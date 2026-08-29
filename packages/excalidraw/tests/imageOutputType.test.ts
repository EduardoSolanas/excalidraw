import { imageOutputTypeFor } from "../data/blob";
import { MIME_TYPES } from "../constants";

describe("imageOutputTypeFor", () => {
  describe("returns WebP for raster image formats", () => {
    it("returns webp for png", () => {
      expect(imageOutputTypeFor(MIME_TYPES.png)).toBe(MIME_TYPES.webp);
    });

    it("returns webp for jpg", () => {
      expect(imageOutputTypeFor(MIME_TYPES.jpg)).toBe(MIME_TYPES.webp);
    });

    it("returns webp for webp", () => {
      expect(imageOutputTypeFor(MIME_TYPES.webp)).toBe(MIME_TYPES.webp);
    });

    it("returns webp for bmp", () => {
      expect(imageOutputTypeFor(MIME_TYPES.bmp)).toBe(MIME_TYPES.webp);
    });

    it("returns webp for ico", () => {
      expect(imageOutputTypeFor(MIME_TYPES.ico)).toBe(MIME_TYPES.webp);
    });

    it("returns webp for avif", () => {
      expect(imageOutputTypeFor(MIME_TYPES.avif)).toBe(MIME_TYPES.webp);
    });

    it("returns webp for jfif", () => {
      expect(imageOutputTypeFor(MIME_TYPES.jfif)).toBe(MIME_TYPES.webp);
    });
  });

  describe("returns undefined for formats that must preserve encoding", () => {
    it("returns undefined for svg", () => {
      expect(imageOutputTypeFor(MIME_TYPES.svg)).toBeUndefined();
    });

    it("returns undefined for gif", () => {
      expect(imageOutputTypeFor(MIME_TYPES.gif)).toBeUndefined();
    });
  });

  describe("returns undefined for unknown or unsupported mime types", () => {
    it("returns undefined for unknown mime type", () => {
      expect(imageOutputTypeFor("image/unknown")).toBeUndefined();
    });

    it("returns undefined for non-image mime type", () => {
      expect(imageOutputTypeFor("text/plain")).toBeUndefined();
    });

    it("returns undefined for empty string", () => {
      expect(imageOutputTypeFor("")).toBeUndefined();
    });

    it("returns undefined for arbitrary string", () => {
      expect(imageOutputTypeFor("random-mime-type")).toBeUndefined();
    });
  });
});
