/**
 * Image upload validation (v2 Phase 1, audit H4).
 *
 * The old check (`file.type.startsWith("image/")`) trusted a client-supplied
 * MIME type, so SVG files sailed through — and were stored with that
 * attacker-controlled content type, including in public buckets. SVG can
 * carry script, so it is never an acceptable upload here.
 *
 * This module is the single validator for every upload path (deposit
 * screenshots, chat images, game icons, brand logo): it sniffs the real
 * file bytes (magic numbers), not the claimed MIME type, and returns the
 * canonical content type + extension so callers never store an
 * attacker-chosen content type again. Allowed: PNG, JPEG, WebP, GIF.
 */

export type ValidImageType = {
  contentType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  extension: "png" | "jpg" | "webp" | "gif";
};

function ascii(bytes: Buffer, start: number, length: number): string {
  return bytes.toString("ascii", start, start + length);
}

/** Sniffs the file's real format from its magic bytes. Null = not allowed. */
export function detectImageType(bytes: Buffer): ValidImageType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { contentType: "image/png", extension: "png" };
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (
    bytes.length >= 6 &&
    (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")
  ) {
    return { contentType: "image/gif", extension: "gif" };
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  ) {
    return { contentType: "image/webp", extension: "webp" };
  }
  return null;
}

export type ValidatedImage = ValidImageType & { bytes: Buffer };

/**
 * Validates an uploaded file end to end: present, within the size cap, and
 * a real PNG/JPEG/WebP/GIF by magic bytes. Throws a user-facing message
 * otherwise. Callers must use the returned bytes/contentType/extension.
 */
export async function validateImageFile(
  file: File,
  maxBytes: number,
): Promise<ValidatedImage> {
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("No image attached");
  }
  if (file.size > maxBytes) {
    throw new Error(`Image must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller`);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) {
    throw new Error("Only PNG, JPEG, WebP or GIF images are allowed");
  }
  return { ...type, bytes };
}
