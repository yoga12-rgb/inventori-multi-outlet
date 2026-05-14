// Service Worker untuk Sistem Inventori Multi-Outlet (PWA shell cache).
// Strategi:
//   - Aset statis (Next /_next, ikon, manifest, font): cache-first.
//   - Halaman HTML (navigasi): network-first dengan fallback ke cache lalu /offline.
//   - API Supabase (HTTP) dilewatkan ke jaringan, tidak di-cache (datanya volatile,
//     dan offline-first kasir sudah ditangani via IndexedDB queue).
//
// Versi cache di-bump setiap kali isi SW berubah supaya client lama dibersihkan.
const VERSION = "v2";
const STATIC_CACHE = `inv-static-${VERSION}`;
const PAGE_CACHE = `inv-pages-${VERSION}`;

const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/offline",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // Best-effort precache; kalau /offline belum ada (mis. dev), abaikan.
      await Promise.allSettled(PRECACHE_URLS.map((u) => cache.add(u)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== PAGE_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function shouldBypass(url) {
  // Lewatkan request ke Supabase / API lain.
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (url.pathname.startsWith("/auth/")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (shouldBypass(url)) return;

  // Aset statis Next.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|css|js|map)$/i.test(
      url.pathname,
    )
  ) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // Manifest.
  if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // Halaman HTML.
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirstPage(req));
    return;
  }
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return cached || Response.error();
  }
}

async function networkFirstPage(req) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    const offline = await cache.match("/offline");
    if (offline) return offline;
    return new Response(
      "<h1>Offline</h1><p>Halaman ini belum tersedia secara offline.</p>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}
