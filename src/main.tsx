import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthGate } from "./components/AuthGate";
import "./i18n";
import {
  applyInterfaceLanguage,
  interfaceLanguageStorageKey,
} from "./i18n/preferences";
import { normalizeLocale } from "./i18n/resources";
import "./styles/index.css";

// i18n-exempt: application bootstrap has no user-facing product copy.

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== interfaceLanguageStorageKey || !event.newValue) return;
    void applyInterfaceLanguage(normalizeLocale(event.newValue));
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/push-sw.js").catch(() => {
      // The app remains online-first when service worker registration is unavailable.
    });
  });
}

const CHUNK_RECOVERY_PARAM = "_mend_chunk_recovery";
const CHUNK_RECOVERY_KEY = "mend:chunk-recovery-at";

function recoverFromStaleChunk() {
  const url = new URL(window.location.href);
  url.searchParams.set(CHUNK_RECOVERY_PARAM, String(Date.now()));
  window.location.replace(url.toString());
}

if (window.location.search.includes(CHUNK_RECOVERY_PARAM)) {
  const url = new URL(window.location.href);
  url.searchParams.delete(CHUNK_RECOVERY_PARAM);
  window.history.replaceState(null, "", url.toString());
}

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  try {
    const previousRecovery = Number(
      window.sessionStorage.getItem(CHUNK_RECOVERY_KEY),
    );
    if (
      Number.isFinite(previousRecovery) &&
      Date.now() - previousRecovery < 15_000
    )
      return;
    window.sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(Date.now()));
  } catch {
    // Private browsing can disable sessionStorage; the cache-busted reload is
    // still safe and remains the best recovery available.
  }
  recoverFromStaleChunk();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthGate>
        <App />
      </AuthGate>
    </BrowserRouter>
  </StrictMode>,
);
