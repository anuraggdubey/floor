// Prints the EVM address the Floor contract controls through NEAR Chain Signatures.
//
// The MPC derives a key from (calling NEAR account, derivation path, domain). Because the *contract*
// is the caller, only contract logic can ever get a signature for this address — that is the whole point.
//
//   pnpm --filter @floor/worker derive-address [contractAccountId] [path]
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex } from "@noble/hashes/utils";

const RPC = process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com";
const SIGNER = process.env.SIGNER_CONTRACT ?? "v1.signer-prod.testnet";
const account = process.argv[2] ?? process.env.FLOOR_CONTRACT ?? "floorxa-floor.testnet";
const path = process.argv[3] ?? process.env.EVM_DERIVATION_PATH ?? "floor-pool-1";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Decode(s) {
  let num = 0n;
  for (const ch of s) {
    const i = B58.indexOf(ch);
    if (i < 0) throw new Error(`bad base58 char: ${ch}`);
    num = num * 58n + BigInt(i);
  }
  let hex = num.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const body = Uint8Array.from(hex.match(/../g).map((h) => parseInt(h, 16)));
  // restore leading zero bytes, which base58 encodes as '1'
  let zeros = 0;
  for (const ch of s) { if (ch === "1") zeros++; else break; }
  return Uint8Array.from([...new Uint8Array(zeros), ...body]);
}

/** EIP-55 checksum, so the address can be pasted into a faucet without complaint. */
function toChecksum(addrLower) {
  const hash = bytesToHex(keccak_256(addrLower));
  let out = "0x";
  for (let i = 0; i < 40; i++) {
    out += parseInt(hash[i], 16) >= 8 ? addrLower[i].toUpperCase() : addrLower[i];
  }
  return out;
}

async function view(contractId, method, args) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "query",
      params: {
        request_type: "call_function", finality: "final",
        account_id: contractId, method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      },
    }),
  });
  const json = await res.json();
  if (json.error || json.result?.error) throw new Error(JSON.stringify(json.error ?? json.result.error));
  return JSON.parse(Buffer.from(json.result.result).toString("utf8"));
}

const pub = await view(SIGNER, "derived_public_key", { path, predecessor: account, domain_id: 0 });
const raw = base58Decode(String(pub).replace(/^secp256k1:/, ""));
if (raw.length !== 64) throw new Error(`expected a 64-byte uncompressed key, got ${raw.length}`);
const address = toChecksum(bytesToHex(keccak_256(raw)).slice(-40));

// Also report whether that address can actually pay, so funding it is a one-command check.
const EVM_RPC = process.env.EVM_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const USDC = process.env.EVM_USDC ?? "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

async function evmCall(body) {
  const r = await fetch(EVM_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }),
  });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result;
}

let funding = null;
try {
  const [wei, usdcHex] = await Promise.all([
    evmCall({ method: "eth_getBalance", params: [address, "latest"] }),
    evmCall({
      method: "eth_call",
      params: [{ to: USDC, data: "0x70a08231" + "0".repeat(24) + address.slice(2).toLowerCase() }, "latest"],
    }),
  ]);
  const eth = Number(BigInt(wei)) / 1e18;
  const usdc = Number(BigInt(usdcHex)) / 1e6;
  funding = {
    sepoliaEth: eth.toFixed(6),
    testUsdc: usdc.toFixed(2),
    // one ERC-20 transfer at a few gwei costs well under 0.001 ETH
    readyToPay: eth >= 0.002 && usdc >= 5,
  };
} catch (e) {
  funding = { error: String(e.message ?? e) };
}

console.log(
  JSON.stringify(
    { signer: SIGNER, nearAccount: account, path, derivedPublicKey: String(pub), evmAddress: address, funding },
    null,
    2,
  ),
);

if (funding && funding.readyToPay === false) {
  console.log("");
  console.log("This address is not funded yet. On Ethereum Sepolia it needs:");
  console.log("  - about 0.01 Sepolia ETH for gas   https://www.alchemy.com/faucets/ethereum-sepolia");
  console.log("  - at least 5 test USDC             https://faucet.circle.com  (choose Ethereum Sepolia)");
  console.log("");
  console.log("Paste this address into both:");
  console.log("  " + address);
}
