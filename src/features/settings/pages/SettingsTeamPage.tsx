import type { Confirm } from "../../../shared/ui/ConfirmDialog";
import { useTranslation } from "react-i18next";
import { MembersPanel } from "../components/MembersPanel";
import { SettingsPageHeader } from "../components/SettingsShared";

export function SettingsTeamPage({
  workspaceId,
  onToast,
  onConfirm,
}: {
  workspaceId: string | null;
  onToast: (message: string) => void;
  onConfirm: Confirm;
}) {
  const { t } = useTranslation("settings");
  return (
    <div className="settings-v2-page">
      <SettingsPageHeader
        title={t("workspaceMembers")}
        description={t("workspaceMembersDescription")}
      />
      <MembersPanel
        workspaceId={workspaceId}
        onToast={onToast}
        onConfirm={onConfirm}
      />
    </div>
  );
}
