// app/nft/[listingId]/NftDetailClient.tsx
"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { zeroAddress } from "viem";
import NftDetail, { type NftComment, type NftDetailProps } from "@/components/NftDetail";
import { api } from "@/lib/api";
import { useSession } from "@/lib/useSession";

const MARKETPLACE_ADDRESS = process.env.NEXT_PUBLIC_MARKETPLACE_CONTRACT_ADDRESS as `0x${string}`;

const marketplaceAbi = [
  {
    type: "function",
    name: "buyItem",
    stateMutability: "payable",
    inputs: [{ name: "listingId", type: "uint256" }],
    outputs: [],
  },
] as const;

type ApiComment = {
  id: string;
  body: string;
  author: { address: string; username: string | null };
};

const shortAddress = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

interface Props extends NftDetailProps {
  nftId: string; // the nfts.id (uuid), NOT the listing id
  listingId: string;
  price: string;
  paymentToken: string;
  seller: string;
  active: boolean;
}

export default function NftDetailClient({
  nftId,
  listingId,
  price,
  paymentToken,
  seller,
  active,
  ...rest
}: Props) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const session = useSession();
  const sessionAddress = session.data?.address ?? null;

  const [likeInfo, setLikeInfo] = useState<{ count: number; likedByMe: boolean } | null>(null);
  const [comments, setComments] = useState<NftComment[] | null>(null);

  // Reload when the page opens, and again when the user signs in or out
  useEffect(() => {
    if (session.isLoading) return;
    let cancelled = false;

    api<{ count: number; likedByMe?: boolean }>(`/api/nfts/${nftId}/likes`)
      .then((d) => {
        if (!cancelled) setLikeInfo({ count: d.count, likedByMe: d.likedByMe ?? false });
      })
      .catch(() => {});

    api<{ comments: ApiComment[] }>(`/api/nfts/${nftId}/comments?limit=50`)
      .then((d) => {
        if (cancelled) return;
        setComments(
          d.comments
            .map((c) => ({
              id: c.id,
              author: c.author.username ?? shortAddress(c.author.address),
              text: c.body,
            }))
            .reverse() // API sends newest first; the list shows oldest first
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [nftId, sessionAddress, session.isLoading]);

  async function handleLike(next: boolean) {
    await api(`/api/nfts/${nftId}/like`, { method: next ? "PUT" : "DELETE" });
  }

  async function handleAddComment(text: string) {
    await api(`/api/nfts/${nftId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: text }),
    });
  }

  async function handleBuy() {
    if (!isConnected || !address) throw new Error("Connect your wallet first");
    if (address.toLowerCase() === seller.toLowerCase())
      throw new Error("You can't buy your own listing");
    if (paymentToken.toLowerCase() !== zeroAddress)
      throw new Error("ERC-20 payments need an approve step first");

    const hash = await writeContractAsync({
      address: MARKETPLACE_ADDRESS,
      abi: marketplaceAbi,
      functionName: "buyItem",
      args: [BigInt(listingId)],
      value: BigInt(price),
    });
    await publicClient!.waitForTransactionReceipt({ hash });
  }

  return (
    <NftDetail
      {...rest}
      price={price}
      likeCount={likeInfo?.count ?? rest.likeCount}
      initialLiked={likeInfo?.likedByMe ?? false}
      comments={comments ?? rest.comments}
      onLikeChange={handleLike}
      onAddComment={handleAddComment}
      actionLabel={active ? "Buy" : "Sold"}
      onMint={active ? handleBuy : undefined}
    />
  );
}