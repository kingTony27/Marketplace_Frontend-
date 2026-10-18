// lib/nftCache.ts
export interface CachedNft {
  id:string;
  listingId: string;
  tokenId: string;
  name: string;
  description: string;
  image: string | null;
  ratio: number; // width / height
  price: string; // wei
  paymentToken: string;
  seller: string;
}

const key = (id: string) => `nft:${id}`;

export function cacheNfts(items: CachedNft[]) {
  try {
    for (const item of items) {
      localStorage.setItem(key(item.listingId), JSON.stringify(item));
    }
  } catch {
    /* storage full or blocked: the detail page falls back gracefully */
  }
}

export function readNft(listingId: string): CachedNft | null {
  try {
    const raw = localStorage.getItem(key(listingId));
    return raw ? (JSON.parse(raw) as CachedNft) : null;
  } catch {
    return null;
  }
}

// every cached NFT except one, for "More like this"
export function readOthers(exceptId: string, max = 8): CachedNft[] {
  const out: CachedNft[] = [];
  try {
    for (let i = 0; i < localStorage.length && out.length < max; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith("nft:") || k === key(exceptId)) continue;
      const raw = localStorage.getItem(k);
      if (raw) out.push(JSON.parse(raw));
    }
  } catch {
    /* ignore */
  }
  return out;
}