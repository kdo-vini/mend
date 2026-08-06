import type { TFunction } from "i18next";
import type { LiveActionError } from "../api/transport";

const errorKeys: Record<string, string> = {
  invalid_input: "errors.invalidInput",
  workspace_not_found: "errors.workspaceNotFound",
  forbidden: "errors.permissionDenied",
  not_authenticated: "errors.permissionDenied",
};

export function localizedErrorMessage(error: unknown, t: TFunction): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as LiveActionError).code;
    const key = code ? errorKeys[code] : undefined;
    if (key) return t(key, { ns: "common" });
  }
  return t("errors.technical", { ns: "common" });
}
