// @vitest-environment jsdom
// i18n-exempt: test renders translated output through the shared i18n instance, not useTranslation().

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import i18n from "../../../i18n";
import { NewChatDialog } from "./NewChatDialog";

const channels = [{ id: "channel-1", name: "Téchne support" }];

let container: HTMLDivElement;
let root: Root;

function type(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function field(name: string) {
  const element = document.body.querySelector<HTMLInputElement>(
    `[name="${name}"]`,
  );
  if (!element) throw new Error(`field ${name} was not rendered`);
  return element;
}

function submitButton() {
  const buttons = [
    ...document.body.querySelectorAll<HTMLButtonElement>("button[type=submit]"),
  ];
  if (buttons.length !== 1) throw new Error("expected one submit button");
  return buttons[0];
}

async function render(started: unknown[] = []) {
  await act(async () => {
    root.render(
      <NewChatDialog
        channels={channels}
        submitting={false}
        onClose={() => undefined}
        onStart={(input) => started.push(input)}
      />,
    );
  });
}

describe("NewChatDialog", () => {
  beforeAll(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage("en-US");
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  it("keeps submit disabled until a valid phone number and a message are present", async () => {
    await render();
    expect(submitButton().disabled).toBe(true);

    await act(async () => type(field("phoneNumber"), "+55 (11) 99999-9999"));
    expect(submitButton().disabled).toBe(true);

    await act(async () => type(field("message"), "   "));
    expect(submitButton().disabled).toBe(true);

    await act(async () => type(field("message"), "Hello from Téchne"));
    expect(submitButton().disabled).toBe(false);

    await act(async () => type(field("phoneNumber"), "+55 11"));
    expect(submitButton().disabled).toBe(true);
  });

  it("submits the selected channel with the typed phone number and message", async () => {
    const started: unknown[] = [];
    await render(started);

    await act(async () => type(field("phoneNumber"), "+55 (11) 99999-9999"));
    await act(async () => type(field("message"), "Hello from Téchne"));
    await act(async () => submitButton().click());

    expect(started).toEqual([
      {
        channelId: "channel-1",
        phoneNumber: "+55 (11) 99999-9999",
        message: "Hello from Téchne",
      },
    ]);
  });

  it("hides the channel field when the workspace has a single connected channel", async () => {
    await render();
    expect(document.body.querySelector("[role=combobox]")).toBeNull();
    expect(document.body.textContent).toContain(
      "Messaging a number that never wrote to you first can get your WhatsApp account restricted.",
    );
  });
});
