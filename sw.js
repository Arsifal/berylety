// Service Worker для «Мои поездки»
// Версия кэша. Меняй при каждом обновлении приложения — иначе старые файлы останутся в кэше!
const CACHE_VERSION = 'trips-v41';

// Файлы, которые кэшируем при установке
const URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Установка: кэшируем всё
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(URLS);
    }).then(() => self.skipWaiting())
  );
});

// Активация: удаляем старые версии кэша
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Перехват запросов
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  if (url.startsWith('chrome-extension://') || url.startsWith('moz-extension://') || url.startsWith('safari-extension://')) {
    return;
  }

  if (url.includes('nominatim.openstreetmap.org') || url.includes('api.open-meteo.com')) {
    return;
  }

  // HTML-навигация — network-first, чтобы всегда получать свежий index.html
  const isHtml = event.request.mode === 'navigate'
    || ((event.request.headers.get('accept') || '').includes('text/html'));

  if (isHtml) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        return caches.match(event.request).then((c) => c || caches.match('./index.html'));
      })
    );
    return;
  }

  // Остальное — cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
