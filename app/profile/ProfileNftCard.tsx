// app/profile/ProfileNftCard.tsx
// Shared card for BOTH the Listings and Gallery tabs.
// Uniform sizing: aspect-square image, fixed card height, no masonry.
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProfileNft } from "./types";
import { useCurrency } from "@/lib/currencyContext";

const IPFS_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? "https://gateway.pinata.cloud/ipfs/";

function resolveIpfs(uri: string): string {
  return uri.startsWith("ipfs://")
    ? IPFS_GATEWAY + uri.slice("ipfs://".length).replace(/^ipfs\//, "")
    : uri;
}

interface NftMeta {
  name: string;
  image: string | null;
}

async function fetchMeta(tokenUri: string | null): Promise<NftMeta> {
  if (!tokenUri) return { name: "", image: null };
  try {
    const res = await fetch(resolveIpfs(tokenUri));
    const meta = await res.json();
    return {
      name: meta.name ?? "",
      image: meta.image ? resolveIpfs(meta.image) : null,
    };
  } catch {
    return { name: "", image: null };
  }
}

interface Props {
  nft: ProfileNft;
  /** "listings" links to /nft/[listingId]; "gallery" has no link. */
  variant: "listings" | "gallery";
  /** True only when the connected wallet owns this profile. */
  owner?: boolean;
  /** Gallery-only: called with the NFT whose token id should be listed. */
  onList?: (nft: ProfileNft) => void;
}

export default function ProfileNftCard({ nft, variant, owner, onList }: Props) {
  const { formatPrice } = useCurrency();
  const [meta, setMeta] = useState<NftMeta>({ name: "", image: null });
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMeta(nft.tokenUri).then((m) => {
      if (!cancelled) setMeta(m);
    });
    return () => {
      cancelled = true;
    };
  }, [nft.tokenUri]);

  const priceText = nft.price ? formatPrice(nft.price) : "";

  // Only the owner, only in the gallery, and only if the view gave us a token id.
  const canList = variant === "gallery" && owner === true && !!onList && nft.tokenId !== "";

  const inner = (
    <div className="group flex h-full flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-colors duration-200 hover:border-zinc-700">
      {/* Square image area — always the same size across all cards. */}
      <div className="relative aspect-square w-full overflow-hidden bg-zinc-800">
        {meta.image && !imgFailed ? (
          <img
            src={meta.image}
            alt={meta.name || "NFT"}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-zinc-600">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-10 w-10"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          </div>
        )}

        {/* Owner-only: list this gallery NFT without minting again. Always
            visible on touch; revealed on hover from lg up. */}
        {canList && (
          <button
            type="button"
            onClick={() => onList?.(nft)}
            className="absolute inset-x-2 bottom-2 rounded-lg bg-green-400 py-3 text-sm font-semibold text-zinc-900 transition-opacity duration-200 hover:bg-green-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 lg:opacity-0 lg:py-2 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
          >
            List
          </button>
        )}
      </div>

      {/* Text area — fixed height so all cards align. Listings show the
          price at the bottom; Gallery shows only the name (no token id). */}
      <div className="flex flex-1 flex-col justify-end p-3">
        {variant === "listings"
          ? priceText && (
              <p className="truncate text-sm text-green-400">{priceText}</p>
            )
          : meta.name && (
              <p className="truncate text-sm font-medium text-white">
                {meta.name}
              </p>
            )}
      </div>
    </div>
  );

  if (variant === "listings" && nft.listingId) {
    return (
      <Link
        href={`/nft/${nft.listingId}`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
      >
        {inner}
      </Link>
    );
  }

  return inner;
}
