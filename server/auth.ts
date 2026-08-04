import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { User } from "@supabase/supabase-js";
import {
  createServerSupabaseClient,
  type MendServerSupabaseClient,
} from "./supabase.js";

export class AuthenticationError extends Error {
  readonly statusCode: 401 | 503;
  readonly code: "missing_bearer" | "invalid_bearer" | "auth_unavailable";

  constructor(
    code: "missing_bearer" | "invalid_bearer" | "auth_unavailable",
    message: string,
    statusCode: 401 | 503 = code === "auth_unavailable" ? 503 : 401,
  ) {
    super(message);
    this.name = "AuthenticationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface MendAuthContext {
  accessToken: string;
  user: User;
  client: MendServerSupabaseClient;
}

export interface AuthenticateBearerOptions {
  authorization?: string | null;
  clientFactory?: (accessToken: string) => MendServerSupabaseClient | null;
  verifyUser?: (
    client: MendServerSupabaseClient,
    accessToken: string,
  ) => Promise<User | null>;
}

/** Extracts exactly one non-empty bearer token from an Authorization header. */
export function parseBearerToken(authorization?: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer[\t ]+([^\t ]+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

/**
 * Authenticates one request with Supabase Auth. The token is verified by
 * getUser(jwt), never by decoding client-provided claims or workspace ids.
 */
export async function authenticateBearer(
  options: AuthenticateBearerOptions,
): Promise<MendAuthContext> {
  const accessToken = parseBearerToken(options.authorization);
  if (!accessToken) {
    throw new AuthenticationError(
      "missing_bearer",
      "Authorization bearer token is required.",
    );
  }

  const client = (options.clientFactory ?? createServerSupabaseClient)(
    accessToken,
  );
  if (!client) {
    throw new AuthenticationError(
      "auth_unavailable",
      "Supabase server authentication is not configured.",
    );
  }

  try {
    const user = options.verifyUser
      ? await options.verifyUser(client, accessToken)
      : (await client.auth.getUser(accessToken)).data.user;
    if (!user) throw new Error("user_not_found");
    return { accessToken, user, client };
  } catch {
    throw new AuthenticationError(
      "invalid_bearer",
      "Bearer token is invalid or expired.",
    );
  }
}

export async function authenticateRequest(
  request: Pick<Request, "headers">,
  options: Omit<AuthenticateBearerOptions, "authorization"> = {},
): Promise<MendAuthContext> {
  return authenticateBearer({
    ...options,
    authorization: request.headers.authorization,
  });
}

export interface AuthenticatedRequest extends Request {
  mendAuth?: MendAuthContext;
}

/** Express middleware for future protected routes; it is intentionally not mounted here. */
export function requireBearerAuth(
  options: Omit<AuthenticateBearerOptions, "authorization"> = {},
): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    void authenticateRequest(request, options)
      .then((context) => {
        (request as AuthenticatedRequest).mendAuth = context;
        next();
      })
      .catch((error: unknown) => {
        const authError =
          error instanceof AuthenticationError
            ? error
            : new AuthenticationError(
                "invalid_bearer",
                "Bearer token is invalid or expired.",
              );
        response
          .status(authError.statusCode)
          .json({ error: authError.code, message: authError.message });
      });
  };
}

export function requireRequestAuth(
  request: Pick<Request, "headers"> & { mendAuth?: MendAuthContext },
): MendAuthContext {
  if (!request.mendAuth) {
    throw new AuthenticationError(
      "missing_bearer",
      "Request authentication has not been established.",
    );
  }
  return request.mendAuth;
}
