import { icon } from "./icons.js";
import { addRoute, navigate, setNotFound, start } from "./router.js";
import { getFavorites, getLastLocation, getTheme, setTheme } from "./storage.js";
import { emptyState } from "./ui.js";
import { parseLocation } from "./utils.js";
import { renderExplore } from "./views/explore.js";
import { renderFavorites } from "./views/favorites.js";
import { renderHome } from "./views/home.js";
import { renderSpecies } from "./views/species.js";

function applyTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  if (persist) setTheme(theme);

  const themeIcon = document.querySelector("[data-theme-icon]");
  if (themeIcon) themeIcon.innerHTML = icon(theme === "dark" ? "sun" : "moon", { size: 20 });

  const toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  }

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#101713" : "#1F5E4B");
}

function getRepoUrl() {
  if (window.location.hostname.endsWith(".github.io")) {
    const owner = window.location.hostname.split(".")[0];
    const repo = window.location.pathname.split("/").filter(Boolean)[0] || "birdscope";
    return `https://github.com/${owner}/${repo}`;
  }
  return "https://github.com/";
}

function updateFavoritesCount() {
  const badge = document.getElementById("favorites-count");
  if (!badge) return;
  const count = getFavorites().length;
  badge.textContent = String(count);
  badge.hidden = count === 0;
  
  // Update app badge (Badging API)
  updateAppBadge(count);
}

async function updateAppBadge(count) {
  if ('setAppBadge' in navigator) {
    try {
      if (count > 0) {
        await navigator.setAppBadge(count);
      } else {
        await navigator.clearAppBadge();
      }
    } catch (e) {
      console.log('Badging API error:', e);
    }
  }
}

function renderNotFound(container) {
  document.title = "Lost in the reeds — BirdScope";
  container.innerHTML = `
    <div class="container" style="padding:64px 0 90px">
      ${emptyState({
        iconName: "compass",
        title: "Lost in the reeds",
        text: "This trail does not lead anywhere. Head back to the field guide and start with a place.",
        action: `<a class="btn btn-primary" href="#/">Back to BirdScope</a>`,
      })}
    </div>`;
}

function handleShareTarget() {
  // Handle share target: /explore?title=...&text=...&url=...
  const urlParams = new URLSearchParams(window.location.search);
  const title = urlParams.get("title") || urlParams.get("name") || "";
  const text = urlParams.get("text") || urlParams.get("q") || "";
  const sharedUrl = urlParams.get("url") || "";

  const query = text || title || sharedUrl;
  if (query) {
    // Pre-fill the search and navigate to explore
    setTimeout(() => {
      navigate("/explore", { name: query });
    }, 0);
  }
}

function handleProtocolHandler() {
  // Handle web+birdscope: protocol
  const hash = window.location.hash;
  if (hash.startsWith("#/explore")) {
    const location = parseLocation(new URLSearchParams(hash.split("?")[1] || ""));
    if (location) {
      navigate("/explore", location);
    }
  }
}

function handleFileLaunch(files) {
  // Handle files launched via file_handlers
  files.forEach(file => {
    if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
      handleCSVFile(file);
    } else if (file.type === 'application/json' || file.name.endsWith('.json')) {
      handleJSONFile(file);
    }
  });
}

async function handleCSVFile(file) {
  const text = await file.text();
  const lines = text.trim().split('\n');
  // Parse CSV for location data
  // Expected format: name,lat,lng,radius
  if (lines.length > 1) {
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const nameIdx = headers.indexOf('name');
    const latIdx = headers.indexOf('lat');
    const lngIdx = headers.indexOf('lng');
    const radiusIdx = headers.indexOf('radius');
    
    if (nameIdx >= 0 && latIdx >= 0 && lngIdx >= 0) {
      const data = lines[1].split(',').map(d => d.trim());
      const location = {
        name: data[nameIdx],
        lat: parseFloat(data[latIdx]),
        lng: parseFloat(data[lngIdx]),
        radius: radiusIdx >= 0 ? parseInt(data[radiusIdx]) : 25
      };
      if (!isNaN(location.lat) && !isNaN(location.lng)) {
        navigate("/explore", location);
        return;
      }
    }
  }
  // Fallback: show toast
  console.log('CSV import failed, invalid format');
}

async function handleJSONFile(file) {
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    // Expected format: { name, lat, lng, radius }
    if (data.name && typeof data.lat === 'number' && typeof data.lng === 'number') {
      navigate("/explore", {
        name: data.name,
        lat: data.lat,
        lng: data.lng,
        radius: data.radius || 25
      });
    }
  } catch (e) {
    console.log('JSON import failed:', e);
  }
}

async function registerPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push notifications not supported');
    return;
  }
  
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        'YOUR_VAPID_PUBLIC_KEY_HERE' // Replace with actual VAPID key for production
      )
    });
    console.log('Push subscription:', subscription);
    // Send subscription to backend
  } catch (e) {
    console.log('Push registration failed:', e);
  }
}

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

async function registerBackgroundSync() {
  if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register('sync-favorites');
      console.log('Background sync registered');
    } catch (e) {
      console.log('Background sync registration failed:', e);
    }
  }
}

async function registerPeriodicBackgroundSync() {
  if ('serviceWorker' in navigator && 'periodicSync' in window.ServiceWorkerRegistration.prototype) {
    try {
      const registration = await navigator.serviceWorker.ready;
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (status.state === 'granted') {
        await registration.periodicSync.register('update-species-cache', {
          minInterval: 24 * 60 * 60 * 1000
        });
        console.log('Periodic background sync registered');
      }
    } catch (e) {
      console.log('Periodic background sync registration failed:', e);
    }
  }
}

// Listen for messages from service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data.type === 'favorites-synced') {
      console.log('Favorites synced from background');
      updateFavoritesCount();
    }
    if (event.data.type === 'species-cache-updated') {
      console.log('Species cache updated from background');
    }
    if (event.data.type === 'cacheStats') {
      console.log('Cache stats:', event.data.stats);
    }
  });
}

// Window Controls Overlay support
function setupWindowControlsOverlay() {
  if ('windowControlsOverlay' in navigator) {
    navigator.windowControlsOverlay.addEventListener('geometrychange', (event) => {
      const { titlebarAreaRect } = event;
      // Adjust header padding for window controls overlay
      const header = document.querySelector('.site-header');
      if (header && titlebarAreaRect.width > 0) {
        header.style.paddingRight = `${titlebarAreaRect.width + 16}px`;
      }
    });
    
    // Get initial geometry
    const geometry = navigator.windowControlsOverlay.getTitlebarAreaRect();
    if (geometry.width > 0) {
      const header = document.querySelector('.site-header');
      if (header) {
        header.style.paddingRight = `${geometry.width + 16}px`;
      }
    }
  }
}

function init() {
  const storedTheme = getTheme();
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(storedTheme || (systemDark ? "dark" : "light"));

  const themeToggle = document.getElementById("theme-toggle");
  themeToggle?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next, true);
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
    if (!getTheme()) applyTheme(event.matches ? "dark" : "light");
  });

  const githubIcon = document.querySelector("[data-github-icon]");
  if (githubIcon) githubIcon.innerHTML = icon("github", { size: 20 });

  const repoUrl = getRepoUrl();
  const repoLink = document.getElementById("repo-link");
  if (repoLink) repoLink.href = repoUrl;
  const footerRepo = document.getElementById("footer-repo");
  if (footerRepo) footerRepo.href = repoUrl;

  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  document.querySelector("[data-explore-link]")?.addEventListener("click", (event) => {
    const lastLocation = getLastLocation();
    if (!lastLocation) return;
    event.preventDefault();
    navigate("/explore", lastLocation);
  });

  window.addEventListener("bs:favorites-changed", updateFavoritesCount);
  window.addEventListener("storage", (event) => {
    if (event.key === "bs:favorites:v1") updateFavoritesCount();
  });
  updateFavoritesCount();

  // Handle share target and protocol handler on load
  handleShareTarget();
  handleProtocolHandler();

  // Handle file launch
  if (window.launchQueue) {
    window.launchQueue.setConsumer((launchParams) => {
      if (launchParams.files && launchParams.files.length > 0) {
        handleFileLaunch(launchParams.files);
      }
    });
  }

  // Register background sync
  registerBackgroundSync();
  
  // Register periodic background sync
  registerPeriodicBackgroundSync();
  
  // Setup window controls overlay
  setupWindowControlsOverlay();

  // Initialize push notifications (commented out - needs VAPID key)
  // registerPushNotifications();

  addRoute("/", renderHome);
  addRoute("/explore", renderExplore);
  addRoute("/species/:id", renderSpecies);
  addRoute("/favorites", renderFavorites);
  setNotFound(renderNotFound);

  start();
}

init();
