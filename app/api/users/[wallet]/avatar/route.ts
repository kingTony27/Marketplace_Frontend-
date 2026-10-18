// app/api/users/[wallet]/avatar/route.ts
// PATCH /api/users/[wallet]/avatar
//
// Server-verified avatar update. The client signs a human-readable message with
// personal_sign; we verify the signer is [wallet] before writing users.avatar_url.
// Without a valid, fresh signature we reject (401/403).
import { NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { supabasePublic } from "@/lib/supabaseClient";
import { buildAvatarMessage, AVATAR_SIGNATURE_MAX_AGE_MS, AVATAR_SIGNATURE_MAX_FUTURE_MS } from "@/lib/avatarMessage";
import { isAllowedAvatarUrl } from "@/lib/avatarOptions";

export const dynamic = "force-dynamic";

type PatchBody = {
  avatarUrl?: unknown;
  timestamp?: unknown;
  signature?: unknown;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ wallet: string }> }
) {
  const { wallet } = await params;

  // Wallet must be a valid 0x address (40 hex chars). Case-insensitive match.
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return badRequest("Invalid wallet address.");
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const { avatarUrl, timestamp, signature } = body;

  // avatarUrl: null (clear) or a string that is one of the allowed URLs.
  if (avatarUrl !== null && typeof avatarUrl !== "string") {
    return badRequest("avatarUrl must be null or a string.");
  }
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return badRequest("timestamp must be a number (unix ms).");
  }
  if (typeof signature !== "string" || signature.length === 0) {
    return badRequest("signature must be a string.");
  }

  if (!isAllowedAvatarUrl(avatarUrl as string | null)) {
    return unauthorized("Avatar URL is not allowed.");
  }

  // Timestamp freshness: no older than 5 min, no more than 1 min in the future.
  const now = Date.now();
  if (timestamp < now - AVATAR_SIGNATURE_MAX_AGE_MS) {
    return unauthorized("Signature expired.");
  }
  if (timestamp > now + AVATAR_SIGNATURE_MAX_FUTURE_MS) {
    return unauthorized("Signature timestamp is too far in the future.");
  }

  // Rebuild the EXACT same message the client signed.
  const message = buildAvatarMessage({
    wallet,
    avatarUrl: avatarUrl as string | null,
    timestamp,
  });

  let valid: boolean;
  try {
    valid = await verifyMessage({
      address: wallet as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
  } catch {
    return unauthorized("Invalid signature.");
  }

  // verifyMessage returns true only when the signature was produced by [wallet].
  if (!valid) {
    return unauthorized("Signature does not match the profile wallet.");
  }

  // All checks passed: persist the avatar URL via the SECURITY DEFINER
  // function set_user_avatar(). anon has no direct UPDATE on users; the
  // function is the only write path and runs with the owner's privileges.
  // The application-level signature check above guarantees only the wallet
  // owner can change their own avatar.
  const { error: rpcError } = await supabasePublic.rpc("set_user_avatar", {
    p_wallet: wallet,
    p_avatar_url: avatarUrl as string | null,
  });

  if (rpcError) {
    // Never leak DB internals to the client.
    console.error("[avatar] set_user_avatar failed:", rpcError.message);
    return NextResponse.json({ error: "Failed to save avatar." }, { status: 500 });
  }

  return NextResponse.json({ avatarUrl: avatarUrl as string | null });
}
