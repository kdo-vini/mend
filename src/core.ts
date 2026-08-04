export const allowedCommands = {
  install: ["npm", "install"],
  lint: ["npm", "run", "lint"],
  test: ["npm", "run", "test"],
  build: ["npm", "run", "build"],
} as const;

export type AllowedCommand = keyof typeof allowedCommands;

export function createIssueIdentifier(
  prefix: string,
  nextNumber: number,
): string {
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(prefix))
    throw new Error("Invalid issue prefix");
  if (!Number.isSafeInteger(nextNumber) || nextNumber < 1)
    throw new Error("Invalid issue number");
  return `${prefix}-${nextNumber}`;
}

export function isDuplicateIssue(
  title: string,
  candidateTitles: string[],
): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((word) => word.length > 3);
  const input = new Set(normalize(title));
  return candidateTitles.some((candidate) => {
    const words = normalize(candidate);
    const overlap = words.filter((word) => input.has(word)).length;
    return overlap >= 2 && overlap / Math.max(words.length, input.size) >= 0.4;
  });
}

export function safeRelativePath(root: string, candidate: string): string {
  const normalizedRoot = root.replace(/[\\/]$/, "");
  const normalizedCandidate = candidate.replace(/^[\\/]+/, "");
  const full = `${normalizedRoot}/${normalizedCandidate}`.replace(/\\/g, "/");
  const rootPrefix = `${normalizedRoot.replace(/\\/g, "/")}/`;
  if (
    !full.startsWith(rootPrefix) ||
    normalizedCandidate.split("/").includes("..")
  )
    throw new Error("Path is outside the workspace");
  return full;
}
