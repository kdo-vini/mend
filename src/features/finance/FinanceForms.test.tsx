// @vitest-environment jsdom
// i18n-exempt: labels come from the shared locale catalog.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import i18n from "../../i18n";
import { MemoryRouter } from "react-router-dom";
import type { FinanceRecord } from "./api";
import {
  editDraft,
  newEntryDraft,
  newSettlementDraft,
  type FinanceDraft,
} from "./model";
import type { DraftEditor } from "./useFinanceEditor";
import { FinanceForm } from "./components/FinanceForm";

let container: HTMLDivElement;
let root: Root;

const entry: FinanceRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  version: 1,
  kind: "income",
  description: "Client invoice",
  period: "2026-10-01",
  amount_cents: 50000,
  category: "Services",
  source: "Lucas Ops",
  estimated: false,
  project: "",
  allocation: "",
  cancelled: false,
  reason: "",
};

function editorFor(draft: FinanceDraft): DraftEditor {
  return {
    draft,
    busy: false,
    error: null,
    conflict: false,
    latestChanges: {},
    reloaded: false,
    open: vi.fn(),
    close: vi.fn(),
    update: vi.fn(),
    setAmountText: vi.fn(),
    submit: vi.fn(async () => undefined),
    reloadLatest: vi.fn(async () => undefined),
  };
}

const labels = () =>
  [...container.querySelectorAll("label")].map((label) =>
    label.textContent?.trim(),
  );
const render = async (editor: DraftEditor) =>
  act(async () =>
    root.render(
      <MemoryRouter>
        <FinanceForm editor={editor} />
      </MemoryRouter>,
    ),
  );

describe("finance forms", () => {
  beforeAll(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    Element.prototype.scrollIntoView = vi.fn();
    await i18n.changeLanguage("en-US");
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps project and allocation folded on a new expense", async () => {
    await render(editorFor(newEntryDraft("expense", "2026-10-01")));
    expect(container.querySelector("h2")?.textContent).toBe("New expense");
    expect(labels()).not.toContain("Served project");
    expect(labels()).not.toContain("Cancel record (reason required)");
    const toggle = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Project and allocation"),
    );
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => toggle?.click());
    expect(labels()).toContain("Served project");
  });

  it("keeps the project optional when the source is Supabase", async () => {
    const draft = newEntryDraft("expense", "2026-10-01");
    draft.record.source = "Supabase";
    await render(editorFor(draft));
    expect(container.querySelector("select[required]")).toBeNull();
    const toggle = container.querySelector<HTMLButtonElement>(
      ".finance-disclosure-toggle",
    );
    expect(toggle?.disabled).toBe(false);
  });

  it("offers cancellation with a required reason only when editing", async () => {
    const draft = editDraft("entries", { ...entry, cancelled: true });
    await render(editorFor(draft));
    expect(labels()).toContain("Cancel record (reason required)");
    const reason = container.querySelector("textarea");
    expect(reason?.required).toBe(true);
  });

  it("records a receipt in entry context without exposing identifiers", async () => {
    await render(editorFor(newSettlementDraft(entry, "2026-10-05")));
    expect(container.querySelector("h2")?.textContent).toBe("Record receipt");
    expect(container.querySelector(".finance-context")?.textContent).toContain(
      "Client invoice",
    );
    const values = [...container.querySelectorAll("input")].map(
      (input) => input.value,
    );
    expect(values).toContain("2026-10-05");
    expect(values).toContain("500.00");
    expect(values.join(" ")).not.toContain(entry.id);
    expect(labels().join(" ")).not.toMatch(/identifier/i);
  });

  it("disables saving and offers recovery during a version conflict", async () => {
    const editor = {
      ...editorFor(editDraft("entries", entry)),
      error: "conflict" as const,
      conflict: true,
    };
    await render(editor);
    const save = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Save record",
    );
    expect(save?.disabled).toBe(true);
    const recover = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Review latest version and keep draft"),
    );
    await act(async () => recover?.click());
    expect(editor.reloadLatest).toHaveBeenCalled();
  });
});
