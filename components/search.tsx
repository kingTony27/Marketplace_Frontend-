'use client'
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cacheNfts } from "@/lib/nftCache";
import { enrich, type ApiListing, type ListingItem } from "@/lib/enrichNft";
import { useCurrency } from "@/lib/currencyContext";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;
const RESULT_LIMIT = 6; // per type (listings and users)
const SEARCH_PAGE = "/search"; // build this page, or remove "See all results"

/* ------------------------------------------------------------------ */
/* Types and helpers                                                   */
/* ------------------------------------------------------------------ */

type Result =
  | { kind: "listing"; key: string; href: string; item: ListingItem }
  | {
      kind: "user";
      key: string;
      href: string;
      username: string;
      wallet: string;
      avatar: string | null;
    };

interface ApiUser {
  username: string | null;
  wallet: string;
  avatarUrl: string | null;
}


function UserIcon() {
  return (
    <span
       aria-hidden="true"       
       className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-zinc-700 text-zinc-300"
     >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="butt"
      aria-hidden="true"
      className="h-2 w-2 text-zinc-100"
    >
      <circle cx="12" cy="8" r="4.5" />
      <path d="M3.5 22c0-5 3.8-8.5 8.5-8.5s8.5 3.5 8.5 8.5" />
    </svg>
</span>

  );
}

const shortAddress = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;


/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function SearchBar({ className = "" }: { className?: string }) {
  const router = useRouter();
  const { formatPrice } = useCurrency();
  const uid = useId();
  const listId = `${uid}-results`;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const trimmed = query.trim();
  const searching = trimmed.length >= MIN_CHARS;

  /* Debounced search. Aborts the previous request so slow, old responses
     can never overwrite newer ones. */
  useEffect(() => {
    if (!searching) {
      setResults([]);
      setStatus("idle");
      return;
    }

    setStatus("loading");
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/nfts/search?q=${encodeURIComponent(trimmed)}&limit=${RESULT_LIMIT}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error(`Request failed (${res.status})`);

        const json = (await res.json()) as {
          listings?: ApiListing[];
          users?: ApiUser[];
        };

        // Pull name + image from each NFT's metadata (also gives the detail page its data)
        const enriched = await Promise.all(
          (Array.isArray(json.listings) ? json.listings : []).map(enrich)
        );
        if (controller.signal.aborted) return;
        cacheNfts(enriched);

        const listingResults: Result[] = enriched.map((item) => ({
          kind: "listing",
          key: `listing-${item.listingId}`,
          href: `/nft/${item.listingId}`,
          item,
        }));

        const userResults: Result[] = (Array.isArray(json.users) ? json.users : [])
          .filter((u) => u && typeof u.wallet === "string")
          .map((u) => ({
            kind: "user",
            key: `user-${u.wallet}`,
            href: `/profile/${encodeURIComponent(u.wallet)}`,
            username: u.username?.trim() || "Unnamed user",
            wallet: u.wallet,
            avatar: u.avatarUrl,
          }));

        setResults([...listingResults, ...userResults]);
        setActiveIndex(-1);
        setStatus("done");
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setStatus("error");
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, searching]);

  /* Close the dropdown when clicking outside */
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const goTo = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const goToAllResults = () => {
    if (!searching) return;
    goTo(`${SEARCH_PAGE}?q=${encodeURIComponent(trimmed)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const active = results[activeIndex];
    if (active) goTo(active.href);
    else goToAllResults();
  };

  const showDropdown = open && searching;
  const activeId = activeIndex >= 0 ? `${uid}-option-${activeIndex}` : undefined;

  return (
    <div ref={wrapperRef} className={`relative w-full ${className}`}>
      <form role="search" onSubmit={onSubmit} autoComplete="off">
        <label htmlFor={`${uid}-input`} className="sr-only">
          Search listings and users
        </label>
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-2.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500 sm:left-3"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            id={`${uid}-input`}
            type="search"
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search listings or users..."
            maxLength={100}
            className="h-10 w-full rounded-xl bg-zinc-800 pr-3 pl-10 text-sm text-white placeholder:text-zinc-400 outline-none transition-all duration-200 focus:bg-zinc-800 focus:ring-2 focus:ring-green-400 focus:ring-offset-2 focus:ring-offset-zinc-900 sm:h-12 sm:pr-4 sm:pl-11 sm:text-[15px]"
          />
        </div>
      </form>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[28rem] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl">
          {status === "loading" && results.length === 0 && (
            <p role="status" className="p-4 text-sm text-zinc-400">
              Searching...
            </p>
          )}

          {status === "error" && (
            <p role="alert" className="p-4 text-sm text-red-400">
              Search isn&apos;t working right now. Please try again.
            </p>
          )}

          {status === "done" && results.length === 0 && (
            <p className="p-4 text-sm text-zinc-400">
              No listings or users match &quot;{trimmed}&quot;.
            </p>
          )}

          {results.length > 0 && (
            <ul id={listId} role="listbox" aria-label="Search results" className="p-2">
              {results.map((r, i) => (
                <li key={r.key} role="presentation">
                  {/* section label when the type changes */}
                  {(i === 0 || results[i - 1].kind !== r.kind) && (
                    <p className="px-2 pb-1 pt-2 text-xs uppercase tracking-wide text-zinc-500">
                      {r.kind === "listing" ? "Listings" : "Users"}
                    </p>
                  )}
                  <div
                    id={`${uid}-option-${i}`}
                    role="option"
                    aria-selected={i === activeIndex}
                  >
                    <Link
                      href={r.href}
                      tabIndex={-1}
                      onClick={() => setOpen(false)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={`flex items-center gap-3 rounded-xl p-2 ${
                        i === activeIndex ? "bg-zinc-800" : "hover:bg-zinc-800"
                      }`}
                    >
                      {r.kind === "listing" ? (
                        <>
                          {r.item.image ? (
                            <img
                              src={r.item.image}
                              alt=""
                              loading="lazy"
                              className="h-10 w-10 shrink-0 rounded-lg object-cover"
                            />
                          ) : (
                            <span
                              className="h-10 w-10 shrink-0 rounded-lg bg-zinc-800"
                              aria-hidden="true"
                            />
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm text-white">
                            {r.item.name}
                          </span>
                          <span className="shrink-0 text-sm text-green-400">
                            {formatPrice(r.item.price)}
                          </span>
                        </>
                      ) : (
                        <>
                        <UserIcon />
                          <span className="min-w-0 flex-1 truncate text-sm text-white">
                            {r.username}
                          </span>
                          <span className="shrink-0 text-sm text-green-400">
                            {shortAddress(r.wallet)}
                          </span>
                        </>
                      )}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {results.length > 0 && (
            <button
              type="button"
              onClick={goToAllResults}
              className="w-full border-t border-zinc-800 p-3 text-center text-sm text-green-400 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-400"
            >
              See all results
            </button>
          )}
        </div>
      )}
    </div>
  );
}