// The cross-chain payout leg.
//
// When the Floor contract triggers a policy it also reserves an EVM payout. This executor finishes that job:
// it supplies the gas parameters and nonce, asks the contract to get the transaction signed by the NEAR MPC,
// then assembles and broadcasts the signed transaction on the EVM chain.
//
// It deliberately holds no key for the EVM address. The address is controlled by the contract through Chain
// Signatures, so the only way to move funds out of it is to make the contract ask for a signature — and the
// contract only ever asks for a payout it already owes.
import type { Hex } from "viem";
import type { Chain } from "./chain.js";
import type { Cfg } from "./config.js";
import type { Bus } from "./events.js";

export interface EvmChainCfg {
  name: string;
  chain_id: number;
  token: string;
  path: string;
  signer: string;
  cap: string;
}

export interface EvmPayout {
  id: number;
  policy_id: number;
  to: string;
  amount: string;
  status: "Reserved" | "Signing" | "Signed" | "Confirmed";
  sighash: string | null;
  signature: string | null;
  evm_tx: string | null;
  nonce: number | null;
}

/** What the MPC signer returns for an ECDSA request. */
interface SignerResponse {
  scheme?: string;
  big_r?: { affine_point: string };
  s?: { scalar: string };
  recovery_id?: number;
}

const ERC20_ABI = [
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
/** Enough for an ERC-20 transfer with room to spare; the contract refuses anything outside 21k..300k. */
const GAS_LIMIT = 100_000n;

export function startEvmExecutor(chain: Chain, cfg: Cfg, bus: Bus) {
  if (!cfg.evmRpcUrl) return { stop: () => {} };

  // viem is a large dependency; importing it lazily keeps worker startup instant and means a problem here
  // can never stop the NEAR side of the demo from coming up.
  type Viem = typeof import("viem");
  let viem: Viem | null = null;
  let client: ReturnType<Viem["createPublicClient"]> | null = null;
  async function ready() {
    if (client) return true;
    try {
      const [v, chains] = await Promise.all([import("viem"), import("viem/chains")]);
      viem = v;
      client = v.createPublicClient({ chain: chains.sepolia, transport: v.http(cfg.evmRpcUrl) });
      bus.emit("evm", { ok: true, step: "ready", rpc: cfg.evmRpcUrl, address: cfg.evmPoolAddress });
      return true;
    } catch (e) {
      bus.emit("evm", { ok: false, step: "load", error: String((e as Error)?.message ?? e).slice(0, 200) });
      return false;
    }
  }
  const admin = chain.account(cfg.admin.id, cfg.admin.key);
  let busy = false;
  /** Payout ids we have already given up on this run, so a bad one cannot spin forever. */
  const failed = new Set<number>();
  let warnedUnfunded = false;

  async function poolAddress(): Promise<Hex | null> {
    return (cfg.evmPoolAddress as Hex) ?? null;
  }

  /** Does the contract-controlled address hold enough gas and USDC to make this payout? */
  async function fundedFor(amount: bigint, token: Hex, from: Hex) {
    const c = client!;
    const [gas, usdc, fees] = await Promise.all([
      c.getBalance({ address: from }),
      c.readContract({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [from] }) as Promise<bigint>,
      c.estimateFeesPerGas(),
    ]);
    const needGas = GAS_LIMIT * (fees.maxFeePerGas ?? 2_000_000_000n);
    return { ok: gas >= needGas && usdc >= amount, gas, usdc, needGas, fees };
  }

  async function run(po: EvmPayout, evm: EvmChainCfg) {
    const from = await poolAddress();
    if (!from) return;
    const token = evm.token as Hex;
    const amount = BigInt(po.amount);

    const f = await fundedFor(amount, token, from);
    if (!f.ok) {
      if (!warnedUnfunded) {
        warnedUnfunded = true;
        bus.emit("evm", {
          ok: false,
          waiting_for_funds: true,
          address: from,
          has_gas_wei: f.gas.toString(),
          needs_gas_wei: f.needGas.toString(),
          has_usdc: f.usdc.toString(),
          needs_usdc: amount.toString(),
        });
      }
      return; // nothing is wasted: we have not asked for a signature or spent a nonce
    }
    warnedUnfunded = false;

    // 1. gas parameters and the next nonce for the contract's own address
    const nonce = await client!.getTransactionCount({ address: from, blockTag: "pending" });
    const maxFeePerGas = f.fees.maxFeePerGas ?? 2_000_000_000n;
    const maxPriorityFeePerGas = f.fees.maxPriorityFeePerGas ?? 1_000_000_000n;

    // 2. the contract builds and hashes the transaction itself, then asks the MPC to sign it
    let signed = po;
    if (po.status === "Reserved" || !po.signature) {
      const r = await chain.send(
        admin,
        cfg.floor,
        "request_evm_payout",
        {
          payout_id: po.id,
          nonce,
          max_priority_fee_per_gas: maxPriorityFeePerGas.toString(),
          max_fee_per_gas: maxFeePerGas.toString(),
          gas_limit: Number(GAS_LIMIT),
        },
        { tgas: 250 },
      );
      if (!r.ok) {
        bus.emit("evm", { ok: false, id: po.id, step: "sign", error: r.error });
        failed.add(po.id);
        return;
      }
      const fresh = await chain.view<EvmPayout>(cfg.floor, "get_evm_payout", { payout_id: po.id });
      if (!fresh?.signature) {
        // the MPC may still answer later; leave it for the next pass
        bus.emit("evm", { ok: false, id: po.id, step: "sign", error: "no signature yet" });
        return;
      }
      signed = fresh;
      bus.emit("evm", { ok: true, id: po.id, step: "signed", tx: r.hash, sighash: fresh.sighash });
    }

    // 3. rebuild the exact transaction the contract hashed, attach the signature, broadcast
    const sig = JSON.parse(signed.signature!) as SignerResponse;
    const bigR = sig.big_r?.affine_point;
    if (!bigR || !sig.s?.scalar) {
      bus.emit("evm", { ok: false, id: po.id, step: "broadcast", error: "signature response has no r/s" });
      failed.add(po.id);
      return;
    }
    const data = viem!.encodeFunctionData({ abi: ERC20_ABI, functionName: "transfer", args: [signed.to as Hex, amount] });
    const raw = viem!.serializeTransaction(
      {
        type: "eip1559",
        chainId: evm.chain_id,
        nonce: signed.nonce ?? nonce,
        maxPriorityFeePerGas,
        maxFeePerGas,
        gas: GAS_LIMIT,
        to: token,
        value: 0n,
        data,
        accessList: [],
      },
      // r is the x coordinate of big_r: bytes 1..33 of its compressed encoding
      { r: `0x${bigR.slice(2)}` as Hex, s: `0x${sig.s.scalar}` as Hex, yParity: sig.recovery_id ?? 0 },
    );

    try {
      const hash = await client!.sendRawTransaction({ serializedTransaction: raw });
      const c = await chain.send(admin, cfg.floor, "confirm_evm_payout", { payout_id: po.id, evm_tx: hash }, { tgas: 60 });
      bus.emit("evm", {
        ok: true,
        id: po.id,
        policy_id: po.policy_id,
        step: "broadcast",
        evm_tx: hash,
        to: signed.to,
        amount: signed.amount,
        chain: evm.name,
        explorer: `https://sepolia.etherscan.io/tx/${hash}`,
        confirmed_on_near: c.ok,
      });
    } catch (e) {
      bus.emit("evm", { ok: false, id: po.id, step: "broadcast", error: String((e as Error)?.message ?? e).slice(0, 300) });
      failed.add(po.id);
    }
  }

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      if (!(await ready())) return;
      const evm = await chain.view<EvmChainCfg | null>(cfg.floor, "get_evm_chain");
      if (!evm) return;
      const all = (await chain.view<EvmPayout[]>(cfg.floor, "list_evm_payouts")) ?? [];
      const todo = all.filter((p) => p.status !== "Confirmed" && !failed.has(p.id));
      for (const po of todo) await run(po, evm);
    } catch (e) {
      bus.emit("evm", { ok: false, step: "tick", error: String((e as Error)?.message ?? e).slice(0, 200) });
    } finally {
      busy = false;
    }
  }

  const timer = setInterval(() => void tick(), 12_000);
  void tick();
  return { stop: () => clearInterval(timer) };
}
