'use client'
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { parseEther, zeroAddress, type Abi } from "viem";
import NFTArtifact from "@/abi/NFTCollection.json";
import MarketplaceArtifact from "@/abi/Marketplace.json";
import { useCurrency, type Currency } from "@/lib/currencyContext";
import { supabasePublic } from "@/lib/supabaseClient";
import { resolveIpfs } from "@/lib/enrichNft";
import { parseEventLogs } from "viem";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

// The on-chain Marketplace.listItem(uint256,uint256,address,bool) contract
// takes only a `featured: bool` (4th arg). Duration/fee live at the contract
// level (owner-only), so we surface the currently-configured tier here.
const FEATURED_OPTIONS = [{ days: 30,  }];

const NFT_ABI = ((NFTArtifact as any).abi ?? NFTArtifact) as Abi;
const MARKET_ABI = ((MarketplaceArtifact as any).abi ?? MarketplaceArtifact) as Abi;
const NFT_ADDRESS = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS as `0x${string}`;
const MARKET_ADDRESS = process.env.NEXT_PUBLIC_MARKETPLACE_CONTRACT_ADDRESS as `0x${string}`;

// address(0) = the chain's native coin.
const PAYMENT_TOKEN = zeroAddress;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const inputClass =
  "w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white " +
  "placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-green-400 disabled:opacity-60";

function errorMessage(err: unknown) {
  if (err == null) return "Something went wrong. Please try again.";
  if (typeof err === "string") return err;
  if (typeof err === "number" || typeof err === "boolean" || typeof err === "bigint") {
    return String(err);
  }
  const e = err as { shortMessage?: string; message?: string } | null;
  return e?.shortMessage ?? e?.message ?? "Something went wrong. Please try again.";
}

// token_id -> nfts.token_uri -> metadata JSON -> description (null if anything is missing)
async function getDescriptionForToken(tokenId: string): Promise<string | null> {
  try {
    const { data } = await supabasePublic
      .from("nfts")
      .select("token_uri")
      .eq("token_id", tokenId)
      .maybeSingle();
    const uri: string | undefined = data?.token_uri;
    if (!uri) return null;

    const res = await fetch(resolveIpfs(uri), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const meta = (await res.json()) as { description?: string };
    return meta.description?.trim() || null;
  } catch {
    return null;
  }
}

// Waits for the webhook to insert the listing, then sets its description
async function saveListingDescription(listingId: string, tokenId: string) {
  try {
    const description = await getDescriptionForToken(tokenId);
    if (!description) return; // metadata missing (e.g. unpinned), leave it empty

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

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

interface RelistSidebarProps {
  /** Token id of an already-minted NFT to put up for sale. */
  tokenId: string | null;
  /** Controls visibility: the panel is open while `tokenId` is set. */
  open: boolean;
  onClose: () => void;
}

export default function RelistSidebar({ tokenId, open, onClose }: RelistSidebarProps) {
  const [price, setPrice] = useState("");
  const [featured, setFeatured] = useState(false);
  const [featuredDays, setFeaturedDays] = useState<number>(FEATURED_OPTIONS[0].days);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { currency, setCurrency, usdcPriceToWei } = useCurrency();

  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  const uid = useId();
  const titleId = `${uid}-title`;
  const priceId = `${uid}-price`;
  const featuredId = `${uid}-featured`;
  const daysId = `${uid}-days`;

  // Reset the form each time a new token is opened.
  useEffect(() => {
    if (!open) return;
    setPrice("");
    setFeatured(false);
    setFeaturedDays(FEATURED_OPTIONS[0].days);
    setStatus(null);
    setFormError(null);
    setBusy(false);
  }, [open, tokenId]);

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

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
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

  const handleList = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);
      if (busy) return;

      if (tokenId === null || tokenId === "") return setFormError("No NFT selected to list.");
      if (!address) return setFormError("Connect your wallet first.");
      if (!publicClient) return setFormError("Wallet network isn't ready. Please try again.");

      let id: bigint;
      try {
        id = BigInt(tokenId);
      } catch {
        return setFormError("That token id is invalid.");
      }

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
      if (priceWei <= BigInt(0)) return setFormError("Price must be greater than 0.");
      const MAX_WEI = parseEther("1000000");
      if (priceWei > MAX_WEI) return setFormError("Price cannot exceed 1,000,000 coins.");

      setBusy(true);
      try {
        // listItem pulls the NFT into escrow, so the marketplace must be approved first.
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
          setStatus("Waiting for approval...");
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

        setStatus("Waiting for confirmation...");
        const receipt = await publicClient.waitForTransactionReceipt({ hash: listHash });
        if (receipt.status !== "success") throw new Error("Listing transaction failed.");

          try {
          const listed = parseEventLogs({ abi: MARKET_ABI, eventName: "Listed", logs: receipt.logs });
          const a = listed.find((l) => l.address.toLowerCase() === MARKET_ADDRESS.toLowerCase())?.args as any;
          const listingId = a?.listingId ?? a?.[0];
          if (listingId != null) void saveListingDescription(String(listingId), String(id));
        } catch {
          /* never block the listing flow */
        }

        onClose();
      } catch (err) {
        setFormError(errorMessage(err));
      } finally {
        setStatus(null);
        setBusy(false);
      }
    },
    [address, busy, currency, featured, onClose, price, publicClient, tokenId, usdcPriceToWei, writeContractAsync]
  );

  const selectedOption = FEATURED_OPTIONS.find((o) => o.days === featuredDays);

  const overlay = (
    <div
      className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* Backdrop: click to close */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close list panel"
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
        <form
          onSubmit={handleList}
          autoComplete="off"
          className="flex flex-1 flex-col gap-5 p-4 sm:p-6"
          noValidate
        >
          <h2 id={titleId} className="text-2xl text-green-400 sm:text-3xl sancreek">
            List NFT
          </h2>

          {tokenId !== null && tokenId !== "" && (
            <p className="rounded-xl border border-green-400/40 bg-green-400/10 px-4 py-3 text-xs text-green-300">
              Listing NFT #{tokenId}. Set a price below and confirm.
            </p>
          )}

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
                    Your NFT stays in featured section for {selectedOption.days} days
                    only.
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
                {busy ? "Listing NFT..." : "List NFT"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return <>{mounted && createPortal(overlay, document.body)}</>;
}
