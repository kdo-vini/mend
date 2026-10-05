export function parseFinanceAmount(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(normalized))
    throw new Error("invalid_amount");
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents <= 0 || cents > 100_000_000_000) throw new Error("invalid_amount");
  return cents;
}
