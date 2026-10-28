// @vitest-environment jsdom
// i18n-exempt: the avatar renders no user-visible copy.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContactAvatar } from "./ContactAvatar";

describe("ContactAvatar", () => {
  let root: Root;
  let container: HTMLDivElement;
  const conversation = { accent: "#3366ff", initials: "FF" };
  const photo = "https://storage.googleapis.com/whatsmiau/p/1.jpeg";

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows the photo and falls back to initials when it fails", async () => {
    await act(async () =>
      root.render(
        <ContactAvatar conversation={conversation} photoUrl={photo} />,
      ),
    );
    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toBe(photo);
    await act(async () => image?.dispatchEvent(new Event("error")));
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("FF");
  });

  it("shows initials without a photo", async () => {
    await act(async () =>
      root.render(<ContactAvatar conversation={conversation} />),
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("FF");
  });
});
