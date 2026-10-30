const VERSION = 'planner-pwa-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// Network-only by design. For same-origin app shell/code, bypass the HTTP cache
// so installed Android shortcuts/PWAs pick up login and access fixes promptly.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin) {
    const freshRequest = new Request(event.request, { cache: 'no-store' });
    event.respondWith(fetch(freshRequest));
    return;
  }
  event.respondWith(fetch(event.request));
});
