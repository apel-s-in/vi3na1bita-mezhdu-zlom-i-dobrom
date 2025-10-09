const CACHE_NAME = 'album-offline-v1';
self.__offlineMode = false;
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { clients.claim(); });
self.addEventListener('message', e => {
  if(e.data && e.data.type === 'CACHE_FILES'){ addOfflineAssets(e.data.files); self.__offlineMode=true; }
  if(e.data && e.data.type === 'CLEAR_CACHE'){ clearOfflineCache(); self.__offlineMode=false; }
});
self.addEventListener('fetch', function(event) {
  if(self.__offlineMode && event.request.method === 'GET') {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => cache.match(event.request)).then(resp => resp || fetch(event.request))
    );
  }
});
async function addOfflineAssets(files) {
  const cache = await caches.open(CACHE_NAME);
  for(let url of files) { try { await cache.add(url); } catch(e){} }
}
async function clearOfflineCache() { await caches.delete(CACHE_NAME);}

