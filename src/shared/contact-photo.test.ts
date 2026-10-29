import { describe, expect, it } from "vitest";
import { contactPhotoUrl } from "./contact-photo";

describe("contactPhotoUrl", () => {
  it("keeps photos from the Whatsmiau bucket", () => {
    const url =
      "https://storage.googleapis.com/whatsmiau/profile/5511999999999.jpeg";
    expect(contactPhotoUrl(url)).toBe(url);
  });

  it("drops hidden photos, other hosts and junk", () => {
    expect(
      contactPhotoUrl("https://storage.googleapis.com/whatsmiau/p/1.asc"),
    ).toBeUndefined();
    expect(
      contactPhotoUrl("https://pps.whatsapp.net/v/t61/photo.jpg"),
    ).toBeUndefined();
    expect(
      contactPhotoUrl("https://storage.googleapis.com/other/photo.jpg"),
    ).toBeUndefined();
    expect(contactPhotoUrl(null)).toBeUndefined();
  });
});
