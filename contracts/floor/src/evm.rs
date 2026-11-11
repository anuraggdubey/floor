//! Minimal EIP-1559 transaction encoding, enough to build a USDC `transfer` and its signing hash
//! inside a NEAR contract. No external dependencies besides the NEAR host `keccak256`.

use near_sdk::env;

/// RLP encode a byte string.
pub fn rlp_bytes(b: &[u8]) -> Vec<u8> {
    if b.len() == 1 && b[0] < 0x80 {
        return vec![b[0]];
    }
    let mut out = len_prefix(b.len(), 0x80);
    out.extend_from_slice(b);
    out
}

/// RLP encode a list whose items are already RLP encoded.
pub fn rlp_list(items: &[Vec<u8>]) -> Vec<u8> {
    let payload: Vec<u8> = items.iter().flatten().copied().collect();
    let mut out = len_prefix(payload.len(), 0xc0);
    out.extend(payload);
    out
}

fn len_prefix(len: usize, offset: u8) -> Vec<u8> {
    if len < 56 {
        vec![offset + len as u8]
    } else {
        let be = (len as u64).to_be_bytes();
        let first = be.iter().position(|b| *b != 0).unwrap_or(7);
        let lb = &be[first..];
        let mut v = vec![offset + 55 + lb.len() as u8];
        v.extend_from_slice(lb);
        v
    }
}

/// Minimal big-endian bytes of an unsigned integer (zero is the empty string).
pub fn uint_bytes(v: u128) -> Vec<u8> {
    let be = v.to_be_bytes();
    match be.iter().position(|b| *b != 0) {
        Some(i) => be[i..].to_vec(),
        None => vec![],
    }
}

fn rlp_uint(v: u128) -> Vec<u8> {
    rlp_bytes(&uint_bytes(v))
}

pub fn hex_decode(s: &str) -> Vec<u8> {
    let s = s.strip_prefix("0x").unwrap_or(s);
    assert!(s.len() % 2 == 0, "odd hex length");
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).expect("bad hex"))
        .collect()
}

pub fn hex_encode(b: &[u8]) -> String {
    const H: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(b.len() * 2);
    for x in b {
        s.push(H[(x >> 4) as usize] as char);
        s.push(H[(x & 15) as usize] as char);
    }
    s
}

pub fn parse_address(s: &str) -> [u8; 20] {
    let b = hex_decode(s);
    assert!(b.len() == 20, "address must be 20 bytes");
    let mut a = [0u8; 20];
    a.copy_from_slice(&b);
    a
}

/// ABI encoding of ERC-20 `transfer(address,uint256)`.
pub fn erc20_transfer_data(recipient: [u8; 20], amount: u128) -> Vec<u8> {
    let mut d = vec![0xa9, 0x05, 0x9c, 0xbb];
    d.extend_from_slice(&[0u8; 12]);
    d.extend_from_slice(&recipient);
    d.extend_from_slice(&[0u8; 16]);
    d.extend_from_slice(&amount.to_be_bytes());
    d
}

pub struct Eip1559Tx {
    pub chain_id: u64,
    pub nonce: u64,
    pub max_priority_fee_per_gas: u128,
    pub max_fee_per_gas: u128,
    pub gas_limit: u64,
    pub to: [u8; 20],
    pub value: u128,
    pub data: Vec<u8>,
}

impl Eip1559Tx {
    /// `0x02 || rlp([chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList])`
    pub fn unsigned_payload(&self) -> Vec<u8> {
        let fields = vec![
            rlp_uint(self.chain_id as u128),
            rlp_uint(self.nonce as u128),
            rlp_uint(self.max_priority_fee_per_gas),
            rlp_uint(self.max_fee_per_gas),
            rlp_uint(self.gas_limit as u128),
            rlp_bytes(&self.to),
            rlp_uint(self.value),
            rlp_bytes(&self.data),
            rlp_list(&[]),
        ];
        let mut out = vec![0x02];
        out.extend(rlp_list(&fields));
        out
    }

    /// keccak256 of the unsigned payload: the 32 bytes handed to the MPC signer.
    pub fn signing_hash(&self) -> [u8; 32] {
        let h = env::keccak256(&self.unsigned_payload());
        let mut out = [0u8; 32];
        out.copy_from_slice(&h);
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    // Vector produced with viem 2.57.17 `serializeTransaction` + `keccak256`
    // (EIP-1559, Sepolia chain id 11155111, ERC-20 transfer of 5,000,000 units).
    const TOKEN: &str = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
    const RECIPIENT: &str = "0x525521d79134822a342d330bd91da67976569af1";
    const DATA: &str = "a9059cbb000000000000000000000000525521d79134822a342d330bd91da67976569af100000000000000000000000000000000000000000000000000000000004c4b40";
    const SERIALIZED: &str = "02f87183aa36a7078459682f008506fc23ac00830186a0941c7d4b196cb0c7b01d743fbc6116a902379c723880b844a9059cbb000000000000000000000000525521d79134822a342d330bd91da67976569af100000000000000000000000000000000000000000000000000000000004c4b40c0";
    const HASH: &str = "ceee0c58ebce8ab6cba8a4f507e0429956c0296b6ad8e5eaad094141c244ca2e";

    fn tx() -> Eip1559Tx {
        Eip1559Tx {
            chain_id: 11155111,
            nonce: 7,
            max_priority_fee_per_gas: 1_500_000_000,
            max_fee_per_gas: 30_000_000_000,
            gas_limit: 100_000,
            to: parse_address(TOKEN),
            value: 0,
            data: erc20_transfer_data(parse_address(RECIPIENT), 5_000_000),
        }
    }

    #[test]
    fn erc20_data_matches_viem() {
        let d = erc20_transfer_data(parse_address(RECIPIENT), 5_000_000);
        assert_eq!(hex_encode(&d), DATA);
    }

    #[test]
    fn unsigned_payload_matches_viem() {
        assert_eq!(hex_encode(&tx().unsigned_payload()), SERIALIZED);
    }

    #[test]
    fn signing_hash_matches_viem() {
        testing_env!(VMContextBuilder::new().build());
        assert_eq!(hex_encode(&tx().signing_hash()), HASH);
    }

    #[test]
    fn rlp_edge_cases() {
        assert_eq!(rlp_bytes(&[]), vec![0x80]);
        assert_eq!(rlp_bytes(&[0x7f]), vec![0x7f]);
        assert_eq!(rlp_bytes(&[0x80]), vec![0x81, 0x80]);
        assert_eq!(rlp_list(&[]), vec![0xc0]);
        assert_eq!(uint_bytes(0), Vec::<u8>::new());
        assert_eq!(uint_bytes(1024), vec![0x04, 0x00]);
        let long = vec![1u8; 56];
        assert_eq!(&rlp_bytes(&long)[..2], &[0xb8, 56]);
    }
}
