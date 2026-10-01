import {
  BookOpen,
  CircleDot,
  Inbox as InboxIcon,
  Settings as SettingsIcon,
  TerminalSquare,
} from "lucide-react";
import { SUPPORT_AI_SURFACES_ENABLED } from "../../shared/support-ai-surfaces";

export type WorkspaceNavigationId =
  | "inbox"
  | "issues"
  | "runs"
  | "knowledge"
  | "settings";

export const navItems = [
  { id: "inbox", to: "/inbox", icon: InboxIcon },
  { id: "issues", to: "/issues", icon: CircleDot },
  { id: "runs", to: "/agent-runs", icon: TerminalSquare },
  { id: "knowledge", to: "/knowledge", icon: BookOpen },
  { id: "settings", to: "/settings", icon: SettingsIcon },
] as const;

const SUPPORT_AI_NAVIGATION_IDS: readonly WorkspaceNavigationId[] = [
  "runs",
  "knowledge",
];

/** Navigation shown to operators; AI/agent surfaces hide behind the Fase A flag. */
export const visibleNavItems = navItems.filter(
  ({ id }) =>
    SUPPORT_AI_SURFACES_ENABLED || !SUPPORT_AI_NAVIGATION_IDS.includes(id),
);
