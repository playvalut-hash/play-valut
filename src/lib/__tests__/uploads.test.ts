import { describe, expect, it } from "vitest";

import { detectImageType, validateImageFile } from "../uploads";

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF = Buffer.from("GIF89a" + "xxxxxx");
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x10, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP"),
]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

describe("detectImageType (magic bytes, not MIME)", () => {
  it("recognizes PNG, JPEG, GIF and WebP", () => {
    expect(detectImageType(PNG)).toEqual({ contentType: "image/png", extension: "png" });
    expect(detectImageType(JPEG)).toEqual({ contentType: "image/jpeg", extension: "jpg" });
    expect(detectImageType(GIF)).toEqual({ contentType: "image/gif", extension: "gif" });
    expect(detectImageType(WEBP)).toEqual({ contentType: "image/webp", extension: "webp" });
  });

  it("rejects SVG text, empty and truncated input", () => {
    expect(detectImageType(SVG)).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
});

describe("validateImageFile", () => {
  it("trusts bytes over the claimed MIME type", async () => {
    // PNG bytes wearing an SVG MIME label still validate as PNG.
    const file = new File([PNG], "evil.svg", { type: "image/svg+xml" });
    const out = await validateImageFile(file, 8 * 1024 * 1024);
    expect(out.contentType).toBe("image/png");
    expect(out.extension).toBe("png");
  });

  it("rejects SVG bytes even when labeled as PNG", async () => {
    const file = new File([SVG], "x.png", { type: "image/png" });
    await expect(validateImageFile(file, 8 * 1024 * 1024)).rejects.toThrow(
      "Only PNG, JPEG, WebP or GIF",
    );
  });

  it("rejects oversize and empty files", async () => {
    const big = new File([PNG], "big.png", { type: "image/png" });
    await expect(validateImageFile(big, 4)).rejects.toThrow("MB or smaller");
    const empty = new File([], "e.png", { type: "image/png" });
    await expect(validateImageFile(empty, 8 * 1024 * 1024)).rejects.toThrow(
      "No image attached",
    );
  });
});
