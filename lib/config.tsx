// lib/config.ts
"use client"

import { http, cookieStorage, createStorage, createConfig } from 'wagmi'
import { hardhat, mainnet, sepolia } from 'wagmi/chains'
import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  metaMaskWallet,
  coinbaseWallet,
  injectedWallet,
} from '@rainbow-me/rainbowkit/wallets'

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [metaMaskWallet,  coinbaseWallet, injectedWallet],
    },
  ],
  { appName: 'NFT Marketplace', projectId }
)

export const config = createConfig({
  connectors,
  chains: [hardhat, sepolia, mainnet],
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
  transports: {
    [hardhat.id]: http('http://127.0.0.1:8545'),
    [mainnet.id]: http(process.env.NEXT_PUBLIC_MAINNET_RPC_URL),
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
  },
})