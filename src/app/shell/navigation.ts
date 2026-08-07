import {
  BookOpen,
  CircleDot,
  Inbox as InboxIcon,
  KanbanSquare,
  Settings as SettingsIcon,
  TerminalSquare,
} from "lucide-react";

export const navItems = [
  { to: "/inbox", label: "Inbox", icon: InboxIcon },
  { to: "/issues", label: "Issues", icon: CircleDot },
  { to: "/kanban", label: "Kanban", icon: KanbanSquare },
  { to: "/codex-runs", label: "Engineering runs", icon: TerminalSquare },
  { to: "/knowledge", label: "Knowledge", icon: BookOpen },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;
