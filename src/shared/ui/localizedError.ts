export function localizedError(reason: unknown, message: string): string {
  if (reason instanceof Error) console.error("Mend operation failed", reason);
  return message;
}
