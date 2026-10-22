'use client'
import Carousel from "@/components/ui/carousel";
import Link from "next/link";
import { useId, useRef, useEffect, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { cacheNfts } from "@/lib/nftCache";
import { enrich, type ApiListing, type ListingItem } from "@/lib/enrichNft";
import LoadingOverlay from "@/components/LoadingOverlay";
import { useCurrency } from "@/lib/currencyContext";


/* Shared style tokens so both sections look like one family. */
const sectionTitle =
  "font-display text-2xl text-green-400 sm:text-3xl sancreek";

const glass =
  "bg-white/10 border border-white/25 backdrop-blur-xl backdrop-saturate-150 " +
  "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4),inset_0_-1px_0_0_rgba(255,255,255,0.1)] " +
  "supports-[backdrop-filter:url(#liquid-glass)]:[backdrop-filter:url(#liquid-glass)_blur(10px)_saturate(1.5)]";

function GlassFilter() {
  return (
    <svg aria-hidden="true" focusable="false" className="absolute h-0 w-0">
      <filter id="liquid-glass" x="0%" y="0%" width="100%" height="100%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.008 0.008"
          numOctaves={2}
          seed={3}
          result="noise"
        />
        <feGaussianBlur in="noise" stdDeviation="2" result="map" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="map"
          scale="28"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-1 py-2 text-center sm:gap-2 sm:px-2 sm:py-3">
      <dt className="text-[10px] text-green-400 sm:text-sm">{label}</dt>
      <dd className="text-xs text-white sm:text-base">{value}</dd>
    </div>
  );
}


interface PreviewCardProps {
  title?: string | null;
  description?: string | null;
  imageSrc?: string | null;
  imageAlt?: string | null;
  /** If set, the whole card links here. */
  href?: string | null;
}

export interface PreviewCardItem extends PreviewCardProps {
  id: string;
}

function cleanText(value?: string | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

/* The slot you fill later: swap it by passing imageSrc. */
function ImagePlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="flex h-full w-full flex-col items-center justify-center gap-3 text-zinc-500"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-10 w-10"
      >
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="9" cy="9" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
      <span className="text-sm">Image placeholder</span>
    </div>
  );
}

function PreviewCard({
  title,
  description,
  imageSrc,
  imageAlt,
  href,
}: PreviewCardProps) {
  const cleanTitle = cleanText(title) ?? "Untitled";
  const cleanDescription = cleanText(description);
  const src = cleanText(imageSrc);
  const link = cleanText(href);

  // Full-image viewer (lightbox)
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <article
      className={`relative flex h-full flex-col rounded-3xl border border-zinc-700 bg-zinc-800 font-display mt-4 ${
        link ? "motion-safe:transition-colors hover:border-green-400" : ""
      }`}
    >
      {/* Image slot */}
      <div className="m-2 aspect-[4/3] overflow-hidden rounded-2xl bg-zinc-950">
        {src ? (
          // relative z-10 keeps the button above the title link's stretched ::after layer
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="View full image"
            className="relative z-10 block h-full w-full cursor-zoom-in rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
          >
            <img
              src={src}
              alt={cleanText(imageAlt) ?? ""}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </button>
        ) : (
          <ImagePlaceholder />
        )}
      </div>

      {/* Text */}
      <div className="flex flex-1 flex-col gap-2 p-4 pt-2 sm:p-6 sm:pt-4">
        <h3 className="text-xl text-green-400 sm:text-2xl">
          {link ? (
            <Link
              href={link}
              // The ::after layer stretches the link over the whole card,
              // so the card is clickable but screen readers hear one link.
              className="after:absolute after:inset-0 after:rounded-3xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-green-400 focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-zinc-900"
            >
              {cleanTitle}
            </Link>
          ) : (
            cleanTitle
          )}
        </h3>

        {cleanDescription && (
          <p className="text-sm text-zinc-400 sm:text-base">
            {cleanDescription}
          </p>
        )}
      </div>

      {/* Full image overlay: click the backdrop, press Escape, or use the X to close */}
      {open &&
        src &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={cleanTitle}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-md"
          >
            {/* Modal box in the center: clicking inside it does not close it */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-xl rounded-2xl border border-zinc-700 bg-zinc-900 p-2 shadow-2xl"
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close full image"
                className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-2xl text-white hover:text-green-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
              >
                ×
              </button>
              {/* object-contain shows the whole image, nothing cropped */}
              <img
                src={src}
                alt={cleanText(imageAlt) ?? ""}
                className="max-h-[70vh] w-full rounded-xl object-contain"
              />
            </div>
          </div>,
          document.body
        )}
    </article>
  );
}

/* ---------- Responsive grid ---------- */


// Placeholder props for the "Get Started" grid. Replace the text, hrefs,
// and imageSrc values later. Leaving imageSrc empty shows the image placeholder.
const WALLET_PLACEHOLDER_ITEMS: PreviewCardItem[] = [
  {
    id: "wallet-1",
    title: "Get Sepolia ETH",
    description:
      "Go to Google web3 faucet and fund you account you wish to use with sepolia ETH.",
    imageSrc: "/connect_step1.png",
    imageAlt: null,
    href: "#",
  },
  {
    id: "wallet-2",
    title: "Connect a wallet/create account",
    description:
      "Connect an existing wallet or set up a new wallet and keep the recovery phrase safe. Sign in using wallet and create your account.",
    imageSrc: "/connect_step2.png",
    imageAlt: null,
    href: "#",
  },
  {
    id: "wallet-3",
    title: "Connect to the marketplace",
    description:
      "This should be how your wallet should look like after correct Signup.",
    imageSrc: "/connect_step3.png",
    imageAlt: null,
    href: "#",
  },
];

const BUY_PLACEHOLDER_ITEMS: PreviewCardItem[] = [
  {
    id: "buy-1",
    title: "Find an NFT",
    description: "Find an NFT you interested in buying. Either from Featured, Trending or from a user's profile.",
    imageSrc:  "/Buy_step1.png",
    imageAlt: null,
    href: "#",
  },
  {
    id: "buy-2",
    title: "Check the details",
    description: "Click the NFT, it takes you to the checkout page. Where you can buy, comment and like.",
    imageSrc:  "/Buy_step2.png",
    imageAlt: "",
    href: "#",
  },
  {
    id: "buy-3",
    title: "Buy it",
    description: "After succesful purchase you can check your profile page. The minted NFT should appear in your gallery.",
    imageSrc: "/Buy_step3.png",
    imageAlt: null,
    href: "#",
  },
];

const SELL_PLACEHOLDER_ITEMS: PreviewCardItem[] = [
  {
    id: "sell-1",
    title: "Create your NFT",
    description: "Click the create button in the menu sidebar. Then fill in your NFT details and initiate the transaction.",
    imageSrc: "/create&sell_step1.png",
    imageAlt: null,
    href: "#",
  },
  {
    id: "sell-2",
    title: "Warning error",
    description: "You may get some warning errors such as the ones in the image. Don't worry it's mainly cause the site is on free deployment.",
    imageSrc: "create&sell_step2.png",
    imageAlt: null,
    href: "#",
  },
  {
    id: "sell-3",
    title: "List it for sale",
    description: "When done with creating the NFT you then list it. You can decide to list on Featured section alone which lasts for 30 days or you can list normally.",
    imageSrc: "create&sell_step3.png",
    imageAlt: null,
    href: "#",
  },
];


type GuideTab = {
  id: string;
  label: string;
  heading: string;
  items: PreviewCardItem[];
};

const GUIDE_TABS: GuideTab[] = [
  { id: "wallet", label: "Connect wallet", heading: "Connect EVM Wallet", items: WALLET_PLACEHOLDER_ITEMS },
  { id: "sell", label: "Create & sell", heading: "Create & Sell an NFT", items: SELL_PLACEHOLDER_ITEMS },
  { id: "buy", label: "Buy an NFT", heading: "Buy an NFT", items: BUY_PLACEHOLDER_ITEMS },
];

const tabFocus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900";

function GuideTabs({ tabs = GUIDE_TABS }: { tabs?: GuideTab[] }) {
  const uid = useId();
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  if (tabs.length === 0) return null;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.id === active);
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    const id = tabs[next].id;
    setActive(id);
    tabRefs.current[id]?.focus();
  }

  return (
    <div className="mx-auto w-full max-w-6xl bg-zinc-900 px-4 py-4 font-display md:px-6 lg:px-8">
      {/* Tab bar: scrolls inside itself on narrow phones, never the page */}
      <div
        role="tablist"
        aria-label="Get started guides"
        onKeyDown={onKeyDown}
        className="flex gap-2 overflow-x-auto border-b border-zinc-700 md:gap-6"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
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
              className={`min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-base motion-safe:transition-colors md:px-4 md:text-lg ${tabFocus} ${
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

      {/* Panels: one per tab, only the active one is shown */}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${uid}-panel-${tab.id}`}
          aria-labelledby={`${uid}-tab-${tab.id}`}
          hidden={tab.id !== active}
          tabIndex={0}
          className={`mt-6 space-y-6 ${tabFocus}`}
        >
          <ul role="list" className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
            {tab.items.map((item, i) => (
              <li key={item.id}>
                <p className="mb-0 text-sm text-zinc-400">Step {i + 1}</p>
                <PreviewCard {...item} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const { formatPrice } = useCurrency();
  const [featured, setFeatured] = useState<ListingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/nfts/featured?limit=8&offset=0`);
        if (!res.ok) return;
        const data: { items: ApiListing[] } = await res.json();
        const enriched = await Promise.all(data.items.map(enrich));
        cacheNfts(enriched); // the detail page reads these
        if (!cancelled) setFeatured(enriched.filter((i) => i.image));
      } catch(error) {
        /* leave the carousel empty if the API is unreachable */
        console.log("Carousel eror", error);
      }finally {
      if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) return <LoadingOverlay show={isLoading} />;

  return (
    <div className="flex w-full flex-col gap-12 overflow-x-clip bg-[color:var(--bg-main)] px-4 py-8 sm:px-6 lg:px-8">
      <GlassFilter />

      {featured.length > 0 && (
        <section aria-labelledby="featured-title" className="space-y-6">
          <h2 id="featured-title" className={sectionTitle}>
            FEATURED
          </h2>
          <Carousel
            autoplayMs={4000}
            slides={featured.map((item) => ({
              src: item.image!,
              alt: item.name,
              title: (
                <Link
                  href={`/nft/${item.listingId}`}
                  // stretches the link over the whole slide, no overlay or dimming
                  className="sancreek text-green-400 after:absolute after:inset-0"
                >
                  {item.name}
                </Link>
              ),
              content: (
                <dl className={`mx-auto grid grid-cols-3 divide-x divide-white/25 rounded-2xl ${glass}`}>
                  <Stat label="Price" value={formatPrice(item.price)} />
                  <Stat label="Sales" value={"..."} />
                 <Stat label="Volume" value={"..."} />

                </dl>
              ),
            }))}
          />
        </section>
      )}

     <section aria-labelledby="start-title" className="my-20 space-y-6">
      <h2 id="start-title" className={sectionTitle}>
        GET STARTED
      </h2>
      <GuideTabs />
    </section>
    </div>
  );
}