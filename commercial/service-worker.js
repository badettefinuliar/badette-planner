const VERSION = 'planner-pwa-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// Intentionally network-only. Buyer access and planner authorization must always
// use the live app/Firebase flow; this service worker exists for installability
// and does not cache authenticated data or stale access states.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request));
});
