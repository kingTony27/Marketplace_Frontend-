'use client'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/* Config: change these to match your own routes                       */
/* ------------------------------------------------------------------ */

const API = {
  /** GET -> returns an array of notifications (or { notifications: [...] } / { data: [...] }) */
  list: "/api/notifications",
  /** PATCH with { read: true } marks one as read. DELETE removes it. */
  item: (id: string) => `/api/notifications/${encodeURIComponent(id)}`,
  /** PATCH marks everything as read. */
  readAll: "/api/notifications/read-all",
};

/** Refresh interval while the page is open and visible. Set to 0 to turn polling off. */
const POLL_MS = 60_000;

/* ------------------------------------------------------------------ */
/* Types + helpers                                                     */
/* ------------------------------------------------------------------ */

export interface NotificationItem {
  id: string;
  title: string;
  message?: string;
  /** Display text such as "2h ago". */
  time: string;
  read: boolean;
  /** If set, clicking the notification goes here and the panel closes. */
  href?: string;
  imageSrc?: string;
  imageAlt?: string;
}

type Tab = "all" | "unread";

function timeAgo(value: unknown): string {
  const date = new Date(value as string);
  const ms = Date.now() - date.getTime();
  if (Number.isNaN(ms)) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return date.toLocaleDateString();
}

/**
 * Converts one row from your API into what the panel displays.
 * It already understands both camelCase and snake_case, so a row like
 * { id, title, message, href, created_at, read_at } works as is.
 * Adjust here if your column names differ.
 */
function toItem(raw: unknown): NotificationItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = r.id;
  const title = r.title;
  if ((typeof id !== "string" && typeof id !== "number") || typeof title !== "string") {
    return null;
  }
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  return {
    id: String(id),
    title,
    message: str(r.message),
    time: str(r.time) ?? timeAgo(r.createdAt ?? r.created_at),
    read: typeof r.read === "boolean" ? r.read : Boolean(r.readAt ?? r.read_at),
    href: str(r.href),
    imageSrc: str(r.imageSrc ?? r.image_src),
    imageAlt: str(r.imageAlt ?? r.image_alt),
  };
}

async function send(url: string, init: RequestInit) {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
}

function Message({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-zinc-500">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

interface NotificationSidebarProps {
  /** Your existing sidebar icon. The component wraps it in a button that opens the panel. */
  trigger?: ReactNode;
  triggerLabel?: string;
  triggerClassName?: string;

  /** Only needed if you control open/close yourself. Leave out to let the component manage it. */
  open?: boolean;
  onClose?: () => void;

  /** Optional: called when the unread count changes, handy for a badge on your own icon. */
  onUnreadCountChange?: (count: number) => void;
}

export default function NotificationSidebar({
  trigger,
  triggerLabel = "Notifications",
  triggerClassName = "",
  open: openProp,
  onClose: onCloseProp,
  onUnreadCountChange,
}: NotificationSidebarProps) {
  // Works on its own (clicking the trigger opens it), or controlled via open/onClose.
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = openProp ?? internalOpen;
  const onClose = useCallback(() => {
    if (!isControlled) setInternalOpen(false);
    onCloseProp?.();
  }, [isControlled, onCloseProp]);

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [tab, setTab] = useState<Tab>("all");
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => setMounted(true), []);

  /* ---------------- Loading from your API ---------------- */

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(API.list, { cache: "no-store", credentials: "include", signal });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);

      const json: unknown = await res.json();
      const obj = json as { notifications?: unknown; data?: unknown } | null;
      const list = Array.isArray(json) ? json : obj?.notifications ?? obj?.data;
      if (!Array.isArray(list)) throw new Error("Unexpected response from the server.");

      setItems(list.map(toItem).filter((n): n is NotificationItem => n !== null));
      setLoadError(null);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setLoadError("Couldn't load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount (so the unread count is ready) and refresh on a timer.
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);

    let timer: ReturnType<typeof setInterval> | undefined;
    if (POLL_MS > 0) {
      timer = setInterval(() => {
        if (document.visibilityState === "visible") load(controller.signal);
      }, POLL_MS);
    }
    return () => {
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [load]);

  // Refresh whenever the panel is opened.
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const unreadCount = useMemo(() => items.filter((n) => !n.read).length, [items]);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  const visible = tab === "unread" ? items.filter((n) => !n.read) : items;

  /* ---------------- Escape, scroll lock, focus trap ---------------- */

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

  /* ---------------- Actions: update the view first, then your API ---------------- */

  const markRead = async (id: string) => {
    const target = items.find((n) => n.id === id);
    if (!target || target.read) return;

    const snapshot = items;
    setActionError(null);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await send(API.item(id), { method: "PATCH", body: JSON.stringify({ read: true }) });
    } catch {
      setItems(snapshot); // undo if the server said no
      setActionError("Couldn't update that notification.");
    }
  };

  const markAllRead = async () => {
    if (unreadCount === 0) return;

    const snapshot = items;
    setActionError(null);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await send(API.readAll, { method: "PATCH" });
    } catch {
      setItems(snapshot);
      setActionError("Couldn't mark all as read.");
    }
  };

  const dismiss = async (id: string) => {
    const snapshot = items;
    setActionError(null);
    setItems((prev) => prev.filter((n) => n.id !== id));
    try {
      await send(API.item(id), { method: "DELETE" });
    } catch {
      setItems(snapshot);
      setActionError("Couldn't dismiss that notification.");
    }
  };

  const activate = (item: NotificationItem) => {
    void markRead(item.id);
    if (item.href) onClose();
  };

  /* ---------------- Rendering ---------------- */

  const rowBody = (item: NotificationItem) => (
    <>
      <span
        className="mt-1.5 flex h-2.5 w-2.5 shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        {!item.read && <span className="h-2.5 w-2.5 rounded-full bg-green-400" />}
      </span>

      {item.imageSrc && (
        <img
          src={item.imageSrc}
          alt={item.imageAlt ?? ""}
          loading="lazy"
          className="h-10 w-10 shrink-0 rounded-full object-cover"
        />
      )}

      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${item.read ? "text-zinc-300" : "text-white"}`}>
          {item.title}
        </span>
        {item.message && (
          <span className="mt-0.5 block text-sm text-zinc-400">{item.message}</span>
        )}
        <span className="mt-1 block text-xs text-zinc-500">{item.time}</span>
      </span>
      {!item.read && <span className="sr-only">Unread</span>}
    </>
  );

  const rowClass =
    "flex w-full items-start gap-3 rounded-2xl p-3 pr-10 text-left hover:bg-zinc-800 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400";

  const bellIcon = (
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
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );

  let body: ReactNode;
  if (loading && items.length === 0) {
    body = (
      <Message>
        <p role="status" className="text-sm">
          Loading notifications...
        </p>
      </Message>
    );
  } else if (loadError && items.length === 0) {
    body = (
      <Message>
        <p role="alert" className="text-sm text-red-400">
          {loadError}
        </p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            load();
          }}
          className="rounded-full border border-zinc-600 px-4 py-1.5 text-sm text-zinc-200 hover:border-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
        >
          Try again
        </button>
      </Message>
    );
  } else if (visible.length === 0) {
    body = (
      <Message>
        {bellIcon}
        <p className="text-sm">
          {tab === "unread" ? "You're all caught up." : "No notifications yet."}
        </p>
      </Message>
    );
  } else {
    body = (
      <ul className="space-y-1">
        {visible.map((item) => (
          <li key={item.id} className="relative">
            {item.href ? (
              <Link href={item.href} onClick={() => activate(item)} className={rowClass}>
                {rowBody(item)}
              </Link>
            ) : (
              <button type="button" onClick={() => activate(item)} className={rowClass}>
                {rowBody(item)}
              </button>
            )}

            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label={`Dismiss notification: ${item.title}`}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
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
          </li>
        ))}
      </ul>
    );
  }

  const overlay = (
    <div
      className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* Backdrop: click to close */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close notifications"
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
        className={`absolute right-0 top-0 flex h-full w-full flex-col bg-zinc-900 font-display shadow-2xl focus:outline-none md:w-96 motion-safe:transition-[transform,visibility] motion-safe:duration-300 ${
          open ? "translate-x-0 visible" : "translate-x-full invisible"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-4 pb-3 sm:p-6 sm:pb-4">
          <h2 id={titleId} className="text-2xl text-green-400 sm:text-3xl sancreek">
            Notifications
            {unreadCount > 0 && (
              <span className="ml-2 align-middle text-sm text-zinc-400">({unreadCount})</span>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notifications"
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Tabs + mark all */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 pb-3 sm:px-6">
          <div className="flex gap-2">
            {(["all", "unread"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className={`rounded-full px-3 py-1.5 text-sm capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 ${
                  tab === t ? "bg-green-400 text-zinc-900" : "text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="text-xs text-zinc-400 underline hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 disabled:no-underline disabled:opacity-40"
          >
            Mark all as read
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-3">
          {actionError && (
            <p
              role="alert"
              className="mb-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400"
            >
              {actionError}
            </p>
          )}
          {body}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {trigger && (
        <button
          type="button"
          onClick={() => setInternalOpen(true)}
          aria-label={unreadCount > 0 ? `${triggerLabel}, ${unreadCount} unread` : triggerLabel}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={`relative inline-flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 ${triggerClassName}`}
        >
          {trigger}
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-green-400 px-1 text-[10px] font-semibold text-zinc-900"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Portal to <body> so it overlays everything, even if your sidebar
          has overflow, transform, or z-index rules that would clip it. */}
      {mounted && createPortal(overlay, document.body)}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Usage                                                               */
/* ------------------------------------------------------------------ */
/*
No data props needed. The panel fetches its own notifications.

const [notifOpen, setNotifOpen] = useState(false);

<RailButton
  title="Notifications"
  icon={<Bell className="h-6 w-6 shrink-0" strokeWidth={2} />}
  onClick={() => setNotifOpen(true)}
/>

<NotificationSidebar open={notifOpen} onClose={() => setNotifOpen(false)} />

Routes it calls (edit the API object at the top to rename them):

  GET    /api/notifications            -> [{ id, title, message, href, created_at, read_at }]
  PATCH  /api/notifications/:id        -> body { read: true }
  PATCH  /api/notifications/read-all
  DELETE /api/notifications/:id

On the server, always filter by the logged-in user's id so people only
see, update, and delete their own notifications.
*/