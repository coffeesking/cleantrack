// ============================================================
// SERVICE WORKER
// Caches app shell for offline-first experience.
// Data still requires network (Supabase).
// ============================================================

const CACHE_NAME = 'cleantrack-v1';

const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/auth.js',
  '/db.js',
  '/translations.js',
  '/supabase-config.js',
  '/manifest.json',
];

// Install: cache app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for app shell, network-first for API
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip Supabase and external API calls
  if (url.hostname.includes('supabase') || url.hostname.includes('anthropic')) {
    return;
  }

  // Cache-first for app shell assets
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
