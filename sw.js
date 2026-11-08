/* =========================================================
   DayFlow — service worker (web only)
   Keeps the app's own files so the installed web app (Add to
   Home Screen) opens without a connection. Supabase and other
   sites always go to the network. VERSION is stamped by
   build_artifact.py, so each deploy replaces the old cache.
   ========================================================= */

const VERSION = "4814c13883";
const CACHE = `dayflow-${VERSION}`;
const FILES = [
  "./", "index.html", "manifest.json",
  "css/styles.css",
  "js/vendor/supabase.js", "js/config.js", "js/platform.js", "js/store.js", "js/sync.js", "js/swipe.js", "js/timeline.js", "js/app.js",
  "fonts/atkinson-400.woff2", "fonts/atkinson-400-italic.woff2", "fonts/atkinson-700.woff2",
  "fonts/bricolage-var.woff2", "fonts/plexmono-400.woff2", "fonts/plexmono-500.woff2",
  "images/space-wide.svg", "images/space-tall.svg", "sounds/dayflow-alarm.wav",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});

// The page asks for this when the person taps "Reload" on the update toast.
self.addEventListener("message", (e) => {
  if (e.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("dayflow-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Own files: cache first (fast, works offline). Everything else: straight to the network.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(e.request).catch(() =>
          // Offline and not cached: page requests get the app shell.
          e.request.mode === "navigate" ? caches.match("index.html") : Response.error()
        )
    )
  );
});
