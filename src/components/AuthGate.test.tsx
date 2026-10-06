// @vitest-environment jsdom
// i18n-exempt: auth lifecycle regression harness, not product copy.
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";

const auth = vi.hoisted(() => ({
  listener: undefined as
    | undefined
    | ((event: string, session: Session | null) => void),
}));
vi.mock("../lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "first" } } },
      }),
      onAuthStateChange: (listener: typeof auth.listener) => {
        auth.listener = listener;
        return {
          data: {
            listener: { unsubscribe() {} },
            subscription: { unsubscribe() {} },
          },
        };
      },
    },
  },
}));
vi.mock("../i18n/preferences", () => ({
  resolveInterfaceLanguage: async () => "en-US",
}));
import { AuthGate } from "./AuthGate";

it("preserves workspace state on token refresh and clears it when the account changes", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  function Workspace() {
    const [value, setValue] = useState(0);
    return <button onClick={() => setValue(value + 1)}>{value}</button>;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <AuthGate>
          <Workspace />
        </AuthGate>,
      ),
    );
    act(() => container.querySelector("button")!.click());
    expect(container.textContent).toBe("1");
    await act(async () =>
      auth.listener!("TOKEN_REFRESHED", { user: { id: "first" } } as Session),
    );
    expect(container.textContent).toBe("1");
    await act(async () =>
      auth.listener!("SIGNED_IN", { user: { id: "second" } } as Session),
    );
    expect(container.textContent).toBe("0");
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
