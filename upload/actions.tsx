// @/upload/actions.ts
"use server";

import { uploadPreset } from "./upload";

const MAX_BYTES = 8 * 1024 * 1024;

export type CreateMetadataResult =
  | { ok: true; metadataUri: string; imageUri: string }
  | { ok: false; error: string };

/**
 * Called straight from the client component (no route.ts needed).
 * Uploads the picture and the metadata JSON to Pinata and returns the ipfs:// metadata URI.
 */
export async function createMetadata(formData: FormData): Promise<CreateMetadataResult> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const file = formData.get("file");

  if (!name) return { ok: false, error: "Name is required." };
  if (!description) return { ok: false, error: "Write up is required." };
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return { ok: false, error: "A valid image is required." };
  }
  if (file.size > MAX_BYTES) return { ok: false, error: "Image is too large." };

  try {
    const { metadataUri, imageUri } = await uploadPreset({
      name,
      description,
      image: Buffer.from(await file.arrayBuffer()),
    });
    return { ok: true, metadataUri, imageUri };
  } catch (err) {
    console.error(err);
    return { ok: false, error: "Upload to IPFS failed. Please try again." };
  }
}