// @vitest-environment jsdom
// i18n-exempt: audit request race regression, not product copy.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ history: vi.fn() }));
vi.mock("../api", () => ({ financeApi: { history: mock.history } }));
import i18n from "../../../i18n";
import { HistoryPanel } from "./HistoryPanel";

it("never labels a previous record's audit events as the newly selected record", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage("en-US");
  HTMLElement.prototype.scrollIntoView = vi.fn();
  mock.history.mockResolvedValueOnce({
    data: [
      {
        id: 1,
        actor_id: "operator-one",
        happened_at: "2026-10-06T12:00:00Z",
        before_record: null,
        after_record: { description: "first record audit description" },
      },
    ],
  });
  mock.history.mockImplementationOnce(() => new Promise(() => undefined));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onClose = vi.fn();
  const onForbidden = vi.fn();
  try {
    await act(async () =>
      root.render(
        <HistoryPanel
          recordId="first"
          title="First"
          onClose={onClose}
          onForbidden={onForbidden}
        />,
      ),
    );
    expect(container.textContent).toContain("first record audit description");
    await act(async () =>
      root.render(
        <HistoryPanel
          recordId="second"
          title="Second"
          onClose={onClose}
          onForbidden={onForbidden}
        />,
      ),
    );
    expect(container.textContent).not.toContain(
      "first record audit description",
    );
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
