// i18n-exempt: layout primitive; callers pass translated title and summary.
import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Collapsible card: the header always shows the title and its key figure,
 * the body springs open below. Closed bodies stay mounted (their data keeps
 * loading) but are hidden from focus and assistive technology.
 */
export function Disclosure({
  title,
  summary,
  defaultOpen = false,
  className,
  label,
  children,
}: {
  title: ReactNode;
  summary?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section
      className={["disclosure", className].filter(Boolean).join(" ")}
      data-open={open || undefined}
      aria-label={label}
    >
      <h3 className="disclosure-heading">
        <button
          type="button"
          className="disclosure-trigger"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="disclosure-title">{title}</span>
          {summary != null && (
            <span className="disclosure-summary">{summary}</span>
          )}
          <ChevronDown
            className="disclosure-chevron"
            size={16}
            aria-hidden="true"
          />
        </button>
      </h3>
      <div id={id} className="disclosure-body">
        <div className="disclosure-clip">
          <div className="disclosure-inner">{children}</div>
        </div>
      </div>
    </section>
  );
}
