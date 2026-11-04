import { useTranslation } from "react-i18next";
import type { ClientStage } from "./api";

/** Dot plus text: the stage is never carried by colour alone. */
export function StagePill({ stage }: { stage: ClientStage }) {
  const { t } = useTranslation("clients");
  return (
    <span className={`client-stage client-stage-${stage}`}>
      {t(`stages.${stage}`)}
    </span>
  );
}
