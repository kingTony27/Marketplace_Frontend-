// app/profile/[wallet]/actions.ts
// Server actions for paginating the profile's Listings and Gallery tabs.
"use server";

import { supabasePublic } from "@/lib/supabaseClient";
import { PROFILE_PAGE_SIZE, type ProfileNft, type ListingRow } from "@/app/profile/types";

const PAGE_SIZE = PROFILE_PAGE_SIZE;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

// One row of the `nft_gallery` view (see the SQL that creates it).
// This replaces the old GalleryRow type from "@/app/profile/types".
type GalleryViewRow = {
  nft_id: string | number;
  token_id: string | number | null;
  token_uri: string | null;
  last_sale_price: string | number | null;
  last_sale_payment_token: string | null;
};

function normalizeListings(rows: ListingRow[]): ProfileNft[] {
  return rows.map((r) => ({
    id: String(r.listing_id),
    listingId: String(r.listing_id),
    tokenId: String(r.nfts?.token_id ?? ""),
    tokenUri: r.nfts?.token_uri ?? null,
    price: r.price != null ? String(r.price) : null,
    paymentToken: r.payment_token ?? null,
  }));
}

function normalizeGallery(rows: GalleryViewRow[]): ProfileNft[] {
  return rows.map((r) => ({
    id: String(r.nft_id),
    listingId: null, // gallery NFTs are not listed
    tokenId: String(r.token_id ?? ""),
    tokenUri: r.token_uri ?? null,
    // null = never sold. A real price of 0 is kept, not hidden.
    price: r.last_sale_price != null ? String(r.last_sale_price) : null,
    paymentToken: r.last_sale_payment_token ?? null,
  }));
}

export async function loadListings(
  wallet: string,
  offset: number
): Promise<{ items: ProfileNft[]; nextOffset: number | null }> {
  console.log(wallet);
  if (!ADDRESS_RE.test(wallet)) {
    return { items: [], nextOffset: null };
  }

  const { data, error } = await supabasePublic
    .from("listings")
    .select("listing_id, price, payment_token, nfts!inner(token_id, token_uri)")
    .ilike("seller_address", wallet)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .order("listing_id", { ascending: false }) // tiebreaker so pages never overlap
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) {
    console.error("loadListings failed:", error.message);
    return { items: [], nextOffset: null };
  }

  const items = normalizeListings((data ?? []) as unknown as ListingRow[]);
  const nextOffset = items.length === PAGE_SIZE ? offset + PAGE_SIZE : null;
  return { items, nextOffset };
}

export async function loadGallery(
  wallet: string,
  offset: number
): Promise<{ items: ProfileNft[]; nextOffset: number | null }> {
  if (!ADDRESS_RE.test(wallet)) {
    return { items: [], nextOffset: null };

  }

  // The view already excludes actively listed NFTs and already holds the
  // token info and last sale, so this is a single query.
  const { data, error } = await supabasePublic
    .from("nft_gallery")
    .select("nft_id, token_id, token_uri, last_sale_price, last_sale_payment_token")
    .ilike("owner_address", wallet)
    .order("acquired_at", { ascending: false })
    .order("nft_id", { ascending: false }) // tiebreaker so pages never overlap
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) {
    console.error("loadGallery failed:", error.message);
    return { items: [], nextOffset: null };
  }

  const items = normalizeGallery((data ?? []) as unknown as GalleryViewRow[]);
  const nextOffset = items.length === PAGE_SIZE ? offset + PAGE_SIZE : null;
  return { items, nextOffset };
}