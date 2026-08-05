import { createClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;
type MessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "reaction";

interface NormalizedMessage {
  instanceName: string;
  providerMessageId: string;
  remoteJid: string;
  phoneNumber: string;
  direction: "inbound" | "outbound";
  messageType: MessageType;
  text?: string;
  caption?: string;
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  durationSeconds?: number;
  quotedProviderMessageId?: string;
  interactionId?: string;
  providerTimestamp?: string;
  contactName?: string;
  chatType?: "direct" | "group";
  participantName?: string;
  raw: JsonRecord;
}

const MAX_BODY_BYTES = 1_000_000;
const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

const asRecord = (value: unknown): JsonRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};

const firstRecord = (...values: unknown[]): JsonRecord =>
  values.map(asRecord).find((value) => Object.keys(value).length > 0) ?? {};

const stringValue = (...values: unknown[]): string | undefined =>
  values
    .find(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )
    ?.trim();

const numberValue = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number(value)
          : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

function normalizeEventName(value: unknown): string {
  return (
    typeof value === "string" && value.trim() ? value.trim() : "messages.upsert"
  )
    .toLowerCase()
    .replaceAll("_", ".");
}

function normalizePhoneNumber(value: string): string {
  return value
    .replace(/^\+/, "")
    .replace(/@[^/]+$/, "")
    .replace(/\D/g, "");
}

function messageType(message: JsonRecord): MessageType {
  if (message.imageMessage) return "image";
  if (message.videoMessage) return "video";
  if (message.audioMessage) return "audio";
  if (message.documentMessage) return "document";
  if (message.reactionMessage) return "reaction";
  return "text";
}

function unwrapMessages(payload: JsonRecord): JsonRecord[] {
  if (Array.isArray(payload.data))
    return payload.data
      .map(asRecord)
      .filter((value) => Object.keys(value).length > 0);
  const data = asRecord(payload.data);
  if (Array.isArray(data.messages))
    return data.messages
      .map(asRecord)
      .filter((value) => Object.keys(value).length > 0);
  return Object.keys(data).length > 0 ? [data] : [];
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function stableMessageId(
  instanceName: string,
  event: string,
  value: JsonRecord,
): Promise<string> {
  const key = asRecord(value.key);
  const digest = await sha256(
    JSON.stringify({
      instanceName,
      event,
      remoteJid: key.remoteJid ?? value.remoteJid,
      timestamp: value.messageTimestamp ?? value.timestamp,
      message: value.message,
    }),
  );
  return `generated-${digest.slice(0, 32)}`;
}

function normalizeProviderStatus(value: unknown): string | undefined {
  const status =
    typeof value === "string"
      ? value.trim().toLowerCase().replaceAll("-", "_")
      : "";
  if (["error", "failed", "failure"].includes(status)) return "failed";
  if (["server_ack", "sent", "ack"].includes(status)) return "sent";
  if (["delivery_ack", "delivered"].includes(status)) return "delivered";
  if (["read", "played"].includes(status)) return "read";
  return undefined;
}

async function updateProviderMessageStatus(
  client: ReturnType<typeof createClient>,
  binding: { id: string; workspace_id: string },
  payload: JsonRecord,
): Promise<{ updated: boolean; status?: string }> {
  const data = asRecord(payload.data);
  const key = asRecord(data.key);
  const providerMessageId = stringValue(
    data.messageId,
    data.keyId,
    key.id,
    data.id,
  );
  const status = normalizeProviderStatus(
    data.status ?? data.statusCode ?? payload.status,
  );
  if (!providerMessageId || !status) return { updated: false };
  const now = new Date().toISOString();
  const { data: rows, error } = await client
    .from("messages")
    .update({ provider_status: status, updated_at: now })
    .eq("workspace_id", binding.workspace_id)
    .eq("channel_connection_id", binding.id)
    .eq("provider_message_id", providerMessageId)
    .select("id");
  if (error)
    throw new Error(`message_status_update_failed:${error.code ?? "database"}`);
  return { updated: Boolean(rows?.length), status };
}

async function markProviderMessageDeleted(
  client: ReturnType<typeof createClient>,
  binding: { id: string; workspace_id: string },
  payload: JsonRecord,
): Promise<{ updated: boolean }> {
  const data = asRecord(payload.data);
  const providerMessageId = stringValue(data.id, asRecord(data.key).id);
  if (!providerMessageId) return { updated: false };
  const { data: rows, error } = await client
    .from("messages")
    .update({
      is_deleted: true,
      provider_status: "deleted",
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", binding.workspace_id)
    .eq("channel_connection_id", binding.id)
    .eq("provider_message_id", providerMessageId)
    .select("id");
  if (error)
    throw new Error(`message_delete_update_failed:${error.code ?? "database"}`);
  return { updated: Boolean(rows?.length) };
}

async function upsertProviderContacts(
  client: ReturnType<typeof createClient>,
  binding: { id: string; workspace_id: string },
  payload: JsonRecord,
): Promise<{ processed: number }> {
  const contacts = Array.isArray(payload.data)
    ? payload.data
        .map(asRecord)
        .filter((value) => Object.keys(value).length > 0)
    : [];
  if (contacts.length === 0) return { processed: 0 };

  const now = new Date().toISOString();
  const rows = contacts.flatMap((contact) => {
    const remoteJid = stringValue(contact.remoteJid, contact.remote_jid);
    // Group JIDs and LIDs do not map to a person phone number in the inbox.
    if (!remoteJid || remoteJid.endsWith("@g.us")) return [];
    const phoneNumber = normalizePhoneNumber(remoteJid);
    if (phoneNumber.length < 5) return [];
    const displayName =
      stringValue(
        contact.pushName,
        contact.notifyName,
        contact.displayName,
        contact.name,
      ) ?? "WhatsApp contact";
    const profilePictureUrl = stringValue(
      contact.profilePicUrl,
      contact.profilePictureUrl,
    );
    return [
      {
        workspace_id: binding.workspace_id,
        channel_connection_id: binding.id,
        provider_contact_id: stringValue(contact.remoteLid, remoteJid),
        phone_number: phoneNumber,
        display_name: displayName.slice(0, 240),
        ...(profilePictureUrl
          ? { profile_picture_url: profilePictureUrl }
          : {}),
        updated_at: now,
      },
    ];
  });
  if (rows.length === 0) return { processed: 0 };

  const { error } = await client
    .from("contacts")
    .upsert(rows, { onConflict: "workspace_id,phone_number" });
  if (error) throw new Error(`contact_sync_failed:${error.code ?? "database"}`);
  return { processed: rows.length };
}

async function normalizeMessages(
  payload: JsonRecord,
  canonicalInstanceName?: string,
): Promise<NormalizedMessage[]> {
  const event = normalizeEventName(payload.event ?? payload.type);
  const data = asRecord(payload.data);
  const instanceName =
    canonicalInstanceName ??
    stringValue(
      payload.instance,
      payload.instanceName,
      payload.name,
      data.instanceId,
      data.instanceName,
      data.instance,
    );
  if (!instanceName) return [];

  const normalized = await Promise.all(
    unwrapMessages(payload).map(
      async (value): Promise<NormalizedMessage | null> => {
        const key = asRecord(value.key);
        const message = asRecord(value.message);
        const content = firstRecord(
          message.imageMessage,
          message.videoMessage,
          message.audioMessage,
          message.documentMessage,
          message.reactionMessage,
        );
        const extended = asRecord(message.extendedTextMessage);
        const remoteJid =
          stringValue(key.remoteJid, value.remoteJid, value.chatId) ?? "";
        const phoneNumber = normalizePhoneNumber(remoteJid);
        if (!remoteJid || phoneNumber.length < 5) return null;

        const providerMessageId =
          stringValue(key.id, value.id) ??
          (await stableMessageId(instanceName, event, value));
        const type = messageType(message);
        const timestamp = numberValue(value.messageTimestamp, value.timestamp);
        const timestampMs =
          timestamp !== undefined && timestamp < 10_000_000_000
            ? timestamp * 1_000
            : timestamp;
        const parsedTimestamp =
          timestampMs === undefined ? undefined : new Date(timestampMs);
        const quoted = asRecord(asRecord(extended.contextInfo).quotedMessage);
        const listResponse = asRecord(
          asRecord(message.listResponseMessage).singleSelectReply,
        );
        const buttonResponse = asRecord(message.buttonsResponseMessage);
        const interactionId = stringValue(
          listResponse.selectedRowId,
          buttonResponse.selectedButtonId,
        );
        const text = stringValue(
          message.conversation,
          extended.text,
          content.caption,
          asRecord(message.reactionMessage).text,
          listResponse.title,
          buttonResponse.selectedDisplayText,
        );
        const caption = stringValue(content.caption);
        const mediaUrl = stringValue(
          value.mediaUrl,
          content.url,
          content.directPath,
          content.mediaUrl,
          asRecord(value.media).url,
        );
        const mimeType = stringValue(content.mimetype, content.mimeType);
        const fileName = stringValue(content.fileName, content.filename);
        const fileSize = numberValue(content.fileLength, content.fileSize);
        const durationSeconds = numberValue(content.seconds, content.duration);
        const quotedProviderMessageId = stringValue(
          asRecord(asRecord(quoted).key).id,
          asRecord(asRecord(message.reactionMessage).key).id,
        );
        const contactName = stringValue(
          value.pushName,
          value.notifyName,
          value.contactName,
        );
        const fromMe = key.fromMe === true || value.fromMe === true;
        const chatType = remoteJid.endsWith("@g.us") ? "group" : "direct";

        return {
          instanceName,
          providerMessageId,
          remoteJid,
          phoneNumber,
          direction: fromMe ? "outbound" : "inbound",
          messageType: type,
          ...(text ? { text } : {}),
          ...(caption ? { caption } : {}),
          ...(mediaUrl ? { mediaUrl } : {}),
          ...(mimeType ? { mimeType } : {}),
          ...(fileName ? { fileName } : {}),
          ...(fileSize !== undefined ? { fileSize } : {}),
          ...(durationSeconds !== undefined ? { durationSeconds } : {}),
          ...(quotedProviderMessageId ? { quotedProviderMessageId } : {}),
          ...(interactionId ? { interactionId } : {}),
          ...(parsedTimestamp && !Number.isNaN(parsedTimestamp.getTime())
            ? { providerTimestamp: parsedTimestamp.toISOString() }
            : {}),
          ...(contactName ? { contactName } : {}),
          chatType,
          ...(chatType === "group" && contactName
            ? { participantName: contactName }
            : {}),
          raw: value,
        };
      },
    ),
  );

  return normalized.filter(
    (message): message is NormalizedMessage => message !== null,
  );
}

function secureEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1)
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

function response(status: number, body: JsonRecord): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function serviceRoleKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = JSON.parse(
    Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}",
  ) as Record<string, string>;
  return keys.default ?? "";
}

async function markConnectionEvent(
  client: ReturnType<typeof createClient>,
  instanceName: string,
  payload: JsonRecord,
): Promise<void> {
  const data = asRecord(payload.data);
  const rawState = stringValue(
    data.state,
    data.status,
    data.connection,
    payload.state,
  );
  const state =
    rawState && ["open", "closed", "connecting", "qr-code"].includes(rawState)
      ? rawState
      : undefined;
  const patch = {
    last_event_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...(state
      ? {
          status: state,
          ...(state === "open"
            ? { connected_at: new Date().toISOString() }
            : {}),
        }
      : {}),
  };
  const { error } = await client
    .from("channel_connections")
    .update(patch)
    .eq("provider", "whatsmiau")
    .eq("provider_instance_name", instanceName);
  if (error)
    throw new Error(`connection_update_failed:${error.code ?? "database"}`);
}

async function markHistorySyncEvent(
  client: ReturnType<typeof createClient>,
  binding: { id: string; workspace_id: string },
  payload: JsonRecord,
): Promise<void> {
  const progressValue = numberValue(
    payload.progress,
    asRecord(payload.data).progress,
  );
  const progress = Math.max(0, Math.min(100, Math.round(progressValue ?? 0)));
  const latest = payload.isLatest === true || progress >= 100;
  const now = new Date().toISOString();
  const { error } = await client
    .from("channel_connections")
    .update({
      history_sync_progress: progress,
      history_sync_complete: latest,
      history_sync_updated_at: now,
      last_event_at: now,
      updated_at: now,
    })
    .eq("id", binding.id)
    .eq("workspace_id", binding.workspace_id);
  if (error)
    throw new Error(`history_sync_update_failed:${error.code ?? "database"}`);
}

async function recordAndQueue(
  client: ReturnType<typeof createClient>,
  binding: { id: string; workspace_id: string },
  event: string,
  message: NormalizedMessage,
): Promise<{ inserted: boolean; messageId: string }> {
  const now = new Date();
  const dedupeKey = `whatsmiau:${message.instanceName}:${message.providerMessageId}`;
  const { data: job, error: jobError } = await client
    .from("jobs")
    .insert({
      workspace_id: binding.workspace_id,
      type: "whatsmiau.message.received",
      payload: { event, message },
      status: "queued",
      attempts: 0,
      max_attempts: 5,
      available_at: now.toISOString(),
      dedupe_key: dedupeKey,
    })
    .select("id")
    .single();

  if (jobError) {
    if (jobError.code === "23505")
      return { inserted: false, messageId: "duplicate-in-flight" };
    throw new Error(`job_insert_failed:${jobError.code ?? "database"}`);
  }

  if (!job?.id) throw new Error("job_insert_empty");
  const { error: channelError } = await client
    .from("channel_connections")
    .update({ last_event_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("id", binding.id)
    .eq("workspace_id", binding.workspace_id);
  if (channelError)
    throw new Error(
      `channel_event_update_failed:${channelError.code ?? "database"}`,
    );
  // The API live worker owns ingestion and automation. This edge function only
  // acknowledges the provider and places the durable job in that queue.
  return { inserted: true, messageId: "" };
}

Deno.serve(async (request) => {
  if (request.method === "GET")
    return response(200, { ok: true, service: "mend-whatsmiau-webhook" });
  if (request.method !== "POST")
    return response(405, { error: "method_not_allowed" });

  const configuredSecret = Deno.env.get("WHATSMIAU_WEBHOOK_SECRET") ?? "";
  const bearerSecret = (request.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  const pathParts = new URL(request.url).pathname.split("/").filter(Boolean);
  const pathSecret =
    pathParts.at(-1) === "whats-mend-webhook"
      ? ""
      : decodeURIComponent(pathParts.at(-1) ?? "");
  const suppliedSecret = bearerSecret || pathSecret;
  if (!configuredSecret || !secureEqual(configuredSecret, suppliedSecret))
    return response(401, { error: "unauthorized" });

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES)
    return response(413, { error: "payload_too_large" });

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES)
      return response(413, { error: "payload_too_large" });
    const payload = asRecord(JSON.parse(rawBody));
    if (Object.keys(payload).length === 0)
      return response(400, { error: "invalid_payload" });

    const data = asRecord(payload.data);
    const reportedInstanceName = stringValue(
      payload.instance,
      payload.instanceName,
      payload.name,
      data.instanceId,
      data.instanceName,
      data.instance,
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const secretKey = serviceRoleKey();
    if (!supabaseUrl || !secretKey)
      throw new Error("supabase_configuration_missing");
    const client = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let bindingQuery = client
      .from("channel_connections")
      .select("id, workspace_id, provider_instance_name")
      .eq("provider", "whatsmiau");
    if (reportedInstanceName)
      bindingQuery = bindingQuery.eq(
        "provider_instance_name",
        reportedInstanceName,
      );
    let { data: bindings, error: bindingError } = await bindingQuery.limit(2);
    if (bindingError)
      throw new Error(
        `binding_lookup_failed:${bindingError.code ?? "database"}`,
      );
    if (!bindings?.length && reportedInstanceName) {
      const fallback = await client
        .from("channel_connections")
        .select("id, workspace_id, provider_instance_name")
        .eq("provider", "whatsmiau")
        .eq("status", "open")
        .limit(2);
      bindings = fallback.data;
      bindingError = fallback.error;
      if (bindingError)
        throw new Error(
          `binding_fallback_failed:${bindingError.code ?? "database"}`,
        );
    }
    if (!bindings?.length) return response(404, { error: "channel_not_found" });
    if (bindings.length > 1)
      return response(409, { error: "channel_ambiguous" });
    const binding = bindings[0] as {
      id: string;
      workspace_id: string;
      provider_instance_name: string;
    };
    const instanceName = binding.provider_instance_name;
    if (reportedInstanceName && reportedInstanceName !== instanceName) {
      console.warn(
        "Whatsmiau instance identifier mapped to the only open channel",
        { reportedInstanceName, instanceName },
      );
    }

    const event = normalizeEventName(payload.event ?? payload.type);
    if (event === "connection.update") {
      await markConnectionEvent(client, instanceName, payload);
      return response(202, { accepted: true, event, processed: 0 });
    }

    if (event === "contacts.upsert") {
      const result = await upsertProviderContacts(client, binding, payload);
      await client
        .from("channel_connections")
        .update({
          last_event_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", binding.id)
        .eq("workspace_id", binding.workspace_id);
      return response(202, {
        accepted: true,
        event,
        processed: result.processed,
      });
    }

    if (event === "messages.update") {
      const result = await updateProviderMessageStatus(
        client,
        binding,
        payload,
      );
      await client
        .from("channel_connections")
        .update({
          last_event_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", binding.id)
        .eq("workspace_id", binding.workspace_id);
      return response(202, {
        accepted: true,
        event,
        processed: result.updated ? 1 : 0,
        ...(result.status ? { status: result.status } : {}),
      });
    }

    if (event === "messages.delete") {
      const result = await markProviderMessageDeleted(client, binding, payload);
      await client
        .from("channel_connections")
        .update({
          last_event_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", binding.id)
        .eq("workspace_id", binding.workspace_id);
      return response(202, {
        accepted: true,
        event,
        processed: result.updated ? 1 : 0,
      });
    }

    if (event === "messages.set")
      await markHistorySyncEvent(client, binding, payload);

    if (event !== "messages.upsert" && event !== "messages.set") {
      await client
        .from("channel_connections")
        .update({
          last_event_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", binding.id);
      return response(202, { accepted: true, event, processed: 0 });
    }

    const messages = await normalizeMessages(payload, instanceName);
    if (messages.length === 0)
      return response(400, { error: "message_required" });
    const results = [];
    for (const message of messages)
      results.push(await recordAndQueue(client, binding, event, message));
    return response(202, {
      accepted: true,
      event,
      processed: results.length,
      inserted: results.filter((result) => result.inserted).length,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown_error";
    console.error("Whatsmiau webhook failed", detail);
    return response(500, { error: "webhook_processing_failed" });
  }
});
