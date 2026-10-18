// app/nft/[listingId]/page.tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { readNft, readOthers, type CachedNft } from "@/lib/nftCache";
import NftDetailClient from "./NftDetailClient";
import { useCurrency } from "@/lib/currencyContext";

// NftDetail wants pixel sizes; only the ratio matters for layout
const size = (ratio: number) => ({ width: Math.round(ratio * 1000), height: 1000 });

export default function NftPage() {
  const { formatPrice } = useCurrency();
  const { listingId } = useParams<{ listingId: string }>();
  // undefined = still reading storage, null = nothing saved
  const [nft, setNft] = useState<CachedNft | null | undefined>(undefined);
  const [others, setOthers] = useState<CachedNft[]>([]);

  useEffect(() => {
    setNft(readNft(listingId));
    setOthers(readOthers(listingId));
  }, [listingId]);

  if (nft === undefined) return null;

  if (nft === null) {
    return (
      <div className="mx-auto max-w-6xl bg-zinc-900 px-4 py-16 text-center font-display text-zinc-300">
        <p>We couldn't find this NFT.</p>
        <Link href="/" className="mt-4 inline-block text-green-400 hover:underline">
          Back to the marketplace
        </Link>
      </div>
    );
  }

  return (
    <NftDetailClient
      nftId={nft.id}
      listingId={nft.listingId}
      price={nft.price}
      paymentToken={nft.paymentToken}
      seller={nft.seller}
      active
      media={
        nft.image
          ? { type: "image", src: nft.image, alt: nft.name, ...size(nft.ratio) }
          : null
      }
      title={nft.name}
      creatorName={`${nft.seller.slice(0, 6)}...${nft.seller.slice(-4)}`}
      creatorAddress={nft.seller}
      related={others
        .filter((o) => o.image)
        .map((o) => ({
          id: o.listingId,
          src: o.image!,
          alt: o.name,
          ...size(o.ratio),
          badge: formatPrice(o.price),
          href: `/nft/${o.listingId}`,
        }))}
    />
  );
}