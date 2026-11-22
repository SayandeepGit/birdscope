// BirdScope Service Worker - Cache-first strategy for static assets, network-first for API calls
// Works on GitHub Pages subdirectory: https://sayandeepgit.github.io/birdscope/

const CACHE_NAME = 'birdscope-v1';
const BASE_PATH = '/birdscope'; // GitHub Pages repo name
const MAX_CACHE_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const CACHE_STRATEGIES = {
  STATIC: 'cache-first',
  API: 'network-first',
  IMAGES: 'cache-first',
  FONTS: 'cache-first'
};

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

const IMAGE_ORIGINS = [
  'https://static.inaturalist.org',
  'https://inaturalist-open-data.s3.amazonaws.com',
  'https://{s}.tile.openstreetmap.org'
];

const FONT_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com'
];

// Offline fallback page
const OFFLINE_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BirdScope - Offline</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #F6F1E7; color: #1D2A23; 
           display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
    .card { max-width: 400px; padding: 40px; text-align: center; background: #FFFDF8; 
            border-radius: 24px; box-shadow: 0 24px 70px rgba(35,48,40,0.12); }
    h1 { font-family: Georgia, serif; font-size: 2rem; margin: 0 0 12px; }
    p { color: #5C6B62; line-height: 1.6; }
    button { margin-top: 20px; padding: 12px 24px; background: #1F5E4B; color: #FFFDF8; 
             border: none; border-radius: 999px; font-weight: 650; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🐦 You're Offline</h1>
    <p>BirdScope works offline for cached content. Connect to search new locations or load fresh data.</p>
    <button onclick="window.location.reload()">Try Again</button>
  </div>
</body>
</html>
`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      cache.put(new Request(BASE_PATH + '/offline.html'), new Response(OFFLINE_HTML, {
        headers: { 'Content-Type': 'text/html' }
      }));
      return cache.addAll(STATIC_ASSETS);
    })
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
  
  // Register background sync
  registerBackgroundSync();
  
  // Register periodic background sync
  registerPeriodicBackgroundSync();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension, data:, blob: URLs
  if (!url.protocol.startsWith('http')) return;

  // Determine cache strategy
  const isApiCall = API_ORIGINS.some((origin) => url.origin === origin || url.origin.endsWith(origin.replace('https://', '')));
  const isImage = IMAGE_ORIGINS.some((origin) => url.origin === origin || url.origin.endsWith(origin.replace('https://', '')));
  const isFont = FONT_ORIGINS.some((origin) => url.origin === origin);

  if (isApiCall) {
    event.respondWith(networkFirstThenCache(request));
    return;
  }

  if (isImage) {
    event.respondWith(cacheFirstThenNetwork(request, 'images'));
    return;
  }

  if (isFont) {
    event.respondWith(cacheFirstThenNetwork(request, 'fonts'));
    return;
  }

  // Static assets - cache first
  event.respondWith(cacheFirstThenNetwork(request, 'static'));
});

async function cacheFirstThenNetwork(request, cacheType = 'static') {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      const responseToCache = response.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cached-at', Date.now().toString());
      headers.set('sw-cache-type', cacheType);
      const cachedResponse = new Response(await responseToCache.blob(), {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers
      });
      cache.put(request, cachedResponse);
    }
    return response;
  } catch {
    // Return offline fallback for navigation requests
    if (request.mode === 'navigate') {
      return caches.match(BASE_PATH + '/offline.html');
    }
    // For images, return placeholder
    if (request.destination === 'image') {
      return caches.match(BASE_PATH + '/assets/bird-placeholder.svg');
    }
    throw new Error('Offline');
  }
}

async function networkFirstThenCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      const responseToCache = response.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cached-at', Date.now().toString());
      headers.set('sw-cache-type', 'api');
      const cachedResponse = new Response(await responseToCache.blob(), {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers
      });
      cache.put(request, cachedResponse);
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      const cachedAt = cached.headers.get('sw-cached-at');
      if (cachedAt && Date.now() - parseInt(cachedAt) > MAX_CACHE_AGE) {
        const response = new Response(await cached.blob(), {
          status: cached.status,
          statusText: cached.statusText,
          headers: cached.headers
        });
        response.headers.set('x-cache-warning', 'stale');
        return response;
      }
      return cached;
    }
    return new Response(JSON.stringify({ error: 'Offline', cached: false }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Background sync registration
async function registerBackgroundSync() {
  if ('sync' in self.registration) {
    try {
      await self.registration.sync.register('sync-favorites');
      console.log('Background sync registered: sync-favorites');
    } catch (err) {
      console.log('Background sync registration failed:', err);
    }
  }
}

// Periodic background sync registration
async function registerPeriodicBackgroundSync() {
  if ('periodicSync' in self.registration) {
    try {
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (status.state === 'granted') {
        await self.registration.periodicSync.register('update-species-cache', {
          minInterval: 24 * 60 * 60 * 1000 // 24 hours
        });
        console.log('Periodic background sync registered: update-species-cache');
      }
    } catch (err) {
      console.log('Periodic background sync registration failed:', err);
    }
  }
}

// Background sync for favorite changes
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-favorites') {
    event.waitUntil(syncFavorites());
  }
});

async function syncFavorites() {
  // Could sync localStorage favorites to a backend here if needed
  console.log('Background sync: favorites');
  // Notify clients
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({ type: 'favorites-synced' }));
}

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-species-cache') {
    event.waitUntil(updateSpeciesCache());
  }
});

async function updateSpeciesCache() {
  console.log('Periodic sync: updating species cache');
  // Pre-fetch popular locations
  const popularLocations = [
    { lat: 22.56263, lng: 88.36304, name: 'Kolkata' },
    { lat: 47.60621, lng: -122.33207, name: 'Seattle' },
    { lat: 51.5074, lng: -0.1278, name: 'London' }
  ];
  
  for (const loc of popularLocations) {
    try {
      await fetch(`https://api.inaturalist.org/v1/observations/species_counts?lat=${loc.lat}&lng=${loc.lng}&radius=25&taxon_id=3&quality_grade=research&per_page=10&order=desc&order_by=count`);
    } catch (e) {
      console.log('Pre-fetch failed for', loc.name, e);
    }
  }
  
  // Notify clients
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({ type: 'species-cache-updated' }));
}

// Push notification handling
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  const options = {
    body: data.body || 'New bird sighting near you!',
    icon: BASE_PATH + '/assets/icons/icon-192.png',
    badge: BASE_PATH + '/assets/icons/icon-72.png',
    vibrate: [100, 50, 100],
    data: data.data || {},
    actions: [
      { action: 'open', title: 'Open BirdScope' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    requireInteraction: true,
    tag: 'birdscope-notification'
  };
  event.waitUntil(self.registration.showNotification(data.title || 'BirdScope', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    event.waitUntil(clients.openWindow(BASE_PATH + '/'));
  }
});

self.addEventListener('notificationclose', (event) => {
  console.log('Notification closed:', event.notification.tag);
});

// Message handling for cache management and client communication
self.addEventListener('message', (event) => {
  if (!event.data) return;
  
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  
  if (event.data === 'clearCache') {
    event.waitUntil(caches.delete(CACHE_NAME));
  }
  
  if (event.data === 'getCacheStats') {
    getCacheStats().then(stats => {
      event.ports[0].postMessage({ type: 'cacheStats', stats });
    });
  }
  
  if (event.data === 'registerSync') {
    registerBackgroundSync().then(() => {
      event.ports[0].postMessage({ type: 'syncRegistered' });
    });
  }
  
  if (event.data === 'requestNotificationPermission') {
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(event.data.vapidKey)
    }).then(subscription => {
      event.ports[0].postMessage({ type: 'pushSubscription', subscription });
    }).catch(err => {
      event.ports[0].postMessage({ type: 'pushError', error: err.message });
    });
  }
});

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getCacheStats() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  let totalSize = 0;
  for (const request of keys) {
    const response = await cache.match(request);
    if (response) {
      const blob = await response.blob();
      totalSize += blob.size;
    }
  }
  return { count: keys.length, size: totalSize };
}

// File handling support (for file_handlers in manifest)
self.addEventListener('filehandler', (event) => {
  event.files.forEach(file => {
    console.log('File handler received:', file.name, file.type);
    // Could process CSV/JSON files with bird data here
  });
});

// Window controls overlay support
self.addEventListener('windowcontrolsoverlay', (event) => {
  // Handle window controls overlay geometry changes
  console.log('Window controls overlay geometry:', event.geometry);
});

console.log('BirdScope Service Worker v2 loaded - Full PWA capabilities enabled');