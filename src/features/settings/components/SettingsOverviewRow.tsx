import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { SettingsStatus } from "./SettingsShared";

// i18n-exempt: labels, descriptions, and status are translated by the page caller.

export function SettingsOverviewRow({
  label,
  description,
  status,
  tone,
  to,
  children,
}: {
  label: string;
  description: string;
  status: string;
  tone: "success" | "warning" | "danger" | "muted";
  to: string;
  children?: ReactNode;
}) {
  return (
    <Link className="settings-overview-row" to={to}>
      <div className="settings-overview-row-main">
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      {children}
      <SettingsStatus tone={tone}>{status}</SettingsStatus>
      <ArrowUpRight size={15} aria-hidden="true" />
    </Link>
  );
}
