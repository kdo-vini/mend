import { LiveActionError } from "../../api/transport";

/** Picks a translated message for a failed client request. */
export function clientErrorKey(
  error: unknown,
): "forbidden" | "notFound" | "generic" {
  if (error instanceof LiveActionError) {
    if (error.status === 403) return "forbidden";
    if (error.status === 404) return "notFound";
  }
  return "generic";
}
