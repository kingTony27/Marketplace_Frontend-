// app/profile/types.ts
// Shared types for the profile page (listings + gallery).

export const PROFILE_PAGE_SIZE = 20;

export interface ProfileNft {
  /** Stable id for React keys. listings row id OR nfts.id for gallery. */
  id: string;
  /** For listings: the listings.id used to link to /nft/[listingId]. */
  listingId?: string | null;
  tokenId: string;
  tokenUri: string | null;
  /** Price in wei (listings) OR last sale price in wei (gallery). */
  price: string | null;
  paymentToken: string | null;
}

export type ListingRow = {
  listing_id: string | number;
  price: string | number | null;
  payment_token: string | null;
  nfts: { token_id: string | number; token_uri: string | null } | null;
};

export type GalleryRow = {
  nft_id: string | number;
  token_id: string | number | null;
  token_uri: string | null;
  last_sale_price: string | number | null;
  last_sale_payment_token: string | null;
};

export interface ProfilePageProps {
  wallet: string;
  username: string | null;
  avatarUrl: string | null;
  totalSales: number | null;
  totalBuys: number | null;
  listings: ProfileNft[];
  gallery: ProfileNft[];
  listingsNextOffset: number | null;
  galleryNextOffset: number | null;
}

export type TabId = "listings" | "gallery";

export interface TabContent {
  items: ProfileNft[];
  nextOffset: number | null;
}
