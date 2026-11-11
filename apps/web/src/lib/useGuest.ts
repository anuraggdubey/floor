"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, GUEST_KEY, type Balances } from "./api";

export interface Guest {
  accountId: string | null;
  balances: Balances | null;
  loading: boolean;
  error: string | null;
  /** Create a testnet sub-account for this visitor (custodial, testnet only). */
  start: () => Promise<string | null>;
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
    } catch (e) {
      // Only forget the account when the worker positively says it does not know this token. A timeout, a
      // rate limit or a restart in progress must not log the visitor out of a demo halfway through.
      if (e instanceof ApiError && e.code === "NO_GUEST") {
        localStorage.removeItem(GUEST_KEY);
        setAccountId(null);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // keep balances honest while the demo runs
  useEffect(() => {
    if (!accountId) return;
    const t = setInterval(() => void refresh(), 12000);
    return () => clearInterval(t);
  }, [accountId, refresh]);

  const start = useCallback(async (): Promise<string | null> => {
    setLoading(true);
    setError(null);
    try {
      const g = await api.guest();
      localStorage.setItem(GUEST_KEY, g.token);
      setAccountId(g.accountId);
      setBalances(g.balances);
      return g.accountId;
    } catch (e) {
      setError((e as Error).message);
      return null;
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
