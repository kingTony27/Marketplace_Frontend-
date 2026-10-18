// lib/avatars.ts
import { supabasePublic} from './supabaseClient';

export const AVATAR_COUNT = 20;

export function getAvatarUrl(index: number): string {
  const { data } = supabasePublic.storage
    .from('avatars')
    .getPublicUrl(`pixelArt/pixelArt-${index}.svg`);
  return data.publicUrl;
}

export const avatarUrls: string[] = Array.from({ length: AVATAR_COUNT }, (_, i) =>
  getAvatarUrl(i + 1)
);