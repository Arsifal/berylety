// Service Worker для «Мои поездки»
// Версия кэша. Меняй при каждом обновлении приложения — иначе старые файлы останутся в кэше!
const CACHE_VERSION = 'trips-v4';

// Файлы, которые кэшируем при установке
const URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
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

// Перехват запросов: сначала кэш, потом сеть
self.addEventListener('fetch', (event) => {
  // Не перехватываем запросы к API погоды и геокодингу — они всегда должны идти в сеть
  const url = event.request.url;
  if (url.includes('nominatim.openstreetmap.org') || url.includes('api.open-meteo.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      // Если есть в кэше — отдаём из кэша
      if (cached) return cached;
      // Иначе идём в сеть и кэшируем ответ
      return fetch(event.request).then((response) => {
        // Кэшируем только успешные GET-запросы
        if (response && response.status === 200 && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(() => {
        // Если сети нет и файла нет в кэше — отдаём index.html (для навигации)
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
