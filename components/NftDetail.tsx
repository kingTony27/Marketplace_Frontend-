"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useCurrency } from "@/lib/currencyContext";

/* ---------- Types ---------- */

export interface NftMedia {
  type: "image" | "video";
  src: string;
  alt: string;
  /** Real pixel size, so the space is reserved before it loads. */
  width?: number | null;
  height?: number | null;
  poster?: string | null;
  /** Captions file (.vtt) for videos. Strongly recommended for accessibility. */
  captionsSrc?: string | null;
}

export interface NftComment {
  id: string;
  author?: string | null;
  text: string;
}

export interface RelatedNft {
  id: string;
  src: string;
  alt: string;
  width?: number | null;
  height?: number | null;
  /** Small label on the corner, like a duration (0:27) or a price. */
  badge?: string | null;
  href?: string | null;
}

export interface NftDetailProps {
  media?: NftMedia | null;
  title?: string | null;
  creatorName?: string | null;
  /** Used for the Profile link (/profile/[address]). */
  creatorAddress?: string | null;
  creatorAvatarSrc?: string | null;
  /** Listing price in wei; formatted in the selected currency (ETH / USDC). */
  price?: string | null;
  likeCount?: number | null;
  comments?: NftComment[] | null;
  related?: RelatedNft[] | null;
  actionLabel?: string;
   initialLiked?: boolean;
  /** Runs when Mint is clicked. Throw an error if the mint fails. */
  onMint?: () => void | Promise<void>;
  onLikeChange?: (liked: boolean) => void | Promise<void>;
  /** Runs when a comment is posted. Throw an error if it fails. */
  onAddComment?: (text: string) => void | Promise<void>;
   /** Runs when the heart is clicked. Throw an error if it fails. */
}

type MintState = "idle" | "minting" | "minted" | "error";
type Status = { text: string; error: boolean };

/* ---------- Safe-value helpers ---------- */

function cleanText(value?: string | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

function cleanCount(value?: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positive(value?: number | null): number | null {
  const n = cleanCount(value);
  return n !== null && n > 0 ? n : null;
}

function cleanComments(list?: NftComment[] | null): NftComment[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((c) => c && cleanText(c.text))
    .map((c) => ({
      id: c.id,
      author: cleanText(c.author) ?? "Anonymous",
      text: c.text.trim(),
    }));
}

function cleanRelated(list?: RelatedNft[] | null): RelatedNft[] {
  if (!Array.isArray(list)) return [];
  return list.filter((r) => r && cleanText(r.src));
}

/* ---------- Style tokens (same as the other components) ---------- */

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900";

const iconButton = `flex h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-2 text-white motion-safe:transition-colors hover:bg-white/10 ${focusRing}`;

/* ---------- Icons ---------- */

function Icon({
  children,
  className = "h-6 w-6",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-6 w-6 ${filled ? "text-green-400" : ""}`}
    >
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  );
}

/* ---------- Small pieces ---------- */

function Avatar({
  name,
  src,
  size = "h-10 w-10",
}: {
  name: string;
  src?: string | null;
  size?: string;
}) {
  const [failed, setFailed] = useState(false);
  const clean = cleanText(src);
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  if (clean && !failed) {
    return (
      <img
        src={clean}
        alt=""
        onError={() => setFailed(true)}
        className={`${size} shrink-0 rounded-xl object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${size} grid shrink-0 place-items-center rounded-xl bg-zinc-700 text-base text-white`}
    >
      {initial}
    </span>
  );
}

function RelatedCard({ item }: { item: RelatedNft }) {
  const href = cleanText(item.href);
  const badge = cleanText(item.badge);

  const picture = (
    <figure className="relative">
      <img
        src={item.src}
        alt={item.alt ?? ""}
        width={positive(item.width) ?? 4}
        height={positive(item.height) ?? 5}
        loading="lazy"
        decoding="async"
        className="h-auto w-full rounded-2xl bg-zinc-800"
      />
      {badge && (
        <figcaption className="absolute left-2 top-2 rounded-full bg-zinc-900/80 px-3 py-1 text-sm text-white">
          {badge}
        </figcaption>
      )}
    </figure>
  );

  return href ? (
    <Link href={href} className={`block rounded-2xl ${focusRing}`}>
      {picture}
    </Link>
  ) : (
    picture
  );
}

/* ---------- Main component ---------- */

export default function NftDetail({
  media,
  title,
  creatorName,
  creatorAddress,
  creatorAvatarSrc,
  price,
  likeCount,
  initialLiked = false, 
  comments,
  related,
  onMint,
  onLikeChange,
  onAddComment,
  actionLabel = "Mint"
  
}: NftDetailProps) {
  const router = useRouter();
  const { formatPrice } = useCurrency();
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [commentsOpen, setCommentsOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [extraComments, setExtraComments] = useState<NftComment[]>([]);
  const [mintState, setMintState] = useState<MintState>("idle");
  const [mediaFailed, setMediaFailed] = useState(false);
  const [notice, setNotice] = useState<Status | null>(null);
  const [liked, setLiked] = useState(initialLiked);
  const likePending = useRef(false);

  //like state
  useEffect(() => {
  setLiked(initialLiked);
}, [initialLiked]);

  // Clean every prop once, then use only the clean values below.
  const cleanTitle = cleanText(title) ?? "Untitled";
  const name = cleanText(creatorName) ?? "Unknown creator";
  const address = cleanText(creatorAddress);
  const priceText = cleanText(price) ? formatPrice(cleanText(price) as string) : null;
  const mediaSrc = cleanText(media?.src);
  const mediaWidth = positive(media?.width) ?? 4;
  const mediaHeight = positive(media?.height) ?? 5;
  const baseLikes = cleanCount(likeCount);
   const allComments = [...cleanComments(comments), ...extraComments];
  const relatedItems = cleanRelated(related);

 // The server count already includes my like if I had liked before.
const likes =
  baseLikes !== null
    ? Math.max(0, baseLikes + (liked ? 1 : 0) - (initialLiked ? 1 : 0))
    : liked
      ? 1
      : null;

 

  function flash(text: string, error = false) {
    setNotice({ text, error });
    window.setTimeout(() => setNotice(null), 3000);
  }

 async function toggleLike() {
  if (likePending.current) return; // ignore clicks while a request is running
  likePending.current = true;

  const next = !liked;
  setLiked(next); // show it right away
  try {
    await onLikeChange?.(next); // true = like, false = unlike
  } catch {
    setLiked(!next); // undo if the server said no
    flash("Could not update your like. Are you signed in?", true);
  } finally {
    likePending.current = false;
  }
}

  function openComments() {
    setCommentsOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function handleShare() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: cleanTitle, url });
      } else {
        await navigator.clipboard.writeText(url);
        flash("Link copied.");
      }
    } catch (err) {
      // The person closed the share sheet. Nothing went wrong.
      if (err instanceof DOMException && err.name === "AbortError") return;
      flash("Could not share this link.", true);
    }
  }

  async function handleMint() {
    if (!onMint || mintState === "minting" || mintState === "minted") return;
    setMintState("minting");
    try {
      await onMint();
      setMintState("minted");
    } catch {
      setMintState("error");
    }
  }

  async function submitComment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;

    // Show it right away, and undo if saving fails.
    const id = `local-${Date.now()}`;
    setExtraComments((prev) => [...prev, { id, author: "You", text }]);
    setDraft("");
    try {
      await onAddComment?.(text);
    } catch {
      setExtraComments((prev) => prev.filter((c) => c.id !== id));
      setDraft(text);
      flash("Could not post your comment. Please try again.", true);
    }
  }

  const mintStatus: Status | null =
    mintState === "error"
      ? { text: "Mint failed. Please try again.", error: true }
      : mintState === "minted"
        ? { text: "Mint complete.", error: false }
        : mintState === "minting"
          ? { text: "Minting...", error: false }
          : null;
  const status = notice ?? mintStatus;

  const mintLabel =
  mintState === "minting"
    ? "Processing..."
    : mintState === "minted"
      ? "Done"
      : mintState === "error"
        ? "Try again"
        : actionLabel;

  const commentCount = allComments.length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 bg-zinc-900 px-4 py-8 font-display text-white sm:px-6 lg:px-8">
      <article className="grid overflow-hidden rounded-3xl border border-zinc-700 lg:grid-cols-2">
        {/* ---------- Media ---------- */}
        <div className="relative flex items-center justify-center bg-black lg:min-h-[28rem]">
          {mediaSrc && !mediaFailed ? (
            media?.type === "video" ? (
              <video
                src={mediaSrc}
                poster={cleanText(media?.poster) ?? undefined}
                aria-label={cleanText(media?.alt) ?? cleanTitle}
                width={mediaWidth}
                height={mediaHeight}
                controls
                playsInline
                preload="metadata"
                onError={() => setMediaFailed(true)}
                className="h-auto max-h-[80vh] w-full object-contain"
              >
                {cleanText(media?.captionsSrc) && (
                  <track
                    kind="captions"
                    src={cleanText(media?.captionsSrc) ?? undefined}
                    srcLang="en"
                    label="English"
                    default
                  />
                )}
              </video>
            ) : (
              <img
                src={mediaSrc}
                alt={cleanText(media?.alt) ?? cleanTitle}
                width={mediaWidth}
                height={mediaHeight}
                onError={() => setMediaFailed(true)}
                className="h-auto max-h-[80vh] w-full object-contain"
              />
            )
          ) : (
            <p className="p-12 text-center text-base text-zinc-400">
              Media not available.
            </p>
          )}

          <button
            type="button"
            onClick={() => router.back()}
            className={`absolute left-4 top-4 flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-900/90 text-white motion-safe:transition-colors hover:bg-zinc-800 ${focusRing}`}
          >
            <Icon>
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </Icon>
            <span className="sr-only">Go back</span>
          </button>
        </div>

        {/* ---------- Info panel ---------- */}
        <div className="flex min-h-0 flex-col gap-6 p-4 sm:p-6">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-pressed={liked}
                onClick={toggleLike}
                className={iconButton}
              >
                <HeartIcon filled={liked} />
                <span className="sr-only">Like</span>
                {likes !== null && (
                  <span className="text-base">{likes.toLocaleString("en-US")}</span>
                )}
              </button>

              <button type="button" onClick={openComments} className={iconButton}>
                <Icon>
                  <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" />
                </Icon>
                <span className="sr-only">Add a comment</span>
              </button>

              <button type="button" onClick={handleShare} className={iconButton}>
                <Icon>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </Icon>
                <span className="sr-only">Share</span>
              </button>
            </div>

            <div className="flex items-center gap-4">
              {address && (
                <Link
                  href={`/profile/${encodeURIComponent(address)}`}
                  className={`rounded-xl px-2 py-2 text-base text-white motion-safe:transition-colors hover:text-green-400 sm:text-lg ${focusRing}`}
                >
                  Profile
                </Link>
              )}
              <button
                type="button"
                onClick={handleMint}
                disabled={
                  !onMint || mintState === "minting" || mintState === "minted"
                }
                aria-busy={mintState === "minting"}
                className={`rounded-2xl bg-green-400 px-6 py-3 text-base text-zinc-950 motion-safe:transition-colors hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-60 sm:text-lg ${focusRing}`}
              >
                {mintLabel}
              </button>
            </div>
          </div>

          {/* Status messages (read out by screen readers) */}
          <p
            role="status"
            className={`min-h-5 text-sm sm:text-base ${
              status?.error ? "text-red-400" : "text-green-400"
            }`}
          >
            {status?.text ?? ""}
          </p>

          {/* Creator and title */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar name={name} src={creatorAvatarSrc} size="h-8 w-8" />
              <p className="text-base text-white">{name}</p>
            </div>
            <h1 className="text-2xl text-green-400 sm:text-3xl">{cleanTitle}</h1>
            {priceText && (
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-zinc-400">Price</span>
                <span className="text-xl text-green-400 sm:text-2xl">{priceText}</span>
              </div>
            )}
          </div>

          {/* Comments */}
          <section
            aria-labelledby={`${uid}-comments`}
            className="flex min-h-0 flex-1 flex-col gap-4 border-t border-zinc-700 pt-6"
          >
            <h2 id={`${uid}-comments`} className="text-lg">
              <button
                type="button"
                aria-expanded={commentsOpen}
                aria-controls={`${uid}-comment-list`}
                onClick={() => setCommentsOpen((open) => !open)}
                className={`flex w-full items-center justify-between rounded-xl py-2 text-left text-white ${focusRing}`}
              >
                <span>
                  {commentCount} {commentCount === 1 ? "Comment" : "Comments"}
                </span>
                <Icon
                  className={`h-6 w-6 motion-safe:transition-transform ${
                    commentsOpen ? "rotate-180" : ""
                  }`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </Icon>
              </button>
            </h2>

            <div
              id={`${uid}-comment-list`}
              hidden={!commentsOpen}
              className="max-h-72 min-h-0 flex-1 overflow-y-auto lg:max-h-none"
            >
              {commentCount > 0 ? (
                <ul role="list" className="space-y-4">
                  {allComments.map((c, i) => (
                    <li key={c.id ?? i} className="flex items-start gap-3">
                      <Avatar name={c.author ?? "Anonymous"} size="h-8 w-8" />
                      <p className="min-w-0 break-words text-base text-zinc-200">
                        <span className="text-green-400">{c.author}</span>{" "}
                        {c.text}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-base text-zinc-400">No comments yet.</p>
              )}
            </div>
          </section>

          {/* Comment box */}
          <form onSubmit={submitComment} className="flex items-center gap-3">
            <label htmlFor={`${uid}-comment`} className="sr-only">
              Add a comment
            </label>
            <input
              ref={inputRef}
              id={`${uid}-comment`}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a comment"
              maxLength={500}
              autoComplete="off"
              className={`min-h-12 min-w-0 flex-1 rounded-3xl border-x border-green-400 bg-transparent px-6 text-base text-white placeholder:text-zinc-400 ${focusRing}`}
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className={`min-h-12 rounded-3xl px-4 text-base text-green-400 motion-safe:transition-colors hover:bg-green-400/10 disabled:cursor-not-allowed disabled:text-zinc-500 disabled:hover:bg-transparent ${focusRing}`}
            >
              Post
            </button>
          </form>
        </div>
      </article>

      {/* ---------- More like this ---------- */}
      {relatedItems.length > 0 && (
        <section aria-labelledby={`${uid}-related`} className="space-y-6">
          <h2
            id={`${uid}-related`}
            className="text-2xl text-green-400 sm:text-3xl"
          >
            More like this
          </h2>
          <ul
            role="list"
            className="columns-2 gap-4 sm:gap-6 md:columns-3 lg:columns-4"
          >
            {relatedItems.map((item) => (
              <li key={item.id} className="mb-4 break-inside-avoid sm:mb-6">
                <RelatedCard item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}