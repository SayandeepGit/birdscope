const INAT = "https://api.inaturalist.org/v1";
const CACHE_PREFIX = "bs:cache:v2:";
const memoryCache = new Map();

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export class ApiError extends Error {
  constructor(message, { status = 0, url = "" } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.url = url;
  }
}

function readCache(key) {
  const now = Date.now();
  const inMemory = memoryCache.get(key);
  if (inMemory && inMemory.expires > now) return inMemory.data;
  if (inMemory) memoryCache.delete(key);

  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.expires <= now) {
      sessionStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    memoryCache.set(key, parsed);
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(key, data, ttl) {
  if (!ttl || ttl <= 0) return;
  const entry = { expires: Date.now() + ttl, data };
  memoryCache.set(key, entry);
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    /* sessionStorage may be full or unavailable */
  }
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchJson(url, { signal, ttl = 10 * MINUTE, retries = 1, headers = {} } = {}) {
  const cached = readCache(url);
  if (cached !== null) return cached;

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal,
        headers: { Accept: "application/json", ...headers },
      });

      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        await delay(500 + attempt * 700);
        continue;
      }

      if (!response.ok) {
        throw new ApiError(`Request failed with status ${response.status}`, {
          status: response.status,
          url,
        });
      }

      const data = await response.json();
      writeCache(url, data, ttl);
      return data;
    } catch (error) {
      if (error.name === "AbortError") throw error;
      if (attempt >= retries) {
        if (error instanceof ApiError) throw error;
        throw new ApiError("Network request failed", { url });
      }
      await delay(400 + attempt * 500);
    }
  }
}

export async function geocodePlace(query, signal) {
  const trimmed = String(query || "").trim();
  if (!trimmed) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}&count=8&language=en&format=json`;
  const data = await fetchJson(url, { signal, ttl: DAY });
  const results = (data.results || []).filter(
    (item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude),
  );
  const populated = results.filter((item) => String(item.feature_code || "").startsWith("PPL"));
  const chosen = populated.length ? populated : results;

  const seen = new Set();
  return chosen
    .map((item) => {
      const name = [item.name, item.admin1, item.country].filter(Boolean).join(", ");
      return {
        name,
        shortName: item.name || name,
        admin1: item.admin1 || "",
        country: item.country || "",
        countryCode: item.country_code || "",
        lat: Number(item.latitude),
        lng: Number(item.longitude),
        population: Number(item.population) || 0,
      };
    })
    .filter((item) => {
      if (!item.name || seen.has(item.name)) return false;
      seen.add(item.name);
      return true;
    })
    .slice(0, 6);
}

export async function reverseGeocode(lat, lng, signal) {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&localityLanguage=en`;
  const data = await fetchJson(url, { signal, ttl: DAY });
  const city = data.city || data.locality || data.principalSubdivision || "My location";
  const parts = [city, data.principalSubdivision, data.countryName].filter(
    (part, index, list) => part && list.indexOf(part) === index,
  );
  return {
    name: parts.join(", "),
    shortName: city,
    lat: Number(lat),
    lng: Number(lng),
  };
}

export async function getSpeciesNearby({ lat, lng, radius, page = 1, perPage = 50, signal }) {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius: String(radius),
    taxon_id: "3",
    quality_grade: "research",
    per_page: String(perPage),
    page: String(page),
    order: "desc",
    order_by: "count",
  });
  const data = await fetchJson(`${INAT}/observations/species_counts?${params}`, { signal, ttl: 10 * MINUTE });
  return {
    total: Number(data.total_results) || 0,
    species: (data.results || []).map((item) => {
      const taxon = item.taxon || {};
      return {
        id: taxon.id,
        commonName: taxon.preferred_common_name || taxon.name || "Unknown bird",
        scientificName: taxon.name || "",
        count: Number(item.count) || 0,
        photo: taxon.default_photo?.medium_url || taxon.default_photo?.small_url || taxon.default_photo?.url || null,
        photoAttribution: taxon.default_photo?.attribution || "",
        rank: taxon.rank || "species",
        observationsCount: Number(taxon.observations_count) || 0,
      };
    }),
  };
}

export async function getTaxon(id, signal) {
  const data = await fetchJson(`${INAT}/taxa/${encodeURIComponent(id)}`, { signal, ttl: DAY });
  return data.results?.[0] || null;
}

export function wikipediaTitleFromUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const marker = parsed.pathname.indexOf("/wiki/");
    if (marker === -1) return null;
    const raw = parsed.pathname.slice(marker + 6).split("#")[0];
    const title = decodeURIComponent(raw).replaceAll("_", " ").trim();
    return title || null;
  } catch {
    return null;
  }
}

export async function getWikipediaSummary(wikipediaUrl, signal) {
  const title = wikipediaTitleFromUrl(wikipediaUrl);
  if (!title) return null;
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(" ", "_"))}`;
  try {
    return await fetchJson(url, { signal, ttl: DAY, retries: 0 });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function getSeasonality({ taxonId, lat, lng, radius, signal }) {
  const year = new Date().getFullYear();
  const params = new URLSearchParams({
    taxon_id: String(taxonId),
    interval: "month_of_year",
    d1: `${year - 2}-01-01`,
    d2: `${year}-12-31`,
  });
  if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(radius)) {
    params.set("lat", String(lat));
    params.set("lng", String(lng));
    params.set("radius", String(radius));
  }
  const data = await fetchJson(`${INAT}/observations/histogram?${params}`, { signal, ttl: 6 * HOUR });
  const months = data.results?.month_of_year || {};
  return Array.from({ length: 12 }, (_, index) => Number(months[index + 1]) || 0);
}

function observationPhoto(observation) {
  const raw = observation.photos?.[0]?.url;
  if (!raw) return null;
  return raw.replace(/(square)(\.(?:jpe?g|png|webp))/i, "small$2");
}

export async function getRecentObservations({ lat, lng, radius, taxonId = 3, perPage = 100, signal }) {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius: String(radius),
    taxon_id: String(taxonId),
    quality_grade: "research",
    per_page: String(perPage),
    order_by: "observed_on",
    order: "desc",
  });
  const data = await fetchJson(`${INAT}/observations?${params}`, { signal, ttl: 10 * MINUTE });
  return (data.results || []).map((observation) => ({
    id: observation.id,
    speciesId: observation.taxon?.id || null,
    commonName: observation.taxon?.preferred_common_name || observation.taxon?.name || "Unknown bird",
    scientificName: observation.taxon?.name || "",
    observedOn: observation.observed_on || observation.created_at || "",
    placeGuess: observation.place_guess || "",
    lat: observation.geojson?.coordinates?.[1] ?? null,
    lng: observation.geojson?.coordinates?.[0] ?? null,
    photo: observationPhoto(observation),
    observer: observation.user?.login || "",
    observerName: observation.user?.name || observation.user?.login || "",
    uri: observation.uri || `https://www.inaturalist.org/observations/${observation.id}`,
  }));
}

export async function getNearbyObservationCount({ taxonId, lat, lng, radius, signal }) {
  const params = new URLSearchParams({
    taxon_id: String(taxonId),
    lat: String(lat),
    lng: String(lng),
    radius: String(radius),
    per_page: "0",
  });
  const data = await fetchJson(`${INAT}/observations?${params}`, { signal, ttl: 10 * MINUTE });
  return Number(data.total_results) || 0;
}
