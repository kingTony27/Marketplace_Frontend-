// lib/marketplace.ts
export const MARKETPLACE_ADDRESS = process.env
  .NEXT_PUBLIC_MARKETPLACE_CONTRACT_ADDRESS as `0x${string}`;

export const marketplaceAbi = [
  {
    type: "function",
    name: "buyNFT", // <- rename to your real function
    stateMutability: "payable",
    inputs: [{ name: "listingId", type: "uint256" }],
    outputs: [],
  },
] as const;