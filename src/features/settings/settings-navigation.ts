import type { LucideIcon } from "lucide-react";
import {
  Bot,
  BookOpenCheck,
  Boxes,
  FileClock,
  GitBranch,
  Github,
  Link2,
  MessageCircle,
  Network,
  Settings2,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

export type SettingsRouteId =
  | "overview"
  | "whatsapp"
  | "team"
  | "ai"
  | "flows"
  | "integrations"
  | "github"
  | "google"
  | "mcp"
  | "repositories"
  | "coding-connections"
  | "coding-routing"
  | "audit";

export interface SettingsNavItem {
  id: SettingsRouteId;
  label: string;
  description: string;
  path: string;
  icon: LucideIcon;
}

export interface SettingsNavGroup {
  id: string;
  label: string;
  items: SettingsNavItem[];
}

export const settingsNavigation: SettingsNavGroup[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      {
        id: "overview",
        label: "Overview",
        description: "Health and next actions across the workspace.",
        path: "/settings",
        icon: Settings2,
      },
      {
        id: "whatsapp",
        label: "WhatsApp",
        description: "Numbers, pairing and live channel health.",
        path: "/settings/channels/whatsapp",
        icon: MessageCircle,
      },
      {
        id: "team",
        label: "Team & access",
        description: "Members, invitations and workspace roles.",
        path: "/settings/team",
        icon: UsersRound,
      },
      {
        id: "audit",
        label: "Audit log",
        description: "Immutable activity for this workspace.",
        path: "/settings/audit",
        icon: FileClock,
      },
    ],
  },
  {
    id: "automation",
    label: "Automation",
    items: [
      {
        id: "ai",
        label: "AI behavior",
        description: "Triage, autonomy and approval boundaries.",
        path: "/settings/automation/ai",
        icon: Bot,
      },
      {
        id: "flows",
        label: "Support flows",
        description: "The first steps a customer sees on WhatsApp.",
        path: "/settings/automation/flows",
        icon: Network,
      },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    items: [
      {
        id: "integrations",
        label: "All integrations",
        description: "Connected services and external access.",
        path: "/settings/integrations",
        icon: Link2,
      },
      {
        id: "github",
        label: "GitHub",
        description: "Source, branches and publishing access.",
        path: "/settings/integrations/github",
        icon: Github,
      },
      {
        id: "google",
        label: "Google Calendar",
        description: "Calendars available to authorized actions.",
        path: "/settings/integrations/google",
        icon: Boxes,
      },
      {
        id: "mcp",
        label: "MCP plugins",
        description: "Trusted tools with explicit write controls.",
        path: "/settings/integrations/mcp",
        icon: Link2,
      },
    ],
  },
  {
    id: "engineering",
    label: "Engineering",
    items: [
      {
        id: "repositories",
        label: "Repositories",
        description: "Codebases Mend can work with.",
        path: "/settings/engineering/repositories",
        icon: GitBranch,
      },
      {
        id: "coding-connections",
        label: "Coding connections",
        description: "Providers, subscriptions and model catalogs.",
        path: "/settings/engineering/coding/connections",
        icon: ShieldCheck,
      },
      {
        id: "coding-routing",
        label: "Coding routing",
        description: "Stage policies, budgets and fallbacks.",
        path: "/settings/engineering/coding/routing",
        icon: BookOpenCheck,
      },
    ],
  },
];

const legacyTabPaths: Record<string, string> = {
  whatsapp: "/settings/channels/whatsapp",
  connections: "/settings/integrations",
  members: "/settings/team",
  ai: "/settings/automation/ai",
  flows: "/settings/automation/flows",
  repositories: "/settings/engineering/repositories",
  audit: "/settings/audit",
};

export function legacySettingsPath(tab: string | null): string | null {
  return tab ? (legacyTabPaths[tab] ?? null) : null;
}

export function findSettingsNavItem(pathname: string): SettingsNavItem {
  const items = settingsNavigation
    .flatMap((group) => group.items)
    .sort((left, right) => right.path.length - left.path.length);
  return (
    items.find(
      (item) => item.path === pathname || pathname.startsWith(`${item.path}/`),
    ) ?? items[0]
  );
}
