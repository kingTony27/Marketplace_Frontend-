'use client'
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { parseEther, parseEventLogs, zeroAddress, type Abi } from "viem";
import NFTArtifact from "@/abi/NFTCollection.json";
import MarketplaceArtifact from "@/abi/Marketplace.json";
import { createMetadata } from "@/upload/actions";
import { useCurrency, type Currency } from "@/lib/currencyContext";
import {supabasePublic} from "@/lib/supabaseClient";

/* ------------------------------------------------------------------ */
/* Types + config                                                      */
/* ------------------------------------------------------------------ */

export interface PostData {
  image: string | null; // data URL of the resized picture
  name: string;
  writeUp: string;
  featured: boolean;
  featuredDays: number | null;
}

interface FeaturedOption {
  days: number
}

// The on-chain Marketplace.listItem(uint256,uint256,address,bool) contract
// takes only a `featured: bool` (4th arg) — there is no per-call duration or
// fee percent parameter. The duration/fee are set at the contract level
// (owner-only). We surface the contract's currently-configured featured tier
// here so the dropdown never offers tiers the contract cannot honour.
const FEATURED_OPTIONS: FeaturedOption[] = [
  { days: 30 },
];

// Hardhat/Foundry artifacts keep the ABI under `.abi`; a bare ABI file is the array itself.
const NFT_ABI = ((NFTArtifact as any).abi ?? NFTArtifact) as Abi;
const MARKET_ABI = ((MarketplaceArtifact as any).abi ?? MarketplaceArtifact) as Abi;
const NFT_ADDRESS = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS as `0x${string}`;
const MARKET_ADDRESS = process.env.NEXT_PUBLIC_MARKETPLACE_CONTRACT_ADDRESS as `0x${string}`;

// address(0) = the chain's native coin. Swap for an accepted ERC-20 address if you add token payments.
const PAYMENT_TOKEN = zeroAddress;

const MAX_WORDS = 5;

const DRAFT_KEY = "post-draft-v1";
const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // drafts expire after 30 days
const MAX_FILE_BYTES = 8 * 1024 * 1024; // reject originals over 8MB
const MAX_IMAGE_SIDE = 1024; // downscale so the draft fits in localStorage

// create  -> click 1 mints
// minting -> uploading + minting
// list    -> minted; click 2 lists (a retry lists WITHOUT minting again)
// listing -> approving + listing
type Step = "create" | "minting" | "list" | "listing";

interface Draft extends PostData {
  savedAt: number;
  price: string;
  // Set once the NFT is minted, so a refresh goes straight to listing instead of
  // minting a second NFT. Never shown to the user.
  tokenId: string | null;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const inputClass =
  "w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white " +
  "placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-green-400 disabled:opacity-60";

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Cuts text down to the first `max` words (also handles pasted text). */
function limitWords(text: string, max = MAX_WORDS) {
  if (wordCount(text) <= max) return text;
  return text.trim().split(/\s+/).slice(0, max).join(" ");
}

async function dataUrlToFile(dataUrl: string, filename: string) {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
}

function errorMessage(err: unknown) {
  if (err == null) return "Something went wrong. Your draft is saved.";
  if (typeof err === "string") return err;
  if (typeof err === "number" || typeof err === "boolean" || typeof err === "bigint") {
    return String(err);
  }
  const e = err as { shortMessage?: string; message?: string; name?: string } | null;
  return e?.shortMessage ?? e?.message ?? "Something went wrong. Your draft is saved.";
}

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas not supported"));
        return;
      }
      ctx.fillStyle = "#ffffff"; // avoids black backgrounds on transparent PNGs
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image"));
    };
    img.src = url;
  });
}

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    if (!draft || Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage unavailable, nothing to clear */
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

interface PostSidebarProps {
  /** Your existing sidebar icon. The component wraps it in a button that opens the panel. */
  trigger?: ReactNode;
  /** Accessible name for the icon button (screen readers). */
  triggerLabel?: string;
  /** Optional classes for the icon button, to match your other sidebar items. */
  triggerClassName?: string;
  /** Only needed if you want to control open/close yourself. Leave out to let the component manage it. */
  open?: boolean;
  onClose?: () => void;
}

export default function PostSidebar({
  trigger,
  triggerLabel = "New post",
  triggerClassName = "",
  open: openProp,
  onClose: onCloseProp,
}: PostSidebarProps) {
  // Works on its own (clicking the trigger opens it), or controlled via open/onClose.
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = openProp ?? internalOpen;
  const onClose = useCallback(() => {
    if (!isControlled) setInternalOpen(false);
    onCloseProp?.();
  }, [isControlled, onCloseProp]);

  const [image, setImage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [writeUp, setWriteUp] = useState("");
  const [price, setPrice] = useState("");
  const [featured, setFeatured] = useState(false);
  const [featuredDays, setFeaturedDays] = useState<number>(FEATURED_OPTIONS[0].days);

  const [step, setStep] = useState<Step>("create");
  // Internal only: the id the chain gave the new NFT. Needed for approve + listItem,
  // and kept so a failed listing can be retried without minting again.
  const [tokenId, setTokenId] = useState<bigint | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [hydrated, setHydrated] = useState(false);
  const [savedVisible, setSavedVisible] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { currency, setCurrency, usdcPriceToWei } = useCurrency();

  const busy = step === "minting" || step === "listing";
  const minted = tokenId !== null;
  const locked = busy || minted; // picture, name and description can't change once minted

  const panelRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  const uid = useId();
  const nameId = `${uid}-name`;
  const writeUpId = `${uid}-writeup`;
  const priceId = `${uid}-price`;
  const featuredId = `${uid}-featured`;
  const daysId = `${uid}-days`;
  const titleId = `${uid}-title`;

  /* Load the saved draft once, after mount (never during render,
     or Next.js will report a hydration mismatch). */
  useEffect(() => {
    const draft = readDraft();
    if (draft) {
      setImage(draft.image ?? null);
      setName(draft.name ?? "");
      setWriteUp(limitWords(draft.writeUp ?? ""));
      setPrice(draft.price ?? "");
      setFeatured(Boolean(draft.featured));
      if (FEATURED_OPTIONS.some((o) => o.days === draft.featuredDays)) {
        setFeaturedDays(draft.featuredDays as number);
      }
      if (draft.tokenId) {
        try {
          setTokenId(BigInt(draft.tokenId));
          setStep("list"); // already minted, so the next click only lists
        } catch {
          /* corrupt value, ignore */
        }
      }
    }
    setHydrated(true);
  }, []);

  /* Auto-save, debounced. Waits for hydration so it never overwrites a
     saved draft with empty state. */
  useEffect(() => {
    if (!hydrated) return;
    const isEmpty =
      !image && !name.trim() && !writeUp.trim() && !price.trim() && !featured && tokenId === null;

    const timer = setTimeout(() => {
      if (isEmpty) {
        clearDraft();
        setSavedVisible(false);
        return;
      }
      const draft: Draft = {
        image,
        name,
        writeUp,
        price,
        featured,
        featuredDays: featured ? featuredDays : null,
        tokenId: tokenId === null ? null : tokenId.toString(),
        savedAt: Date.now(),
      };
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        setSavedVisible(true);
      } catch {
        // Quota hit: keep the text, drop the picture from the draft.
        try {
          localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, image: null }));
          setSavedVisible(true);
        } catch {
          setSavedVisible(false);
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [hydrated, image, name, writeUp, price, featured, featuredDays, tokenId]);

  /* Escape to close, scroll lock, focus handling */
  useEffect(() => {
    if (!open) return;

    lastFocused.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;

      // Keep Tab inside the panel while it's open.
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      lastFocused.current?.focus();
    };
  }, [open, onClose]);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setImageError(null);

    if (!file.type.startsWith("image/")) {
      setImageError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setImageError("That image is too large. Please pick one under 8MB.");
      return;
    }
    try {
      setImage(await resizeImage(file));
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Could not load that image.");
    }
  }, []);

  const removeImage = () => {
    setImage(null);
    setImageError(null);
    if (fileRef.current) fileRef.current.value = ""; // lets the same file be picked again
  };

  const resetForm = () => {
    setImage(null);
    setName("");
    setWriteUp("");
    setPrice("");
    setFeatured(false);
    setFeaturedDays(FEATURED_OPTIONS[0].days);
    setTokenId(null);
    setStep("create");
    setStatus(null);
    setImageError(null);
    setFormError(null);
    setSavedVisible(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const discardDraft = () => {
    clearDraft();
    resetForm();
  };

  /* -------------------------------------------------------------- */
  /* Mint: upload to IPFS, mint, then read the new id from the event */
  /* -------------------------------------------------------------- */
  const mintNft = async (picture: string): Promise<bigint> => {
    if (!publicClient) throw new Error("Wallet network isn't ready. Please try again.");

    // 1. Upload picture + metadata to Pinata (runs on the server, so the JWT stays private)
    setStatus("Uploading to IPFS...");
    const body = new FormData();
    body.append("name", name.trim());
    body.append("description", writeUp.trim());
    body.append("file", await dataUrlToFile(picture, "upload.jpg"));
    const uploaded = await createMetadata(body);
    if (!uploaded.ok) throw new Error(uploaded.error);


    // 2. Mint
    setStatus("Confirm the mint in your wallet...");
    const hash = await writeContractAsync({
      address: NFT_ADDRESS,
      abi: NFT_ABI,
      functionName: "createNFT",
      args: [uploaded.metadataUri],
    });

    setStatus("Waiting for the mint to confirm...");
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("Mint transaction failed.");

    // 3. The id comes from the NFTCreated event (the tx itself only returns a hash)
    const logs = parseEventLogs({ abi: NFT_ABI, eventName: "NFTCreated", logs: receipt.logs });
    const log = logs.find((l) => l.address.toLowerCase() === NFT_ADDRESS.toLowerCase());
    const args = log?.args as any;
    const id = args?.tokenId ?? args?.[1];
    if (id === undefined || id === null) {
      throw new Error("NFT was minted but its ID couldn't be read from the event.");
    }
    return BigInt(id);
  };

  /* -------------------------------------------------------------- */
  /* List: approve the marketplace (if needed), then list            */
  /* -------------------------------------------------------------- */
  const approveAndList = async (id: bigint, priceWei: bigint) => {
    if (!address) throw new Error("Connect your wallet first.");
    if (!publicClient) throw new Error("Wallet network isn't ready. Please try again.");

    // listItem pulls the NFT into escrow, so the marketplace must be approved first
    const [approvedTo, approvedForAll] = await Promise.all([
      publicClient.readContract({
        address: NFT_ADDRESS,
        abi: NFT_ABI,
        functionName: "getApproved",
        args: [id],
      }),
      publicClient.readContract({
        address: NFT_ADDRESS,
        abi: NFT_ABI,
        functionName: "isApprovedForAll",
        args: [address, MARKET_ADDRESS],
      }),
    ]);
    const alreadyApproved =
      Boolean(approvedForAll) || String(approvedTo).toLowerCase() === MARKET_ADDRESS.toLowerCase();

    if (!alreadyApproved) {
      setStatus("Approve the marketplace in your wallet...");
      const approveHash = await writeContractAsync({
        address: NFT_ADDRESS,
        abi: NFT_ABI,
        functionName: "approve",
        args: [MARKET_ADDRESS, id],
      });
      setStatus("Waiting for the approval to confirm...");
      const approval = await publicClient.waitForTransactionReceipt({ hash: approveHash });
      if (approval.status !== "success") throw new Error("Approval transaction failed.");
    }

    setStatus("Confirm the listing in your wallet...");
    const listHash = await writeContractAsync({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "listItem",
      args: [id, priceWei, PAYMENT_TOKEN, featured],
    });

    setStatus("Waiting for the listing to confirm...");
    const receipt = await publicClient.waitForTransactionReceipt({ hash: listHash });
    if (receipt.status !== "success") throw new Error("Listing transaction failed.");
    return receipt;
  };

  /* -------------------------------------------------------------- */
  /* Click 1: mint                                                   */
  /* -------------------------------------------------------------- */
  const handleCreate = async () => {
    if (!address) return setFormError("Connect your wallet first.");
    if (!publicClient) return setFormError("Wallet network isn't ready. Please try again.");
    if (!image) return setFormError("Please add a picture.");
    if (!name.trim()) return setFormError("Please add a name.");
    const words = wordCount(writeUp);
    if (words === 0) return setFormError("Please add a write up.");
    if (words > MAX_WORDS) return setFormError(`Write up can be at most ${MAX_WORDS} words.`);

    setStep("minting");
    try {
      const id = await mintNft(image);
      setTokenId(id); // kept so a refresh or retry can never mint a second NFT
      setStep("list"); // the next click lists it
    } catch (err) {
      setFormError(errorMessage(err));
      setStep("create");
    } finally {
      setStatus(null);
    }
  };

  //  waits for the webhook to insert the listing, then sets its description in the db
async function saveListingDescription(listingId: string, description: string) {
  if (!description) return;
  try {
    for (let i = 0; i < 20; i++) { // about 60 seconds
      const { data, error } = await supabasePublic
        .from("listings")
        .update({ description })
        .eq("listing_id", listingId)
        .select("listing_id");
      if (error) {
        console.error("description update failed:", error.message);
        return;
      }
      if (data && data.length > 0) return; // saved
      await new Promise((r) => setTimeout(r, 3000)); // row not there yet
    }
  } catch (e) {
    console.error("description update failed:", e);
  }
}

  /* -------------------------------------------------------------- */
  /* Click 2: approve (if needed) and list                           */
  /* -------------------------------------------------------------- */
  const handleList = async () => {
    if (tokenId === null) return setFormError("Create the NFT first before listing it.");
    if (!address) return setFormError("Connect your wallet first.");
    if (!publicClient) return setFormError("Wallet network isn't ready. Please try again.");

    let priceWei: bigint;
    if (currency === "USDC") {
      // Listings settle in the native coin, so the USDC amount is converted to
      // its ETH-equivalent wei before it goes on-chain.
      const converted = usdcPriceToWei(price.trim());
      if (converted === null) {
        return setFormError(
          "USDC price unavailable. Enter a valid amount and make sure the rate has loaded."
        );
      }
      priceWei = converted;
    } else {
      try {
        priceWei = parseEther(price.trim());
      } catch {
        return setFormError("Please enter a valid price.");
      }
    }
    // Using BigInt(0) instead of `0n` for ES5 <-> ES2019 tsconfig.target support.
    if (priceWei <= BigInt(0)) return setFormError("Price must be greater than 0.");
    if (priceWei > parseEther("1000000")) {
      return setFormError("Price cannot exceed 1,000,000 coins.");
    }

    setStep("listing");
    try {
      const description = writeUp.trim(); // capture description before resetForm clears it
      const receipt = await approveAndList(tokenId, priceWei);

      // Read the listing id from the Listed event, then save the description in the background
      try {
        const listed = parseEventLogs({ abi: MARKET_ABI, eventName: "Listed", logs: receipt.logs });
        const a = listed.find((l) => l.address.toLowerCase() === MARKET_ADDRESS.toLowerCase())?.args as any;
        const listingId = a?.listingId ?? a?.[0];
        if (listingId != null) void saveListingDescription(String(listingId), description);
      } catch {
        /* never block the listing flow */
      }

      // Only a fully successful listing clears the draft.
      clearDraft();
      resetForm();
      onClose();
    } catch (err) {
      setFormError(errorMessage(err));
      setStep("list");
    } finally {
      setStatus(null);
    }
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (busy) return;
    if (step === "create") await handleCreate();
    else await handleList();
  };

  const submitLabel = {
    create: "Create NFT",
    minting: "Creating NFT...",
    list: "List NFT",
    listing: "Listing NFT...",
  }[step];

  const selectedOption = FEATURED_OPTIONS.find((o) => o.days === featuredDays);
  const words = wordCount(writeUp);

  const overlay = (
    <div
      className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* Backdrop: click to close */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close post panel"
        onClick={onClose}
        className={`absolute inset-0 h-full w-full bg-black/60 backdrop-blur-sm motion-safe:transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Panel: full screen on phones, fixed width from md up */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`absolute right-0 top-0 flex h-full w-full flex-col overflow-y-auto bg-zinc-900 font-display shadow-2xl focus:outline-none md:w-96 motion-safe:transition-[transform,visibility] motion-safe:duration-300 ${
          open ? "translate-x-0 visible" : "translate-x-full invisible"
        }`}
      >
        <form onSubmit={handlePost} className="flex flex-1 flex-col gap-5 p-4 sm:p-6" noValidate>
          <div className="flex items-center justify-between">
            <h2 id={titleId} className="text-2xl text-green-400 sm:text-3xl sancreek">
              New Nft
            </h2>
            <span
              role="status"
              aria-live="polite"
              className="text-xs text-zinc-500"
            >
              {savedVisible ? "Draft saved" : ""}
            </span>
          </div>

          {/* Add picture */}
          <div>
            <span className="mb-2 block text-sm text-zinc-300">Picture</span>

            {image ? (
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-zinc-950">
                <img
                  src={image}
                  alt="Selected picture preview"
                  className="h-full w-full object-cover"
                />
                {!locked && (
                  <button
                    type="button"
                    onClick={removeImage}
                    aria-label="Remove picture"
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      className="h-4 w-4"
                      aria-hidden="true"
                    >
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={locked}
                className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-600 bg-zinc-950 text-zinc-400 hover:border-green-400 hover:text-green-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 disabled:opacity-60"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-10 w-10"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="9" cy="9" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                <span className="text-sm">Add picture</span>
              </button>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            {imageError && (
              <p role="alert" className="mt-2 text-sm text-red-400">
                {imageError}
              </p>
            )}
          </div>

          {/* Name */}
          <div>
            <label htmlFor={nameId} className="mb-2 block text-sm text-zinc-300">
              Name
            </label>
            <input
              id={nameId}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              maxLength={80}
              autoComplete="off"
              disabled={locked}
              className={inputClass}
            />
          </div>

          {/* Write up (single line, MAX_WORDS words max) */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor={writeUpId} className="text-sm text-zinc-300">
                Write up
              </label>
              <span
                aria-live="polite"
                className={`text-xs ${words >= MAX_WORDS ? "text-green-400" : "text-zinc-500"}`}
              >
                {words}/{MAX_WORDS} words
              </span>
            </div>
            <input
              id={writeUpId}
              type="text"
              value={writeUp}
              onChange={(e) => setWriteUp(limitWords(e.target.value))}
              placeholder={`Short description (max ${MAX_WORDS} words)`}
              maxLength={30}
              autoComplete="off"
              disabled={locked}
              className={inputClass}
            />
          </div>

          {/* Price */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor={priceId} className="text-sm text-zinc-300">
                Price
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
                disabled={busy}
                aria-label="Price currency"
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 disabled:opacity-60"
              >
                <option value="ETH">ETH</option>
                <option value="USDC">USDC</option>
              </select>
            </div>
            <input
              id={priceId}
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder={currency === "USDC" ? "10.00" : "0.05"}
              autoComplete="off"
              disabled={busy}
              className={inputClass}
            />
            <p className="mt-2 text-xs text-zinc-500">
              {currency === "USDC"
                ? "Converted to the native coin at the current rate when listing."
                : "Paid in the network's native coin."}
            </p>
          </div>

          {/* Add to featured */}
          <div className="space-y-3">
            <label
              htmlFor={featuredId}
              className="flex cursor-pointer items-center gap-3 text-sm text-zinc-200"
            >
              <input
                id={featuredId}
                type="checkbox"
                checked={featured}
                onChange={(e) => setFeatured(e.target.checked)}
                disabled={busy}
                className="h-5 w-5 rounded border-zinc-600 bg-zinc-800 accent-green-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
              />
              Add to featured
            </label>

            {featured && (
              <div>
                <label htmlFor={daysId} className="mb-2 block text-sm text-zinc-300">
                  Feature for how long?
                </label>
                <select
                  id={daysId}
                  value={featuredDays}
                  onChange={(e) => setFeaturedDays(Number(e.target.value))}
                  disabled={busy}
                  className={inputClass}
                >
                  {FEATURED_OPTIONS.map((o) => (
                    <option key={o.days} value={o.days}>
                      {o.days} days
                    </option>
                  ))}
                </select>
                {selectedOption && (
                  <p className="mt-2 text-xs text-zinc-500">
                    Your NFT will stay in the featured section for {selectedOption.days} days
                  </p>
                )}
              </div>
            )}
          </div>

          {formError && (
            <p role="alert" className="text-sm text-red-400">
              {formError}
            </p>
          )}

          {/* Actions */}
          <div className="mt-auto space-y-3 pt-2">
            {status && (
              <p role="status" aria-live="polite" className="text-center text-xs text-zinc-400">
                {status}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="flex-1 rounded-xl border border-zinc-600 px-4 py-3 text-sm text-zinc-200 hover:border-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-xl bg-green-400 px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-green-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 disabled:opacity-60"
              >
                {submitLabel}
              </button>
            </div>

            {/* Start over. After a mint, the NFT stays in your wallet; this form just stops tracking it. */}
            {(savedVisible || minted) && (
              <button
                type="button"
                onClick={() => {
                  if (
                    minted &&
                    !window.confirm(
                      "This NFT is already minted and stays in your wallet. Start a new one instead?"
                    )
                  ) {
                    return;
                  }
                  discardDraft();
                }}
                disabled={busy}
                className="w-full text-center text-xs text-zinc-500 underline hover:text-zinc-300 disabled:opacity-50"
              >
                {minted ? "Start a new NFT" : "Discard draft"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {trigger && (
        <button
          type="button"
          onClick={() => setInternalOpen(true)}
          aria-label={triggerLabel}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={`inline-flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 ${triggerClassName}`}
        >
          {trigger}
        </button>
      )}

      {/* Portal to <body> so it overlays everything, even if your sidebar
          has overflow, transform, or z-index rules that would clip it. */}
      {hydrated && createPortal(overlay, document.body)}
    </>
  );
}