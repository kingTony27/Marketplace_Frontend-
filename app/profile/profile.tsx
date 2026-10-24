"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { X as CloseIcon } from "lucide-react";
import { useAccount,  } from "wagmi";
import { useUsernameModal } from "@/lib/authProvider";
import { AVATAR_OPTIONS } from "@/lib/avatarOptions";
import RelistSidebar from "@/components/relist";
import ProfileNftCard from "./ProfileNftCard";
import type { ProfileNft, TabId } from "./types";
import { supabasePublic } from "@/lib/supabaseClient";
import { loadListings, loadGallery } from "./[wallet]/actions";



const TABS: { id: TabId; label: string }[] = [
  { id: "listings", label: "Listings" },
  { id: "gallery", label: "Gallery" },
];

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

/* ---------- Safe-value helpers ---------- */

function cleanText(value?: string | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

function cleanCount(value?: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function shortAddress(address: string): string {
  return address.length > 12
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address;
}

/* ---------- Small pieces ---------- */

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900";

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="butt"
      aria-hidden="true"
      className="h-3/4 w-3/4 text-zinc-100"
    >
      <circle cx="12" cy="8" r="4.5" />
      <path d="M3.5 22c0-5 3.8-8.5 8.5-8.5s8.5 3.5 8.5 8.5" />
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <dt className="text-sm text-white lg:text-base">{label}</dt>
      <dd className="text-base text-green-400 lg:text-lg">
        {value === null ? (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">Not available</span>
          </>
        ) : (
          value.toLocaleString("en-US")
        )}
      </dd>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="py-12 text-center text-sm text-zinc-400 lg:text-base">
      Nothing in {label.toLowerCase()} yet.
    </p>
  );
}

/* ---------- Grid ---------- */

function NftGrid({
  items,
  variant,
  owner,
  onList,
}: {
  items: ProfileNft[];
  variant: TabId;
  owner: boolean;
  onList: (nft: ProfileNft) => void;
}) {
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {items.map((nft) => (
        <li key={nft.id}>
          <ProfileNftCard nft={nft} variant={variant} owner={owner} onList={onList} />
        </li>
      ))}
    </ul>
  );
}

/* ---------- Main component ---------- */

export default function ProfilePage({
  wallet,
  username,
  avatarUrl,
  totalSales,
  totalBuys,
  listings,
  gallery,
  listingsNextOffset,
  galleryNextOffset,
}: ProfilePageProps) {
  const [active, setActive] = useState<TabId>("listings");
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);

  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string>(
    cleanText(avatarUrl) ?? ""
  );
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // Token id of the gallery NFT being listed (null = the post panel is closed).
  const [listingTokenId, setListingTokenId] = useState<string | null>(null);

  // Pagination state for each tab.
  const [listingItems, setListingItems] = useState<ProfileNft[]>(listings);
  const [galleryItems, setGalleryItems] = useState<ProfileNft[]>(gallery);
  const [listingOffset, setListingOffset] = useState<number | null>(
    listingsNextOffset
  );
  const [galleryOffset, setGalleryOffset] = useState<number | null>(
    galleryNextOffset
  );
  const [loadingListings, setLoadingListings] = useState(false);
  const [loadingGallery, setLoadingGallery] = useState(false);

  // ---- Editable: only the wallet that owns this profile can edit it ----
  const { address: connectedAddress } = useAccount();
  const editable =
    !!connectedAddress &&
    connectedAddress.toLowerCase() === wallet.toLowerCase();

  // Owner clicked "List" on a gallery card: open the post panel for that token.
  const listFromGallery = useCallback((nft: ProfileNft) => {
    setListingTokenId(nft.tokenId);
  }, []);


  const avatarWrapRef = useRef<HTMLDivElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // Close the picker on outside click / Escape.
  useEffect(() => {
    if (!avatarPickerOpen) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (avatarWrapRef.current?.contains(target)) return;
      if (pickerRef.current?.contains(target)) return;
      setAvatarPickerOpen(false);
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setAvatarPickerOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [avatarPickerOpen]);

   const selectAvatar = useCallback(
    async (url: string) => {
      if (savingAvatar || url === currentAvatarUrl) {
        setAvatarPickerOpen(false);
        return;
      }
      if (!editable) return;

      const previous = currentAvatarUrl;
      setCurrentAvatarUrl(url); // optimistic update
      setAvatarFailed(false);
      setAvatarError(null);
      setAvatarPickerOpen(false);

      try {
        setSavingAvatar(true);
        const { data, error } = await supabasePublic
          .from("users")
          .update({ avatar_url: url || null })
          .eq("wallet", wallet.toLowerCase())
          .select("wallet");

        if (error) throw new Error(error.message);
        // RLS doesn't raise an error when it blocks an update; it just matches 0 rows
        if (!data?.length) throw new Error("Couldn't save your avatar.");
      } catch (err) {
        setCurrentAvatarUrl(previous); // roll back
        setAvatarError(err instanceof Error ? err.message : "Couldn't save your avatar.");
      } finally {
        setSavingAvatar(false);
      }
    },
    [currentAvatarUrl, editable, savingAvatar, wallet]
  );

  // ---- Load more handlers ----
  const loadMoreListings = useCallback(async () => {
    if (listingOffset == null || loadingListings) return;
    setLoadingListings(true);
    const result = await loadListings(wallet, listingOffset);
    setListingItems((prev) => [...prev, ...result.items]);
    setListingOffset(result.nextOffset);
    setLoadingListings(false);
  }, [listingOffset, loadingListings, wallet]);

  const loadMoreGallery = useCallback(async () => {
    if (galleryOffset == null || loadingGallery) return;
    setLoadingGallery(true);
    const result = await loadGallery(wallet, galleryOffset);
    setGalleryItems((prev) => [...prev, ...result.items]);
    setGalleryOffset(result.nextOffset);
    setLoadingGallery(false);
  }, [galleryOffset, loadingGallery, wallet]);

  const uid = useId();
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    listings: null,
    gallery: null,
  });
  const { open: openUsernameModal } = useUsernameModal();

  const cleanName = cleanText(username)?.replace(/^@/, "") ?? null;
  const sales = cleanCount(totalSales);
  const buys = cleanCount(totalBuys);
  const showAvatarImg = !!currentAvatarUrl && !avatarFailed;

  const usernameBaseClasses = [
    "text-white",
    "no-underline",
    "decoration-white",
    "underline-offset-2",
    "transition-all duration-200 ease-out",
    "hover:underline",
    focusRing,
  ].join(" ");

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const current = TABS.findIndex((t) => t.id === active);
    let next = current;
    if (e.key === "ArrowRight") next = (current + 1) % TABS.length;
    else if (e.key === "ArrowLeft")
      next = (current - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    const id = TABS[next].id;
    setActive(id);
    tabRefs.current[id]?.focus();
  }

  return (
    <div className="w-full bg-zinc-900 pb-8 font-display text-white lg:pb-12">
      <div className="h-24 w-full bg-green-600 md:h-32 lg:h-40" />

      <div className="mx-auto w-full max-w-6xl px-4 md:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-3 md:grid md:grid-cols-[1fr_auto_1fr] md:items-end md:gap-6">
          {/* Avatar */}
          <div
            ref={avatarWrapRef}
            className="relative -mt-12 md:order-2 md:-mt-16 md:justify-self-center"
          >
            {editable ? (
              <button
                type="button"
                onClick={() => setAvatarPickerOpen((v) => !v)}
                aria-haspopup="dialog"
                aria-expanded={avatarPickerOpen}
                aria-controls={`${uid}-avatar-picker`}
                title="Change profile picture"
                className={`group relative mx-auto grid h-32 w-32 shrink-0 place-items-center overflow-hidden rounded-2xl bg-zinc-900 md:h-40 md:w-40 ${focusRing}`}
              >
                {showAvatarImg ? (
                  <img
                    src={currentAvatarUrl}
                    alt={cleanName ? `${cleanName}'s avatar` : "User avatar"}
                    onError={() => setAvatarFailed(true)}
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                  />
                ) : (
                  <UserIcon />
                )}
                <span className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-zinc-900/90 py-1 text-center text-xs text-white/80 transition-transform duration-200 group-hover:translate-y-0">
                  Change picture
                </span>
              </button>
            ) : (
              <div className="mx-auto grid h-32 w-32 shrink-0 place-items-center overflow-hidden rounded-2xl bg-zinc-900 md:h-40 md:w-40">
                {showAvatarImg ? (
                  <img
                    src={currentAvatarUrl}
                    alt={cleanName ? `${cleanName}'s avatar` : "User avatar"}
                    onError={() => setAvatarFailed(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <UserIcon />
                )}
              </div>
            )}

            {editable && avatarPickerOpen && (
              <div
                ref={pickerRef}
                id={`${uid}-avatar-picker`}
                role="dialog"
                aria-label="Choose a profile picture"
                className="absolute left-1/2 top-full z-50 mt-3 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl md:left-full md:top-0 md:ml-4 md:mt-0 md:translate-x-0"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-white">
                    Choose your avatar
                  </p>
                  <button
                    type="button"
                    aria-label="Close avatar picker"
                    onClick={() => setAvatarPickerOpen(false)}
                    className={`grid h-11 w-11 place-items-center rounded-lg text-white/70 hover:bg-zinc-800 hover:text-white lg:h-8 lg:w-8 ${focusRing}`}
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
                <div
                  className="grid max-h-72 gap-2 overflow-y-auto p-0.5"
                  style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
                >
                  {AVATAR_OPTIONS.map((option) => {
                    const selected = option.src === currentAvatarUrl;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        title={option.label}
                        aria-label={option.label}
                        disabled={savingAvatar}
                        onClick={() => selectAvatar(option.src)}
                        aria-pressed={selected}
                        className={`relative grid aspect-square place-items-center overflow-hidden rounded-xl border-2 bg-zinc-800 transition-all duration-200 disabled:cursor-wait disabled:opacity-60 ${
                          selected
                            ? "border-green-400 shadow-[0_0_0_2px_rgba(5,223,114,0.15)]"
                            : "border-transparent hover:border-zinc-600"
                        } ${focusRing}`}
                      >
                        {option.src ? (
                          <img
                            src={option.src}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center">
                            <div className="grid h-8 w-8 place-items-center rounded-full bg-zinc-900 text-zinc-300">
                              <UserIcon />
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {avatarError && (
              <p
                role="alert"
                className="absolute left-1/2 top-full mt-2 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 text-center text-sm text-red-400 lg:whitespace-nowrap lg:text-xs"
              >
                {avatarError}
              </p>
            )}
          </div>

          {/* Username */}
          <h1 className="text-lg text-white md:order-3 md:text-left">
            {editable ? (
              cleanName ? (
                <button
                  type="button"
                  className={usernameBaseClasses}
                >
                  @{cleanName}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openUsernameModal}
                  className={usernameBaseClasses}
                >
                  Unnamed user
                </button>
              )
            ) : cleanName ? (
              <span>@{cleanName}</span>
            ) : (
              <span className="text-zinc-400">Unnamed user</span>
            )}
          </h1>

          <p className="text-base text-white md:order-1 md:text-right md:text-lg">
            <span className="sr-only">Wallet address: </span>
            <span title={wallet}>{shortAddress(wallet)}</span>
          </p>
        </div>

        {/* Stats */}
        <dl className="mt-8 flex justify-center gap-8 lg:gap-12">
          <Stat label="Total Sales" value={sales} />
          <Stat label="Total Buys" value={buys} />
        </dl>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Profile sections"
          onKeyDown={onKeyDown}
          className="mt-6 grid grid-cols-2 gap-2 md:mt-12 md:flex md:justify-between md:gap-0"
        >
          {TABS.map((tab) => {
            const selected = active === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                type="button"
                role="tab"
                id={`${uid}-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`${uid}-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(tab.id)}
                className={`min-h-11 w-full border-b-2 px-2 py-2 text-center text-base motion-safe:transition-colors md:w-auto md:text-lg ${focusRing} ${
                  selected
                    ? "border-green-400 text-green-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Panels */}
        {TABS.map((tab) => {
          const isListings = tab.id === "listings";
          const items = isListings ? listingItems : galleryItems;
          const nextOffset = isListings ? listingOffset : galleryOffset;
          const loading = isListings ? loadingListings : loadingGallery;
          const onLoadMore = isListings ? loadMoreListings : loadMoreGallery;

          return (
            <div
              key={tab.id}
              role="tabpanel"
              id={`${uid}-panel-${tab.id}`}
              aria-labelledby={`${uid}-tab-${tab.id}`}
              hidden={active !== tab.id}
              tabIndex={0}
              className={`mt-6 min-h-48 ${focusRing}`}
            >
              {items.length === 0 ? (
                <EmptyState label={tab.label} />
              ) : (
                <>
                  <NftGrid
                    items={items}
                    variant={tab.id}
                    owner={editable}
                    onList={listFromGallery}
                  />
                  {nextOffset != null && (
                    <div className="mt-8 flex justify-center">
                      <button
                        type="button"
                        onClick={onLoadMore}
                        disabled={loading}
                        className={`min-h-11 rounded-lg bg-zinc-800 px-6 py-2 text-sm text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 lg:min-h-9 ${focusRing}`}
                      >
                        {loading ? "Loading…" : "Load more"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Owner listing a gallery NFT: opens a dedicated re-listing panel using
          the token id read from the nft_gallery view, so the mint flow never runs. */}
      <RelistSidebar
        open={listingTokenId !== null}
        tokenId={listingTokenId}
        onClose={() => setListingTokenId(null)}
      />
    </div>
  );
}
