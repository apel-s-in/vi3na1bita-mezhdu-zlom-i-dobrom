// Ключ для кэша (обновляйте, если меняется версия!)
const CACHE_NAME = 'album-offline-v1';

// Какие режимы умеем (переменная контролируется страницей)
let offlineAssets = []; // Изменяется из страницы

self.addEventListener('install', event => {
  // Не кэшируем ничего при установке!
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  clients.claim();
});

// Получаем список файлов для оффлайна (от страницы)
self.addEventListener('message', event => {
  if(event.data && event.data.type === 'CACHE_FILES') {
    addOfflineAssets(event.data.files);
  }
  if(event.data && event.data.type === 'CLEAR_CACHE') {
    clearOfflineCache();
  }
});

self.addEventListener('fetch', event => {
  // Если оффлайн-режим — отдаём из кэша
  if(self.__offlineMode && event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then(resp => resp || fetch(event.request))
    );
  }
});

// Фичи для страницы:
async function addOfflineAssets(files) {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(files);
  self.__offlineMode = true;
}
async function clearOfflineCache() {
  await caches.delete(CACHE_NAME);
  self.__offlineMode = false;
}

