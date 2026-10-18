"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (username: string) => void;
};

export function UsernameModal({ open, onOpenChange, onSaved }: Props) {
  const [username, setUsername] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = USERNAME_RE.test(username);

  function close() {
    if (saving) return;
    setConfirming(false);
    setError(null);
    onOpenChange(false);
  }

  // Escape key closes it
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api("/api/users/me", {
        method: "PUT",
        body: JSON.stringify({ username }),
      });
      onSaved(username);
      setConfirming(false);
      onOpenChange(false);
    } catch (err) {
      setConfirming(false);
      setError(
        err instanceof ApiError && err.status === 409
          ? "That name is taken. Try another."
          : "Something went wrong. Try again."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    if (!confirming) setConfirming(true);
    else save();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="username-title"
        onClick={(e) => e.stopPropagation()}
        className={`sancreek w-full max-w-md rounded-xl border-2 border-green-400 bg-zinc-900 p-1`}
      >
        <div className="rounded-lg border border-dashed border-[#4ade80]/60 p-6">
          <div className="text-center">
            <h2 id="username-title" className="text-3xl tracking-wide text-white">
              Pick a username.
            </h2>
            <p className="mt-2 tracking-wide text-zinc-400">
               Once you pick it, you can't change it.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
            <label htmlFor="username" className="text-green-400">
              Username
            </label>
            <input
              id="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setConfirming(false);
                setError(null);
              }}
              placeholder="insert username"
              maxLength={20}
              autoComplete="off"
              autoFocus
              disabled={saving}
              className={`sancreek rounded-md border border-green-400/50 bg-zinc-800 px-3 py-2 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-400`}
            />
            <p className="text-xs text-zinc-500">3 to 20 letters, numbers or _</p>
            {error && <p className="text-sm text-red-400">{error}</p>}

            {confirming ? (
              <div className="grid gap-3 rounded-lg bg-zinc-800 p-4 text-center">
                <p className="text-white">
                  <span className="text-green-400">@{username}</span> can never be
                  changed. Sure?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={saving}
                    className="flex-1 rounded-md border border-green-400/50 px-4 py-2 text-white hover:bg-zinc-700"
                  >
                    Go back
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 rounded-md bg-green-400 px-4 py-2 text-zinc-900 hover:bg-green-300 disabled:opacity-50"
                  >
                    {saving ? "Sealing..." : "Yes, seal it"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="flex-1 rounded-md border border-green-400/50 px-4 py-2 text-white hover:bg-zinc-700"
                >
                  Later
                </button>
                <button
                  type="submit"
                  disabled={!valid}
                  className="flex-1 rounded-md bg-green-400 px-4 py-2 text-zinc-900 hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Seal It
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}