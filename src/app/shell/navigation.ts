import {
  BookOpen,
  CircleDot,
  Inbox as InboxIcon,
  Settings as SettingsIcon,
  TerminalSquare,
} from "lucide-react";

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
