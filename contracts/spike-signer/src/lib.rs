//! Spike S1: the contract itself builds an ERC-20 `transfer` for a fixed token, hashes it, and asks the
//! NEAR MPC signer (Chain Signatures) to sign it. The caller supplies only recipient, amount and fees,
//! so it cannot get any other transaction signed (this is "Design A" in floor-build-guide.md).

use near_sdk::json_types::U128;
use near_sdk::serde_json::{json, Value};
use near_sdk::{
    env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
};

pub mod evm;
use evm::{erc20_transfer_data, hex_encode, parse_address, Eip1559Tx};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct SpikeSigner {
    owner: AccountId,
    signer: AccountId,
    token: String,
    chain_id: u64,
    last_hash: Option<String>,
    last_signature: Option<String>,
}

#[near]
impl SpikeSigner {
    #[init]
    pub fn new(signer: AccountId, token_address: String, chain_id: u64) -> Self {
        parse_address(&token_address); // validates length and hex
        Self {
            owner: env::predecessor_account_id(),
            signer,
            token: token_address,
            chain_id,
            last_hash: None,
            last_signature: None,
        }
    }

    /// Free view: the 32-byte hash the contract would send to the signer.
    pub fn preview_hash(
        &self,
        recipient: String,
        amount: U128,
        nonce: u64,
        max_priority_fee_per_gas: U128,
        max_fee_per_gas: U128,
        gas_limit: u64,
    ) -> String {
        let tx = self.build_tx(recipient, amount, nonce, max_priority_fee_per_gas, max_fee_per_gas, gas_limit);
        hex_encode(&tx.signing_hash())
    }

    /// Ask the MPC signer to sign the transfer. Owner only in this spike.
    pub fn sign_transfer(
        &mut self,
        path: String,
        recipient: String,
        amount: U128,
        nonce: u64,
        max_priority_fee_per_gas: U128,
        max_fee_per_gas: U128,
        gas_limit: u64,
    ) -> Promise {
        require!(env::predecessor_account_id() == self.owner, "owner only");
        let tx = self.build_tx(recipient, amount, nonce, max_priority_fee_per_gas, max_fee_per_gas, gas_limit);
        let hash = hex_encode(&tx.signing_hash());
        let args = json!({
            "request": { "payload_v2": { "Ecdsa": hash }, "path": path, "domain_id": 0 }
        });
        Promise::new(self.signer.clone())
            .function_call(
                "sign".to_string(),
                args.to_string().into_bytes(),
                NearToken::from_yoctonear(1),
                Gas::from_tgas(60),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(10))
                    .on_signed(hash),
            )
    }

    #[private]
    pub fn on_signed(
        &mut self,
        hash: String,
        #[callback_result] result: Result<Value, PromiseError>,
    ) -> Option<Value> {
        match result {
            Ok(sig) => {
                self.last_hash = Some(hash);
                self.last_signature = Some(sig.to_string());
                Some(sig)
            }
            Err(_) => None,
        }
    }

    pub fn get_last(&self) -> (Option<String>, Option<String>) {
        (self.last_hash.clone(), self.last_signature.clone())
    }

    pub fn get_config(&self) -> (AccountId, AccountId, String, u64) {
        (self.owner.clone(), self.signer.clone(), self.token.clone(), self.chain_id)
    }
}

impl SpikeSigner {
    fn build_tx(
        &self,
        recipient: String,
        amount: U128,
        nonce: u64,
        max_priority_fee_per_gas: U128,
        max_fee_per_gas: U128,
        gas_limit: u64,
    ) -> Eip1559Tx {
        Eip1559Tx {
            chain_id: self.chain_id,
            nonce,
            max_priority_fee_per_gas: max_priority_fee_per_gas.0,
            max_fee_per_gas: max_fee_per_gas.0,
            gas_limit,
            to: parse_address(&self.token),
            value: 0,
            data: erc20_transfer_data(parse_address(&recipient), amount.0),
        }
    }
}
