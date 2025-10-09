// service-worker.js v6.2.0
const VERSION = '6.2.0';
const BUILD_DATE = '2025-01-16';
const CACHE_PREFIX = 'vitrina-razbita';
const CACHE_NAMES = {
  static: `${CACHE_PREFIX}-static-v${VERSION}`,
  dynamic: `${CACHE_PREFIX}-dynamic-v${VERSION}`,
  audio: `${CACHE_PREFIX}-audio-v1`
};

// При установке логируем версию
self.addEventListener('install', event => {
  console.log(`[SW] Installing version: ${VERSION} (${BUILD_DATE})`);
  event.waitUntil(
    caches.open(CACHE_NAMES.static).then(cache => {
      return cache.addAll([
        './',
        './index.html',
        './manifest.json',
        './config.json',
        './img/logo.png',
        './img/star.png',
        './img/star2.png',
        './Cover.png',
        './Cover01.png',
        './Cover02.png',
        './Cover03.png',
        './icons/icon-192.png',
        './icons/icon-512.png'
      ]);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log(`[SW] Activating version: ${VERSION}`);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName.startsWith(CACHE_PREFIX) && 
              !Object.values(CACHE_NAMES).includes(cacheName)) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Обработка fetch запросов
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Обработка Range запросов для аудио
  if (event.request.headers.has('range')) {
    event.respondWith(handleRangeRequest(event.request));
    return;
  }
  
  // Стратегия Cache First для статики
  if (url.pathname.match(/\.(png|jpg|jpeg|gif|ico|css|js|json)$/)) {
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request).then(fetchResponse => {
          return caches.open(CACHE_NAMES.static).then(cache => {
            cache.put(event.request, fetchResponse.clone());
            return fetchResponse;
          });
        });
      })
    );
    return;
  }
  
  // Стратегия Cache First для аудио
  if (url.pathname.match(/\.(mp3|m4a|ogg|wav)$/)) {
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request).then(fetchResponse => {
          return caches.open(CACHE_NAMES.audio).then(cache => {
            cache.put(event.request, fetchResponse.clone());
            return fetchResponse;
          });
        });
      })
    );
    return;
  }
  
  // Network First для остальных запросов
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

// Обработка Range запросов
async function handleRangeRequest(request) {
  const cache = await caches.open(CACHE_NAMES.audio);
  const cachedResponse = await cache.match(request.url);
  
  if (!cachedResponse) {
    return fetch(request);
  }
  
  const rangeHeader = request.headers.get('range');
  const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  
  if (!match) {
    return cachedResponse;
  }
  
  const pos = Number(match[1]);
  const end = match[2] ? Number(match[2]) : null;
  
  const blob = await cachedResponse.blob();
  const size = blob.size;
  const actualEnd = end !== null ? Math.min(end, size - 1) : size - 1;
  const chunkSize = actualEnd - pos + 1;
  
  const slice = blob.slice(pos, pos + chunkSize);
  
  return new Response(slice, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Range': `bytes ${pos}-${actualEnd}/${size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'audio/mpeg'
    }
  });
}

// Обработка сообщений от клиента
self.addEventListener('message', event => {
  if (event.data.type === 'CACHE_FILES') {
    cacheFiles(event.data.files);
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    clearAllCaches();
  }
  
  if (event.data.type === 'SET_OFFLINE_MODE') {
    // Сохраняем состояние offline режима
    self.offlineMode = event.data.value;
  }
});

async function cacheFiles(files) {
  const cache = await caches.open(CACHE_NAMES.audio);
  for (const file of files) {
    try {
      const response = await fetch(file);
      await cache.put(file, response);
    } catch (e) {
      console.error('[SW] Failed to cache:', file, e);
    }
  }
}

async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.map(name => caches.delete(name))
  );
  console.log('[SW] All caches cleared');
}
