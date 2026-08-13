import { describe, expect, it } from "vitest";
import type { KnowledgeArticle } from "../../types";
import {
  filterKnowledgeArticles,
  reconcileKnowledgeSelection,
} from "./knowledge-selection";

const articles: KnowledgeArticle[] = [
  {
    id: "published",
    title: "Published guide",
    category: "Product",
    updatedAt: "Today",
    excerpt: "Setup steps",
    status: "Published",
  },
  {
    id: "draft",
    title: "Billing notes",
    category: "Billing",
    updatedAt: "Yesterday",
    excerpt: "Internal policy",
    status: "Draft",
  },
];

describe("knowledge selection", () => {
  it("keeps a visible selection and moves a hidden selection to the first result", () => {
    expect(reconcileKnowledgeSelection(articles, "draft")).toBe("draft");
    expect(reconcileKnowledgeSelection([articles[0]], "draft")).toBe(
      "published",
    );
  });

  it("preserves an intentional empty selection", () => {
    expect(reconcileKnowledgeSelection(articles, null)).toBeNull();
    expect(reconcileKnowledgeSelection([], "draft")).toBeNull();
  });

  it("filters normalized copy and stable raw categories", () => {
    expect(filterKnowledgeArticles(articles, "internal")).toEqual([
      articles[1],
    ]);
    expect(filterKnowledgeArticles(articles, "", "Billing")).toEqual([
      articles[1],
    ]);
  });
});
