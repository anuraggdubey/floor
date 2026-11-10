"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useFloor, type Live } from "@/lib/useFloor";

const Ctx = createContext<Live | null>(null);

/** One connection to the worker for the whole page; every section reads from it. */
export function LiveProvider({ children, holder }: { children: ReactNode; holder?: string | null }) {
  const live = useFloor(holder);
  return <Ctx.Provider value={live}>{children}</Ctx.Provider>;
}

export function useLive(): Live {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLive must be used inside <LiveProvider>");
  return v;
}
