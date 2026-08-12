import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  AgentConnection,
  CatalogModel,
  CatalogSnapshot,
  CodingProvider,
} from "./coding-control-plane.js";
import {
  resolveCodingAgentExecutable,
  materializeCodingAuthBundle,
  type CodingAgentExecutable,
} from "./coding-agent-cli.js";

export interface CatalogSecret {
  apiKey?: string;
  bundle?: Record<string, unknown>;
}

export interface CodingCatalogProvider {
  list(
    connection: AgentConnection,
    secret: CatalogSecret | undefined,
  ): Promise<CatalogSnapshot>;
}

function responseModels(value: unknown): CatalogModel[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const values = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : [];
  return values
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object",
    )
    .map((item) => {
      const id = String(item.id ?? item.name ?? "").replace(/^models\//, "");
      const label =
        typeof item.displayName === "string" ? item.displayName : undefined;
      return {
        id,
        ...(label ? { label } : {}),
      } satisfies CatalogModel;
    })
    .filter((item) => item.id.length > 0 && item.id.length <= 160);
}

function openAiCodingModels(value: unknown): CatalogModel[] {
  return responseModels(value).filter(({ id }) =>
    /(?:^|[-_.])codex(?:$|[-_.])|^gpt-5(?:$|[-_.])|^gpt-4\.1(?:$|[-_.])|^o[134](?:$|[-_.])/i.test(
      id,
    ),
  );
}

function codexModels(value: unknown): CatalogModel[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const values = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : [];
  return values
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object",
    )
    .map((item) => {
      const id = String(item.id ?? item.model ?? "");
      const efforts = Array.isArray(item.supportedReasoningEfforts)
        ? item.supportedReasoningEfforts.filter(
            (effort): effort is string => typeof effort === "string",
          )
        : undefined;
      return {
        id,
        ...(typeof item.displayName === "string"
          ? { label: item.displayName }
          : {}),
        ...(efforts?.length ? { efforts } : {}),
      } satisfies CatalogModel;
    })
    .filter((item) => item.id.length > 0 && item.id.length <= 160);
}

async function jsonRequest(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) throw new Error(`catalog_http_${response.status}`);
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function apiCatalog(
  connection: AgentConnection,
  models: CatalogModel[],
  source: CatalogSnapshot["source"],
): CatalogSnapshot {
  if (!models.length) throw new Error("agent_catalog_empty");
  const now = new Date();
  return {
    connectionId: connection.id,
    provider: connection.provider,
    cliVersion: connection.cliVersion ?? "unknown",
    models,
    source,
    lastVerifiedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
  };
}

async function runCodexModelList(
  executable: CodingAgentExecutable,
  env: NodeJS.ProcessEnv,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      executable.command,
      [...executable.argsPrefix, "app-server"],
      {
        cwd: process.cwd(),
        env,
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    let settled = false;
    let modelListRequested = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      callback();
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error("codex_catalog_timeout"))),
      20_000,
    );
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      for (const line of stdout.split(/\r?\n/)) {
        try {
          const value = JSON.parse(line) as Record<string, unknown>;
          if (value.id === 1 && value.error) {
            finish(() => reject(new Error("codex_catalog_initialize_error")));
            continue;
          }
          if (value.id === 1 && value.result !== undefined) {
            if (!modelListRequested) {
              modelListRequested = true;
              child.stdin.write('{"method":"initialized","params":{}}\n');
              child.stdin.write(
                `${JSON.stringify({ id: 2, method: "model/list", params: { includeHidden: false } })}\n`,
              );
            }
            continue;
          }
          if (value.id === 2 && value.result !== undefined)
            finish(() => resolve(value.result));
          if (value.id === 2 && value.error)
            finish(() => reject(new Error("codex_catalog_error")));
        } catch {
          // JSONL may contain a partial line or a human-readable warning.
        }
      }
      stdout = stdout.slice(-200_000);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8").slice(-10_000);
    });
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code) => {
      if (!settled)
        finish(() =>
          reject(
            new Error(
              code
                ? `codex_catalog_exit_${code}`
                : stderr || "codex_catalog_closed",
            ),
          ),
        );
    });
    const clientInfo = { name: "mend", title: "Mend", version: "2.0.0" };
    child.stdin.write(
      `${JSON.stringify({ id: 1, method: "initialize", params: { clientInfo, capabilities: {} } })}\n`,
    );
  });
}

export async function prepareCodingCatalogHome(): Promise<string> {
  const homeDirectory = await mkdtemp(
    path.join(os.homedir(), ".mend-coding-catalog-"),
  );
  await mkdir(path.join(homeDirectory, ".codex"), { recursive: true });
  return homeDirectory;
}

export class DefaultCodingCatalogProvider implements CodingCatalogProvider {
  async list(
    connection: AgentConnection,
    secret: CatalogSecret | undefined,
  ): Promise<CatalogSnapshot> {
    if (connection.provider === "anthropic") {
      if (!secret?.apiKey) throw new Error("agent_api_key_missing");
      const value = await jsonRequest("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": secret.apiKey,
          "anthropic-version": "2023-06-01",
        },
      });
      return apiCatalog(connection, responseModels(value), "api");
    }
    if (connection.provider === "google") {
      if (!secret?.apiKey) throw new Error("agent_api_key_missing");
      const value = await jsonRequest(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(secret.apiKey)}`,
        {},
      );
      return apiCatalog(connection, responseModels(value), "api");
    }
    if (connection.provider !== "openai")
      throw new Error("agent_catalog_provider_not_supported");
    if (secret?.apiKey) {
      const value = await jsonRequest("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${secret.apiKey}` },
      });
      return apiCatalog(connection, openAiCodingModels(value), "api");
    }
    const executable = await resolveCodingAgentExecutable("openai");
    const homeDirectory = await prepareCodingCatalogHome();
    try {
      const bundle = secret?.bundle
        ? Object.fromEntries(
            Object.entries(secret.bundle).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === "string",
            ),
          )
        : undefined;
      await materializeCodingAuthBundle(homeDirectory, bundle);
      const env: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        HOME: homeDirectory,
        USERPROFILE: homeDirectory,
        CODEX_HOME: path.join(homeDirectory, ".codex"),
        ...(secret?.apiKey ? { CODEX_API_KEY: secret.apiKey } : {}),
        CI: "1",
        NO_COLOR: "1",
      };
      return apiCatalog(
        connection,
        codexModels(await runCodexModelList(executable, env)),
        "cli",
      );
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  }
}

export function createCatalogRequestId(): string {
  return randomUUID();
}

export function catalogProviderFor(
  provider: CodingProvider,
): CodingCatalogProvider {
  void provider;
  return new DefaultCodingCatalogProvider();
}
