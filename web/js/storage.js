const FAVORITES_KEY = "bs:favorites:v1";
const THEME_KEY = "bs:theme";
const RECENT_KEY = "bs:recent-locations:v1";
const LAST_KEY = "bs:last-location:v1";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* localStorage may be unavailable or full */
  }
}

function notifyFavorites() {
  window.dispatchEvent(new CustomEvent("bs:favorites-changed"));
}

export function getFavorites() {
  const favorites = read(FAVORITES_KEY, []);
  return Array.isArray(favorites) ? favorites : [];
}

export function isFavorite(id) {
  const numericId = Number(id);
  return getFavorites().some((favorite) => Number(favorite.id) === numericId);
}

export function toggleFavorite(species, location = null) {
  const numericId = Number(species.id);
  const favorites = getFavorites();
  const index = favorites.findIndex((favorite) => Number(favorite.id) === numericId);

  if (index >= 0) {
    favorites.splice(index, 1);
    write(FAVORITES_KEY, favorites);
    notifyFavorites();
    return false;
  }

  favorites.unshift({
    id: numericId,
    commonName: species.commonName || species.scientificName || "Unknown bird",
    scientificName: species.scientificName || "",
    photo: species.photo || null,
    savedAt: new Date().toISOString(),
    location: location || null,
  });
  write(FAVORITES_KEY, favorites);
  notifyFavorites();
  return true;
}

export function removeFavorite(id) {
  const numericId = Number(id);
  const favorites = getFavorites().filter((favorite) => Number(favorite.id) !== numericId);
  write(FAVORITES_KEY, favorites);
  notifyFavorites();
}

export function getTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

export function setTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function getRecentLocations() {
  const locations = read(RECENT_KEY, []);
  return Array.isArray(locations) ? locations : [];
}

export function addRecentLocation(location) {
  if (!location || !Number.isFinite(Number(location.lat)) || !Number.isFinite(Number(location.lng))) return;
  const clean = {
    name: location.name || "this location",
    lat: Number(location.lat),
    lng: Number(location.lng),
    radius: Number(location.radius) || 25,
    usedAt: new Date().toISOString(),
  };
  const remaining = getRecentLocations().filter(
    (item) => !(Math.abs(item.lat - clean.lat) < 0.02 && Math.abs(item.lng - clean.lng) < 0.02),
  );
  write(RECENT_KEY, [clean, ...remaining].slice(0, 6));
}

export function getLastLocation() {
  const location = read(LAST_KEY, null);
  if (!location || !Number.isFinite(Number(location.lat)) || !Number.isFinite(Number(location.lng))) return null;
  return location;
}

export function setLastLocation(location) {
  if (!location) return;
  const clean = {
    name: location.name || "this location",
    lat: Number(location.lat),
    lng: Number(location.lng),
    radius: Number(location.radius) || 25,
  };
  write(LAST_KEY, clean);
  addRecentLocation(clean);
}
