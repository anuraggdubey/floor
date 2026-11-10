//! fusdc: demo money for Floor (NEP-141, 6 decimals). Premiums, solver margin and payouts use this token.
//! Testnet only. A production deployment would use real USDC instead.

use near_contract_standards::fungible_token::core::FungibleTokenCore;
use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::resolver::FungibleTokenResolver;
use near_contract_standards::fungible_token::FungibleToken;
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::collections::LazyOption;
use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue,
};

/// Faucet amount per claim: 1,000 fUSDC (6 decimals).
pub const FAUCET_AMOUNT: u128 = 1_000_000_000;
/// One claim per account per 24 hours.
pub const FAUCET_COOLDOWN_SECS: u64 = 24 * 60 * 60;

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    FungibleToken,
    Metadata,
    Claims,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Fusdc {
    token: FungibleToken,
    metadata: LazyOption<FungibleTokenMetadata>,
    owner: AccountId,
    last_claim: LookupMap<AccountId, u64>,
}

#[near]
impl Fusdc {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        let metadata = FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: "Floor demo USDC".to_string(),
            symbol: "fUSDC".to_string(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: 6,
        };
        Self {
            token: FungibleToken::new(StorageKey::FungibleToken),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            owner,
            last_claim: LookupMap::new(StorageKey::Claims),
        }
    }

    /// Mint `FAUCET_AMOUNT` to the caller, at most once per 24 hours. Registers the caller if needed.
    pub fn faucet(&mut self) -> U128 {
        let who = env::predecessor_account_id();
        let now = env::block_timestamp() / 1_000_000_000;
        if let Some(last) = self.last_claim.get(&who) {
            require!(now >= last + FAUCET_COOLDOWN_SECS, "FAUCET_COOLDOWN");
        }
        self.last_claim.insert(who.clone(), now);
        self.mint_internal(&who, FAUCET_AMOUNT);
        U128(FAUCET_AMOUNT)
    }

    /// Owner-only mint, used to fund solver bots and holders in the demo.
    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        require!(env::predecessor_account_id() == self.owner, "OWNER_ONLY");
        self.mint_internal(&account_id, amount.0);
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }
}

impl Fusdc {
    fn mint_internal(&mut self, account_id: &AccountId, amount: u128) {
        if !self.token.accounts.contains_key(account_id) {
            self.token.internal_register_account(account_id);
        }
        self.token.internal_deposit(account_id, amount);
        near_contract_standards::fungible_token::events::FtMint {
            owner_id: account_id,
            amount: U128(amount),
            memo: Some("mint"),
        }
        .emit();
    }
}

#[near]
impl FungibleTokenCore for Fusdc {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Fusdc {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used_amount, _burned) =
            self.token.internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        used_amount.into()
    }
}

#[near]
impl StorageManagement for Fusdc {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        self.token.internal_storage_unregister(force).is_some()
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Fusdc {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.get().unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn ctx(who: AccountId, ts_secs: u64) -> VMContextBuilder {
        let mut b = VMContextBuilder::new();
        b.predecessor_account_id(who).block_timestamp(ts_secs * 1_000_000_000);
        b
    }

    #[test]
    fn faucet_mints_and_rate_limits() {
        testing_env!(ctx(accounts(0), 1_000).build());
        let mut c = Fusdc::new(accounts(0));
        testing_env!(ctx(accounts(1), 1_000).build());
        assert_eq!(c.faucet().0, FAUCET_AMOUNT);
        assert_eq!(c.ft_balance_of(accounts(1)).0, FAUCET_AMOUNT);
        assert_eq!(c.ft_total_supply().0, FAUCET_AMOUNT);
    }

    #[test]
    #[should_panic(expected = "FAUCET_COOLDOWN")]
    fn faucet_cooldown_blocks_second_claim() {
        testing_env!(ctx(accounts(0), 1_000).build());
        let mut c = Fusdc::new(accounts(0));
        testing_env!(ctx(accounts(1), 1_000).build());
        c.faucet();
        testing_env!(ctx(accounts(1), 1_000 + 60).build());
        c.faucet();
    }

    #[test]
    fn faucet_allows_claim_after_cooldown() {
        testing_env!(ctx(accounts(0), 1_000).build());
        let mut c = Fusdc::new(accounts(0));
        testing_env!(ctx(accounts(1), 1_000).build());
        c.faucet();
        testing_env!(ctx(accounts(1), 1_000 + FAUCET_COOLDOWN_SECS).build());
        c.faucet();
        assert_eq!(c.ft_balance_of(accounts(1)).0, 2 * FAUCET_AMOUNT);
    }

    #[test]
    #[should_panic(expected = "OWNER_ONLY")]
    fn mint_is_owner_only() {
        testing_env!(ctx(accounts(0), 1_000).build());
        let mut c = Fusdc::new(accounts(0));
        testing_env!(ctx(accounts(1), 1_000).build());
        c.mint(accounts(1), U128(1));
    }

    #[test]
    fn owner_can_mint() {
        testing_env!(ctx(accounts(0), 1_000).build());
        let mut c = Fusdc::new(accounts(0));
        c.mint(accounts(2), U128(5_000_000));
        assert_eq!(c.ft_balance_of(accounts(2)).0, 5_000_000);
    }

    #[test]
    fn metadata_is_six_decimals() {
        testing_env!(ctx(accounts(0), 1_000).build());
        let c = Fusdc::new(accounts(0));
        assert_eq!(c.ft_metadata().decimals, 6);
        assert_eq!(c.ft_metadata().symbol, "fUSDC");
    }
}
