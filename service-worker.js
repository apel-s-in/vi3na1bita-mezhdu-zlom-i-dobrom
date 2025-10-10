// service-worker.js - v6.3.0
const VERSION = '6.3.0';
const CACHE_NAME = `album-cache-v${VERSION}`;
const OFFLINE_CACHE = 'album-offline-v1';

const CACHE_NAMES = {
  static: CACHE_NAME,
  offline: OFFLINE_CACHE
};

// Паттерны для исключения из кэша
const SKIP_CACHE_PATTERNS = [
  /localStorage/,
  /position_/,
  /sleepTimer/,
  /playerVolume/
];

// Статические ресурсы для кэширования при установке
const STATIC_CACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './config.json',
  './img/logo.png',
  './img/star.png',
  './img/star2.png',
  './Cover.png'
];

let offlineMode = false;

// Установка Service Worker
self.addEventListener('install', event => {
  console.log('[SW] Installing version:', VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching static resources');
      return cache.addAll(STATIC_CACHE_URLS);
    }).then(() => {
      self.skipWaiting();
    })
  );
});

// Активация Service Worker
self.addEventListener('activate', event => {
  console.log('[SW] Activating version:', VERSION);
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== OFFLINE_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      self.clients.claim();
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'CACHE_UPDATED',
            version: VERSION
          });
        });
      });
    })
  );
});

// Обработка fetch запросов
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Не кэшируем локальные данные
  if (SKIP_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    return event.respondWith(fetch(event.request));
  }
  
  // Обработка Range запросов для аудио
  if (event.request.headers.get('range')) {
    return event.respondWith(handleRangeRequest(event.request));
  }
  
  // Основная стратегия кэширования
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Возвращаем из кэша
        return cachedResponse;
      }
      
      // Если офлайн режим и нет в кэше - возвращаем ошибку
      if (offlineMode && !navigator.onLine) {
        return new Response('Offline - resource not cached', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      }
      
      // Запрашиваем из сети
      return fetch(event.request).then(response => {
        // Не кэшируем неуспешные ответы
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        
        // Определяем нужно ли кэшировать
        const shouldCache = shouldCacheRequest(event.request);
        
        if (shouldCache) {
          const responseToCache = response.clone();
          caches.open(offlineMode ? OFFLINE_CACHE : CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        
        return response;
      }).catch(error => {
        console.error('[SW] Fetch failed:', error);
        // Можно вернуть fallback страницу если нужно
        return new Response('Network error', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      });
    })
  );
});

// Обработка Range запросов для аудио
async function handleRangeRequest(request) {
  try {
    const cache = await caches.open(offlineMode ? OFFLINE_CACHE : CACHE_NAME);
    const cachedResponse = await cache.match(request, { ignoreVary: true });
    
    if (!cachedResponse) {
      // Если нет в кэше, пробуем загрузить
      if (!navigator.onLine && offlineMode) {
        return new Response('Offline - audio not cached', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      }
      return fetch(request);
    }
    
    const rangeHeader = request.headers.get('range');
    if (!rangeHeader) {
      return cachedResponse;
    }
    
    const fullBlob = await cachedResponse.blob();
    const fullSize = fullBlob.size;
    
    const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (!rangeMatch) {
      return cachedResponse;
    }
    
    const start = parseInt(rangeMatch[1], 10);
    const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : fullSize - 1;
    
    if (start >= fullSize || end >= fullSize) {
      return new Response('Range Not Satisfiable', {
        status: 416,
        headers: {
          'Content-Range': `bytes */${fullSize}`
        }
      });
    }
    
    const slicedBlob = fullBlob.slice(start, end + 1);
    const slicedResponse = new Response(slicedBlob, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fullSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': (end - start + 1).toString(),
        'Content-Type': cachedResponse.headers.get('Content-Type') || 'audio/mpeg'
      }
    });
    
    return slicedResponse;
  } catch (error) {
    console.error('[SW] Range request error:', error);
    return fetch(request);
  }
}

// Определение нужно ли кэшировать запрос
function shouldCacheRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  // Кэшируем аудио файлы
  if (pathname.includes('/audio/') && pathname.endsWith('.mp3')) {
    return true;
  }
  
  // Кэшируем тексты песен
  if (pathname.includes('/lyrics/')) {
    return true;
  }
  
  // Кэшируем обложки
  if (pathname.includes('Cover') && pathname.match(/\.(png|jpg|jpeg)$/)) {
    return true;
  }
  
  // Кэшируем основные ресурсы
  if (pathname.match(/\.(html|css|js|json)$/)) {
    return true;
  }
  
  // Кэшируем изображения
  if (pathname.includes('/img/') || pathname.includes('/icons/')) {
    return true;
  }
  
  return false;
}

// Обработка сообщений от клиентов
self.addEventListener('message', event => {
  const message = event.data;
  
  switch(message.type) {
    case 'SET_OFFLINE_MODE':
      offlineMode = message.value;
      console.log('[SW] Offline mode:', offlineMode);
      break;
      
    case 'CACHE_FILES':
      cacheFiles(message.files, message.offlineMode);
      break;
      
    case 'CLEAR_CACHE':
      clearOfflineCache();
      offlineMode = false;
      break;
      
    case 'REQUEST_OFFLINE_STATE':
      event.source.postMessage({
        type: 'OFFLINE_STATE',
        value: offlineMode
      });
      break;
      
    case 'CLEANUP_OLD_DATA':
      // Отправляем сообщение клиентам для очистки localStorage
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'CLEANUP_POSITIONS',
            timestamp: Date.now()
          });
        });
      });
      break;
  }
});

// Кэширование файлов для офлайн режима
async function cacheFiles(files, setOfflineMode) {
  try {
    const cache = await caches.open(OFFLINE_CACHE);
    const promises = [];
    
    for (const file of files) {
      const request = new Request(file);
      promises.push(
        cache.match(request).then(response => {
          if (!response) {
            return fetch(request).then(fetchResponse => {
              if (fetchResponse.ok) {
                return cache.put(request, fetchResponse);
              }
            });
          }
        })
      );
    }
    
    await Promise.all(promises);
    
    if (setOfflineMode) {
      offlineMode = true;
    }
    
    console.log('[SW] Files cached for offline');
  } catch (error) {
    console.error('[SW] Error caching files:', error);
  }
}

// Очистка офлайн кэша
async function clearOfflineCache() {
  try {
    await caches.delete(OFFLINE_CACHE);
    console.log('[SW] Offline cache cleared');
  } catch (error) {
    console.error('[SW] Error clearing cache:', error);
  }
}

// Периодическая очистка устаревших позиций (каждый час)
setInterval(() => {
  self.clients.matchAll().then(clients => {
    if (clients.length > 0) {
      clients.forEach(client => {
        client.postMessage({
          type: 'CLEANUP_POSITIONS',
          timestamp: Date.now()
        });
      });
    }
  });
}, 3600000); // 1 час

console.log('[SW] Service Worker v' + VERSION + ' loaded');
