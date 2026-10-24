// lib/enrichNft.ts

//get ipfs gateway for NFT metadata 
const GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? "https://gateway.pinata.cloud/ipfs/";

export interface ApiListing {
  id: string;
  tokenId: string;
  tokenUri: string;
  listingId: string;
  seller: string;
  price: string; // wei
  paymentToken: string;
}

export interface ListingItem extends ApiListing {
  name: string;
  description: string;
  image: string | null;
  ratio: number; // width / height
}

export const resolveIpfs = (uri: string) => // resolve ipfs uri to gateway
  uri.startsWith("ipfs://")
    ? GATEWAY + uri.slice("ipfs://".length).replace(/^ipfs\//, "")
    : uri;

const measure = (src: string) =>
  new Promise<number>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth / img.naturalHeight || 1);
    img.onerror = () => resolve(1);
    img.src = src;
  });

export async function enrich(listing: ApiListing): Promise<ListingItem> { // enrich listing with metadata
  try {
    const res = await fetch(resolveIpfs(listing.tokenUri));
    const meta = await res.json();
    const image = meta.image ? resolveIpfs(meta.image) : null;
    return {
      ...listing,
      name: meta.name ?? `NFT #${listing.tokenId}`,
      description: meta.description ?? "",
      image,
      ratio: image ? await measure(image) : 1,
    };
  } catch {
    return {
      ...listing,
      name: `NFT #${listing.tokenId}`,
      description: "",
      image: null,
      ratio: 1,
    };
  }
}