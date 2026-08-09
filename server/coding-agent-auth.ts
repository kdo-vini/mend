import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveCodingAgentExecutable } from "./coding-agent-cli.js";

export interface SubscriptionLoginChallenge {
  url?: string;
  code?: string;
  expiresAt: string;
}

export interface SubscriptionLoginResult {
  status: "awaiting_user" | "completed" | "failed" | "canceled" | "expired";
  challenge: SubscriptionLoginChallenge;
  bundle?: Record<string, string>;
  errorCode?: string;
}

interface ActiveLogin {
  provider: "openai" | "google";
  homeDirectory: string;
  child: ChildProcess;
  state: SubscriptionLoginResult;
  canceled: boolean;
  expired: boolean;
  completion: Promise<void>;
}

const activeLogins = new Map<string, ActiveLogin>();

function loginEnvironment(homeDirectory: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    PATHEXT: process.env.PATHEXT,
    SYSTEMROOT: process.env.SYSTEMROOT,
    WINDIR: process.env.WINDIR,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    CI: "1",
    NO_COLOR: "1",
    HOME: homeDirectory,
    USERPROFILE: homeDirectory,
    APPDATA: path.join(homeDirectory, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(homeDirectory, "AppData", "Local"),
    CODEX_HOME: path.join(homeDirectory, ".codex"),
    GEMINI_CLI_HOME: path.join(homeDirectory, ".gemini"),
  };
  return env;
}

function challengeFromOutput(
  output: string,
  expiresAt: string,
): SubscriptionLoginChallenge {
  const url = output.match(/https?:\/\/[^\s)]+/i)?.[0];
  const code = output.match(/\b[A-Z0-9]{4}(?:-[A-Z0-9]{4}){1,3}\b/)?.[0];
  return { expiresAt, ...(url ? { url } : {}), ...(code ? { code } : {}) };
}

async function authBundle(
  homeDirectory: string,
): Promise<Record<string, string>> {
  const candidates = [
    path.join(homeDirectory, ".codex", "auth.json"),
    path.join(homeDirectory, ".codex", "auth.json.enc"),
  ];
  const bundle: Record<string, string> = {};
  for (const candidate of candidates) {
    const relative = path
      .relative(homeDirectory, candidate)
      .replaceAll("\\", "/");
    try {
      bundle[relative] = (await readFile(candidate)).toString("base64");
    } catch {
      // The CLI may use a different allowlisted credential file in a future version.
    }
  }
  return bundle;
}

async function validateCodexLogin(
  homeDirectory: string,
  executable: { command: string; argsPrefix: readonly string[] },
): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(
      executable.command,
      [...executable.argsPrefix, "login", "status"],
      {
        cwd: homeDirectory,
        env: loginEnvironment(homeDirectory),
        shell: false,
        windowsHide: true,
        stdio: "ignore",
      },
    );
    const timer = setTimeout(() => {
      child.kill();
      resolve(false);
    }, 10_000);
    child.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

export async function startSubscriptionLogin(
  jobId: string,
  provider: "openai" | "google",
  onComplete: (result: SubscriptionLoginResult) => Promise<void>,
): Promise<SubscriptionLoginChallenge> {
  if (provider !== "openai")
    throw new Error("google_subscription_login_requires_interactive_runner");
  const executable = await resolveCodingAgentExecutable("openai");
  const homeDirectory = await mkdtemp(
    path.join(os.tmpdir(), "mend-coding-login-"),
  );
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const child = spawn(
    executable.command,
    [...executable.argsPrefix, "login", "--device-auth"],
    {
      cwd: homeDirectory,
      env: loginEnvironment(homeDirectory),
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const state: SubscriptionLoginResult = {
    status: "awaiting_user",
    challenge: { expiresAt },
  };
  const active: ActiveLogin = {
    provider,
    homeDirectory,
    child,
    state,
    canceled: false,
    expired: false,
    completion: Promise.resolve(),
  };
  active.completion = new Promise((resolve) => {
    let output = "";
    let settled = false;
    const updateChallenge = () => {
      state.challenge = challengeFromOutput(output, expiresAt);
    };
    const finish = async () => {
      if (settled) return;
      settled = true;
      try {
        await onComplete({ ...state });
      } catch (error) {
        console.error(
          "[mend-coding-login] completion persistence failed",
          error,
        );
      } finally {
        activeLogins.delete(jobId);
        try {
          await rm(homeDirectory, { recursive: true, force: true });
        } catch (error) {
          console.error(
            "[mend-coding-login] temporary home cleanup failed",
            error,
          );
        }
        resolve();
      }
    };
    const finishFromClose = async (code: number | null) => {
      if (settled) return;
      updateChallenge();
      try {
        if (active.canceled) {
          state.status = "canceled";
        } else if (active.expired) {
          state.status = "expired";
          state.errorCode = "login_expired";
        } else if (
          code === 0 &&
          (await validateCodexLogin(homeDirectory, executable))
        ) {
          const bundle = await authBundle(homeDirectory);
          if (Object.keys(bundle).length) {
            state.status = "completed";
            state.bundle = bundle;
          } else {
            state.status = "failed";
            state.errorCode = "codex_auth_bundle_missing";
          }
        } else {
          state.status = "failed";
          state.errorCode = `codex_login_exit_${code ?? 1}`;
        }
      } catch {
        state.status = "failed";
        state.errorCode = "login_validation_failed";
      }
      await finish();
    };
    const onData = (chunk: Buffer) => {
      output = `${output}${chunk.toString("utf8")}`.slice(-20_000);
      updateChallenge();
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("error", () => {
      if (!active.canceled) {
        state.status = "failed";
        state.errorCode = "login_runner_process_error";
      }
      void finish();
    });
    child.once("close", (code) => void finishFromClose(code));
  });
  activeLogins.set(jobId, active);
  await new Promise((resolve) => setTimeout(resolve, 250));
  return { ...state.challenge };
}

export function pollSubscriptionLogin(
  jobId: string,
): SubscriptionLoginResult | null {
  const active = activeLogins.get(jobId);
  if (!active) return null;
  if (
    !active.canceled &&
    !active.expired &&
    Date.parse(active.state.challenge.expiresAt) <= Date.now()
  ) {
    active.expired = true;
    active.state.status = "expired";
    active.state.errorCode = "login_expired";
    active.child.kill();
  }
  return active.state;
}

export async function cancelSubscriptionLogin(jobId: string): Promise<boolean> {
  const active = activeLogins.get(jobId);
  if (!active) return false;
  active.canceled = true;
  active.state.status = "canceled";
  active.child.kill();
  await active.completion;
  return true;
}
