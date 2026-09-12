// Minimal service worker whose only job is Web Push. Pearl has no offline
// caching strategy (deliberately — see the PWA notes in README: every
// open should fetch live content, not a stale cached copy), so this file
// does not implement `fetch` or `install`-time caching at all. It exists
// solely so the browser has something to attach a push subscription to.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Pearl", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Pearl";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/app/dashboard" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/app/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
