const CACHE_NAME = 'orbit-app-v20260720-2';

const APP_SHELL_URLS = [
  './',
  './index.html',
  './privacy.html',
  './manifest.webmanifest',
  './css/style.css?v=20260720-2',
  './js/app.js?v=20260720-2',
  './js/config.js',
  './js/i18n.js',
  './js/pwa.js',
  './js/store.js',
  './js/sync-state.js',
  './js/utils.js',
  './js/components/archives.js',
  './js/components/area-modal.js',
  './js/components/area-page.js',
  './js/components/dashboard.js',
  './js/components/delete-actions.js',
  './js/components/goal-modal.js',
  './js/components/monthly-review.js',
  './js/components/sidebar.js',
  './js/components/sync-conflict-modal.js',
  './js/components/today-page.js',
  './js/services/calendar-api.js',
  './js/services/drive-api.js',
  './js/services/premium-api.js',
  './assets/icons/orbit-icon.svg',
  './assets/icons/orbit-icon-180.png',
  './assets/icons/orbit-icon-192.png',
  './assets/icons/orbit-icon-maskable-192.png',
  './assets/icons/orbit-icon-512.png',
  './assets/icons/orbit-icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request)
      .then(cached => cached || fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }))
  );
});
