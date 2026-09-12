import { Database, FileText, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { KnowledgeProduct } from "../../../types";

export function KnowledgeProductBar({
  products,
  selectedProductId,
  view,
  onProductChange,
  onViewChange,
  onCreateProduct,
}: {
  products: KnowledgeProduct[];
  selectedProductId: string;
  view: "content" | "sources";
  onProductChange: (value: string) => void;
  onViewChange: (value: "content" | "sources") => void;
  onCreateProduct: () => void;
}) {
  const { t } = useTranslation("knowledge");
  return (
    <div className="knowledge-scope-bar">
      <div
        className="knowledge-view-switch"
        aria-label={t("products.viewLabel")}
      >
        <button
          type="button"
          className={view === "content" ? "selected" : ""}
          onClick={() => onViewChange("content")}
        >
          <FileText size={14} /> {t("products.content")}
        </button>
        <button
          type="button"
          className={view === "sources" ? "selected" : ""}
          onClick={() => onViewChange("sources")}
        >
          <Database size={14} /> {t("products.sources")}
        </button>
      </div>
      <div
        className="knowledge-product-tabs"
        aria-label={t("products.filterLabel")}
      >
        <button
          type="button"
          className={selectedProductId === "all" ? "selected" : ""}
          onClick={() => onProductChange("all")}
        >
          {t("products.all")}
        </button>
        {view === "content" ? (
          <button
            type="button"
            className={selectedProductId === "shared" ? "selected" : ""}
            onClick={() => onProductChange("shared")}
          >
            {t("products.shared")}
          </button>
        ) : null}
        {products
          .filter((product) => product.status === "active")
          .map((product) => (
            <button
              type="button"
              key={product.id}
              className={selectedProductId === product.id ? "selected" : ""}
              onClick={() => onProductChange(product.id)}
            >
              {product.name}
            </button>
          ))}
        <button
          type="button"
          className="knowledge-product-add"
          onClick={onCreateProduct}
          aria-label={t("products.create")}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
