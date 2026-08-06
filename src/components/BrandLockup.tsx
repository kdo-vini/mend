import { useTranslation } from "react-i18next";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-mark ${className}`.trim()} aria-hidden="true">
      <span />
    </span>
  );
}

export function BrandLockup({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation("common");
  return (
    <div
      className={`brand-lockup ${compact ? "brand-lockup-compact" : ""} ${className}`.trim()}
    >
      <BrandMark />
      <div>
        <div className="brand-name">{t("brand.name")}</div>
        {!compact && (
          <div className="brand-subtitle">{t("brand.descriptor")}</div>
        )}
      </div>
    </div>
  );
}
