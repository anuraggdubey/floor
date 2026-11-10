//! Data types shared by the Floor contract, its views and its tests.

use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

/// One payout tier: pays `payout_bps` of notional once the price has stayed below `below_price_e8`
/// for the sustain window. Prices are 8-decimal fixed point (1.00 = 100_000_000).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Tier {
    pub below_price_e8: u64,
    pub payout_bps: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Params {
    /// Cover is only sold, and only activates, while price >= band.
    pub band_e8: u64,
    /// Shallowest tier first: `below_price_e8` strictly decreasing, `payout_bps` strictly increasing.
    pub tiers: Vec<Tier>,
    /// How long the price must stay below a tier line before it counts as a trigger.
    pub sustain_secs: u64,
    /// Cover cannot be bought until the price has been in band for this long.
    pub lookback_secs: u64,
    /// A purchase only becomes Active after this wait, and only if the price stayed in band.
    pub wait_secs: u64,
    /// Price observations older than this are rejected.
    pub stale_secs: u64,
    pub max_tenor_secs: u64,
    /// Cap on the total margin locked across all open policies.
    pub exposure_cap: U128,
}

impl Params {
    pub fn demo() -> Self {
        Self {
            band_e8: 99_500_000,
            tiers: vec![
                Tier { below_price_e8: 97_000_000, payout_bps: 300 },
                Tier { below_price_e8: 93_000_000, payout_bps: 800 },
                Tier { below_price_e8: 90_000_000, payout_bps: 1_500 },
            ],
            sustain_secs: 30,
            lookback_secs: 120,
            wait_secs: 20,
            stale_secs: 60,
            max_tenor_secs: 600,
            exposure_cap: U128(1_000_000_000_000),
        }
    }

    pub fn validate(&self) {
        assert!(!self.tiers.is_empty(), "NO_TIERS");
        assert!(self.band_e8 > self.tiers[0].below_price_e8, "BAND_BELOW_FIRST_TIER");
        for w in self.tiers.windows(2) {
            assert!(w[1].below_price_e8 < w[0].below_price_e8, "TIERS_NOT_DESCENDING");
            assert!(w[1].payout_bps > w[0].payout_bps, "PAYOUTS_NOT_ASCENDING");
        }
        assert!(self.tiers.last().unwrap().payout_bps <= 10_000, "PAYOUT_OVER_100_PERCENT");
        assert!(self.max_tenor_secs > self.wait_secs, "TENOR_NOT_ABOVE_WAIT");
    }

    pub fn max_bps(&self) -> u32 {
        self.tiers.last().map(|t| t.payout_bps).unwrap_or(0)
    }

    /// Canonical string committed to by solver quotes, so a quote is only valid for this tier schedule.
    pub fn canonical(&self) -> String {
        let mut s = format!("band:{}", self.band_e8);
        for t in &self.tiers {
            s.push_str(&format!("|{}:{}", t.below_price_e8, t.payout_bps));
        }
        s
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default)]
pub struct TierState {
    /// When the price first dropped below this tier line in the current breach.
    pub start_ts: Option<u64>,
    /// True once the current breach has lasted `sustain_secs`.
    pub sustained: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Solver {
    /// ed25519 public key (32 bytes) used to sign quotes.
    pub pubkey: Vec<u8>,
    pub free: U128,
    pub locked: U128,
    pub active: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Status {
    Pending,
    Active,
    Void,
    Triggered,
    PaidOut,
    Expired,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Policy {
    pub id: u64,
    pub holder: AccountId,
    pub solver: AccountId,
    pub notional: U128,
    pub premium: U128,
    pub max_payout: U128,
    pub created_ts: u64,
    pub activate_ts: u64,
    pub expires_ts: u64,
    pub status: Status,
    pub tier_idx: Option<u8>,
    pub payout_amount: U128,
    /// Amount the contract still owes the holder (a premium refund or a payout).
    pub owed: U128,
    /// True while a transfer to the holder is in flight.
    pub paying: bool,
}

/// A solver's offer. The solver signs `quote_message(&quote)` with its ed25519 key.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct Quote {
    pub rfq_id: String,
    pub solver: AccountId,
    pub holder: AccountId,
    pub notional: U128,
    pub tenor_secs: u64,
    pub premium: U128,
    pub max_payout: U128,
    pub expires_ts: u64,
    pub nonce: u64,
    pub params_hash: String,
}

/// Canonical bytes a solver signs. Must match `packages`/worker code byte for byte.
pub fn quote_message(q: &Quote) -> Vec<u8> {
    format!(
        "floor-quote/v1|{}|{}|dUSD|{}|{}|{}|{}|{}|{}|{}|{}",
        q.rfq_id,
        q.solver,
        q.holder,
        q.notional.0,
        q.tenor_secs,
        q.premium.0,
        q.max_payout.0,
        q.expires_ts,
        q.nonce,
        q.params_hash
    )
    .into_bytes()
}

/// Message sent in `ft_transfer_call` to the Floor contract.
#[near(serializers = [json])]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum Msg {
    DepositMargin,
    Buy { quote: Quote, signature: String },
}

#[near(serializers = [json])]
pub struct GateView {
    pub price_e8: U128,
    pub price_ts: u64,
    pub last_out_of_band_ts: Option<u64>,
    pub tiers: Vec<TierState>,
    pub open: bool,
    /// Why the gate is closed (`STALE_PRICE` or `GATE_CLOSED`), if it is.
    pub reason: Option<String>,
}

#[near(serializers = [json])]
pub struct PoolStats {
    pub solvers: u64,
    pub policies: u64,
    pub free_margin: U128,
    pub locked_margin: U128,
    pub exposure_cap: U128,
}
