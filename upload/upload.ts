// @/upload/upload.ts  (server-only: uses sharp and the Pinata JWT)
// NOTE: kept as .ts (not .tsx) because this file has generic arrow functions
// e.g. `async <T>(fn, maxRetries)` whose angle brackets would be parsed as JSX
// tags in .tsx mode → cascading parser error tsunami.
import "server-only";
import { PinataSDK } from "pinata";
import sharp from "sharp";

function requireEnv(name: keyof NodeJS.ProcessEnv): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[upload] Missing environment variable ${name}. Set it in .env.local before uploading.`
    );
  }
  return value;
}

const PINATA_JWT = requireEnv("PINATA_JWT");
const PINATA_GATEWAY = requireEnv("PINATA_GATEWAY");
const GROUP_ID = requireEnv("PINATA_GROUP_ID");

const pinata = new PinataSDK({
  pinataJwt: PINATA_JWT,
  pinataGateway: PINATA_GATEWAY,
});

export type Preset = { name: string; description: string; image: Buffer };

const withRetry = async <T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> => {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      console.error(`Attempt ${attempt} failed:`, err?.message);
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastErr;
};

export const uploadPreset = async ({ name, description, image }: Preset) => {
  // Keep the original ratio: only shrink if larger than 1200px on either side
  const { data, info } = await sharp(image)
    .rotate() // apply EXIF orientation so phone photos aren't sideways
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true });

  if (!data || data.length === 0) {
    throw new Error("[upload] Sharp produced an empty buffer. The source image may be corrupt.");
  }
  if (!info.width || !info.height) {
    throw new Error("[upload] Sharp did not report image dimensions.");
  }

  const safeName = (name.replace(/[^a-z0-9-_]/gi, "_").slice(0, 50) || "preset") + ".jpg";

  // Upload via base64 (100% Node-version-agnostic — doesn't rely on global File/Blob
  // constructors which behave differently across Node 18.x / 20.x minor releases).
  // `.name(safeName).group(GROUP_ID)` are UploadBuilder chain methods, then `await`
  // resolves the thenable builder into UploadResponse.
  const base64Body = data.toString("base64");
  const imageUpload = await withRetry(() =>
    pinata.upload.public
      .base64(base64Body)
      .name(safeName)
      .group(GROUP_ID) as unknown as Promise<{ cid: string }>
  );
  const imageUri = `ipfs://${imageUpload.cid}`;

  const metadata = {
    name,
    description,
    image: imageUri,
    width: info.width, // lets the frontend reserve space for the masonry layout
    height: info.height,
  };
  const metaUpload = await withRetry(() =>
    pinata.upload.public
      .json(metadata)
      .name(`${safeName}.json`)
      .group(GROUP_ID) as unknown as Promise<{ cid: string }>
  );

  return { imageUri, metadataUri: `ipfs://${metaUpload.cid}`, width: info.width, height: info.height };
};