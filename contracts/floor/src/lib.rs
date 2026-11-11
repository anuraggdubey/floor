//! Floor: depeg cover market on NEAR.
//!
//! Flow: a holder buys cover by sending the premium in fUSDC with `ft_transfer_call` and a solver-signed
//! quote. The contract verifies the signature, applies the state gate, locks that solver's margin for this
//! policy only, and escrows the premium. After `wait_secs` with no breach the policy becomes Active and the
//! solver earns the premium. If the pool price stays below a tier line for `sustain_secs`, anyone can call
//! `trigger` and the holder is paid from the solver's locked margin. No claim step. No oracle role: the price
//! is read on-chain from the peg-pool contract by `poke`.

pub mod evm;
pub mod types;

use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, json};
use near_sdk::store::{IterableMap, LookupMap, LookupSet};
use near_sdk::{
    env, ext_contract, log, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise,
    PromiseError, PromiseOrValue,
};
use types::*;
use evm::{erc20_transfer_data, hex_encode as evm_hex, parse_address, Eip1559Tx};

const TGAS_TRANSFER: Gas = Gas::from_tgas(30);
const TGAS_CALLBACK: Gas = Gas::from_tgas(15);
const TGAS_VIEW: Gas = Gas::from_tgas(10);
const MAX_LOG: usize = 256;

#[ext_contract(ext_ft)]
pub trait ExtFt {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[ext_contract(ext_pool)]
pub trait ExtPool {
    fn get_price_e8(&self) -> U128;
}

/// The layout currently deployed on testnet, before the EVM payout leg existed. Used only by `migrate`.
#[near(serializers = [borsh])]
struct FloorV2 {
    owner: AccountId,
    fusdc: AccountId,
    pool: AccountId,
    params: Params,
    last_price_e8: u64,
    last_price_ts: u64,
    last_oob_ts: Option<u64>,
    tier_state: Vec<TierState>,
    sustained_log: Vec<(u64, u8)>,
    solvers: IterableMap<AccountId, Solver>,
    used_nonces: LookupSet<String>,
    policies: IterableMap<u64, Policy>,
    next_policy_id: u64,
    total_exposure: u128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Floor {
    owner: AccountId,
    fusdc: AccountId,
    pool: AccountId,
    params: Params,
    last_price_e8: u64,
    last_price_ts: u64,
    last_oob_ts: Option<u64>,
    tier_state: Vec<TierState>,
    /// Append-only (bounded) record of (timestamp, tier index) for every sustained breach.
    sustained_log: Vec<(u64, u8)>,
    solvers: IterableMap<AccountId, Solver>,
    used_nonces: LookupSet<String>,
    policies: IterableMap<u64, Policy>,
    next_policy_id: u64,
    total_exposure: u128,
    /// Set once an EVM chain is configured; until then the cross-chain leg is simply off.
    evm: Option<EvmChain>,
    /// Where each holder wants an EVM payout sent. Registered before the trigger, never after.
    evm_addr: LookupMap<AccountId, String>,
    evm_payouts: IterableMap<u64, EvmPayout>,
    next_evm_payout_id: u64,
    /// Next transaction nonce for the contract-controlled EVM address; only ever moves forward.
    evm_next_nonce: u64,
}

#[near]
impl Floor {
    #[init]
    pub fn new(owner: AccountId, fusdc: AccountId, pool: AccountId, params: Option<Params>) -> Self {
        let params = params.unwrap_or_else(Params::demo);
        params.validate();
        let n = params.tiers.len();
        Self {
            owner,
            fusdc,
            pool,
            params,
            last_price_e8: 0,
            last_price_ts: 0,
            last_oob_ts: None,
            tier_state: vec![TierState::default(); n],
            sustained_log: vec![],
            solvers: IterableMap::new(b"s"),
            used_nonces: LookupSet::new(b"n"),
            policies: IterableMap::new(b"p"),
            next_policy_id: 1,
            total_exposure: 0,
            evm: None,
            evm_addr: LookupMap::new(b"e"),
            evm_payouts: IterableMap::new(b"E"),
            next_evm_payout_id: 1,
            evm_next_nonce: 0,
        }
    }

    // ------------------------------------------------------------------ admin

    /// One-off upgrade that adds the EVM payout leg. Every solver, margin and policy carries over
    /// untouched and the new fields start empty, so behaviour is unchanged until an EVM chain is
    /// configured. Callable only by the contract account itself.
    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let old: FloorV2 = env::state_read().unwrap_or_else(|| env::panic_str("NO_OLD_STATE"));
        Self {
            owner: old.owner,
            fusdc: old.fusdc,
            pool: old.pool,
            params: old.params,
            last_price_e8: old.last_price_e8,
            last_price_ts: old.last_price_ts,
            last_oob_ts: old.last_oob_ts,
            tier_state: old.tier_state,
            sustained_log: old.sustained_log,
            solvers: old.solvers,
            used_nonces: old.used_nonces,
            policies: old.policies,
            next_policy_id: old.next_policy_id,
            total_exposure: old.total_exposure,
            evm: None,
            evm_addr: LookupMap::new(b"e"),
            evm_payouts: IterableMap::new(b"E"),
            next_evm_payout_id: 1,
            evm_next_nonce: 0,
        }
    }

    /// Owner only. Resets the breach tracking because tier indexes change meaning.
    pub fn set_params(&mut self, params: Params) {
        require!(env::predecessor_account_id() == self.owner, "OWNER_ONLY");
        params.validate();
        self.tier_state = vec![TierState::default(); params.tiers.len()];
        self.sustained_log.clear();
        self.params = params;
    }


    // -------------------------------------------------------------- EVM leg

    /// Owner only. Turns on the cross-chain payout leg for one EVM chain.
    pub fn set_evm_chain(&mut self, chain: EvmChain) {
        require!(env::predecessor_account_id() == self.owner, "OWNER_ONLY");
        parse_address(&chain.token); // rejects anything that is not a 20-byte hex address
        self.evm = Some(chain);
    }

    /// Holders register where they want a cross-chain payout sent. Must be done before the trigger:
    /// the address is read when the payout is created, so it can never be changed afterwards.
    pub fn set_payout_address(&mut self, address: String) {
        parse_address(&address);
        self.evm_addr.insert(env::predecessor_account_id(), address);
    }

    pub fn get_payout_address(&self, account_id: AccountId) -> Option<String> {
        self.evm_addr.get(&account_id).cloned()
    }

    pub fn get_evm_chain(&self) -> Option<EvmChain> {
        self.evm.clone()
    }

    pub fn get_evm_payout(&self, payout_id: u64) -> Option<EvmPayout> {
        self.evm_payouts.get(&payout_id).cloned()
    }

    pub fn list_evm_payouts(&self) -> Vec<EvmPayout> {
        self.evm_payouts.iter().map(|(_, p)| p.clone()).collect()
    }

    /// Ask the NEAR MPC to sign an ERC-20 transfer for a reserved payout.
    ///
    /// This is Design A: the caller supplies only gas parameters and a nonce. Recipient, amount, token and
    /// chain id all come from contract state, and the contract builds and hashes the transaction itself, so
    /// the signature it obtains can only ever be for the payout it already owes.
    pub fn request_evm_payout(
        &mut self,
        payout_id: u64,
        nonce: u64,
        max_priority_fee_per_gas: U128,
        max_fee_per_gas: U128,
        gas_limit: u64,
    ) -> Promise {
        require!(env::predecessor_account_id() == self.owner, "OWNER_ONLY");
        let chain = self.evm.clone().unwrap_or_else(|| env::panic_str("NO_EVM_CHAIN"));
        let po = self.evm_payouts.get(&payout_id).unwrap_or_else(|| env::panic_str("NO_PAYOUT")).clone();
        require!(
            po.status == PayoutStatus::Reserved || po.status == PayoutStatus::Signing,
            "ALREADY_SIGNED"
        );
        require!(nonce >= self.evm_next_nonce, "NONCE_WENT_BACKWARDS");
        require!(gas_limit >= 21_000 && gas_limit <= 300_000, "BAD_GAS_LIMIT");
        require!(max_fee_per_gas.0 > 0 && max_fee_per_gas.0 <= 2_000_000_000_000u128, "BAD_MAX_FEE");
        require!(max_priority_fee_per_gas.0 <= max_fee_per_gas.0, "BAD_PRIORITY_FEE");

        let tx = Eip1559Tx {
            chain_id: chain.chain_id,
            nonce,
            max_priority_fee_per_gas: max_priority_fee_per_gas.0,
            max_fee_per_gas: max_fee_per_gas.0,
            gas_limit,
            to: parse_address(&chain.token),
            value: 0,
            data: erc20_transfer_data(parse_address(&po.to), po.amount.0),
        };
        let hash = evm_hex(&tx.signing_hash());

        {
            let m = self.evm_payouts.get_mut(&payout_id).unwrap();
            m.status = PayoutStatus::Signing;
            m.sighash = Some(hash.clone());
            m.nonce = Some(nonce);
        }
        self.evm_next_nonce = nonce + 1;
        self.emit("evm_sign_requested", json!({ "id": payout_id, "to": po.to, "amount": po.amount, "nonce": nonce, "sighash": hash }));

        Promise::new(chain.signer)
            .function_call(
                "sign".to_string(),
                json!({ "request": { "payload_v2": { "Ecdsa": hash }, "path": chain.path, "domain_id": 0 } })
                    .to_string()
                    .into_bytes(),
                NearToken::from_yoctonear(1),
                Gas::from_tgas(60),
            )
            .then(Self::ext(env::current_account_id()).with_static_gas(Gas::from_tgas(15)).on_evm_signed(payout_id))
    }

    #[private]
    pub fn on_evm_signed(
        &mut self,
        payout_id: u64,
        #[callback_result] result: Result<serde_json::Value, PromiseError>,
    ) -> bool {
        match result {
            Ok(sig) => {
                let raw = sig.to_string();
                if let Some(m) = self.evm_payouts.get_mut(&payout_id) {
                    m.signature = Some(raw.clone());
                    m.status = PayoutStatus::Signed;
                }
                self.emit("evm_signed", json!({ "id": payout_id, "signature": raw }));
                true
            }
            Err(_) => {
                // The MPC can still publish a signature after our callback fails, so the payout stays in
                // Signing and the same nonce and fields can be requested again.
                self.emit("evm_sign_failed", json!({ "id": payout_id }));
                false
            }
        }
    }

    /// The executor reports the hash it broadcast. This is a trusted step: the contract cannot read the
    /// other chain, so confirmation is a claim, not a proof. Said plainly in the UI and the README.
    pub fn confirm_evm_payout(&mut self, payout_id: u64, evm_tx: String) {
        require!(env::predecessor_account_id() == self.owner, "OWNER_ONLY");
        let m = self.evm_payouts.get_mut(&payout_id).unwrap_or_else(|| env::panic_str("NO_PAYOUT"));
        require!(m.status == PayoutStatus::Signed, "NOT_SIGNED");
        m.status = PayoutStatus::Confirmed;
        m.evm_tx = Some(evm_tx.clone());
        self.emit("evm_confirmed", json!({ "id": payout_id, "evm_tx": evm_tx }));
    }

    // ---------------------------------------------------------------- solvers

    /// Register the caller as a solver with the ed25519 key (64 hex chars) that signs its quotes.
    pub fn register_solver(&mut self, pubkey_hex: String) {
        let who = env::predecessor_account_id();
        let pk = hex_decode(&pubkey_hex);
        require!(pk.len() == 32, "BAD_PUBKEY");
        if let Some(s) = self.solvers.get_mut(&who) {
            s.pubkey = pk;
            s.active = true;
        } else {
            self.solvers.insert(
                who.clone(),
                Solver { pubkey: pk, free: U128(0), locked: U128(0), active: true },
            );
        }
        self.emit("solver_registered", json!({ "solver": who }));
    }

    pub fn set_solver_active(&mut self, active: bool) {
        let who = env::predecessor_account_id();
        let s = self.solvers.get_mut(&who).unwrap_or_else(|| env::panic_str("NOT_SOLVER"));
        s.active = active;
    }

    /// Withdraw free (unlocked) margin back to the caller in fUSDC.
    pub fn withdraw_margin(&mut self, amount: U128) -> Promise {
        let who = env::predecessor_account_id();
        let s = self.solvers.get_mut(&who).unwrap_or_else(|| env::panic_str("NOT_SOLVER"));
        require!(amount.0 > 0 && s.free.0 >= amount.0, "INSUFFICIENT_FREE_MARGIN");
        s.free = U128(s.free.0 - amount.0);
        ext_ft::ext(self.fusdc.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(TGAS_TRANSFER)
            .ft_transfer(who.clone(), amount, None)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(TGAS_CALLBACK)
                    .on_withdraw(who, amount),
            )
    }

    #[private]
    pub fn on_withdraw(
        &mut self,
        solver: AccountId,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_err() {
            if let Some(s) = self.solvers.get_mut(&solver) {
                s.free = U128(s.free.0 + amount.0);
            }
            self.emit("withdraw_failed", json!({ "solver": solver, "amount": amount }));
            false
        } else {
            true
        }
    }

    // ------------------------------------------------------- fUSDC receiver

    /// Called by the fUSDC token on `ft_transfer_call`. `msg` is JSON: `{"action":"deposit_margin"}` from a
    /// registered solver, or `{"action":"buy","quote":{..},"signature":"<hex>"}` from a holder. Invalid
    /// requests are refused by returning the full amount, with the reason in an `EVENT_JSON` log.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        require!(env::predecessor_account_id() == self.fusdc, "WRONG_TOKEN");
        let parsed: Msg = match serde_json::from_str(&msg) {
            Ok(m) => m,
            Err(_) => return self.reject("BAD_MSG", &sender_id, amount),
        };
        match parsed {
            Msg::DepositMargin => match self.solvers.get_mut(&sender_id) {
                Some(s) => {
                    s.free = U128(s.free.0 + amount.0);
                    let free = s.free;
                    self.emit("margin_deposited", json!({ "solver": sender_id, "amount": amount, "free": free }));
                    PromiseOrValue::Value(U128(0))
                }
                None => self.reject("NOT_SOLVER", &sender_id, amount),
            },
            Msg::Buy { quote, signature } => match self.buy(&sender_id, amount, quote, &signature) {
                Ok(()) => PromiseOrValue::Value(U128(0)),
                Err(code) => self.reject(code, &sender_id, amount),
            },
        }
    }

    // ----------------------------------------------------------------- price

    /// Anyone may call. Reads the peg-pool price on-chain and updates the gate and breach tracking.
    pub fn poke(&mut self) -> Promise {
        ext_pool::ext(self.pool.clone())
            .with_static_gas(TGAS_VIEW)
            .get_price_e8()
            .then(Self::ext(env::current_account_id()).with_static_gas(TGAS_CALLBACK).on_price())
    }

    #[private]
    pub fn on_price(&mut self, #[callback_result] result: Result<U128, PromiseError>) -> Option<U128> {
        match result {
            Ok(p) => {
                self.apply_price(p.0 as u64, now_secs());
                Some(p)
            }
            Err(_) => None,
        }
    }

    // -------------------------------------------------------------- lifecycle

    /// Anyone, after `activate_ts`. Needs a fresh price (call `poke` first). Pending becomes Active, or Void
    /// (premium refunded, margin unlocked) if the price left the band since purchase.
    pub fn activate(&mut self, policy_id: u64) -> Status {
        let now = now_secs();
        let p = self.policies.get(&policy_id).unwrap_or_else(|| env::panic_str("NO_POLICY")).clone();
        require!(p.status == Status::Pending, "NOT_PENDING");
        require!(now >= p.activate_ts, "TOO_EARLY");
        require!(self.price_is_fresh(now), "STALE_PRICE");
        let breached =
            self.last_price_e8 < self.params.band_e8 || self.last_oob_ts.map_or(false, |t| t >= p.created_ts);
        if breached {
            self.unlock(&p.solver, p.max_payout.0, 0);
            let pm = self.policies.get_mut(&policy_id).unwrap();
            pm.status = Status::Void;
            pm.owed = pm.premium;
            self.emit("policy_void", json!({ "id": policy_id }));
            let _ = self.pay_owed(policy_id);
            Status::Void
        } else {
            if let Some(s) = self.solvers.get_mut(&p.solver) {
                s.free = U128(s.free.0 + p.premium.0);
            }
            self.policies.get_mut(&policy_id).unwrap().status = Status::Active;
            self.emit("policy_activated", json!({ "id": policy_id }));
            Status::Active
        }
    }

    /// Anyone. Pays the holder if a tier was sustained inside the policy window.
    pub fn trigger(&mut self, policy_id: u64) -> U128 {
        let p = self.policies.get(&policy_id).unwrap_or_else(|| env::panic_str("NO_POLICY")).clone();
        require!(p.status == Status::Active, "NOT_ACTIVE");
        let (first_ts, tier) = self
            .settlement(p.activate_ts, p.expires_ts)
            .unwrap_or_else(|| env::panic_str("NOT_TRIGGERED"));
        // Settlement delay: let deeper tiers that are still sustaining be counted before the payout is fixed.
        require!(now_secs() >= first_ts + self.params.settle_secs, "SETTLING");
        let bps = self.params.tiers[tier as usize].payout_bps as u128;
        let amount = (p.notional.0 * bps / 10_000).min(p.max_payout.0);
        // The whole locked margin leaves lock; the payout leaves the contract, the rest returns to free margin.
        self.unlock(&p.solver, p.max_payout.0, amount);
        let pm = self.policies.get_mut(&policy_id).unwrap();
        pm.status = Status::Triggered;
        pm.tier_idx = Some(tier);
        pm.payout_amount = U128(amount);
        pm.owed = U128(amount);
        self.emit("policy_triggered", json!({ "id": policy_id, "tier": tier, "amount": amount.to_string() }));
        self.reserve_evm_payout(policy_id, &p.holder, amount);
        let _ = self.pay_owed(policy_id);
        U128(amount)
    }

    /// Anyone, after `expires_ts`. Unlocks the solver's margin if nothing was triggered.
    pub fn expire(&mut self, policy_id: u64) -> Status {
        let now = now_secs();
        let p = self.policies.get(&policy_id).unwrap_or_else(|| env::panic_str("NO_POLICY")).clone();
        require!(p.status == Status::Active, "NOT_ACTIVE");
        require!(now > p.expires_ts, "NOT_EXPIRED");
        require!(
            self.deepest_tier_in_window(p.activate_ts, p.expires_ts).is_none(),
            "TRIGGER_FIRST"
        );
        self.unlock(&p.solver, p.max_payout.0, 0);
        self.policies.get_mut(&policy_id).unwrap().status = Status::Expired;
        self.emit("policy_expired", json!({ "id": policy_id }));
        Status::Expired
    }

    /// Anyone. Retries a refund or payout that is still owed (for example if the holder was not registered
    /// with fUSDC when the first transfer ran).
    pub fn pay(&mut self, policy_id: u64) {
        require!(self.pay_owed(policy_id).is_some(), "NOTHING_OWED");
    }

    #[private]
    pub fn on_paid(
        &mut self,
        policy_id: u64,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        let ok = result.is_ok();
        let status = {
            let p = self.policies.get_mut(&policy_id).unwrap();
            p.paying = false;
            if ok {
                if p.status == Status::Triggered {
                    p.status = Status::PaidOut;
                }
            } else {
                p.owed = U128(p.owed.0 + amount.0);
            }
            p.status
        };
        if ok {
            self.emit("paid", json!({ "id": policy_id, "amount": amount, "status": status }));
        } else {
            self.emit("pay_failed", json!({ "id": policy_id, "amount": amount }));
        }
        ok
    }

    // ------------------------------------------------------------------ views

    pub fn get_params(&self) -> Params {
        self.params.clone()
    }

    pub fn get_params_hash(&self) -> String {
        params_hash(&self.params)
    }

    pub fn get_gate(&self) -> GateView {
        let now = now_secs();
        let reason = self.gate_error(now).map(|s| s.to_string());
        GateView {
            price_e8: U128(self.last_price_e8 as u128),
            price_ts: self.last_price_ts,
            last_out_of_band_ts: self.last_oob_ts,
            tiers: self.tier_state.clone(),
            open: reason.is_none(),
            reason,
        }
    }

    pub fn get_policy(&self, policy_id: u64) -> Option<Policy> {
        self.policies.get(&policy_id).cloned()
    }

    pub fn list_policies(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<Policy> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;
        self.policies.iter().skip(from).take(limit).map(|(_, p)| p.clone()).collect()
    }

    pub fn get_solver(&self, account_id: AccountId) -> Option<Solver> {
        self.solvers.get(&account_id).cloned()
    }

    pub fn list_solvers(&self) -> Vec<(AccountId, Solver)> {
        self.solvers.iter().map(|(k, v)| (k.clone(), v.clone())).collect()
    }

    pub fn get_sustained_log(&self) -> Vec<(u64, u8)> {
        self.sustained_log.clone()
    }

    pub fn get_pool_stats(&self) -> PoolStats {
        let (free, locked) = self
            .solvers
            .iter()
            .fold((0u128, 0u128), |a, (_, s)| (a.0 + s.free.0, a.1 + s.locked.0));
        PoolStats {
            solvers: self.solvers.len() as u64,
            policies: self.policies.len() as u64,
            free_margin: U128(free),
            locked_margin: U128(locked),
            exposure_cap: self.params.exposure_cap,
        }
    }

    pub fn get_config(&self) -> (AccountId, AccountId, AccountId) {
        (self.owner.clone(), self.fusdc.clone(), self.pool.clone())
    }
}

// ----------------------------------------------------------------- internals
impl Floor {
    /// Update the gate and breach tracking from a price observation. Pure state logic; unit-tested directly.
    pub fn apply_price(&mut self, price_e8: u64, ts: u64) {
        require!(ts >= self.last_price_ts, "TIME_WENT_BACKWARDS");
        self.last_price_e8 = price_e8;
        self.last_price_ts = ts;
        if price_e8 < self.params.band_e8 {
            self.last_oob_ts = Some(ts);
        }
        for i in 0..self.params.tiers.len() {
            let line = self.params.tiers[i].below_price_e8;
            let sustain = self.params.sustain_secs;
            let st = &mut self.tier_state[i];
            if price_e8 < line {
                let start = *st.start_ts.get_or_insert(ts);
                if !st.sustained && ts - start >= sustain {
                    st.sustained = true;
                    self.sustained_log.push((ts, i as u8));
                    if self.sustained_log.len() > MAX_LOG {
                        self.sustained_log.remove(0);
                    }
                    log!("EVENT_JSON:{}", json!({ "standard": "floor", "event": "tier_sustained", "data": { "tier": i, "ts": ts } }));
                }
            } else {
                st.start_ts = None;
                st.sustained = false;
            }
        }
    }

    fn price_is_fresh(&self, now: u64) -> bool {
        self.last_price_ts > 0 && now.saturating_sub(self.last_price_ts) <= self.params.stale_secs
    }

    /// `None` if cover can be sold now, otherwise the reason code.
    fn gate_error(&self, now: u64) -> Option<&'static str> {
        if !self.price_is_fresh(now) {
            return Some("STALE_PRICE");
        }
        if self.last_price_e8 < self.params.band_e8 {
            return Some("GATE_CLOSED");
        }
        if let Some(t) = self.last_oob_ts {
            if now.saturating_sub(t) < self.params.lookback_secs {
                return Some("GATE_CLOSED");
            }
        }
        None
    }

    fn deepest_tier_in_window(&self, from_ts: u64, to_ts: u64) -> Option<u8> {
        self.settlement(from_ts, to_ts).map(|(_, tier)| tier)
    }

    /// (time the first tier was sustained, deepest tier sustained so far) inside the window, if any.
    fn settlement(&self, from_ts: u64, to_ts: u64) -> Option<(u64, u8)> {
        let mut first: Option<u64> = None;
        let mut deepest: Option<u8> = None;
        for (ts, tier) in self.sustained_log.iter().filter(|(ts, _)| *ts >= from_ts && *ts <= to_ts) {
            first = Some(first.map_or(*ts, |f| f.min(*ts)));
            deepest = Some(deepest.map_or(*tier, |d| d.max(*tier)));
        }
        Some((first?, deepest?))
    }

    fn buy(&mut self, holder: &AccountId, amount: U128, q: Quote, signature: &str) -> Result<(), &'static str> {
        let now = now_secs();
        if &q.holder != holder {
            return Err("HOLDER_MISMATCH");
        }
        if q.premium.0 != amount.0 || amount.0 == 0 {
            return Err("PREMIUM_MISMATCH");
        }
        if q.params_hash != params_hash(&self.params) {
            return Err("PARAMS_MISMATCH");
        }
        let solver = match self.solvers.get(&q.solver) {
            Some(s) if s.active => s.clone(),
            _ => return Err("SOLVER_INACTIVE"),
        };
        verify_signature(&solver.pubkey, signature, &quote_message(&q))?;
        if now > q.expires_ts {
            return Err("QUOTE_EXPIRED");
        }
        let nonce_key = format!("{}:{}", q.solver, q.nonce);
        if self.used_nonces.contains(&nonce_key) {
            return Err("NONCE_USED");
        }
        if q.tenor_secs <= self.params.wait_secs || q.tenor_secs > self.params.max_tenor_secs {
            return Err("BAD_TENOR");
        }
        if let Some(code) = self.gate_error(now) {
            return Err(code);
        }
        let expected_max = q.notional.0 * self.params.max_bps() as u128 / 10_000;
        if q.notional.0 == 0 || q.max_payout.0 != expected_max || expected_max == 0 {
            return Err("BAD_MAX_PAYOUT");
        }
        if solver.free.0 < q.max_payout.0 {
            return Err("SOLVER_CAPACITY");
        }
        if self.total_exposure + q.max_payout.0 > self.params.exposure_cap.0 {
            return Err("EXPOSURE_CAP");
        }
        // All checks passed: commit.
        self.used_nonces.insert(nonce_key);
        {
            let s = self.solvers.get_mut(&q.solver).unwrap();
            s.free = U128(s.free.0 - q.max_payout.0);
            s.locked = U128(s.locked.0 + q.max_payout.0);
        }
        self.total_exposure += q.max_payout.0;
        let id = self.next_policy_id;
        self.next_policy_id += 1;
        self.policies.insert(
            id,
            Policy {
                id,
                holder: holder.clone(),
                solver: q.solver.clone(),
                notional: q.notional,
                premium: q.premium,
                max_payout: q.max_payout,
                created_ts: now,
                activate_ts: now + self.params.wait_secs,
                expires_ts: now + q.tenor_secs,
                status: Status::Pending,
                tier_idx: None,
                payout_amount: U128(0),
                owed: U128(0),
                paying: false,
            },
        );
        self.emit(
            "policy_created",
            json!({ "id": id, "holder": holder, "solver": q.solver, "notional": q.notional, "premium": q.premium,
                    "max_payout": q.max_payout, "activate_ts": now + self.params.wait_secs, "expires_ts": now + q.tenor_secs }),
        );
        Ok(())
    }

    /// Unlock `max_payout` from a solver's locked margin; `paid_out` of it leaves the contract.
    fn unlock(&mut self, solver: &AccountId, max_payout: u128, paid_out: u128) {
        if let Some(s) = self.solvers.get_mut(solver) {
            s.locked = U128(s.locked.0 - max_payout);
            s.free = U128(s.free.0 + max_payout - paid_out);
        }
        self.total_exposure -= max_payout;
    }

    fn pay_owed(&mut self, policy_id: u64) -> Option<Promise> {
        let p = self.policies.get_mut(&policy_id)?;
        if p.owed.0 == 0 || p.paying {
            return None;
        }
        let amount = p.owed;
        let holder = p.holder.clone();
        p.owed = U128(0);
        p.paying = true;
        Some(
            ext_ft::ext(self.fusdc.clone())
                .with_attached_deposit(NearToken::from_yoctonear(1))
                .with_static_gas(TGAS_TRANSFER)
                .ft_transfer(holder, amount, None)
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(TGAS_CALLBACK)
                        .on_paid(policy_id, amount),
                ),
        )
    }

    /// Reserve a cross-chain payout alongside the NEAR one, when a chain is configured and this holder
    /// registered an address before the trigger. Capped, because the sending address is faucet-funded.
    fn reserve_evm_payout(&mut self, policy_id: u64, holder: &AccountId, amount: u128) {
        let Some(chain) = self.evm.clone() else { return };
        let Some(to) = self.evm_addr.get(holder).cloned() else { return };
        let send = amount.min(chain.cap.0);
        if send == 0 {
            return;
        }
        let id = self.next_evm_payout_id;
        self.next_evm_payout_id += 1;
        self.evm_payouts.insert(
            id,
            EvmPayout {
                id,
                policy_id,
                to: to.clone(),
                amount: U128(send),
                status: PayoutStatus::Reserved,
                sighash: None,
                signature: None,
                evm_tx: None,
                nonce: None,
            },
        );
        self.emit(
            "evm_payout_reserved",
            json!({ "id": id, "policy_id": policy_id, "to": to, "amount": send.to_string(), "chain": chain.name }),
        );
    }

    fn reject(&self, code: &str, who: &AccountId, amount: U128) -> PromiseOrValue<U128> {
        self.emit("rejected", json!({ "code": code, "account": who, "amount": amount }));
        PromiseOrValue::Value(amount)
    }

    fn emit(&self, event: &str, data: serde_json::Value) {
        log!("EVENT_JSON:{}", json!({ "standard": "floor", "event": event, "data": data }));
    }
}

fn now_secs() -> u64 {
    env::block_timestamp() / 1_000_000_000
}

pub fn params_hash(p: &Params) -> String {
    hex_encode(&env::sha256(p.canonical().as_bytes()))
}

fn verify_signature(pubkey: &[u8], sig_hex: &str, msg: &[u8]) -> Result<(), &'static str> {
    let sig = hex_decode_checked(sig_hex).ok_or("BAD_SIGNATURE")?;
    let sig: [u8; 64] = sig.try_into().map_err(|_| "BAD_SIGNATURE")?;
    let pk: [u8; 32] = pubkey.try_into().map_err(|_| "BAD_SIGNATURE")?;
    if env::ed25519_verify(&sig, msg, &pk) {
        Ok(())
    } else {
        Err("BAD_SIGNATURE")
    }
}

fn hex_decode(s: &str) -> Vec<u8> {
    hex_decode_checked(s).unwrap_or_else(|| env::panic_str("BAD_HEX"))
}

fn hex_decode_checked(s: &str) -> Option<Vec<u8>> {
    let s = s.strip_prefix("0x").unwrap_or(s);
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(s.get(i..i + 2)?, 16).ok()).collect()
}

fn hex_encode(b: &[u8]) -> String {
    const H: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(b.len() * 2);
    for x in b {
        s.push(H[(x >> 4) as usize] as char);
        s.push(H[(x & 15) as usize] as char);
    }
    s
}

#[cfg(test)]
mod tests;
