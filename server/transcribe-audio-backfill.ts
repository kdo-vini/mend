import { createServerSupabaseClient } from "./supabase.js";
import { InboxService, SupabaseInboxPort } from "./inbox-service.js";
import { SupabaseMediaStorage } from "./media.js";
import { WorkspaceSupportAudioTranscriber } from "./providers.js";
import { SupabaseAgentCredentialAdapter } from "./supabase-api-adapters.js";

type AudioRow = {
  id: string;
  workspace_id: string;
};

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const client = createServerSupabaseClient();
if (!client) throw new Error("server_supabase_config_missing");

const workspaceId = flag("--workspace");
const limit = Math.min(
  100,
  Math.max(1, Number.parseInt(flag("--limit") ?? "100", 10) || 100),
);
const dryRun = process.argv.includes("--dry-run");

let query = client
  .from("messages")
  .select("id, workspace_id")
  .eq("message_type", "audio")
  .eq("direction", "inbound")
  .is("text", null)
  .not("media_storage_path", "is", null)
  .order("created_at", { ascending: true })
  .limit(limit);
if (workspaceId) query = query.eq("workspace_id", workspaceId);

const result = await query;
if (result.error)
  throw new Error(`audio_backfill_query:${result.error.message}`);
const rows = (result.data ?? []) as AudioRow[];
console.log(
  `[audio-backfill] ${dryRun ? "would process" : "processing"} ${rows.length} audio message(s)`,
);

if (!dryRun) {
  const inbox = new InboxService(new SupabaseInboxPort(client), {
    mediaStorage: new SupabaseMediaStorage(client),
    transcriber: new WorkspaceSupportAudioTranscriber(
      new SupabaseAgentCredentialAdapter(client),
    ),
  });
  for (const row of rows) {
    try {
      const transcript = await inbox.retranscribeStoredAudio(
        { workspaceId: row.workspace_id, actorType: "system" },
        row.id,
      );
      console.log(
        `[audio-backfill] transcribed ${row.id}: ${transcript.length} chars`,
      );
    } catch (error) {
      console.error(
        `[audio-backfill] failed ${row.id}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
