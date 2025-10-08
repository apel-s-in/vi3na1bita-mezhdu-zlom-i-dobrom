const CACHE_NAME = 'album-offline-v1';
self.__offlineMode = false;

// install
self.addEventListener('install', event => {
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  clients.claim();
});

self.addEventListener('message', event => {
  if(event.data && event.data.type === 'CACHE_FILES') {
    addOfflineAssets(event.data.files);
    self.__offlineMode = true;
  }
  if(event.data && event.data.type === 'CLEAR_CACHE') {
    clearOfflineCache();
    self.__offlineMode = false;
  }
});

self.addEventListener('fetch', function(event) {
  if(self.__offlineMode && event.request.method === 'GET') {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache=>cache.match(event.request)).then(resp=>resp||fetch(event.request))
    );
  }
});

async function addOfflineAssets(files) {
  const cache = await caches.open(CACHE_NAME);
  for(let url of files) {
    try {
      await cache.add(url);
    } catch(e){
      // файл не удалось закешировать (например, offline?)
    }
  }
}
async function clearOfflineCache() {
  await caches.delete(CACHE_NAME);
}
