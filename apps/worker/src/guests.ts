// Guest accounts: each visitor gets a real NEAR testnet sub-account so they need no wallet.
// CUSTODIAL and TESTNET ONLY: the server holds the key (encrypted at rest with ENC_SECRET). Disclosed in the UI and README.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { KeyPair, nearToYocto } from "near-api-js";
import type { Account } from "near-api-js";
import type { Chain } from "./chain.js";
import type { Cfg } from "./config.js";

interface GuestRecord {
  token: string;
  accountId: string;
  enc: string;
  createdAt: number;
  ip: string;
}

/** fUSDC every new guest receives from the admin mint: 5,000 (6 decimals). */
export const GUEST_FUSDC = "5000000000";

function encKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

export function encrypt(plain: string, secret: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", encKey(secret), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64")).join(".");
}

export function decrypt(blob: string, secret: string): string {
  const [iv, tag, body] = blob.split(".").map((s) => Buffer.from(s, "base64")) as [Buffer, Buffer, Buffer];
  const d = crypto.createDecipheriv("aes-256-gcm", encKey(secret), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8");
}

export class Guests {
  private recs = new Map<string, GuestRecord>();
  private accounts = new Map<string, Account>();
  private perIp = new Map<string, number[]>();
  private file: string;

  constructor(
    private chain: Chain,
    private cfg: Cfg,
  ) {
    fs.mkdirSync(cfg.stateDir, { recursive: true });
    this.file = path.join(cfg.stateDir, "guests.json");
    if (fs.existsSync(this.file)) {
      try {
        for (const r of JSON.parse(fs.readFileSync(this.file, "utf8")) as GuestRecord[]) this.recs.set(r.token, r);
      } catch {
        /* corrupt state file: start empty */
      }
    }
  }

  get count(): number {
    return this.recs.size;
  }

  private save(): void {
    fs.writeFileSync(this.file, JSON.stringify([...this.recs.values()], null, 1), { mode: 0o600 });
  }

  private recent: number[] = [];

  /**
   * At most 12 new guests per 10 minutes across all callers. The per-IP limit below is only as good as the IP we
   * can see; this cap holds even when someone rotates addresses, so one script cannot burn the parent account's
   * NEAR or fill every guest slot in a burst.
   */
  private allowGlobal(): boolean {
    const now = Date.now();
    this.recent = this.recent.filter((t) => now - t < 600_000);
    if (this.recent.length >= 12) return false;
    this.recent.push(now);
    return true;
  }

  /** At most 5 new guests per IP per hour. */
  private allowIp(ip: string): boolean {
    const now = Date.now();
    const xs = (this.perIp.get(ip) ?? []).filter((t) => now - t < 3_600_000);
    if (xs.length >= 5) return false;
    xs.push(now);
    this.perIp.set(ip, xs);
    return true;
  }

  async create(ip: string): Promise<{ token: string; accountId: string }> {
    if (this.recs.size >= this.cfg.maxGuests) throw new Error("GUEST_LIMIT: the demo is full, try again later");
    if (!this.allowIp(ip)) throw new Error("RATE_LIMIT: too many new guests from this address");
    if (!this.allowGlobal()) throw new Error("RATE_LIMIT: lots of new visitors right now, try again in a few minutes");
    const kp = KeyPair.fromRandom("ed25519");
    const prefix = "g" + crypto.randomBytes(5).toString("hex");
    const accountId = `${prefix}.${this.cfg.guestParent.id}`;
    const parent = this.chain.account(this.cfg.guestParent.id, this.cfg.guestParent.key);
    await parent.createSubAccount({
      accountOrPrefix: prefix,
      publicKey: kp.getPublicKey(),
      nearToTransfer: nearToYocto(this.cfg.guestNear as `${number}`),
    });
    const token = crypto.randomBytes(24).toString("hex");
    this.recs.set(token, { token, accountId, enc: encrypt(kp.toString(), this.cfg.encSecret), createdAt: Date.now(), ip });
    this.save();

    // Demo money: fUSDC from the admin mint (also registers the account with the token), pool credits from the pool faucet.
    const admin = this.chain.account(this.cfg.admin.id, this.cfg.admin.key);
    const guest = this.account(token)!;
    await Promise.all([
      this.chain.send(admin, this.cfg.fusdc, "mint", { account_id: accountId, amount: GUEST_FUSDC }, { tgas: 30 }),
      this.chain.send(guest, this.cfg.pool, "claim_demo", {}, { tgas: 30 }),
    ]);
    return { token, accountId };
  }

  account(token: string): Account | undefined {
    const rec = this.recs.get(token);
    if (!rec) return undefined;
    let a = this.accounts.get(token);
    if (!a) {
      a = this.chain.account(rec.accountId, decrypt(rec.enc, this.cfg.encSecret));
      this.accounts.set(token, a);
    }
    return a;
  }

  accountId(token: string): string | undefined {
    return this.recs.get(token)?.accountId;
  }
}
