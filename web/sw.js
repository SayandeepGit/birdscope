// BirdScope Service Worker - Cache-first strategy for static assets, network-first for API calls

const CACHE_NAME = 'birdscope-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/404.html',
  '/manifest.json',
  '/assets/logo.svg',
  '/assets/favicon.svg',
  '/assets/bird-placeholder.svg',
  '/css/styles.css',
  '/js/app.js',
  '/js/api.js',
  '/js/icons.js',
  '/js/router.js',
  '/js/storage.js',
  '/js/ui.js',
  '/js/utils.js',
  '/js/components/species-card.js',
  '/js/views/home.js',
  '/js/views/explore.js',
  '/js/views/species.js',
  '/js/views/favorites.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..600&family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..600&display=swap'
];

const API_ORIGINS = [
  'https://api.inaturalist.org',
  'https://geocoding-api.open-meteo.com',
  'https://api.bigdatacloud.net',
  'https://en.wikipedia.org',
  'https://static.inaturalist.org',
  'https://inaturalist-open-data.s3.amazonaws.com',
  'https://{s}.tile.openstreetmap.org'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension, data:, blob: URLs
  if (!url.protocol.startsWith('http')) return;

  // API calls - network first, cache fallback
  const isApiCall = API_ORIGINS.some((origin) => url.origin === origin || url.origin.endsWith(origin.replace('https://', '')));
  if (isApiCall) {
    event.respondWith(networkFirstThenCache(request));
    return;
  }

  // Static assets - cache first
  event.respondWith(cacheFirstThenNetwork(request));
});

async function cacheFirstThenNetwork(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return offline fallback for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    throw new Error('Offline');
  }
}

async function networkFirstThenCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Background sync for favorite changes (optional enhancement)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-favorites') {
    event.waitUntil(syncFavorites());
  }
});

async function syncFavorites() {
  // Could sync localStorage favorites to a backend here if needed
  console.log('Background sync: favorites');
}