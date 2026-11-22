// BirdScope Service Worker - Cache-first strategy for static assets, network-first for API calls
// Works on GitHub Pages subdirectory: https://sayandeepgit.github.io/birdscope/

const CACHE_NAME = 'birdscope-v1';
const BASE_PATH = '/birdscope'; // GitHub Pages repo name

const STATIC_ASSETS = [
  BASE_PATH + '/',
  BASE_PATH + '/index.html',
  BASE_PATH + '/404.html',
  BASE_PATH + '/manifest.json',
  BASE_PATH + '/assets/logo.svg',
  BASE_PATH + '/assets/favicon.svg',
  BASE_PATH + '/assets/bird-placeholder.svg',
  BASE_PATH + '/assets/icons/icon-72.png',
  BASE_PATH + '/assets/icons/icon-96.png',
  BASE_PATH + '/assets/icons/icon-128.png',
  BASE_PATH + '/assets/icons/icon-144.png',
  BASE_PATH + '/assets/icons/icon-152.png',
  BASE_PATH + '/assets/icons/icon-192.png',
  BASE_PATH + '/assets/icons/icon-384.png',
  BASE_PATH + '/assets/icons/icon-512.png',
  BASE_PATH + '/assets/icons/icon-512-maskable.png',
  BASE_PATH + '/css/styles.css',
  BASE_PATH + '/js/app.js',
  BASE_PATH + '/js/api.js',
  BASE_PATH + '/js/icons.js',
  BASE_PATH + '/js/router.js',
  BASE_PATH + '/js/storage.js',
  BASE_PATH + '/js/ui.js',
  BASE_PATH + '/js/utils.js',
  BASE_PATH + '/js/components/species-card.js',
  BASE_PATH + '/js/views/home.js',
  BASE_PATH + '/js/views/explore.js',
  BASE_PATH + '/js/views/species.js',
  BASE_PATH + '/js/views/favorites.js',
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
      return caches.match(BASE_PATH + '/index.html');
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