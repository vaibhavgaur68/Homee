/* ═══════════════════════════════════════════════════════
   HOMEE SERVICE WORKER v3
   Strategy: Network-only. No caching at all.
   If offline → show a branded "connect to internet" page.
   ═══════════════════════════════════════════════════════ */

// ── INSTALL ───────────────────────────────────────────────
// Nothing to cache. Just take control immediately.
self.addEventListener('install', () => self.skipWaiting());

// ── ACTIVATE ─────────────────────────────────────────────
// Wipe every old homee-* cache left from previous SW versions.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('homee-')).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;

  // Only intercept GET navigation requests (page loads).
  // Let all other requests (API, fonts, scripts) go straight
  // to the network untouched — no redirects, no interference.
  if (request.method !== 'GET') return;
  if (request.mode !== 'navigate') return;

  event.respondWith(
    fetch(request).catch(() => offlinePage())
  );
});

// ── OFFLINE PAGE ──────────────────────────────────────────
function offlinePage() {
  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0f0f0f">
<title>Homee — No Connection</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0f0f0f;
    color: #f0ede8;
    font-family: -apple-system, 'DM Sans', sans-serif;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 32px 24px;
    padding-bottom: calc(32px + env(safe-area-inset-bottom));
  }
  .icon {
    width: 72px; height: 72px;
    border-radius: 20px;
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 28px;
  }
  h1 {
    font-size: 32px;
    color: #e8d5a3;
    letter-spacing: -0.5px;
    margin-bottom: 6px;
    font-weight: 400;
  }
  .subtitle {
    font-size: 13px;
    color: #5a5550;
    margin-bottom: 40px;
    font-weight: 300;
  }
  .card {
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 16px;
    padding: 24px 28px;
    max-width: 320px;
    width: 100%;
    margin-bottom: 24px;
  }
  .wifi-icon {
    margin: 0 auto 16px;
    opacity: 0.25;
  }
  .card h2 {
    font-size: 16px;
    font-weight: 600;
    color: #f0ede8;
    margin-bottom: 8px;
  }
  .card p {
    font-size: 13px;
    color: #5a5550;
    line-height: 1.6;
  }
  button {
    padding: 13px 32px;
    background: #e8d5a3;
    color: #1a1000;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    letter-spacing: 0.1px;
  }
  button:active { opacity: 0.85; transform: scale(0.98); }
</style>
</head>
<body>
  <div class="icon">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
         stroke="#e8d5a3" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  </div>

  <h1>Homee</h1>
  <p class="subtitle">Daily expense tracking, refined</p>

  <div class="card">
    <svg class="wifi-icon" width="48" height="48" viewBox="0 0 24 24" fill="none"
         stroke="#f0ede8" stroke-width="1.5"
         stroke-linecap="round" stroke-linejoin="round">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
      <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
      <line x1="12" y1="20" x2="12.01" y2="20"/>
    </svg>
    <h2>No internet connection</h2>
    <p>Connect to Wi-Fi or mobile data, then tap retry to open Homee.</p>
  </div>

  <button onclick="location.reload()">Retry</button>
</body>
</html>`, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
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
