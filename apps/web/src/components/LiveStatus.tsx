"use client";

import type { Live } from "@/lib/useFloor";
import { ago } from "@/lib/api";

/**
 * One honest line about why numbers are missing or old. The worker runs on a free host that sleeps when idle, so
 * the first visitor after a quiet spell waits for it to wake; say so instead of showing zeros and a spinner.
 * Renders nothing once live data is flowing.
 */
export function liveNote(live: Pick<Live, "status" | "stale" | "asOf">): string | null {
  if (live.status === "live") return null;
  const old = live.stale && live.asOf ? ` Showing what it looked like ${ago(live.asOf)}.` : "";
  if (live.status === "loading") return "Connecting to the chain…";
  if (live.status === "waking")
    return `Waking the demo server. The free host sleeps when idle, so this can take up to a minute. Retrying automatically.${old}`;
  return `Cannot reach the demo server right now. Still retrying in the background. The contracts on NEAR testnet are unaffected.${old}`;
}

export function LiveNote({ live, className = "" }: { live: Pick<Live, "status" | "stale" | "asOf">; className?: string }) {
  const text = liveNote(live);
  if (!text) return null;
  return (
    <p role="status" className={`text-mute text-[0.8125rem] leading-relaxed ${className}`}>
      <span
        className="bg-amber mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle"
        style={{ animation: "blink 1.6s ease-in-out infinite" }}
        aria-hidden="true"
      />
      {text}
    </p>
  );
}
