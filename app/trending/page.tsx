"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { cacheNfts } from "@/lib/nftCache";
import { enrich, type ApiListing, type ListingItem } from "@/lib/enrichNft";
import LoadingOverlay from "@/components/LoadingOverlay";
import { useCurrency } from "@/lib/currencyContext";


const PAGE_SIZE = 12;


export default function Trending() {
  const { formatPrice } = useCurrency();
  const [items, setItems] = useState<ListingItem[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMore = useCallback(async (offset: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/nfts/listings?limit=${PAGE_SIZE}&offset=${offset}`);
      if (!res.ok) throw new Error(`Error loading NFTs`);
      const data: { items: ApiListing[]; nextOffset: number | null } = await res.json();
      const enriched = await Promise.all(data.items.map(enrich));

      cacheNfts(enriched); // the detail page reads these

      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.listingId));
        return [...prev, ...enriched.filter((i) => !seen.has(i.listingId))];
      });
      setNextOffset(data.nextOffset);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load listings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMore(0);
  }, [loadMore]);

  
  return (
    <section
      aria-labelledby="trending-title"
      className="mx-auto w-full max-w-6xl space-y-6  px-4 py-8 font-display sm:px-6 lg:px-8"
    >
      <LoadingOverlay show={loading} />

      {error && <p className="text-red-400">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="text-zinc-400">No NFTs are listed yet.</p>
      )}

      <h2 id="trending-title" className="text-2xl text-green-400 sm:text-3xl">
        Trending
      </h2>

      <ul role="list" className="columns-2 gap-4 sm:gap-6 md:columns-3 lg:columns-4">
        {items.map((item) => (
          <li key={item.listingId} className="mb-4 break-inside-avoid sm:mb-6">
            <Link
              href={`/nft/${item.listingId}`}
              className="group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-green-400"
            >
              <figure className="relative overflow-hidden rounded-2xl bg-zinc-800 transition-all duration-300 ease-out group-hover:-translate-y-2 group-hover:shadow-xl group-hover:shadow-green-400/20 group-focus-visible:-translate-y-2">
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image}
                    alt={item.name}
                    loading="lazy"
                    decoding="async"
                    style={{ aspectRatio: item.ratio }}
                    className="block w-full object-cover transition duration-300 group-hover:brightness-75 group-focus-visible:brightness-75"
                  />
                ) : (
                  <div
                    style={{ aspectRatio: 1 }}
                    className="flex items-center justify-center text-zinc-500"
                  >
                    Image unavailable
                  </div>
                )}

                <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
                  <p className="line-clamp-3 text-xs text-zinc-200 sm:text-sm">
                    {item.description}
                  </p>
                  <p className="mt-2 text-sm text-green-400">{formatPrice(item.price)}</p>
                </div>

                <figcaption className="absolute left-0 right-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-3 text-sm text-green-400 sm:text-base">
                  {item.name}
                </figcaption>
              </figure>
            </Link>
          </li>
        ))}
      </ul>

     

      {nextOffset !== null && !loading && items.length > 0 && (
        <button
          onClick={() => loadMore(nextOffset)}
          className="mx-auto block rounded-lg border border-green-400 px-5 py-2 text-green-400 transition hover:bg-green-400 hover:text-black"
        >
          Load more
        </button>
      )}
    </section>
  );
}