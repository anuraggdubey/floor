import type { Metadata } from "next";
import { PlayClient } from "@/components/play/PlayClient";

export const metadata: Metadata = {
  title: "Break the peg — Floor",
  description: "Buy depeg cover, break the peg yourself, and watch the contract pay. NEAR testnet.",
};

export default function PlayPage() {
  return <PlayClient />;
}
