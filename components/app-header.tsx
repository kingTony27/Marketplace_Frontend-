"use client"

import SearchBar from "@/components/search";
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useCurrency } from "@/lib/currencyContext";

export default function AppHeader() {
  const { currency, toggle } = useCurrency();

  return (
    <header className="sticky top-0 z-40 w-full basis-full bg-zinc-900 border-b border-zinc-800">
      {/* Thin dark green/black accent line at the very top edge */}
      <div aria-hidden="true" className="h-1.5 bg-[#0c1a12]" />

      <div className="flex h-16 items-center gap-2 px-3 sm:gap-4 sm:px-6">
        {/* Mobile sidebar trigger — the desktop rail has its own toggle */}
        <SidebarTrigger className="md:hidden" />

        {/* Logo */}
        <a
          href="/"
          aria-label="Home"
          className="h-8 w-8 shrink-0 rounded-full bg-linear-to-br from-green-400 via-green-500 to-black transition-transform duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 sm:h-10 sm:w-10"
        />

        {/* Search */}
        <div className="flex min-w-0 flex-1 justify-center">
          <div className="relative w-full max-w-2xl">
           <SearchBar/>
          </div>
        </div>

        {/* Currency toggle: prices switch between ETH and USDC */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            aria-label={`Prices are shown in ${currency}. Click to switch currency.`}
            title={`Prices are shown in ${currency}. Click to switch.`}
            className="flex min-h-11 min-w-14 items-center justify-center rounded-full border border-zinc-700 px-3 text-xs font-semibold text-zinc-200 transition-colors duration-200 hover:border-green-400 hover:text-green-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 md:min-h-9 md:min-w-12"
          >
            {currency}
          </button>

          <ConnectButton
           accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
          chainStatus={{ smallScreen: "icon", largeScreen: "full" }}
          showBalance={{ smallScreen: false, largeScreen: true }}
          />
        </div>
      </div>
    </header>
  );
}
