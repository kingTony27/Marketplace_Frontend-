// lib/avatarMessage.ts
// Builds the exact string the user signs with personal_sign to authorize an
// avatar change. Imported by BOTH the client (to sign) and the server
// (to verify) — they must produce identical bytes.

export interface AvatarMessageInput {
  wallet: string;
  avatarUrl: string | null;
  timestamp: number;
}

/**
 * Human-readable message. Must match character-for-character on client and
 * server so the signature verifies. The timestamp is a unix ms integer.
 */
export function buildAvatarMessage({ wallet, avatarUrl, timestamp }: AvatarMessageInput): string {
  return [
    "NFT Marketplace — update profile picture",
    `Wallet: ${wallet}`,
    `Avatar: ${avatarUrl ?? "(none)"}`,
    `Timestamp: ${timestamp}`,
  ].join("\n");
}

export const AVATAR_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
export const AVATAR_SIGNATURE_MAX_FUTURE_MS = 60 * 1000; // 1 minute
