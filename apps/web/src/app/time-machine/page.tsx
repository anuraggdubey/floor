import type { Metadata } from "next";
import { TimeMachine } from "@/components/TimeMachine";

export const metadata: Metadata = {
  title: "Time machine — Floor",
  description: "Replay the real March 2023 USDC depeg and watch three underwriters price it, refuse it, and pay out.",
};

export default function Page() {
  return <TimeMachine />;
}
