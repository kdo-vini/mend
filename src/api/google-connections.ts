import { apiRequest } from "./transport";

export interface GoogleCalendar {
  id: string;
  summary: string;
  description?: string;
  primary: boolean;
  accessRole: string;
  timeZone?: string;
}

export interface GoogleConnection {
  id: string;
  workspaceId: string;
  googleAccountId: string;
  accountEmail: string | null;
  accountName: string | null;
  status: "connected" | "error" | "disconnected";
  scopes: string[];
  calendars: GoogleCalendar[];
  selectedCalendarIds: string[];
  lastError: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listLiveGoogleConnections(
  workspaceId: string,
): Promise<GoogleConnection[]> {
  const response = await apiRequest<{ data: GoogleConnection[] }>(
    "/api/google/connections",
    {},
    workspaceId,
  );
  return response.data;
}

export async function startLiveGoogleOAuth(
  workspaceId: string,
): Promise<{ oauthUrl: string }> {
  return apiRequest(
    "/api/google/connections/oauth/start",
    { method: "POST", body: "{}" },
    workspaceId,
  );
}

export async function saveLiveGoogleCalendarSelection(
  workspaceId: string,
  connectionId: string,
  selectedCalendarIds: string[],
): Promise<GoogleConnection> {
  return apiRequest(
    `/api/google/connections/${connectionId}/calendars`,
    {
      method: "PATCH",
      body: JSON.stringify({ selectedCalendarIds }),
    },
    workspaceId,
  );
}

export async function disconnectLiveGoogleConnection(
  workspaceId: string,
  connectionId: string,
): Promise<GoogleConnection> {
  return apiRequest(
    `/api/google/connections/${connectionId}`,
    { method: "DELETE" },
    workspaceId,
  );
}
