import { createHash } from "node:crypto";
import { lstat, readFile, realpath, readdir } from "node:fs/promises";
import path from "node:path";

export interface ExtractedKnowledgeDocument {
  relativePath: string;
  title: string;
  body: string;
  contentHash: string;
  bytes: number;
}

export interface RepositoryExtractionResult {
  documents: ExtractedKnowledgeDocument[];
  filesScanned: number;
  filesSkipped: number;
  totalBytes: number;
}

export interface RepositoryExtractionOptions {
  includePatterns?: readonly string[];
  excludePatterns?: readonly string[];
  maxFileBytes?: number;
  maxTotalBytes?: number;
  maxFiles?: number;
}

export const DEFAULT_KNOWLEDGE_INCLUDE_PATTERNS = [
  "README.md",
  "docs/**/*.md",
  "docs/**/*.mdx",
  "openapi*.json",
  "src/**/*.ts",
  "src/**/*.tsx",
  "src/**/*.js",
  "src/**/*.jsx",
  "src/**/*.json",
  "server/**/*.ts",
  "supabase/migrations/**/*.sql",
] as const;

export const DEFAULT_KNOWLEDGE_EXCLUDE_PATTERNS = [
  "**/.env*",
  "**/.git/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.next/**",
  "**/*.pem",
  "**/*.key",
  "**/*.p12",
  "**/*.sqlite",
  "**/*.db",
  "**/secrets/**",
  "**/fixtures/customer*/**",
  "**/exports/**",
] as const;

const allowedExtensions = new Set([
  ".md",
  ".mdx",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".sql",
]);

function globRegex(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, "/");
  let output = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === "*" && next === "*") {
      if (normalized[index + 2] === "/") {
        output += "(?:.*/)?";
        index += 2;
      } else {
        output += ".*";
        index += 1;
      }
    } else if (char === "*") output += "[^/]*";
    else if (char === "?") output += "[^/]";
    else output += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`${output}$`, "i");
}

function matchesAny(
  relativePath: string,
  patterns: readonly string[],
): boolean {
  return patterns.some((pattern) => globRegex(pattern).test(relativePath));
}

function sensitiveContent(value: string): boolean {
  const sample = value.slice(0, 50_000);
  return (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(sample) ||
    /(?:^|\n)\s*(?:API_KEY|SECRET|PASSWORD|TOKEN|AUTHORIZATION)\s*=\s*\S+/i.test(
      sample,
    )
  );
}

const titleFromPath = (relativePath: string, body: string) => {
  const heading = /^#{1,3}\s+(.+)$/m.exec(body)?.[1]?.trim();
  return (
    heading || path.basename(relativePath, path.extname(relativePath))
  ).slice(0, 240);
};

/** Reads bounded text from an exact checkout without executing repository code. */
export async function extractRepositoryKnowledge(
  repositoryRoot: string,
  options: RepositoryExtractionOptions = {},
): Promise<RepositoryExtractionResult> {
  const root = await realpath(repositoryRoot);
  const includes =
    options.includePatterns ?? DEFAULT_KNOWLEDGE_INCLUDE_PATTERNS;
  const excludes =
    options.excludePatterns ?? DEFAULT_KNOWLEDGE_EXCLUDE_PATTERNS;
  const maxFileBytes = Math.min(
    Math.max(options.maxFileBytes ?? 512_000, 1),
    2_000_000,
  );
  const maxTotalBytes = Math.min(
    Math.max(options.maxTotalBytes ?? 20_000_000, 1),
    100_000_000,
  );
  const maxFiles = Math.min(Math.max(options.maxFiles ?? 2_000, 1), 10_000);
  const documents: ExtractedKnowledgeDocument[] = [];
  let filesScanned = 0;
  let filesSkipped = 0;
  let totalBytes = 0;

  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (filesScanned >= maxFiles || totalBytes >= maxTotalBytes) return;
      const absolute = path.join(directory, entry.name);
      const relativePath = path.relative(root, absolute).replace(/\\/g, "/");
      if (
        !relativePath ||
        relativePath.startsWith("../") ||
        path.isAbsolute(relativePath)
      ) {
        filesSkipped += 1;
        continue;
      }
      if (matchesAny(relativePath, excludes)) {
        filesSkipped += 1;
        continue;
      }
      if (entry.isDirectory()) {
        await visit(absolute);
        continue;
      }
      filesScanned += 1;
      if (
        !entry.isFile() ||
        !allowedExtensions.has(path.extname(entry.name).toLowerCase()) ||
        !matchesAny(relativePath, includes)
      ) {
        filesSkipped += 1;
        continue;
      }
      const info = await lstat(absolute);
      if (
        info.isSymbolicLink() ||
        info.size < 1 ||
        info.size > maxFileBytes ||
        totalBytes + info.size > maxTotalBytes
      ) {
        filesSkipped += 1;
        continue;
      }
      const resolved = await realpath(absolute);
      const inside = path.relative(root, resolved);
      if (inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) {
        filesSkipped += 1;
        continue;
      }
      const buffer = await readFile(resolved);
      if (buffer.includes(0)) {
        filesSkipped += 1;
        continue;
      }
      const body = buffer.toString("utf8").trim();
      if (!body || sensitiveContent(body)) {
        filesSkipped += 1;
        continue;
      }
      totalBytes += buffer.byteLength;
      documents.push({
        relativePath,
        title: titleFromPath(relativePath, body),
        body,
        bytes: buffer.byteLength,
        contentHash: createHash("sha256").update(body).digest("hex"),
      });
    }
  };

  await visit(root);
  documents.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
  return { documents, filesScanned, filesSkipped, totalBytes };
}
