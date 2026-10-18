// app/profile/[wallet]/page.tsx
// Server component: reads the profile directly from Supabase (no API routes).
// Wallet address is the identity (NOT Supabase Auth).
import { notFound } from "next/navigation";
import { supabasePublic } from "@/lib/supabaseClient";
import ProfilePage from "../profile";
import { PROFILE_PAGE_SIZE, type ProfileNft, type ListingRow, type GalleryRow } from "../types";



const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

async function getCounts(wallet: string): Promise<{ totalSales: number | null; totalBuys: number | null }> {
  try {
    const [salesRes, buysRes] = await Promise.all([
      supabasePublic
        .from("sales")
        .select("id", { count: "exact", head: true })
        .ilike("seller_address", wallet),
      supabasePublic
        .from("sales")
        .select("id", { count: "exact", head: true })
        .ilike("buyer_address", wallet),
    ]);
    return {
      totalSales: salesRes.error ? null : salesRes.count ?? 0,
      totalBuys: buysRes.error ? null : buysRes.count ?? 0,
    };
  } catch {
    return { totalSales: null, totalBuys: null };
  }
}

function normalizeListings(rows: ListingRow[]): ProfileNft[] {
  return rows.map((r) => ({
    id: String(r.listing_id),
    listingId: String(r.listing_id),
    tokenId: String(r.nfts?.token_id ?? ""),
    tokenUri: r.nfts?.token_uri ?? null,
    price: r.price ? String(r.price) : null,
    paymentToken: r.payment_token ?? null,
  }));
}

function normalizeGallery(rows: GalleryRow[]): ProfileNft[] {
  return rows.map((r) => ({
    id: String(r.nft_id),
    listingId: null,
    tokenId: String(r.token_id ?? ""),
    tokenUri: r.token_uri ?? null,
    price: r.last_sale_price ? String(r.last_sale_price) : null,
    paymentToken: r.last_sale_payment_token ?? null,
  }));
}

export default async function Profile({
  params,
}: {
  params: Promise<{ wallet: string }>;
}) {
  const { wallet: rawWallet } = await params;
  let wallet: string;
  try {
    wallet = decodeURIComponent(rawWallet);
  } catch {
    notFound();
  }
  if (!ADDRESS_RE.test(wallet)) notFound();

  // Fetch everything in parallel.
  const [userRes, counts, listingsRes, galleryRes] = await Promise.all([
    supabasePublic
      .from("users")
      .select("username, avatar_url")
      .ilike("wallet", wallet)
      .maybeSingle(),

    getCounts(wallet),

    supabasePublic
      .from("listings")
      .select("listing_id, price, payment_token, nfts!inner(token_id, token_uri)")
      .ilike("seller_address", wallet)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .range(0, PROFILE_PAGE_SIZE - 1),
      
    supabasePublic
      .from("nft_gallery")
      .select("nft_id, token_id, token_uri, last_sale_price, last_sale_payment_token")
      .ilike("owner_address", wallet)
      .order("acquired_at", { ascending: false })
      .range(0, PROFILE_PAGE_SIZE - 1),
  ]);

  const user = userRes.data;
  const listings = listingsRes.error ? [] : normalizeListings((listingsRes.data ?? []) as unknown as ListingRow[]);
  const gallery = galleryRes.error ? [] : normalizeGallery((galleryRes.data ?? []) as unknown as GalleryRow[]);

  return (
    <ProfilePage
      wallet={wallet}
      username={user?.username ?? null}
      avatarUrl={user?.avatar_url ?? null}
      totalSales={counts.totalSales}
      totalBuys={counts.totalBuys}
      listings={listings}
      gallery={gallery}
      listingsNextOffset={listings.length === PROFILE_PAGE_SIZE ? PROFILE_PAGE_SIZE : null}
      galleryNextOffset={gallery.length === PROFILE_PAGE_SIZE ? PROFILE_PAGE_SIZE : null}
    />
  );
}
