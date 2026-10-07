import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
  test(`audio waveform plays, pauses, seeks, and renders ${theme} on desktop/mobile`, async ({
    page,
  }, info) => {
    await page.setViewportSize(
      info.project.name === "mobile"
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
    );
    await page.addInitScript((mode) => {
      localStorage.setItem("mend.interface-language", "en-US");
      localStorage.setItem("mend.theme", mode);
    }, theme);
    await page.goto("/inbox?demo=1");

    const mediaUrl = await page.evaluate(() => {
      const sampleRate = 8000;
      const samples = sampleRate * 6;
      const bytes = new ArrayBuffer(44 + samples * 2);
      const view = new DataView(bytes);
      const write = (offset: number, value: string) => {
        for (let index = 0; index < value.length; index++)
          view.setUint8(offset + index, value.charCodeAt(index));
      };
      write(0, "RIFF");
      view.setUint32(4, 36 + samples * 2, true);
      write(8, "WAVE");
      write(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      write(36, "data");
      view.setUint32(40, samples * 2, true);
      return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
    });

    await page.evaluate(async (src) => {
      const loadModule = (url: string) => import(/* @vite-ignore */ url);
      const [reactModule, reactDomModule, audioModule] = await Promise.all([
        loadModule("/node_modules/.vite/deps/react.js"),
        loadModule("/node_modules/.vite/deps/react-dom_client.js"),
        loadModule("/src/features/inbox/components/AudioWavePlayer.tsx"),
      ]);
      const { AudioWavePlayer } = audioModule;
      const { createElement } = reactModule.default;
      const { createRoot } = reactDomModule.default;
      const host = document.createElement("section");
      host.setAttribute("aria-label", "Voice message preview");
      Object.assign(host.style, {
        position: "fixed",
        zIndex: "99999",
        inset: "12px 12px auto",
        padding: "16px",
        borderRadius: "16px",
        background: "var(--surface-raised, #fff)",
        color: "var(--text-primary, #172033)",
        boxShadow: "0 8px 32px #0005",
      });
      const title = document.createElement("h2");
      title.textContent = "Voice message preview";
      title.style.margin = "0 0 12px";
      host.append(title);
      const player = document.createElement("div");
      host.append(player);
      document.body.append(host);
      const root = createRoot(player);
      root.render(
        createElement(AudioWavePlayer, { src, onError: () => undefined }),
      );
      (window as Window & { __audioWaveRoot?: typeof root }).__audioWaveRoot =
        root;
    }, mediaUrl);

    const player = page.locator(".audio-wave-player");
    const audio = page.locator(".audio-wave-player audio");
    const play = page.getByRole("button", { name: "Play audio", exact: true });
    await expect(player).toBeVisible();
    await expect(audio).toHaveAttribute("preload", "metadata");
    await expect(page.getByLabel("Seek audio", { exact: true })).toBeEnabled();
    await expect(page.locator(".audio-wave-player__time")).toContainText(
      "0:06",
    );

    await play.click();
    const pause = page.getByRole("button", {
      name: "Pause audio",
      exact: true,
    });
    await expect(pause).toBeVisible();
    await pause.click();
    await expect(play).toBeVisible();

    const seek = page.getByLabel("Seek audio", { exact: true });
    await seek.fill("2");
    await expect(seek).toHaveValue("2");
    await expect(seek).toHaveAttribute("aria-valuetext", "0:02 / 0:06");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: info.outputPath(`audio-wave-${theme}.png`),
      fullPage: true,
    });
  });
}
