const CACHE_NAME = 'conecta-bahia-v4';

const STATIC_ASSETS = [
  '/BA_(1)9396399957704198.json',
  '/img/LogoConecta.png',
  '/img/MARCA%20GOVBA%200126%20-%20DO%20LADO%20DA%20GENTE__H.png',
];

const DATA_URLS = [
  'https://conectabahia.pages.dev/api/sharepoint',
];

self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Service Worker...');
  
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cache aberto, adicionando assets estáticos');
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })));
    }).catch((err) => {
      console.warn('[SW] Erro ao cachear assets estáticos:', err);
    })
  );
  
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando Service Worker...');
  
  event.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Removendo cache antigo:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    if (url.pathname.includes('/api/')) {
      console.log('[SW] 🚫 Modo DEV: bypass total para:', url.pathname);
      event.respondWith(fetch(request));
      return;
    }
  }
  
  if (DATA_URLS.some(dataUrl => url.pathname.includes(dataUrl))) {
    event.respondWith(fetch(new Request(request, { cache: 'no-store' })));
    return;
  }
  
  if (STATIC_ASSETS.some(asset => url.pathname === asset || url.pathname.endsWith(asset))) {
    event.respondWith(
      cacheFirst(request, CACHE_NAME)
    );
    return;
  }
  
  event.respondWith(
    networkFirst(request, CACHE_NAME)
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    console.log('[SW] Cache HIT:', request.url);
    return cachedResponse;
  }
  
  console.log('[SW] Cache MISS, buscando da rede:', request.url);
  const networkResponse = await fetch(request);
  
  if (networkResponse && networkResponse.status === 200) {
    cache.put(request, networkResponse.clone());
  }
  
  return networkResponse;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (err) {
    console.warn('[SW] Rede falhou, tentando cache:', request.url);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    throw err;
  }
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      }).then(() => {
        console.log('[SW] Todos os caches limpos');
      })
    );
  }
});
