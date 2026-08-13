import { describe, expect, it } from "vitest";
import { classifyCatalogRefreshError } from "./coding-control-plane.js";

describe("Supabase coding control plane catalog errors", () => {
  it.each([
    ["agent_api_key_missing", "agent_catalog_credential_missing"],
    ["catalog_http_401", "agent_catalog_credential_invalid"],
    ["catalog_http_403", "agent_catalog_credential_invalid"],
    ["agent_catalog_empty", "agent_catalog_empty"],
    ["codex_catalog_timeout", "agent_catalog_provider_unavailable"],
    ["fetch failed", "agent_catalog_provider_unavailable"],
  ])("classifies %s as %s", (message, expected) => {
    expect(classifyCatalogRefreshError(new Error(message))).toBe(expected);
  });
});
