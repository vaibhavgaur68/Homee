/* ═══════════════════════════════════════════════════════
   HOMEE SERVICE WORKER  v2
   Strategy: Cache-first for everything local.
   The "webpage not reached" screen will never appear
   once the app has been opened once with internet.
   ═══════════════════════════════════════════════════════ */

const CACHE_NAME = 'homee-v2';

// Everything the app needs to run — cached on first install
const PRECACHE = [
  '/index.html',
  '/manifest.json',
  '/icons/icon-72.png',
  '/icons/icon-96.png',
  '/icons/icon-128.png',
  '/icons/icon-144.png',
  '/icons/icon-152.png',
  '/icons/icon-192.png',
  '/icons/icon-384.png',
  '/icons/icon-512.png',
  // Supabase JS — cached so app JS works offline
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  // Google Fonts CSS
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap',
];

// ── INSTALL ───────────────────────────────────────────────
// Open cache, pre-fetch every asset. skipWaiting so the new
// SW takes control immediately without waiting for a reload.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Cache each asset individually so one failure doesn't
      // block the whole install
      await Promise.allSettled(
        PRECACHE.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] Precache miss (needs internet first):', url)
          )
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────────
// Delete every old homee-* cache so stale files don't linger
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith('homee-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())  // take control of all open tabs immediately
  );
});

// ── FETCH ─────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET
  if (request.method !== 'GET') return;

  // Ignore browser extensions
  if (!url.protocol.startsWith('http')) return;

  // ── Supabase API calls → always network, never cache ──
  // If offline, the app's own JS catches the error and shows
  // cached data from localStorage — SW stays out of the way
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(networkOnly(request));
    return;
  }

  // ── Google font FILES (.woff2 etc) → cache-first ──────
  if (url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ── Everything else → cache-first, update in background ─
  // This covers: index.html, manifest, icons, Supabase JS,
  // Font CSS, and any other local asset
  event.respondWith(cacheFirstWithRefresh(request));
});

// ── STRATEGY: Cache-first, refresh cache in background ───
// Serve from cache instantly. Also fetch network in background
// and update cache so next visit gets fresh content.
async function cacheFirstWithRefresh(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  // Kick off a background network fetch to keep cache fresh
  const networkFetch = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null); // silently fail if offline

  // Return cached immediately if we have it
  if (cached) return cached;

  // Not in cache yet — wait for network (first visit)
  try {
    const response = await networkFetch;
    if (response) return response;
  } catch (_) {}

  // Last resort: return offline fallback page
  return offlineFallback(request);
}

// ── STRATEGY: Network only (Supabase API) ─────────────────
async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch (err) {
    // Return a proper JSON error so the app JS can handle it
    // gracefully instead of crashing
    return new Response(
      JSON.stringify({ error: 'offline', message: 'No internet connection' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ── STRATEGY: Strict cache-first (fonts) ─────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return new Response('', { status: 503 });
  }
}

// ── OFFLINE FALLBACK ──────────────────────────────────────
// If nothing is cached at all (truly first visit, no internet)
// show a clean branded offline page instead of browser error
async function offlineFallback(request) {
  // For navigation requests, return a branded offline page
  if (request.destination === 'document') {
    return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0f0f0f">
<title>Homee — Offline</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    background:#0f0f0f; color:#f0ede8;
    font-family: -apple-system, sans-serif;
    height:100dvh; display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    text-align:center; padding:32px;
  }
  .icon {
    width:72px; height:72px; border-radius:18px;
    background:#1a1a1a; border:1px solid #2a2a2a;
    display:flex; align-items:center; justify-content:center;
    margin:0 auto 24px;
  }
  h1 { font-size:28px; color:#e8d5a3; margin-bottom:8px; letter-spacing:-0.5px; }
  p  { font-size:14px; color:#5a5550; line-height:1.6; max-width:260px; }
  .sub { margin-top:32px; font-size:12px; color:#3a3530; }
  button {
    margin-top:24px; padding:12px 28px;
    background:#e8d5a3; color:#1a1000;
    border:none; border-radius:10px;
    font-size:14px; font-weight:600;
    cursor:pointer;
  }
</style>
</head>
<body>
  <div class="icon">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#e8d5a3" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  </div>
  <h1>Homee</h1>
  <p>You're offline. Connect to the internet and reopen the app.</p>
  <button onclick="location.reload()">Try Again</button>
  <p class="sub">Once loaded once, Homee works fully offline.</p>
</body>
</html>`, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  }

  return new Response('', { status: 503 });
}

// ── PUSH NOTIFICATIONS ────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'Homee', body: 'Time to log your expenses!' };
  if (event.data) {
    try { data = { ...data, ...event.data.json() }; } catch (e) {}
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      tag: 'homee-daily',
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: '/index.html' },
      actions: [
        { action: 'add', title: '+ Add Expense' },
        { action: 'dismiss', title: 'Done' }
      ]
    })
  );
});

// ── NOTIFICATION CLICK ────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.action === 'add'
    ? '/index.html?action=add'
    : (event.notification.data?.url || '/index.html');

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ action: 'notification-click', url: target });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});

// ── BACKGROUND SYNC ───────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-expenses') {
    event.waitUntil(
      clients.matchAll({ type: 'window' })
        .then(list => list.forEach(c => c.postMessage({ action: 'sync-expenses' })))
    );
  }
});

// ── MESSAGES FROM APP ─────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.action === 'skip-waiting') self.skipWaiting();
});
