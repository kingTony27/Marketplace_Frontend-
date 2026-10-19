'use client'

import "@rainbow-me/rainbowkit/styles.css";
import { WagmiProvider, useAccount, type State } from 'wagmi'
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { AuthProvider } from "@/lib/authProvider"
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { hardhat, sepolia } from "wagmi/chains";
import { config } from '../lib/config' // wherever your config lives

import { useEffect, useRef, useState } from 'react' 

/**
 * Wipes client storage when the wallet disconnects and reloads the page, so a
 * draft saved by the previous user is never shown to the next one on a shared
 * browser. "reconnecting" is ignored so a refresh doesn't trigger a false reset.
 */
function ResetStorageOnDisconnect() {
  const { status } = useAccount();
  const wasConnected = useRef(false);

  useEffect(() => {
    if (status === 'connected') {
      wasConnected.current = true;
      return;
    }
    // Ignore transient states and the initial "never connected" load.
    if (status === 'connecting' || status === 'reconnecting') return;
    if (status !== 'disconnected' || !wasConnected.current) return;

    wasConnected.current = false;
    try {
      localStorage.clear();
    } catch {
      /* storage unavailable */
    }
    window.location.reload();
  }, [status]);

  return null;
}

export function Providers({ children, initialState }: { children: React.ReactNode, initialState?: State }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // keep wallet queries cached across route changes so the profile
        // page can re-use the already-resolved address after a refresh.
        staleTime: 60_000,
        refetchOnWindowFocus: false,
      },
    },
  }))

  return (
    <WagmiProvider config={config} initialState={initialState}>
      <ResetStorageOnDisconnect />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RainbowKitProvider
            theme={darkTheme({
              accentColor: '#000000da', // your button color
              accentColorForeground: 'white', // text color on the button
              borderRadius: 'medium',
            })}
            modalSize="compact"
            initialChain={sepolia} // default to hardhat; switch to sepolia for prod
          >
            {children}
          </RainbowKitProvider>
        </AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}