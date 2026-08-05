/* global URL, self, caches, fetch */

const SHELL_CACHE = "mend-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        cache.addAll([
          "/",
          "/index.html",
          "/manifest.webmanifest",
          "/favicon.svg",
          "/icon-192.svg",
          "/icon-512.svg",
        ]),
      )
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.clients
      .claim()
      .then(() =>
        caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter(
                  (key) => key.startsWith("mend-shell-") && key !== SHELL_CACHE,
                )
                .map((key) => caches.delete(key)),
            ),
          ),
      ),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.includes("supabase")
  )
    return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches
            .open(SHELL_CACHE)
            .then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches
          .match(request)
          .then((cached) => cached || caches.match("/index.html")),
      ),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() ?? "New Mend notification" };
  }

  const title = payload.title || "Mend";
  const options = {
    body: payload.body || "You have a new workspace notification.",
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    tag: payload.tag || "mend-notification",
    data: { url: payload.url || "/inbox" },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(
    event.notification.data?.url || "/inbox",
    self.location.origin,
  ).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((client) => "focus" in client);
        if (existing) {
          void existing.navigate(targetUrl);
          return existing.focus();
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});
