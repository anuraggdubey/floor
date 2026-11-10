use super::*;
use ed25519_dalek::{Signer, SigningKey};
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

const T0: u64 = 10_000;

fn acct(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn set_ctx(predecessor: &str, ts: u64) {
    let mut b = VMContextBuilder::new();
    b.predecessor_account_id(acct(predecessor)).block_timestamp(ts * 1_000_000_000);
    testing_env!(b.build());
}

fn hex(b: &[u8]) -> String {
    hex_encode(b)
}

struct T {
    c: Floor,
    sk: SigningKey,
    nonce: u64,
}

impl T {
    /// A Floor contract with one solver holding 1,000 fUSDC of margin and an in-band price at T0.
    fn new() -> Self {
        set_ctx("owner.test", T0);
        let mut c = Floor::new(acct("owner.test"), acct("fusdc.test"), acct("pool.test"), None);
        let sk = SigningKey::from_bytes(&[7u8; 32]);
        set_ctx("solver.test", T0);
        c.register_solver(hex(&sk.verifying_key().to_bytes()));
        let mut t = Self { c, sk, nonce: 0 };
        t.token_call("solver.test", 1_000_000_000, "{\"action\":\"deposit_margin\"}".to_string(), T0);
        t.price(100_000_000, T0);
        t
    }

    fn price(&mut self, p: u64, ts: u64) {
        set_ctx("anyone.test", ts);
        self.c.apply_price(p, ts);
    }

    fn token_call(&mut self, sender: &str, amount: u128, msg: String, ts: u64) -> u128 {
        set_ctx("fusdc.test", ts);
        match self.c.ft_on_transfer(acct(sender), U128(amount), msg) {
            PromiseOrValue::Value(v) => v.0,
            _ => panic!("expected value"),
        }
    }

    fn quote(&mut self, holder: &str, notional: u128, premium: u128, tenor: u64, expires: u64) -> Quote {
        self.nonce += 1;
        Quote {
            rfq_id: format!("rfq-{}", self.nonce),
            solver: acct("solver.test"),
            holder: acct(holder),
            notional: U128(notional),
            tenor_secs: tenor,
            premium: U128(premium),
            max_payout: U128(notional * 1_500 / 10_000),
            expires_ts: expires,
            nonce: self.nonce,
            params_hash: params_hash(&self.c.params),
        }
    }

    fn sign(&self, q: &Quote) -> String {
        hex(&self.sk.sign(&quote_message(q)).to_bytes())
    }

    /// Returns the refunded amount (0 means the purchase was accepted).
    fn buy_with(&mut self, q: Quote, sig: String, holder: &str, paid: u128, ts: u64) -> u128 {
        let msg = serde_json::to_string(&json!({ "action": "buy", "quote": q, "signature": sig })).unwrap();
        self.token_call(holder, paid, msg, ts)
    }

    fn buy(&mut self, ts: u64) -> u128 {
        let q = self.quote("holder.test", 100_000_000, 5_000_000, 300, ts + 60);
        let s = self.sign(&q);
        self.buy_with(q, s, "holder.test", 5_000_000, ts)
    }

    fn solver(&self) -> Solver {
        self.c.get_solver(acct("solver.test")).unwrap()
    }

    fn at(&mut self, who: &str, ts: u64) {
        set_ctx(who, ts);
    }
}

// ------------------------------------------------------------------ happy path

#[test]
fn buy_creates_pending_policy_and_locks_margin() {
    let mut t = T::new();
    assert_eq!(t.buy(T0 + 5), 0);
    let p = t.c.get_policy(1).unwrap();
    assert_eq!(p.status, Status::Pending);
    assert_eq!(p.max_payout.0, 15_000_000);
    assert_eq!(p.activate_ts, T0 + 5 + 20);
    let s = t.solver();
    assert_eq!(s.locked.0, 15_000_000);
    assert_eq!(s.free.0, 1_000_000_000 - 15_000_000);
    assert_eq!(t.c.get_pool_stats().locked_margin.0, 15_000_000);
}

#[test]
fn full_lifecycle_activate_then_expire() {
    let mut t = T::new();
    t.buy(T0 + 5);
    t.price(100_000_000, T0 + 30);
    t.at("anyone.test", T0 + 30);
    assert_eq!(t.c.activate(1), Status::Active);
    // premium is earned on activation
    assert_eq!(t.solver().free.0, 1_000_000_000 - 15_000_000 + 5_000_000);
    t.price(100_000_000, T0 + 400);
    t.at("anyone.test", T0 + 400);
    assert_eq!(t.c.expire(1), Status::Expired);
    let s = t.solver();
    assert_eq!(s.locked.0, 0);
    assert_eq!(s.free.0, 1_005_000_000);
    assert_eq!(t.c.get_pool_stats().locked_margin.0, 0);
}

// -------------------------------------------------------------- gate and quote

#[test]
fn gate_blocks_purchase_while_price_is_out_of_band() {
    let mut t = T::new();
    t.price(96_000_000, T0 + 10);
    assert_eq!(t.buy(T0 + 11), 5_000_000, "refunded in full");
    assert!(t.c.get_policy(1).is_none());
    assert_eq!(t.solver().locked.0, 0);
}

#[test]
fn gate_stays_closed_for_the_lookback_after_recovery() {
    let mut t = T::new();
    t.price(96_000_000, T0 + 10);
    t.price(100_000_000, T0 + 20);
    assert_eq!(t.buy(T0 + 60), 5_000_000, "still inside the 120s lookback");
    t.price(100_000_000, T0 + 10 + 125);
    assert_eq!(t.buy(T0 + 10 + 126), 0, "lookback has passed");
}

#[test]
fn stale_price_closes_the_gate() {
    let mut t = T::new();
    assert_eq!(t.buy(T0 + 61), 5_000_000);
    assert_eq!(t.c.get_gate().reason.as_deref(), Some("STALE_PRICE"));
}

#[test]
fn rejects_bad_signature() {
    let mut t = T::new();
    let q = t.quote("holder.test", 100_000_000, 5_000_000, 300, T0 + 60);
    let other = SigningKey::from_bytes(&[9u8; 32]);
    let bad = hex(&other.sign(&quote_message(&q)).to_bytes());
    assert_eq!(t.buy_with(q, bad, "holder.test", 5_000_000, T0 + 5), 5_000_000);
    assert!(t.c.get_policy(1).is_none());
}

#[test]
fn rejects_tampered_quote() {
    let mut t = T::new();
    let q = t.quote("holder.test", 100_000_000, 5_000_000, 300, T0 + 60);
    let sig = t.sign(&q);
    let mut tampered = q.clone();
    tampered.premium = U128(1); // holder tries to pay less than the solver signed
    assert_eq!(t.buy_with(tampered, sig, "holder.test", 1, T0 + 5), 1);
    assert!(t.c.get_policy(1).is_none());
}

#[test]
fn rejects_wrong_sender_expired_quote_and_reused_nonce() {
    let mut t = T::new();
    // sender is not the quoted holder
    let q = t.quote("holder.test", 100_000_000, 5_000_000, 300, T0 + 60);
    let s = t.sign(&q);
    assert_eq!(t.buy_with(q.clone(), s.clone(), "thief.test", 5_000_000, T0 + 5), 5_000_000);
    // expired
    assert_eq!(t.buy_with(q.clone(), s.clone(), "holder.test", 5_000_000, T0 + 61), 5_000_000);
    // accepted once, then the same quote is a replay
    assert_eq!(t.buy_with(q.clone(), s.clone(), "holder.test", 5_000_000, T0 + 5), 0);
    assert_eq!(t.buy_with(q, s, "holder.test", 5_000_000, T0 + 6), 5_000_000);
    assert_eq!(t.c.get_pool_stats().policies, 1);
}

#[test]
fn rejects_bad_tenor_and_bad_max_payout_and_other_params() {
    let mut t = T::new();
    for tenor in [10u64, 601] {
        let q = t.quote("holder.test", 100_000_000, 5_000_000, tenor, T0 + 60);
        let s = t.sign(&q);
        assert_eq!(t.buy_with(q, s, "holder.test", 5_000_000, T0 + 5), 5_000_000, "tenor {tenor}");
    }
    let mut q = t.quote("holder.test", 100_000_000, 5_000_000, 300, T0 + 60);
    q.max_payout = U128(1); // solver tries to under-commit margin
    let s = t.sign(&q);
    assert_eq!(t.buy_with(q, s, "holder.test", 5_000_000, T0 + 5), 5_000_000);
    let mut q = t.quote("holder.test", 100_000_000, 5_000_000, 300, T0 + 60);
    q.params_hash = "00".repeat(32);
    let s = t.sign(&q);
    assert_eq!(t.buy_with(q, s, "holder.test", 5_000_000, T0 + 5), 5_000_000);
    assert_eq!(t.c.get_pool_stats().policies, 0);
}

#[test]
fn rejects_when_solver_lacks_margin_or_cap_is_hit() {
    let mut t = T::new();
    // notional 10,000 fUSDC needs 1,500 margin but the solver has 1,000
    let q = t.quote("holder.test", 10_000_000_000, 5_000_000, 300, T0 + 60);
    let s = t.sign(&q);
    assert_eq!(t.buy_with(q, s, "holder.test", 5_000_000, T0 + 5), 5_000_000);
    // owner lowers the exposure cap below one policy's margin
    set_ctx("owner.test", T0);
    let mut p = Params::demo();
    p.exposure_cap = U128(1_000_000);
    t.c.set_params(p);
    t.price(100_000_000, T0 + 6);
    let q = t.quote("holder.test", 100_000_000, 5_000_000, 300, T0 + 60);
    let s = t.sign(&q);
    assert_eq!(t.buy_with(q, s, "holder.test", 5_000_000, T0 + 7), 5_000_000);
}

#[test]
fn non_solver_cannot_deposit_margin_and_wrong_token_is_refused() {
    let mut t = T::new();
    assert_eq!(t.token_call("nobody.test", 5, "{\"action\":\"deposit_margin\"}".to_string(), T0 + 1), 5);
    assert_eq!(t.token_call("solver.test", 5, "garbage".to_string(), T0 + 1), 5);
}

#[test]
#[should_panic(expected = "WRONG_TOKEN")]
fn only_the_fusdc_contract_may_call_ft_on_transfer() {
    let mut t = T::new();
    set_ctx("evil-token.test", T0);
    t.c.ft_on_transfer(acct("solver.test"), U128(1), "{\"action\":\"deposit_margin\"}".to_string());
}

// ------------------------------------------------------------------ activation

#[test]
#[should_panic(expected = "TOO_EARLY")]
fn cannot_activate_before_the_wait() {
    let mut t = T::new();
    t.buy(T0 + 5);
    t.price(100_000_000, T0 + 10);
    t.at("anyone.test", T0 + 10);
    t.c.activate(1);
}

#[test]
#[should_panic(expected = "STALE_PRICE")]
fn cannot_activate_on_a_stale_price() {
    let mut t = T::new();
    t.buy(T0 + 5);
    t.at("anyone.test", T0 + 100);
    t.c.activate(1);
}

#[test]
fn drift_between_purchase_and_activation_voids_the_policy_and_refunds() {
    let mut t = T::new();
    t.buy(T0 + 5);
    t.price(98_000_000, T0 + 12); // dips out of band, then recovers
    t.price(100_000_000, T0 + 20);
    t.at("anyone.test", T0 + 26);
    t.price(100_000_000, T0 + 26);
    t.at("anyone.test", T0 + 26);
    assert_eq!(t.c.activate(1), Status::Void);
    let p = t.c.get_policy(1).unwrap();
    assert_eq!(p.status, Status::Void);
    assert!(p.paying, "refund transfer is in flight");
    assert_eq!(t.solver().locked.0, 0);
    assert_eq!(t.solver().free.0, 1_000_000_000, "premium was never credited to the solver");
    // refund completes
    set_ctx("floor.test", T0 + 27);
    t.c.on_paid(1, U128(5_000_000), Ok(()));
    let p = t.c.get_policy(1).unwrap();
    assert!(!p.paying);
    assert_eq!(p.status, Status::Void, "a refund does not turn into PaidOut");
}

// --------------------------------------------------------------------- trigger

fn active_policy(t: &mut T) {
    t.buy(T0 + 5);
    t.price(100_000_000, T0 + 30);
    t.at("anyone.test", T0 + 30);
    t.c.activate(1);
}

#[test]
fn sustained_breach_pays_the_tier_and_returns_the_rest_of_the_margin() {
    let mut t = T::new();
    active_policy(&mut t);
    // price falls to 0.95 (below the 0.97 line only) and stays there 30s
    t.price(95_000_000, T0 + 60);
    t.price(95_000_000, T0 + 95);
    t.at("anyone.test", T0 + 96);
    let paid = t.c.trigger(1).0;
    assert_eq!(paid, 3_000_000, "3% of 100 fUSDC");
    let p = t.c.get_policy(1).unwrap();
    assert_eq!(p.status, Status::Triggered);
    assert_eq!(p.tier_idx, Some(0));
    assert!(p.paying);
    let s = t.solver();
    assert_eq!(s.locked.0, 0);
    assert_eq!(s.free.0, 1_000_000_000 - 15_000_000 + 5_000_000 + 15_000_000 - 3_000_000);
    set_ctx("floor.test", T0 + 97);
    assert!(t.c.on_paid(1, U128(3_000_000), Ok(())));
    assert_eq!(t.c.get_policy(1).unwrap().status, Status::PaidOut);
}

#[test]
fn deep_crash_pays_the_deepest_sustained_tier() {
    let mut t = T::new();
    active_policy(&mut t);
    for ts in [60, 95] {
        t.price(85_000_000, T0 + ts); // below all three lines
    }
    t.at("anyone.test", T0 + 96);
    assert_eq!(t.c.trigger(1).0, 15_000_000, "15% of 100 fUSDC");
    assert_eq!(t.c.get_policy(1).unwrap().tier_idx, Some(2));
}

#[test]
#[should_panic(expected = "NOT_TRIGGERED")]
fn a_flash_spike_that_recovers_inside_the_sustain_window_pays_nothing() {
    let mut t = T::new();
    active_policy(&mut t);
    t.price(80_000_000, T0 + 60);
    t.price(80_000_000, T0 + 75); // only 15s down
    t.price(100_000_000, T0 + 80); // recovers
    t.price(100_000_000, T0 + 120);
    t.at("anyone.test", T0 + 121);
    t.c.trigger(1);
}

#[test]
#[should_panic(expected = "NOT_TRIGGERED")]
fn a_breach_before_activation_does_not_pay() {
    let mut t = T::new();
    t.buy(T0 + 5);
    // the policy is still Pending here, so nothing can trigger it; make it Active afterwards
    t.price(100_000_000, T0 + 30);
    t.at("anyone.test", T0 + 30);
    t.c.activate(1);
    // sustained breach that began and ended before activate_ts is simulated by clearing the log window:
    t.c.sustained_log.push((T0 + 10, 2));
    t.at("anyone.test", T0 + 31);
    t.c.trigger(1);
}

#[test]
#[should_panic(expected = "NOT_ACTIVE")]
fn cannot_trigger_a_pending_policy() {
    let mut t = T::new();
    t.buy(T0 + 5);
    t.at("anyone.test", T0 + 6);
    t.c.trigger(1);
}

#[test]
#[should_panic(expected = "NOT_ACTIVE")]
fn cannot_trigger_twice() {
    let mut t = T::new();
    active_policy(&mut t);
    t.price(95_000_000, T0 + 60);
    t.price(95_000_000, T0 + 95);
    t.at("anyone.test", T0 + 96);
    t.c.trigger(1);
    t.c.trigger(1);
}

// ------------------------------------------------------------ expire and payout

#[test]
#[should_panic(expected = "NOT_EXPIRED")]
fn cannot_expire_early() {
    let mut t = T::new();
    active_policy(&mut t);
    t.at("anyone.test", T0 + 100);
    t.c.expire(1);
}

#[test]
#[should_panic(expected = "TRIGGER_FIRST")]
fn cannot_expire_a_policy_that_should_have_paid() {
    let mut t = T::new();
    active_policy(&mut t);
    t.price(95_000_000, T0 + 60);
    t.price(95_000_000, T0 + 95);
    t.at("anyone.test", T0 + 1_000);
    t.c.expire(1);
}

#[test]
fn failed_transfer_keeps_the_amount_owed_and_can_be_retried() {
    let mut t = T::new();
    active_policy(&mut t);
    t.price(95_000_000, T0 + 60);
    t.price(95_000_000, T0 + 95);
    t.at("anyone.test", T0 + 96);
    t.c.trigger(1);
    set_ctx("floor.test", T0 + 97);
    assert!(!t.c.on_paid(1, U128(3_000_000), Err(PromiseError::Failed)));
    let p = t.c.get_policy(1).unwrap();
    assert_eq!(p.status, Status::Triggered, "not PaidOut until the transfer succeeds");
    assert_eq!(p.owed.0, 3_000_000);
    assert!(!p.paying);
    t.at("anyone.test", T0 + 98);
    t.c.pay(1);
    assert!(t.c.get_policy(1).unwrap().paying);
    set_ctx("floor.test", T0 + 99);
    assert!(t.c.on_paid(1, U128(3_000_000), Ok(())));
    assert_eq!(t.c.get_policy(1).unwrap().status, Status::PaidOut);
}

#[test]
#[should_panic(expected = "NOTHING_OWED")]
fn pay_with_nothing_owed_panics() {
    let mut t = T::new();
    t.buy(T0 + 5);
    t.at("anyone.test", T0 + 6);
    t.c.pay(1);
}

// ------------------------------------------------------------------ withdrawals

#[test]
fn solver_cannot_withdraw_locked_margin() {
    let mut t = T::new();
    t.buy(T0 + 5);
    t.at("solver.test", T0 + 6);
    let free = t.solver().free.0;
    let _ = t.c.withdraw_margin(U128(free));
    assert_eq!(t.solver().free.0, 0);
    assert_eq!(t.solver().locked.0, 15_000_000, "locked margin untouched");
}

#[test]
#[should_panic(expected = "INSUFFICIENT_FREE_MARGIN")]
fn withdraw_more_than_free_panics() {
    let mut t = T::new();
    t.buy(T0 + 5);
    t.at("solver.test", T0 + 6);
    let free = t.solver().free.0;
    let _ = t.c.withdraw_margin(U128(free + 1));
}

#[test]
fn failed_withdraw_restores_free_margin() {
    let mut t = T::new();
    t.at("solver.test", T0 + 6);
    let _ = t.c.withdraw_margin(U128(100));
    let after = t.solver().free.0;
    set_ctx("floor.test", T0 + 7);
    assert!(!t.c.on_withdraw(acct("solver.test"), U128(100), Err(PromiseError::Failed)));
    assert_eq!(t.solver().free.0, after + 100);
}

// ------------------------------------------------------------- params and misc

#[test]
fn params_validation_rejects_bad_schedules() {
    let ok = Params::demo();
    ok.validate();
    let mut p = ok.clone();
    p.tiers.reverse();
    assert!(std::panic::catch_unwind(|| p.validate()).is_err());
    let mut p = ok.clone();
    p.band_e8 = 90_000_000;
    assert!(std::panic::catch_unwind(|| p.validate()).is_err());
    let mut p = ok;
    p.tiers[2].payout_bps = 20_000;
    assert!(std::panic::catch_unwind(|| p.validate()).is_err());
}

#[test]
fn quote_message_is_stable() {
    let q = Quote {
        rfq_id: "rfq-1".into(),
        solver: acct("solver-a.testnet"),
        holder: acct("holder.testnet"),
        notional: U128(100_000_000),
        tenor_secs: 300,
        premium: U128(5_000_000),
        max_payout: U128(15_000_000),
        expires_ts: 1_700_000_060,
        nonce: 7,
        params_hash: "ab".repeat(32),
    };
    assert_eq!(
        String::from_utf8(quote_message(&q)).unwrap(),
        format!(
            "floor-quote/v1|rfq-1|solver-a.testnet|dUSD|holder.testnet|100000000|300|5000000|15000000|1700000060|7|{}",
            "ab".repeat(32)
        )
    );
}

/// Vector produced by apps/worker (TypeScript, @noble/curves) for the same quote and key seed [7; 32].
/// If this fails the worker and the contract no longer agree on quote bytes or signatures.
#[test]
fn typescript_worker_signature_verifies_in_rust() {
    let q = Quote {
        rfq_id: "rfq-1".into(),
        solver: acct("solver-a.testnet"),
        holder: acct("holder.testnet"),
        notional: U128(100_000_000),
        tenor_secs: 300,
        premium: U128(5_000_000),
        max_payout: U128(15_000_000),
        expires_ts: 1_700_000_060,
        nonce: 7,
        params_hash: "ab".repeat(32),
    };
    let sk = SigningKey::from_bytes(&[7u8; 32]);
    assert_eq!(
        hex(&sk.verifying_key().to_bytes()),
        "ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c"
    );
    let ts_sig = "0a9b21e4b1f26bb04ea97c4b38e733b4e50eb3e35349403d6d17af4ea130ae22efc271164f72fa22dbe24038c0c8aae744430f36be241d07125af1298afe6702";
    assert_eq!(hex(&sk.sign(&quote_message(&q)).to_bytes()), ts_sig, "ed25519 is deterministic");
    set_ctx("anyone.test", T0);
    assert!(verify_signature(&sk.verifying_key().to_bytes(), ts_sig, &quote_message(&q)).is_ok());
}

#[test]
fn params_hash_is_deterministic() {
    set_ctx("owner.test", T0);
    let a = Floor::new(acct("owner.test"), acct("fusdc.test"), acct("pool.test"), None);
    let b = Floor::new(acct("owner.test"), acct("fusdc.test"), acct("pool.test"), None);
    assert_eq!(a.get_params_hash(), b.get_params_hash());
    assert_eq!(a.get_params_hash().len(), 64);
}

#[test]
#[should_panic(expected = "TIME_WENT_BACKWARDS")]
fn price_time_cannot_go_backwards() {
    let mut t = T::new();
    t.price(100_000_000, T0 + 50);
    t.price(100_000_000, T0 + 40);
}

#[test]
fn margin_accounting_is_conserved_across_a_payout() {
    let mut t = T::new();
    let total0 = 1_000_000_000u128; // deposited
    active_policy(&mut t);
    t.price(95_000_000, T0 + 60);
    t.price(95_000_000, T0 + 95);
    t.at("anyone.test", T0 + 96);
    let paid = t.c.trigger(1).0;
    let s = t.solver();
    // margin now = deposited + premium earned - payout sent to the holder
    assert_eq!(s.free.0 + s.locked.0, total0 + 5_000_000 - paid);
    assert_eq!(t.c.total_exposure, 0);
}
