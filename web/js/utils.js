export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const PHOTO_FALLBACK = "assets/bird-placeholder.svg";

const IUCN = {
  LC: { label: "Least Concern", tone: "lc" },
  NT: { label: "Near Threatened", tone: "nt" },
  VU: { label: "Vulnerable", tone: "vu" },
  EN: { label: "Endangered", tone: "en" },
  CR: { label: "Critically Endangered", tone: "cr" },
  EW: { label: "Extinct in the Wild", tone: "ex" },
  EX: { label: "Extinct", tone: "ex" },
  DD: { label: "Data Deficient", tone: "dd" },
  NE: { label: "Not Evaluated", tone: "dd" },
};

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function debounce(fn, wait = 300) {
  let timer = null;
  const wrapped = (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => window.clearTimeout(timer);
  return wrapped;
}

export function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return new Intl.NumberFormat("en").format(number);
}

export function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return Number(count) === 1 ? singular : plural;
}

export function truncate(value, length = 160) {
  const text = String(value || "").trim();
  if (text.length <= length) return text;
  return `${text.slice(0, length).trimEnd()}…`;
}

export function stripHtml(value) {
  if (!value) return "";
  const div = document.createElement("div");
  div.innerHTML = value;
  return (div.textContent || "").trim();
}

export function getIucnStatus(taxon) {
  if (!taxon) return null;
  const statuses = Array.isArray(taxon.conservation_statuses) ? taxon.conservation_statuses : [];
  let status = statuses.find((item) => /iucn/i.test(item.authority || ""));
  if (!status && taxon.conservation_status) status = taxon.conservation_status;
  if (!status) return null;

  const code = String(status.status || status.status_name || "").toUpperCase();
  if (!code) return null;
  const info = IUCN[code] || { label: status.status_name || code, tone: "dd" };
  return {
    code,
    label: info.label,
    tone: info.tone,
    url: status.url || null,
    authority: status.authority || "",
  };
}

export function conservationBadge(status, { withLabel = true } = {}) {
  if (!status) {
    return `<span class="badge badge-neutral">IUCN not assessed</span>`;
  }
  return `<span class="badge badge-${status.tone}">${escapeHtml(status.code)}${withLabel ? ` · ${escapeHtml(status.label)}` : ""}</span>`;
}

export function getTaxonomy(taxon) {
  const ranks = ["class", "order", "family", "genus"];
  const byRank = new Map();
  for (const ancestor of taxon?.ancestors || []) {
    if (ranks.includes(ancestor.rank)) byRank.set(ancestor.rank, ancestor);
  }
  return ranks
    .map((rank) => ({ rank, name: byRank.get(rank)?.name || null, id: byRank.get(rank)?.id || null }))
    .filter((item) => item.name);
}

export function taxonPhotos(taxon) {
  const seen = new Set();
  return (taxon?.taxon_photos || [])
    .map((item) => item.photo)
    .filter(Boolean)
    .filter((photo) => {
      const url = photo.medium_url || photo.small_url || photo.url;
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .map((photo) => ({
      id: photo.id,
      thumb: photo.small_url || photo.url || photo.medium_url,
      medium: photo.medium_url || photo.large_url || photo.url,
      large: photo.large_url || photo.original_url || photo.medium_url || photo.url,
      attribution: photo.attribution || "",
      license: photo.license_code || "",
      nativeUrl: photo.native_page_url || (photo.id ? `https://www.inaturalist.org/photos/${photo.id}` : ""),
    }));
}

export function defaultPhoto(taxon, size = "medium") {
  const photo = taxon?.default_photo;
  if (!photo) return null;
  return {
    thumb: photo.small_url || photo.url || null,
    medium: photo.medium_url || photo.large_url || photo.url || null,
    large: photo.large_url || photo.original_url || photo.medium_url || photo.url || null,
    attribution: photo.attribution || "",
    license: photo.license_code || "",
    nativeUrl: photo.native_page_url || (photo.id ? `https://www.inaturalist.org/photos/${photo.id}` : ""),
  };
}

export function buildQuery(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  return search.toString();
}

export function parseLocation(query) {
  const lat = Number(query.get("lat"));
  const lng = Number(query.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const radiusValue = Number(query.get("radius") || 25);
  const radius = [5, 10, 25, 50].includes(radiusValue) ? radiusValue : 25;
  return {
    lat,
    lng,
    radius,
    name: (query.get("name") || "this location").trim().slice(0, 140),
  };
}

export function formatRadius(radius) {
  return `${radius} km`;
}

export function getCurrentMonthIndex() {
  return new Date().getMonth();
}

export function isDarkMode() {
  return document.documentElement.dataset.theme === "dark";
}

export function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
