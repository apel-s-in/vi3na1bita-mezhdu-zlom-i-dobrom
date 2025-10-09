// service-worker.js v6.0.0
const VERSION = '6.0.0';
const CACHE_PREFIX = 'vitrina-razbita';
const CACHE_NAMES = {
  static: `${CACHE_PREFIX}-static-v${VERSION}`,
  dynamic: `${CACHE_PREFIX}-dynamic-v${VERSION}`,
  audio: `${CACHE_PREFIX}-audio-v1`
};

// Файлы для прекеширования (оболочка приложения)
const APP_SHELL_FILES = [
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
];

// Состояние offline режима (восстанавливается из IndexedDB)
let offlineMode = false;

// IndexedDB для хранения состояния
const StateDB = {
  async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('AppState', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('state')) {
          db.createObjectStore('state');
        }
      };
    });
  },
  
  async get(key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['state'], 'readonly');
      const store = transaction.objectStore('state');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  async set(key, value) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['state'], 'readwrite');
      const store = transaction.objectStore('state');
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
};

// Установка - прекеширование оболочки
self.addEventListener('install', event => {
  console.log('[SW] Installing version:', VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAMES.static)
      .then(cache => {
        console.log('[SW] Precaching app shell');
        return Promise.allSettled(
          APP_SHELL_FILES.map(url => {
            return cache.add(url).catch(err => {
              console.warn(`[SW] Failed to cache ${url}:`, err);
              return Promise.resolve();
            });
          })
        );
      })
      .then(() => {
        console.log('[SW] App shell cached successfully');
        return self.skipWaiting();
      })
  );
});

// Активация - очистка старых кешей
self.addEventListener('activate', event => {
  console.log('[SW] Activating version:', VERSION);
  
  event.waitUntil(
    (async () => {
      // Очищаем старые кеши
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(cacheName => {
          if (!Object.values(CACHE_NAMES).includes(cacheName) && 
              !cacheName.includes('album-offline')) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
      
      // Берём контроль над клиентами
      await clients.claim();
      
      // Восстанавливаем состояние offline
      try {
        offlineMode = await StateDB.get('offlineMode') || false;
        console.log('[SW] Restored offline mode:', offlineMode);
      } catch (e) {
        console.log('[SW] No saved offline state');
      }
      
      // Уведомляем клиентов об обновлении
      const allClients = await clients.matchAll();
      allClients.forEach(client => {
        client.postMessage({
          type: 'CACHE_UPDATED',
          version: VERSION
        });
      });
    })()
  );
});

// Обработка Range-запросов для аудио
async function handleRangeRequest(request, cachedResponse) {
  const rangeHeader = request.headers.get('range');
  
  if (!rangeHeader) {
    return cachedResponse;
  }
  
  const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  if (!rangeMatch) {
    return cachedResponse;
  }
  
  const blob = await cachedResponse.blob();
  const fullSize = blob.size;
  
  const start = parseInt(rangeMatch[1], 10);
  const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : fullSize - 1;
  
  if (start >= fullSize || end >= fullSize) {
    return new Response('Range Not Satisfiable', {
      status: 416,
      statusText: 'Range Not Satisfiable',
      headers: {
        'Content-Range': `bytes */${fullSize}`
      }
    });
  }
  
  const slicedBlob = blob.slice(start, end + 1);
  
  const headers = new Headers({
    'Content-Type': cachedResponse.headers.get('Content-Type') || 'audio/mpeg',
    'Content-Length': String(slicedBlob.size),
    'Content-Range': `bytes ${start}-${end}/${fullSize}`,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache'
  });
  
  return new Response(slicedBlob, {
    status: 206,
    statusText: 'Partial Content',
    headers: headers
  });
}

// Проверка является ли запрос аудио файлом
function isAudioRequest(url) {
  const audioExtensions = ['.mp3', '.m4a', '.ogg', '.wav', '.aac'];
  return audioExtensions.some(ext => url.toLowerCase().includes(ext));
}

// Стратегии кеширования
const CACHE_STRATEGIES = {
  cacheFirst: async (request) => {
    const cached = await caches.match(request);
    if (cached) {
      console.log('[SW] Cache hit:', request.url);
      return cached;
    }
    
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAMES.static);
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      console.error('[SW] Fetch failed:', error);
      return new Response('Offline', { status: 503 });
    }
  },
  
  networkFirst: async (request) => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAMES.dynamic);
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) {
        console.log('[SW] Offline, using cache:', request.url);
        return cached;
      }
      return new Response('Network error', { status: 503 });
    }
  }
};

// Обработка fetch событий
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Игнорируем не-GET запросы
  if (request.method !== 'GET') {
    return;
  }
  
  // Специальная обработка для аудио файлов
  if (isAudioRequest(url.pathname)) {
    event.respondWith(
      (async () => {
        // Проверяем кеши
        let cachedResponse = await caches.match(request.url, { ignoreSearch: true });
        
        // Проверяем также в offline кеше
        if (!cachedResponse) {
          const offlineCache = await caches.open('album-offline-v1');
          cachedResponse = await offlineCache.match(request.url, { ignoreSearch: true });
        }
        
        if (cachedResponse) {
          // Обрабатываем Range запрос если есть
          const rangeHeader = request.headers.get('range');
          if (rangeHeader) {
            return handleRangeRequest(request, cachedResponse);
          }
          return cachedResponse;
        }
        
        // Если offline режим и нет в кеше - ошибка
        if (offlineMode) {
          return new Response('Audio not cached for offline use', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        }
        
        // Загружаем из сети
        try {
          const networkResponse = await fetch(request);
          
          // Кешируем только успешные полные ответы
          if (networkResponse.ok && networkResponse.status === 200 && !request.headers.get('range')) {
            const cache = await caches.open(CACHE_NAMES.audio);
            await cache.put(request.url, networkResponse.clone());
          }
          
          return networkResponse;
        } catch (error) {
          return new Response('Network error', { status: 503 });
        }
      })()
    );
    return;
  }
  
  // Определяем стратегию для остальных запросов
  let strategy;
  
  // Для статических файлов оболочки - Cache First
  if (APP_SHELL_FILES.some(file => url.pathname.endsWith(file.replace('./', '')))) {
    strategy = CACHE_STRATEGIES.cacheFirst;
  }
  // Для API и JSON - Network First
  else if (url.pathname.includes('/api/') || url.pathname.includes('.json')) {
    strategy = CACHE_STRATEGIES.networkFirst;
  }
  // Для изображений - Cache First
  else if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url.pathname)) {
    strategy = CACHE_STRATEGIES.cacheFirst;
  }
  // По умолчанию - Cache First
  else {
    strategy = CACHE_STRATEGIES.cacheFirst;
  }
  
  event.respondWith(strategy(request));
});

// Обработка сообщений от клиентов
self.addEventListener('message', async event => {
  console.log('[SW] Received message:', event.data.type);
  
  if (event.data.type === 'SET_OFFLINE_MODE') {
    offlineMode = event.data.value;
    await StateDB.set('offlineMode', offlineMode);
    console.log('[SW] Offline mode set to:', offlineMode);
  }
  
  if (event.data.type === 'CACHE_FILES') {
    const files = event.data.files || [];
    offlineMode = event.data.offlineMode !== undefined ? event.data.offlineMode : true;
    await StateDB.set('offlineMode', offlineMode);
    
    const cache = await caches.open('album-offline-v1');
    let cached = 0;
    
    for (const file of files) {
      try {
        const response = await fetch(file);
        if (response.ok) {
          await cache.put(file, response);
          cached++;
        }
      } catch (error) {
        console.error(`[SW] Failed to cache ${file}:`, error);
      }
    }
    
    console.log(`[SW] Cached ${cached}/${files.length} files`);
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    offlineMode = event.data.offlineMode !== undefined ? event.data.offlineMode : false;
    await StateDB.set('offlineMode', offlineMode);
    
    await caches.delete('album-offline-v1');
    console.log('[SW] Offline cache cleared');
  }
  
  if (event.data.type === 'REQUEST_OFFLINE_STATE' && event.ports[0]) {
    event.ports[0].postMessage({ offlineMode });
  }
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Периодическая синхронизация (если поддерживается)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'update-check') {
    event.waitUntil(checkForUpdates());
  }
});

async function checkForUpdates() {
  console.log('[SW] Checking for updates...');
  // Здесь можно добавить логику проверки обновлений
}
