import { LiveActionError } from "../../api/transport";

export function catalogFailurePresentation(reason: unknown): {
  status: "error" | "revoked";
  messageKey: "catalogCredential" | "catalogUnavailable" | "catalogRevoked";
} {
  const error = reason instanceof LiveActionError ? reason : undefined;
  const code = error?.code;
  if (error?.status === 409 && code === "agent_connection_revoked")
    return { status: "revoked", messageKey: "catalogRevoked" };
  if (
    error?.status === 422 ||
    code === "agent_catalog_credential_missing" ||
    code === "agent_catalog_credential_invalid"
  )
    return { status: "error", messageKey: "catalogCredential" };
  return { status: "error", messageKey: "catalogUnavailable" };
}
