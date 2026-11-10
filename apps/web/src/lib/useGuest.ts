"use client";

import { useCallback, useEffect, useState } from "react";
import { api, GUEST_KEY, type Balances } from "./api";

export interface Guest {
  accountId: string | null;
  balances: Balances | null;
  loading: boolean;
  error: string | null;
  /** Create a testnet sub-account for this visitor (custodial, testnet only). */
  start: () => Promise<void>;
  topUp: () => Promise<void>;
  refresh: () => Promise<void>;
}

/** The visitor's throwaway NEAR account: no wallet, no seed phrase, no gas. */
export function useGuest(): Guest {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!localStorage.getItem(GUEST_KEY)) return;
    try {
      const me = await api.me();
      setAccountId(me.accountId);
      setBalances(me.balances);
    } catch {
      // the worker restarted and lost this token: drop it so the visitor can start again
      localStorage.removeItem(GUEST_KEY);
      setAccountId(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // keep balances honest while the demo runs
  useEffect(() => {
    if (!accountId) return;
    const t = setInterval(() => void refresh(), 6000);
    return () => clearInterval(t);
  }, [accountId, refresh]);

  const start = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const g = await api.guest();
      localStorage.setItem(GUEST_KEY, g.token);
      setAccountId(g.accountId);
      setBalances(g.balances);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const topUp = useCallback(async () => {
    setLoading(true);
    try {
      await api.faucet();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  return { accountId, balances, loading, error, start, topUp, refresh };
}
