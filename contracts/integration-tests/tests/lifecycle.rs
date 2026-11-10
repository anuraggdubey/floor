//! Full lifecycle on a local NEAR sandbox: three contracts, a signing solver, two holders, a pool dump.
//! Run with `cargo test -p integration-tests -- --nocapture` (or `make verify`). Needs no secrets.

use ed25519_dalek::{Signer, SigningKey};
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};
use std::time::Duration;
use tokio::time::sleep;

type Res<T> = anyhow::Result<T>;

const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
const GAS: Gas = Gas::from_tgas(200);
const USDC: u128 = 1_000_000; // 6 decimals

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

struct Env {
    worker: Worker<near_workspaces::network::Sandbox>,
    fusdc: Contract,
    pool: Contract,
    floor: Contract,
    solver: Account,
    sk: SigningKey,
    nonce: u64,
}

async fn deploy(path: &str, worker: &Worker<near_workspaces::network::Sandbox>) -> Res<Contract> {
    let wasm = near_workspaces::compile_project(path).await?;
    Ok(worker.dev_deploy(&wasm).await?)
}

async fn setup() -> Res<Env> {
    let worker = near_workspaces::sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let fusdc = deploy("../fusdc", &worker).await?;
    let pool = deploy("../peg-pool", &worker).await?;
    let floor = deploy("../floor", &worker).await?;

    fusdc.call("new").args_json(json!({ "owner": owner.id() })).transact().await?.into_result()?;
    pool.call("new").args_json(json!({ "owner": owner.id() })).transact().await?.into_result()?;
    // short windows so the sandbox test runs in seconds; production-like defaults are in Params::demo()
    let params = json!({
        "band_e8": 99_500_000u64,
        "tiers": [
            { "below_price_e8": 97_000_000u64, "payout_bps": 300 },
            { "below_price_e8": 93_000_000u64, "payout_bps": 800 },
            { "below_price_e8": 90_000_000u64, "payout_bps": 1500 }
        ],
        "sustain_secs": 3, "settle_secs": 2, "lookback_secs": 6, "wait_secs": 3, "stale_secs": 30,
        "max_tenor_secs": 120, "exposure_cap": "1000000000000"
    });
    floor
        .call("new")
        .args_json(json!({ "owner": owner.id(), "fusdc": fusdc.id(), "pool": pool.id(), "params": params }))
        .transact()
        .await?
        .into_result()?;

    // the Floor contract must be registered with fUSDC to receive ft_transfer_call
    owner
        .call(fusdc.id(), "storage_deposit")
        .args_json(json!({ "account_id": floor.id(), "registration_only": true }))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?
        .into_result()?;

    // solver: register key, fund via faucet, deposit margin
    let solver = worker.dev_create_account().await?;
    let sk = SigningKey::from_bytes(&[42u8; 32]);
    solver
        .call(floor.id(), "register_solver")
        .args_json(json!({ "pubkey_hex": hex(&sk.verifying_key().to_bytes()) }))
        .transact()
        .await?
        .into_result()?;
    solver.call(fusdc.id(), "faucet").transact().await?.into_result()?;
    let dep = solver
        .call(fusdc.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": floor.id(), "amount": (1_000 * USDC).to_string(), "msg": "{\"action\":\"deposit_margin\"}" }))
        .deposit(ONE_YOCTO)
        .gas(GAS)
        .transact()
        .await?
        .into_result()?;
    assert!(dep.logs().iter().any(|l| l.contains("margin_deposited")), "margin deposit event missing");

    Ok(Env { worker, fusdc, pool, floor, solver, sk, nonce: 0 })
}

impl Env {
    async fn poke(&self) -> Res<()> {
        let a = self.worker.dev_create_account().await?;
        a.call(self.floor.id(), "poke").gas(GAS).transact().await?.into_result()?;
        Ok(())
    }

    async fn price(&self) -> Res<u128> {
        let v: String = self.pool.view("get_price_e8").await?.json()?;
        Ok(v.parse()?)
    }

    async fn gate(&self) -> Res<Value> {
        Ok(self.floor.view("get_gate").await?.json()?)
    }

    async fn balance(&self, id: &near_workspaces::AccountId) -> Res<u128> {
        let v: String = self.fusdc.view("ft_balance_of").args_json(json!({ "account_id": id })).await?.json()?;
        Ok(v.parse()?)
    }

    async fn policy(&self, id: u64) -> Res<Value> {
        Ok(self.floor.view("get_policy").args_json(json!({ "policy_id": id })).await?.json()?)
    }

    async fn make_holder(&self) -> Res<Account> {
        let h = self.worker.dev_create_account().await?;
        h.call(self.fusdc.id(), "faucet").transact().await?.into_result()?;
        h.call(self.pool.id(), "claim_demo").transact().await?.into_result()?;
        Ok(h)
    }

    /// Build and sign a quote exactly as an off-chain solver bot will. Returns (quote, signature_hex).
    async fn quote(&mut self, holder: &Account, notional: u128, premium: u128) -> Res<(Value, String)> {
        self.nonce += 1;
        let params_hash: String = self.floor.view("get_params_hash").await?.json()?;
        let now = self.worker.view_block().await?.timestamp() / 1_000_000_000;
        let q = json!({
            "rfq_id": format!("rfq-{}", self.nonce),
            "solver": self.solver.id(),
            "holder": holder.id(),
            "notional": notional.to_string(),
            "tenor_secs": 60,
            "premium": premium.to_string(),
            "max_payout": (notional * 1_500 / 10_000).to_string(),
            "expires_ts": now + 600,
            "nonce": self.nonce,
            "params_hash": params_hash,
        });
        let msg = format!(
            "floor-quote/v1|{}|{}|dUSD|{}|{}|{}|{}|{}|{}|{}|{}",
            q["rfq_id"].as_str().unwrap(),
            self.solver.id(),
            holder.id(),
            notional,
            60,
            premium,
            notional * 1_500 / 10_000,
            q["expires_ts"],
            self.nonce,
            params_hash
        );
        let sig = hex(&self.sk.sign(msg.as_bytes()).to_bytes());
        Ok((q, sig))
    }

    async fn buy(&self, holder: &Account, quote: Value, sig: String, premium: u128) -> Res<Vec<String>> {
        let msg = json!({ "action": "buy", "quote": quote, "signature": sig }).to_string();
        let r = holder
            .call(self.fusdc.id(), "ft_transfer_call")
            .args_json(json!({ "receiver_id": self.floor.id(), "amount": premium.to_string(), "msg": msg }))
            .deposit(ONE_YOCTO)
            .gas(GAS)
            .transact()
            .await?
            .into_result()?;
        Ok(r.logs().iter().map(|s| s.to_string()).collect())
    }

    /// Sell dUSD into the pool; returns the USD units received.
    async fn dump(&self, who: &Account, amount: u128) -> Res<u128> {
        let out: String = who
            .call(self.pool.id(), "sell_dusd")
            .args_json(json!({ "amount": amount.to_string() }))
            .transact()
            .await?
            .into_result()?
            .json()?;
        Ok(out.parse()?)
    }
}

#[tokio::test]
async fn buy_dump_trigger_payout() -> Res<()> {
    let mut e = setup().await?;
    let holder = e.make_holder().await?;
    let latecomer = e.make_holder().await?;
    let notional = 100 * USDC;
    let premium = 5 * USDC;

    // 1. peg is at 1.00 and a poke opens the gate
    assert_eq!(e.price().await?, 100_000_000);
    e.poke().await?;
    assert_eq!(e.gate().await?["open"], true, "gate should be open at the peg");

    // 2. holder buys cover with a solver-signed quote; solver margin is locked
    let before = e.balance(holder.id()).await?;
    let (q, sig) = e.quote(&holder, notional, premium).await?;
    let logs = e.buy(&holder, q.clone(), sig.clone(), premium).await?;
    assert!(logs.iter().any(|l| l.contains("policy_created")), "logs: {logs:?}");
    assert_eq!(e.balance(holder.id()).await?, before - premium, "premium moved to the contract");
    assert_eq!(e.policy(1).await?["status"], "Pending");
    let stats: Value = e.floor.view("get_pool_stats").await?.json()?;
    assert_eq!(stats["locked_margin"], (15 * USDC).to_string());

    // 3. replaying the same quote is refused and refunded
    let logs = e.buy(&holder, q, sig, premium).await?;
    assert!(logs.iter().any(|l| l.contains("NONCE_USED")), "logs: {logs:?}");
    assert_eq!(e.balance(holder.id()).await?, before - premium, "replay refunded in full");

    // 4. wait out the activation delay, refresh the price, activate
    sleep(Duration::from_secs(4)).await;
    e.poke().await?;
    let a = e.worker.dev_create_account().await?;
    a.call(e.floor.id(), "activate").args_json(json!({ "policy_id": 1 })).gas(GAS).transact().await?.into_result()?;
    assert_eq!(e.policy(1).await?["status"], "Active");

    // 5. break the peg: three dumps push the price below every tier line
    let attacker = e.make_holder().await?;
    for _ in 0..3 {
        let _ = e.dump(&attacker, 25_000 * USDC).await?;
    }
    let p = e.price().await?;
    assert!(p < 90_000_000, "price after dumps: {p}");

    // 6. the gate closes and a late buyer is refused on-chain
    e.poke().await?;
    let gate = e.gate().await?;
    assert_eq!(gate["open"], false);
    assert_eq!(gate["reason"], "GATE_CLOSED");
    let late_before = e.balance(latecomer.id()).await?;
    let (q2, s2) = e.quote(&latecomer, notional, premium).await?;
    let logs = e.buy(&latecomer, q2, s2, premium).await?;
    assert!(logs.iter().any(|l| l.contains("GATE_CLOSED")), "logs: {logs:?}");
    assert_eq!(e.balance(latecomer.id()).await?, late_before, "late buyer refunded");

    // 7. the breach must be sustained: poke across the sustain window, then trigger
    for _ in 0..7 {
        sleep(Duration::from_secs(1)).await;
        e.poke().await?;
    }
    let log: Value = e.floor.view("get_sustained_log").await?.json()?;
    assert!(!log.as_array().unwrap().is_empty(), "no tier was sustained");
    let holder_before = e.balance(holder.id()).await?;
    let t = a.call(e.floor.id(), "trigger").args_json(json!({ "policy_id": 1 })).gas(GAS).transact().await?.into_result()?;
    assert!(t.logs().iter().any(|l| l.contains("policy_triggered")), "logs: {:?}", t.logs());

    // 8. the holder is paid in fUSDC on NEAR: 15% of 100 = 15 fUSDC (all three tiers sustained)
    let policy = e.policy(1).await?;
    assert_eq!(policy["status"], "PaidOut", "policy: {policy}");
    assert_eq!(policy["tier_idx"], 2);
    assert_eq!(e.balance(holder.id()).await? - holder_before, 15 * USDC);

    // 9. the solver lost exactly the payout net of the premium it earned; nothing is left locked
    let s: Value = e.floor.view("get_solver").args_json(json!({ "account_id": e.solver.id() })).await?.json()?;
    assert_eq!(s["locked"], "0");
    assert_eq!(s["free"], (1_000 * USDC + premium - 15 * USDC).to_string());
    Ok(())
}

#[tokio::test]
async fn flash_dump_that_recovers_pays_nothing() -> Res<()> {
    let mut e = setup().await?;
    let holder = e.make_holder().await?;
    e.poke().await?;
    let (q, sig) = e.quote(&holder, 100 * USDC, 5 * USDC).await?;
    e.buy(&holder, q, sig, 5 * USDC).await?;
    sleep(Duration::from_secs(4)).await;
    e.poke().await?;
    let a = e.worker.dev_create_account().await?;
    a.call(e.floor.id(), "activate").args_json(json!({ "policy_id": 1 })).gas(GAS).transact().await?.into_result()?;

    // dump then buy straight back: price is below the line for far less than the 3s sustain window
    let trader = e.make_holder().await?;
    let out = e.dump(&trader, 30_000 * USDC).await?;
    assert!(e.price().await? < 97_000_000, "dump should cross the first tier line");
    trader
        .call(e.pool.id(), "buy_dusd")
        .args_json(json!({ "amount": out.to_string() }))
        .transact()
        .await?
        .into_result()?;
    assert!(e.price().await? >= 99_500_000, "round trip restores the peg");
    for _ in 0..3 {
        e.poke().await?;
    }
    let r = a.call(e.floor.id(), "trigger").args_json(json!({ "policy_id": 1 })).gas(GAS).transact().await?;
    assert!(r.is_failure(), "a flash dump must not trigger a payout");
    assert_eq!(e.policy(1).await?["status"], "Active");
    Ok(())
}
