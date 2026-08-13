import { Link } from "react-router-dom";

// i18n-exempt: generic primitive renders labels supplied by its translated caller.

export interface ViewTabItem {
  id: string;
  label: string;
  href: string;
  active: boolean;
}

export function ViewTabs({
  label,
  items,
}: {
  label: string;
  items: ViewTabItem[];
}) {
  return (
    <nav className="view-tabs" aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.id}
          className={item.active ? "active" : ""}
          aria-current={item.active ? "page" : undefined}
          to={item.href}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
