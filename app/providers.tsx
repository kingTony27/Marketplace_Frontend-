'use client'

import "@rainbow-me/rainbowkit/styles.css";
import { WagmiProvider, type State } from 'wagmi'
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { AuthProvider } from "@/lib/authProvider"
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { hardhat, sepolia } from "wagmi/chains";
import { config } from '../lib/config' // wherever your config lives

import { useState } from 'react' 

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