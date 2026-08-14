import type { LucideIcon } from "lucide-react";
import {
  Bot,
  FileClock,
  GitBranch,
  Link2,
  MessageCircle,
  Settings2,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

export type SettingsRouteId =
  | "overview"
  | "team"
  | "audit"
  | "whatsapp"
  | "automation"
  | "repositories"
  | "agents"
  | "integrations";

export type SettingsNavGroupId =
  | "workspace"
  | "support"
  | "engineering"
  | "connections";

export interface SettingsNavItem {
  id: SettingsRouteId;
  path: string;
  matchPrefix: string;
  icon: LucideIcon;
}

export interface SettingsNavGroup {
  id: SettingsNavGroupId;
  items: SettingsNavItem[];
}

export const settingsNavigation: SettingsNavGroup[] = [
  {
    id: "workspace",
    items: [
      {
        id: "overview",
        path: "/settings",
        matchPrefix: "/settings",
        icon: Settings2,
      },
      {
        id: "team",
        path: "/settings/team",
        matchPrefix: "/settings/team",
        icon: UsersRound,
      },
      {
        id: "audit",
        path: "/settings/audit",
        matchPrefix: "/settings/audit",
        icon: FileClock,
      },
    ],
  },
  {
    id: "support",
    items: [
      {
        id: "whatsapp",
        path: "/settings/channels/whatsapp",
        matchPrefix: "/settings/channels/whatsapp",
        icon: MessageCircle,
      },
      {
        id: "automation",
        path: "/settings/automation/replies",
        matchPrefix: "/settings/automation",
        icon: Bot,
      },
    ],
  },
  {
    id: "engineering",
    items: [
      {
        id: "repositories",
        path: "/settings/engineering/repositories",
        matchPrefix: "/settings/engineering/repositories",
        icon: GitBranch,
      },
      {
        id: "agents",
        path: "/settings/engineering/agents/issues/providers",
        matchPrefix: "/settings/engineering/agents",
        icon: ShieldCheck,
      },
    ],
  },
  {
    id: "connections",
    items: [
      {
        id: "integrations",
        path: "/settings/integrations",
        matchPrefix: "/settings/integrations",
        icon: Link2,
      },
    ],
  },
];

const legacyTabPaths: Record<string, string> = {
  whatsapp: "/settings/channels/whatsapp",
  connections: "/settings/integrations",
  members: "/settings/team",
  ai: "/settings/automation/replies",
  flows: "/settings/automation/intake",
  repositories: "/settings/engineering/repositories",
  audit: "/settings/audit",
};

const legacyRoutePaths: Record<string, string> = {
  "/settings/automation/ai": "/settings/automation/replies",
  "/settings/automation/flows": "/settings/automation/intake",
  "/settings/engineering/coding/connections":
    "/settings/engineering/agents/issues/providers",
  "/settings/engineering/coding/routing":
    "/settings/engineering/agents/issues/run-policy",
  "/settings/engineering/agents/providers":
    "/settings/engineering/agents/issues/providers",
  "/settings/engineering/agents/run-policy":
    "/settings/engineering/agents/issues/run-policy",
};

export function legacySettingsPath(tab: string | null): string | null {
  return tab ? (legacyTabPaths[tab] ?? null) : null;
}

export function legacySettingsRoute(
  pathname: string,
  search: string,
): string | null {
  const canonicalPath = legacyRoutePaths[pathname];
  return canonicalPath ? `${canonicalPath}${search}` : null;
}

export function findSettingsNavItem(pathname: string): SettingsNavItem {
  const items = settingsNavigation.flatMap((group) => group.items);
  if (pathname === "/settings" || pathname === "/settings/") return items[0];

  return (
    items
      .filter((item) => item.id !== "overview")
      .sort((left, right) => right.matchPrefix.length - left.matchPrefix.length)
      .find(
        (item) =>
          pathname === item.matchPrefix ||
          pathname.startsWith(`${item.matchPrefix}/`),
      ) ?? items[0]
  );
}
