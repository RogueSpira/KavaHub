// Kava Hub service worker: shows phone notifications (Side Quest sign-offs) and opens the
// hub when one is tapped. It doesn't cache anything, so updates always show right away.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let msg = {};
  try { msg = e.data ? e.data.json() : {}; } catch { msg = { body: e.data?.text() || "" }; }
  e.waitUntil(self.registration.showNotification(msg.title || "Kava Hub", {
    body: msg.body || "",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: msg.tag || undefined,
    data: { url: msg.url || "/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus();
        try { await w.navigate(url); } catch { w.postMessage({ go: url }); }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
