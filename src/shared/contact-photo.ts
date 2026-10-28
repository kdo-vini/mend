const WHATSMIAU_PHOTO_PREFIX = "https://storage.googleapis.com/whatsmiau/";

/**
 * A contact photo the inbox may show. Only Whatsmiau's bucket is allowed (the
 * page's image policy names it), and a hidden photo is stored there as an
 * empty `.asc` file, which reads as "no photo".
 */
export function contactPhotoUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith(WHATSMIAU_PHOTO_PREFIX))
    return undefined;
  try {
    const url = new URL(value);
    return /\.asc$/i.test(url.pathname) ? undefined : url.href;
  } catch {
    return undefined;
  }
}
