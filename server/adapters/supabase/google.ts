import {
  createGoogleOAuthState,
  decryptGoogleToken,
  encryptGoogleToken,
  googleAuthorizationUrl,
  googleCalendarScopes,
  GoogleConnectionError,
  hashGoogleOAuthState,
  requireGoogleOAuthConfig,
  verifyGoogleOAuthState,
  type GoogleCalendarSummary,
  type GoogleConnectionPort,
  type GoogleConnectionRecord,
} from "../../google-calendar.js";
import type { AnySupabaseClient } from "./types.js";
import { checked, row, rows, str, type Row } from "../supabase-mappers.js";
function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function googleCalendars(value: unknown): GoogleCalendarSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.summary !== "string")
      return [];
    return [
      {
        id: record.id,
        summary: record.summary,
        ...(typeof record.description === "string"
          ? { description: record.description.slice(0, 2_000) }
          : {}),
        primary: record.primary === true,
        accessRole:
          typeof record.accessRole === "string" ? record.accessRole : "reader",
        ...(typeof record.timeZone === "string"
          ? { timeZone: record.timeZone }
          : {}),
      },
    ];
  });
}

function googleConnection(rowValue: Row): GoogleConnectionRecord {
  const calendars = googleCalendars(rowValue.calendars_json);
  return {
    id: str(rowValue.id),
    workspaceId: str(rowValue.workspace_id),
    googleAccountId: str(rowValue.google_account_id),
    accountEmail: str(rowValue.account_email) || null,
    accountName: str(rowValue.account_name) || null,
    status: (str(rowValue.status) ||
      "error") as GoogleConnectionRecord["status"],
    scopes: stringArray(rowValue.scopes_json),
    calendars,
    selectedCalendarIds: stringArray(rowValue.selected_calendar_ids_json),
    lastError: str(rowValue.last_error) || null,
    lastSyncedAt: str(rowValue.last_synced_at) || null,
    createdAt: str(rowValue.created_at),
    updatedAt: str(rowValue.updated_at),
  };
}

async function googleJson(
  url: string,
  init: RequestInit,
  label: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok || !body || typeof body !== "object")
    throw new GoogleConnectionError(
      502,
      "google_provider_unavailable",
      `Google ${label} request failed.`,
    );
  return body as Record<string, unknown>;
}

export class SupabaseGoogleConnectionAdapter implements GoogleConnectionPort {
  constructor(
    private readonly client: AnySupabaseClient,
    private readonly privilegedClient: AnySupabaseClient = client,
  ) {}

  async list(context: { workspaceId: string }) {
    const result = await this.client
      .from("google_connections")
      .select(
        "id, workspace_id, google_account_id, account_email, account_name, status, scopes_json, calendars_json, selected_calendar_ids_json, last_error, last_synced_at, created_at, updated_at",
      )
      .eq("workspace_id", context.workspaceId)
      .order("updated_at", { ascending: false });
    return rows(checked("google_connections.list", result)).map(
      googleConnection,
    );
  }

  async startOAuth(context: { workspaceId: string; userId: string }) {
    const config = requireGoogleOAuthConfig();
    const { state, expiresAt } = createGoogleOAuthState(
      context.workspaceId,
      context.userId,
      config.tokenEncryptionKey,
    );
    const result = await this.privilegedClient
      .from("google_oauth_states")
      .insert({
        state_hash: hashGoogleOAuthState(state),
        workspace_id: context.workspaceId,
        user_id: context.userId,
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    checked("google_oauth_states.create", result);
    return { oauthUrl: googleAuthorizationUrl(config, state) };
  }

  async completeOAuth(code: string, state: string) {
    const config = requireGoogleOAuthConfig();
    const signed = verifyGoogleOAuthState(state, config.tokenEncryptionKey);
    const stateResult = await this.privilegedClient
      .from("google_oauth_states")
      .update({ consumed_at: new Date().toISOString() })
      .eq("state_hash", hashGoogleOAuthState(state))
      .eq("workspace_id", signed.workspaceId)
      .eq("user_id", signed.userId)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("id")
      .maybeSingle();
    if (!checked("google_oauth_states.consume", stateResult))
      throw new GoogleConnectionError(
        400,
        "google_oauth_state_used",
        "Google OAuth state is invalid, expired or already used.",
      );

    const tokenBody = await googleJson(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          grant_type: "authorization_code",
        }),
      },
      "token exchange",
    );
    const accessToken =
      typeof tokenBody.access_token === "string" ? tokenBody.access_token : "";
    if (!accessToken)
      throw new GoogleConnectionError(
        502,
        "google_token_missing",
        "Google did not return an access token.",
      );
    const userInfo = await googleJson(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: { authorization: `Bearer ${accessToken}` } },
      "account lookup",
    );
    const calendarBody = await googleJson(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader",
      { headers: { authorization: `Bearer ${accessToken}` } },
      "calendar lookup",
    );
    const googleAccountId =
      typeof userInfo.sub === "string"
        ? userInfo.sub
        : typeof userInfo.email === "string"
          ? userInfo.email
          : "";
    if (!googleAccountId)
      throw new GoogleConnectionError(
        502,
        "google_account_missing",
        "Google did not return an account identifier.",
      );
    const calendars = googleCalendars(calendarBody.items);
    const existingResult = await this.privilegedClient
      .from("google_connections")
      .select("id, selected_calendar_ids_json")
      .eq("workspace_id", signed.workspaceId)
      .eq("google_account_id", googleAccountId)
      .maybeSingle();
    const existing = checked("google_connections.existing", existingResult);
    const selected = stringArray(
      existing && typeof existing === "object"
        ? (existing as Row).selected_calendar_ids_json
        : undefined,
    ).filter((id) => calendars.some((calendar) => calendar.id === id));
    const selectedCalendarIds = selected.length
      ? selected
      : calendars
          .filter((calendar) => calendar.primary)
          .map((calendar) => calendar.id);
    const scopes =
      typeof tokenBody.scope === "string"
        ? tokenBody.scope.split(" ").filter(Boolean)
        : [...googleCalendarScopes];
    const connectionResult = await this.privilegedClient
      .from("google_connections")
      .upsert(
        {
          workspace_id: signed.workspaceId,
          google_account_id: googleAccountId,
          account_email:
            typeof userInfo.email === "string" ? userInfo.email : null,
          account_name:
            typeof userInfo.name === "string"
              ? userInfo.name
              : typeof userInfo.email === "string"
                ? userInfo.email
                : null,
          status: "connected",
          scopes_json: scopes,
          calendars_json: calendars,
          selected_calendar_ids_json: selectedCalendarIds,
          last_error: null,
          last_synced_at: new Date().toISOString(),
          created_by_user_id: signed.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,google_account_id" },
      )
      .select(
        "id, workspace_id, google_account_id, account_email, account_name, status, scopes_json, calendars_json, selected_calendar_ids_json, last_error, last_synced_at, created_at, updated_at",
      )
      .single();
    const connection = googleConnection(
      row(checked("google_connections.upsert", connectionResult)),
    );
    const expiresIn = Number(tokenBody.expires_in);
    const secretResult = await this.privilegedClient
      .from("google_connection_secrets")
      .upsert(
        {
          connection_id: connection.id,
          access_token_encrypted: encryptGoogleToken(
            accessToken,
            config.tokenEncryptionKey,
          ),
          refresh_token_encrypted:
            typeof tokenBody.refresh_token === "string"
              ? encryptGoogleToken(
                  tokenBody.refresh_token,
                  config.tokenEncryptionKey,
                )
              : null,
          token_expires_at: Number.isFinite(expiresIn)
            ? new Date(Date.now() + expiresIn * 1_000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "connection_id" },
      );
    checked("google_connection_secrets.upsert", secretResult);
    const auditResult = await this.privilegedClient.from("audit_log").insert({
      workspace_id: signed.workspaceId,
      actor_user_id: signed.userId,
      action: "google.connection_connected",
      entity_type: "google_connection",
      entity_id: connection.id,
      metadata_json: { provider: "google", calendarCount: calendars.length },
    });
    checked("audit_log.google_connection_connected", auditResult);
    return connection;
  }

  async updateCalendars(
    context: { workspaceId: string; userId: string },
    connectionId: string,
    selectedCalendarIds: string[],
  ) {
    const currentResult = await this.client
      .from("google_connections")
      .select(
        "id, workspace_id, google_account_id, account_email, account_name, status, scopes_json, calendars_json, selected_calendar_ids_json, last_error, last_synced_at, created_at, updated_at",
      )
      .eq("id", connectionId)
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    const current = checked("google_connections.get", currentResult);
    if (!current) return null;
    const calendars = googleCalendars(row(current).calendars_json);
    const allowed = new Set(calendars.map((calendar) => calendar.id));
    if (selectedCalendarIds.some((id) => !allowed.has(id)))
      throw new GoogleConnectionError(
        400,
        "invalid_calendar_selection",
        "One or more selected calendars do not belong to this Google connection.",
      );
    const result = await this.client
      .from("google_connections")
      .update({
        selected_calendar_ids_json: [...new Set(selectedCalendarIds)],
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
      .eq("workspace_id", context.workspaceId)
      .select(
        "id, workspace_id, google_account_id, account_email, account_name, status, scopes_json, calendars_json, selected_calendar_ids_json, last_error, last_synced_at, created_at, updated_at",
      )
      .maybeSingle();
    const updated = checked("google_connections.update_calendars", result);
    if (!updated) return null;
    const auditResult = await this.client.from("audit_log").insert({
      workspace_id: context.workspaceId,
      actor_user_id: context.userId,
      action: "google.connection_calendars_updated",
      entity_type: "google_connection",
      entity_id: connectionId,
      metadata_json: { selectedCalendarCount: selectedCalendarIds.length },
    });
    checked("audit_log.google_connection_calendars_updated", auditResult);
    return googleConnection(row(updated));
  }

  async disconnect(
    context: { workspaceId: string; userId: string },
    connectionId: string,
  ) {
    const result = await this.client
      .from("google_connections")
      .update({
        status: "disconnected",
        selected_calendar_ids_json: [],
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
      .eq("workspace_id", context.workspaceId)
      .select(
        "id, workspace_id, google_account_id, account_email, account_name, status, scopes_json, calendars_json, selected_calendar_ids_json, last_error, last_synced_at, created_at, updated_at",
      )
      .maybeSingle();
    const updated = checked("google_connections.disconnect", result);
    if (!updated) return null;
    const config = (() => {
      try {
        return requireGoogleOAuthConfig();
      } catch {
        return null;
      }
    })();
    const secretResult = await this.privilegedClient
      .from("google_connection_secrets")
      .select("access_token_encrypted, refresh_token_encrypted")
      .eq("connection_id", connectionId)
      .maybeSingle();
    const secret = checked("google_connection_secrets.get", secretResult);
    const encryptedToken =
      secret && typeof secret === "object"
        ? ((secret as Row).refresh_token_encrypted ??
          (secret as Row).access_token_encrypted)
        : null;
    if (config && typeof encryptedToken === "string") {
      try {
        const token = decryptGoogleToken(
          encryptedToken,
          config.tokenEncryptionKey,
        );
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }),
        });
      } catch {
        // Local credentials are still deleted below; a later reconnect can re-authorize.
      }
    }
    await this.privilegedClient
      .from("google_connection_secrets")
      .delete()
      .eq("connection_id", connectionId);
    const auditResult = await this.client.from("audit_log").insert({
      workspace_id: context.workspaceId,
      actor_user_id: context.userId,
      action: "google.connection_disconnected",
      entity_type: "google_connection",
      entity_id: connectionId,
      metadata_json: { provider: "google" },
    });
    checked("audit_log.google_connection_disconnected", auditResult);
    return googleConnection(row(updated));
  }
}
