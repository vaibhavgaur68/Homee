/* ═══════════════════════════════════════════════════════
   HOMEE SERVICE WORKER
   Handles: Offline caching · Background sync · Push notifications
   ═══════════════════════════════════════════════════════ */

const CACHE_VERSION = 'homee-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const FONT_CACHE = `${CACHE_VERSION}-fonts`;

// Files to cache on install (app shell)
const STATIC_ASSETS = [
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// External resources to cache (Google Fonts, CDN)
const EXTERNAL_ASSETS = [
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

// ── INSTALL: cache static shell ──────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('[SW] Caching app shell');
      // Cache static assets, don't fail if some are missing
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Could not cache:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: clean old caches ───────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('homee-') && k !== STATIC_CACHE && k !== DYNAMIC_CACHE && k !== FONT_CACHE)
          .map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: network-first for API, cache-first for assets ─
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension requests
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Supabase API → network-first, no cache (auth/data must be fresh)
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(networkFirst(request, null));
    return;
  }

  // Google Fonts → cache-first (stable external resource)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  // Supabase JS CDN → cache-first
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // App shell (HTML) → network-first, fallback to cache
  if (url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(networkFirst(request, STATIC_CACHE));
    return;
  }

  // Other local assets → cache-first
  event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
});

// ── STRATEGY: Network-first with cache fallback ──────────
async function networkFirst(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (cacheName && networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    if (cacheName) {
      const cached = await caches.match(request);
      if (cached) return cached;
    }
    // If HTML fetch fails and we have the app shell, return it
    if (request.destination === 'document') {
      const appShell = await caches.match('/index.html');
      if (appShell) return appShell;
    }
    return new Response('Offline — please check your connection', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// ── STRATEGY: Cache-first with network fallback ──────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok && cacheName) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    return new Response('Resource unavailable offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// ── PUSH NOTIFICATIONS ───────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'Homee', body: 'Time to log your expenses!', icon: '/icons/icon-192.png' };

  if (event.data) {
    try { data = { ...data, ...event.data.json() }; } catch (e) {}
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: data.tag || 'homee-notification',
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: data.url || '/index.html' },
    actions: [
      { action: 'add', title: '+ Add Expense' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ── NOTIFICATION CLICK ───────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();

  let targetUrl = '/index.html';
  if (event.action === 'add') {
    targetUrl = '/index.html?action=add';
  } else if (event.notification.data?.url) {
    targetUrl = event.notification.data.url;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ action: 'notification-click', url: targetUrl });
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// ── BACKGROUND SYNC ──────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-expenses') {
    event.waitUntil(syncPendingExpenses());
  }
});

async function syncPendingExpenses() {
  // Notify all open clients to retry syncing
  const allClients = await clients.matchAll({ type: 'window' });
  allClients.forEach(client => client.postMessage({ action: 'sync-expenses' }));
}

// ── MESSAGE HANDLER ──────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.action === 'skip-waiting') {
    self.skipWaiting();
  }
  if (event.data?.action === 'schedule-reminder') {
    // Used for scheduling daily reminders via the client
    scheduleLocalReminder(event.data);
  }
});

function scheduleLocalReminder(data) {
  // Reminders are scheduled from the client side via the Notification API
  // This handler is a relay point for future push subscription setup
  console.log('[SW] Reminder scheduled:', data);
}
