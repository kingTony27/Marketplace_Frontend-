// lib/avatarOptions.ts
// Shared avatar configuration used by BOTH the client picker
// (app/profile/profile.tsx) and the server validation
// (app/api/users/[wallet]/avatar/route.ts). One source of truth.

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  (typeof window !== "undefined" ? "" : "");

// The pixelArt avatars live in the public Supabase Storage bucket "avatars"
// at pixelArt/pixelArt-1.svg ... pixelArt/AVATAR_COUNT.svg.
// Public bucket files have a predictable URL.
export const AVATAR_BASE_URL = `${SUPABASE_URL}/storage/v1/object/public/avatars/pixelArt`;
export const AVATAR_COUNT = 20;

export interface AvatarOption {
  id: string;
  src: string; // full URL stored in users.avatar_url; "" = default icon
  label: string;
}

// "src" is the full URL that is stored in users.avatar_url.
export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: "default", src: "", label: "Default (icon)" },
  ...Array.from({ length: AVATAR_COUNT }, (_, i) => ({
    id: `pixelArt-${i + 1}`,
    src: `${AVATAR_BASE_URL}/pixelArt-${i + 1}.svg`,
    label: `Avatar ${i + 1}`,
  })),
];

// Set of allowed avatar URLs the server will accept (excluding the default
// "" which means "clear avatar").
const ALLOWED_AVATAR_URLS = new Set(
  AVATAR_OPTIONS.filter((o) => o.src !== "").map((o) => o.src)
);

/**
 * Returns true when `url` is null (clear avatar) or exactly one of the
 * allowed pixelArt public URLs. Shared between client and server so the
 * validation rules never drift apart.
 */
export function isAllowedAvatarUrl(url: string | null): boolean {
  if (url === null) return true;
  return ALLOWED_AVATAR_URLS.has(url);
}
