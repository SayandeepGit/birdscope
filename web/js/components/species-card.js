import { icon } from "../icons.js";
import { isFavorite } from "../storage.js";
import { escapeHtml, formatNumber, PHOTO_FALLBACK, pluralize } from "../utils.js";

export function speciesHref(id, location) {
  const params = new URLSearchParams();
  if (location) {
    if (location.lat !== undefined) params.set("lat", location.lat);
    if (location.lng !== undefined) params.set("lng", location.lng);
    if (location.radius !== undefined) params.set("radius", location.radius);
    if (location.name) params.set("name", location.name);
  }
  const query = params.toString();
  return `#/species/${encodeURIComponent(id)}${query ? `?${query}` : ""}`;
}

export function speciesCard(species, { location = null, eager = false, note = "" } = {}) {
  const id = Number(species.id);
  const commonName = species.commonName || species.scientificName || "Unknown bird";
  const scientificName = species.scientificName || "";
  const photo = species.photo || PHOTO_FALLBACK;
  const href = speciesHref(id, location);
  const saved = isFavorite(id);
  const count = Number(species.count);
  const hasCount = Number.isFinite(count) && count > 0;

  return `
    <article class="species-card" data-species-id="${id}">
      <a class="species-card-media" href="${href}" aria-label="View ${escapeHtml(commonName)}">
        <img src="${escapeHtml(photo)}" alt="${escapeHtml(commonName)}" loading="${eager ? "eager" : "lazy"}" decoding="async" width="400" height="300">
        ${hasCount ? `<span class="species-card-count">${formatNumber(count)} ${pluralize(count, "sighting")}</span>` : ""}
      </a>
      <div class="species-card-body">
        <div class="species-card-title">
          <h3><a href="${href}">${escapeHtml(commonName)}</a></h3>
          ${scientificName ? `<p class="scientific">${escapeHtml(scientificName)}</p>` : ""}
          ${note ? `<p class="scientific" style="font-style: normal">${escapeHtml(note)}</p>` : ""}
        </div>
        <button
          class="favorite-toggle ${saved ? "is-favorite" : ""}"
          type="button"
          data-favorite-id="${id}"
          aria-pressed="${saved}"
          aria-label="${saved ? "Remove" : "Save"} ${escapeHtml(commonName)} ${saved ? "from" : "to"} favorites"
          title="${saved ? "Remove from favorites" : "Save to favorites"}"
        >${icon("heart")}</button>
      </div>
    </article>`;
}
