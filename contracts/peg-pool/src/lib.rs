//! peg-pool: the "stablecoin under test". A constant-product pool of `dUSD` (a demo stable) against a
//! USD unit. Price of 1 dUSD = reserve_usd / reserve_dusd, so dumping dUSD into the pool pushes the price
//! down on-chain, like a real DEX-driven depeg. All balances are internal demo credits (6 decimals).
//! Testnet demo only: this is not a real stablecoin and not a production AMM.

use near_sdk::json_types::U128;
use near_sdk::serde::Serialize;
use near_sdk::store::LookupMap;
use near_sdk::{env, log, near, require, AccountId, PanicOnDefault};

/// Starting depth of each side: 1,000,000 units (6 decimals).
pub const BASE_RESERVE: u128 = 1_000_000_000_000;
/// Price scale: 1.00 = 100_000_000.
pub const PRICE_ONE: u128 = 100_000_000;
/// Claim: 100,000 dUSD and 100,000 USD credits.
pub const CLAIM_AMOUNT: u128 = 100_000_000_000;
pub const CLAIM_COOLDOWN_SECS: u64 = 60;
/// A single swap may move at most 20% of the input-side reserve.
pub const MAX_SWAP_BPS: u128 = 2_000;

#[near(serializers = [json])]
pub struct PoolState {
    pub reserve_dusd: U128,
    pub reserve_usd: U128,
    pub price_e8: U128,
    pub swaps: u64,
    pub ts: u64,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
struct SwapEvent<'a> {
    standard: &'a str,
    event: &'a str,
    trader: &'a AccountId,
    side: &'a str,
    amount_in: U128,
    amount_out: U128,
    price_e8: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct PegPool {
    owner: AccountId,
    reserve_dusd: u128,
    reserve_usd: u128,
    dusd: LookupMap<AccountId, u128>,
    usd: LookupMap<AccountId, u128>,
    last_claim: LookupMap<AccountId, u64>,
    swaps: u64,
}

#[near]
impl PegPool {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            owner,
            reserve_dusd: BASE_RESERVE,
            reserve_usd: BASE_RESERVE,
            dusd: LookupMap::new(b"d"),
            usd: LookupMap::new(b"u"),
            last_claim: LookupMap::new(b"c"),
            swaps: 0,
        }
    }

    /// Demo credits so anyone can play: 100k dUSD and 100k USD, once per minute per account.
    pub fn claim_demo(&mut self) {
        let who = env::predecessor_account_id();
        let now = env::block_timestamp() / 1_000_000_000;
        if let Some(last) = self.last_claim.get(&who) {
            require!(now >= last + CLAIM_COOLDOWN_SECS, "CLAIM_COOLDOWN");
        }
        self.last_claim.insert(who.clone(), now);
        self.credit(&who, CLAIM_AMOUNT, CLAIM_AMOUNT);
    }

    /// Owner-only: fund an account (used for the arbitrage bot).
    pub fn grant(&mut self, account_id: AccountId, dusd: U128, usd: U128) {
        require!(env::predecessor_account_id() == self.owner, "OWNER_ONLY");
        self.credit(&account_id, dusd.0, usd.0);
    }

    /// Dump: sell `amount` dUSD into the pool for USD. Price falls.
    pub fn sell_dusd(&mut self, amount: U128) -> U128 {
        let who = env::predecessor_account_id();
        let amount = amount.0;
        require!(amount > 0, "ZERO_AMOUNT");
        require!(amount <= self.reserve_dusd * MAX_SWAP_BPS / 10_000, "SWAP_TOO_LARGE");
        let bal = self.dusd.get(&who).copied().unwrap_or(0);
        require!(bal >= amount, "INSUFFICIENT_DUSD");
        let out = Self::amount_out(self.reserve_dusd, self.reserve_usd, amount);
        require!(out > 0, "ZERO_OUTPUT");
        self.dusd.insert(who.clone(), bal - amount);
        let ub = self.usd.get(&who).copied().unwrap_or(0);
        self.usd.insert(who.clone(), ub + out);
        self.reserve_dusd += amount;
        self.reserve_usd -= out;
        self.swaps += 1;
        self.emit("sell_dusd", &who, amount, out);
        U128(out)
    }

    /// Buy: spend `amount` USD to buy dUSD. Price rises. The arbitrage bot uses this to restore the peg.
    pub fn buy_dusd(&mut self, amount: U128) -> U128 {
        let who = env::predecessor_account_id();
        let amount = amount.0;
        require!(amount > 0, "ZERO_AMOUNT");
        require!(amount <= self.reserve_usd * MAX_SWAP_BPS / 10_000, "SWAP_TOO_LARGE");
        let bal = self.usd.get(&who).copied().unwrap_or(0);
        require!(bal >= amount, "INSUFFICIENT_USD");
        let out = Self::amount_out(self.reserve_usd, self.reserve_dusd, amount);
        require!(out > 0, "ZERO_OUTPUT");
        self.usd.insert(who.clone(), bal - amount);
        let db = self.dusd.get(&who).copied().unwrap_or(0);
        self.dusd.insert(who.clone(), db + out);
        self.reserve_usd += amount;
        self.reserve_dusd -= out;
        self.swaps += 1;
        self.emit("buy_dusd", &who, amount, out);
        U128(out)
    }

    /// Owner-only: restore base reserves so every demo run starts at exactly 1.00.
    pub fn reset(&mut self) {
        require!(env::predecessor_account_id() == self.owner, "OWNER_ONLY");
        self.reserve_dusd = BASE_RESERVE;
        self.reserve_usd = BASE_RESERVE;
        log!("EVENT_JSON:{{\"standard\":\"floor-peg\",\"event\":\"reset\"}}");
    }

    /// Price of 1 dUSD in USD units, 8-decimal fixed point (1.00 = 100_000_000).
    pub fn get_price_e8(&self) -> U128 {
        U128(self.price())
    }

    pub fn get_state(&self) -> PoolState {
        PoolState {
            reserve_dusd: U128(self.reserve_dusd),
            reserve_usd: U128(self.reserve_usd),
            price_e8: U128(self.price()),
            swaps: self.swaps,
            ts: env::block_timestamp() / 1_000_000_000,
        }
    }

    pub fn get_balances(&self, account_id: AccountId) -> (U128, U128) {
        (
            U128(self.dusd.get(&account_id).copied().unwrap_or(0)),
            U128(self.usd.get(&account_id).copied().unwrap_or(0)),
        )
    }
}

impl PegPool {
    fn price(&self) -> u128 {
        self.reserve_usd * PRICE_ONE / self.reserve_dusd
    }

    /// Constant product with the rounding in the pool's favour: out = r_out - ceil(k / (r_in + in)).
    fn amount_out(r_in: u128, r_out: u128, amount_in: u128) -> u128 {
        let k = r_in * r_out;
        let new_in = r_in + amount_in;
        let new_out = (k + new_in - 1) / new_in;
        r_out.saturating_sub(new_out)
    }

    fn credit(&mut self, who: &AccountId, dusd: u128, usd: u128) {
        let d = self.dusd.get(who).copied().unwrap_or(0);
        let u = self.usd.get(who).copied().unwrap_or(0);
        self.dusd.insert(who.clone(), d + dusd);
        self.usd.insert(who.clone(), u + usd);
    }

    fn emit(&self, side: &str, trader: &AccountId, amount_in: u128, amount_out: u128) {
        let ev = SwapEvent {
            standard: "floor-peg",
            event: "swap",
            trader,
            side,
            amount_in: U128(amount_in),
            amount_out: U128(amount_out),
            price_e8: U128(self.price()),
        };
        log!("EVENT_JSON:{}", near_sdk::serde_json::to_string(&ev).unwrap());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn ctx(who: AccountId, ts: u64) {
        let mut b = VMContextBuilder::new();
        b.predecessor_account_id(who).block_timestamp(ts * 1_000_000_000);
        testing_env!(b.build());
    }

    fn setup() -> PegPool {
        ctx(accounts(0), 1_000);
        let mut p = PegPool::new(accounts(0));
        ctx(accounts(1), 1_000);
        p.claim_demo();
        p
    }

    #[test]
    fn starts_at_exactly_one() {
        ctx(accounts(0), 1_000);
        let p = PegPool::new(accounts(0));
        assert_eq!(p.get_price_e8().0, PRICE_ONE);
    }

    #[test]
    fn dumping_lowers_price_and_buying_restores_it() {
        let mut p = setup();
        let before = p.get_price_e8().0;
        let out = p.sell_dusd(U128(50_000_000_000)).0; // sell 50k dUSD
        assert!(out > 0 && out < 50_000_000_000);
        let after = p.get_price_e8().0;
        assert!(after < before);
        assert!(after < 97_000_000, "50k dump should break the 0.97 tier, got {after}");
        // buy back what we got
        p.buy_dusd(U128(out));
        let restored = p.get_price_e8().0;
        assert!(restored > after);
        assert!(PRICE_ONE - restored < 100_000, "close to peg after round trip, got {restored}");
    }

    #[test]
    fn three_demo_dumps_break_every_tier() {
        let mut p = setup();
        for _ in 0..3 {
            p.sell_dusd(U128(25_000_000_000));
        }
        // 75k dumped into 1M depth: price falls well below 0.90
        assert!(p.get_price_e8().0 < 90_000_000, "got {}", p.get_price_e8().0);
    }

    #[test]
    fn product_never_decreases() {
        let mut p = setup();
        let k0 = p.reserve_dusd * p.reserve_usd;
        p.sell_dusd(U128(10_000_000_000));
        p.buy_dusd(U128(7_000_000_000));
        p.sell_dusd(U128(3_000_001));
        assert!(p.reserve_dusd * p.reserve_usd >= k0);
    }

    #[test]
    fn balances_are_conserved() {
        let mut p = setup();
        let (d0, u0) = p.get_balances(accounts(1));
        let rd0 = p.reserve_dusd;
        let ru0 = p.reserve_usd;
        p.sell_dusd(U128(10_000_000_000));
        let (d1, u1) = p.get_balances(accounts(1));
        assert_eq!(d0.0 - d1.0, p.reserve_dusd - rd0);
        assert_eq!(u1.0 - u0.0, ru0 - p.reserve_usd);
    }

    #[test]
    #[should_panic(expected = "SWAP_TOO_LARGE")]
    fn swap_cap_enforced() {
        let mut p = setup();
        p.sell_dusd(U128(250_000_000_000));
    }

    #[test]
    #[should_panic(expected = "INSUFFICIENT_DUSD")]
    fn cannot_sell_more_than_balance() {
        let mut p = setup();
        ctx(accounts(2), 1_000);
        p.sell_dusd(U128(1_000_000));
    }

    #[test]
    #[should_panic(expected = "CLAIM_COOLDOWN")]
    fn claim_is_rate_limited() {
        let mut p = setup();
        ctx(accounts(1), 1_010);
        p.claim_demo();
    }

    #[test]
    fn reset_is_owner_only_and_restores_peg() {
        let mut p = setup();
        p.sell_dusd(U128(30_000_000_000));
        assert!(p.get_price_e8().0 < PRICE_ONE);
        ctx(accounts(0), 1_100);
        p.reset();
        assert_eq!(p.get_price_e8().0, PRICE_ONE);
    }

    #[test]
    #[should_panic(expected = "OWNER_ONLY")]
    fn reset_rejects_non_owner() {
        let mut p = setup();
        ctx(accounts(1), 1_100);
        p.reset();
    }
}
