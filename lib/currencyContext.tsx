// CurrencyContext.tsx
"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { formatEther, parseEther } from "viem";

export type Currency = "ETH" | "USDC";

interface CurrencyContextValue {
  /** The currency prices are displayed in. */
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  /** Flips between ETH and USDC. */
  toggle: () => void;
  /** ETH price in USD. 0 until the rate has loaded. */
  ethUsd: number;
  /** Formats a wei amount for display in the selected currency. */
  formatPrice: (wei: string | bigint) => string;
  /**
   * Converts a USDC amount into native-coin wei. Listings always settle in the
   * native coin, so a USDC price is converted before it is sent on-chain.
   * Returns null when the rate isn't available or the amount is invalid.
   */
  usdcPriceToWei: (usdc: string) => bigint | null;
}

const Ctx = createContext<CurrencyContextValue | null>(null);
const STORAGE_KEY = "currency";

export function CurrencyProvider({ children }: { children: ReactNode }) {
  // Start on ETH so the server and first client render agree, then restore the
  // saved choice after mount (localStorage doesn't exist during SSR).
  const [currency, setCurrencyState] = useState<Currency>("ETH");
  const [ethUsd, setEthUsd] = useState(0);
  // Don't persist until the saved value has been restored, or the first render
  // would overwrite the user's choice with the "ETH" default.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "ETH" || saved === "USDC") setCurrencyState(saved);
    } catch(error) {
      /* storage unavailable, keep the default */
      console.log("Error saving currency to storage",error)
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, currency);
    } catch {
      /* storage unavailable */
    }
  }, [hydrated, currency]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch( "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",)
          .then((r) => r.json())
          .then((d: { ethereum?: { usd?: number } }) => {
          const usd = d?.ethereum?.usd;
          if (!cancelled && typeof usd === "number" && usd > 0) setEthUsd(usd);
      })
        .catch((error) => {
          console.log("Error loading rates",error)
        });
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const setCurrency = useCallback((next: Currency) => setCurrencyState(next), []);
  const toggle = useCallback(() => setCurrencyState((c) => (c === "ETH" ? "USDC" : "ETH")), []);

  const formatPrice = useCallback(
    (wei: string | bigint) => {
      let eth: number;
      try {
        eth = Number(formatEther(BigInt(wei)));
      } catch {
        return "";
      }
      if (currency === "USDC") {
        if (!ethUsd) return "…";
        return `${(eth * ethUsd).toFixed(2)} USDC`;
      }
      return `${eth} ETH`;
    },
    [currency, ethUsd]
  );

  const usdcPriceToWei = useCallback(
    (usdc: string) => {
      if (!ethUsd) return null;
      const amount = Number(usdc);
      if (!Number.isFinite(amount) || amount <= 0) return null;
      try {
        return parseEther((amount / ethUsd).toFixed(18) as `${number}`);
      } catch {
        return null;
      }
    },
    [ethUsd]
  );

  const value = useMemo(
    () => ({ currency, setCurrency, toggle, ethUsd, formatPrice, usdcPriceToWei }),
    [currency, setCurrency, toggle, ethUsd, formatPrice, usdcPriceToWei]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrency() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCurrency must be used inside a CurrencyProvider");
  return ctx;
}
