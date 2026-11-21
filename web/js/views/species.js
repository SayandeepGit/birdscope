import {
  getNearbyObservationCount,
  getRecentObservations,
  getSeasonality,
  getTaxon,
  getWikipediaSummary,
} from "../api.js";
import { icon } from "../icons.js";
import { isFavorite, toggleFavorite } from "../storage.js";
import {
  conservationBadge,
  defaultPhoto,
  escapeHtml,
  formatDate,
  formatNumber,
  getCurrentMonthIndex,
  getIucnStatus,
  getTaxonomy,
  MONTHS,
  parseLocation,
  PHOTO_FALLBACK,
  pluralize,
  stripHtml,
  taxonPhotos,
  truncate,
} from "../utils.js";
import {
  copyText,
  emptyState,
  errorState,
  openLightbox,
  skeletonSpecies,
  toast,
} from "../ui.js";

export function renderSpecies(container, params, query) {
  const taxonId = Number(params.id);
  const location = parseLocation(query);
  const controller = new AbortController();
  let alive = true;

  if (!Number.isFinite(taxonId)) {
    container.innerHTML = `<div class="container" style="padding:60px 0">${emptyState({
      iconName: "bird",
      title: "Species not found",
      text: "That species link does not look right.",
      action: `<a class="btn btn-primary" href="#/">Back to BirdScope</a>`,
    })}</div>`;
    return () => {};
  }

  const load = async () => {
    container.innerHTML = skeletonSpecies();

    try {
      const taxon = await getTaxon(taxonId, controller.signal);
      if (!alive) return;

      if (!taxon) {
        container.innerHTML = `<div class="container" style="padding:60px 0">${emptyState({
          iconName: "bird",
          title: "Species not found",
          text: "This taxon may have changed or no longer exists.",
          action: `<a class="btn btn-primary" href="#/">Back to BirdScope</a>`,
        })}</div>`;
        return;
      }

      const [wikiResult, seasonalityResult, countResult, recentResult] = await Promise.allSettled([
        getWikipediaSummary(taxon.wikipedia_url, controller.signal),
        getSeasonality({
          taxonId: taxon.id,
          lat: location?.lat,
          lng: location?.lng,
          radius: location?.radius,
          signal: controller.signal,
        }),
        location
          ? getNearbyObservationCount({
              taxonId: taxon.id,
              lat: location.lat,
              lng: location.lng,
              radius: location.radius,
              signal: controller.signal,
            })
          : Promise.resolve(null),
        location
          ? getRecentObservations({
              lat: location.lat,
              lng: location.lng,
              radius: location.radius,
              taxonId: taxon.id,
              perPage: 8,
              signal: controller.signal,
            })
          : Promise.resolve([]),
      ]);
      if (!alive) return;

      const wiki = wikiResult.status === "fulfilled" ? wikiResult.value : null;
      const seasonality = seasonalityResult.status === "fulfilled" ? seasonalityResult.value : null;
      const nearbyCount = countResult.status === "fulfilled" ? countResult.value : null;
      const recent = recentResult.status === "fulfilled" ? recentResult.value : [];

      const commonName = taxon.preferred_common_name || taxon.name || "Unknown bird";
      const scientificName = taxon.name || "";
      const photos = taxonPhotos(taxon);
      const hero = defaultPhoto(taxon) || photos[0] || null;
      const iucn = getIucnStatus(taxon);
      const taxonomy = getTaxonomy(taxon);
      const extract = wiki?.extract || stripHtml(taxon.wikipedia_summary) || "";
      const paragraphs = extract.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
      const wikiUrl = wiki?.content_urls?.desktop?.page || taxon.wikipedia_url || null;
      const description = wiki?.description ? truncate(wiki.description, 180) : truncate(extract, 220);
      const saved = isFavorite(taxon.id);
      const rankLabel = taxon.rank ? taxon.rank.charAt(0).toUpperCase() + taxon.rank.slice(1) : "Species";
      const hasSeasonality = Array.isArray(seasonality) && seasonality.some((count) => count > 0);

      document.title = `${commonName} (${scientificName}) — BirdScope`;

      const backParams = new URLSearchParams();
      if (location) {
        backParams.set("lat", location.lat);
        backParams.set("lng", location.lng);
        backParams.set("radius", location.radius);
        backParams.set("name", location.name);
      }
      const backHref = location ? `#/explore?${backParams}` : "#/";
      const backLabel = location ? `Back to ${escapeHtml(location.name)}` : "Back to BirdScope";

      const creditText = hero?.attribution || "Photo via iNaturalist";
      const credit = hero
        ? (hero.nativeUrl
            ? `<a class="photo-credit" href="${escapeHtml(hero.nativeUrl)}" target="_blank" rel="noopener">${escapeHtml(creditText)}</a>`
            : `<span class="photo-credit">${escapeHtml(creditText)}</span>`)
        : "";

      const badges = [
        conservationBadge(iucn),
        `<span class="badge badge-neutral">${icon("bird", { size: 14 })} ${escapeHtml(rankLabel)}</span>`,
        `<span class="badge badge-neutral">${formatNumber(taxon.observations_count)} global sightings</span>`,
      ].join("");

      const galleryPhotos = photos.slice(0, 8);
      const galleryMarkup = photos.length > 1
        ? `<section class="panel">
            <h2 class="panel-title">${icon("camera")} Field gallery</h2>
            <div class="gallery">
              ${galleryPhotos.map((photo, index) => `
                <button class="gallery-item" type="button" data-gallery-index="${index}" aria-label="Open photo ${index + 1} of ${photos.length}">
                  <img src="${escapeHtml(photo.thumb || photo.medium)}" alt="${escapeHtml(commonName)} photo ${index + 1}" loading="lazy">
                  ${index === 7 && photos.length > 8 ? `<span class="gallery-more">+${photos.length - 8}</span>` : ""}
                </button>`).join("")}
            </div>
          </section>`
        : "";

      let seasonalityMarkup = "";
      if (hasSeasonality) {
        const max = Math.max(...seasonality, 1);
        const currentMonth = getCurrentMonthIndex();
        const year = new Date().getFullYear();
        const bars = seasonality.map((count, index) => {
          const height = count ? Math.max(4, Math.round((count / max) * 100)) : 0;
          return `
            <div class="chart-col ${index === currentMonth ? "is-current" : ""}" tabindex="0"
              aria-label="${MONTHS[index]}: ${formatNumber(count)} ${pluralize(count, "observation")}">
              <div class="chart-bar-track">
                <div class="chart-bar" style="--h:${height}%"></div>
                <span class="chart-value">${formatNumber(count)}</span>
              </div>
              <span class="chart-label">${MONTHS[index]}</span>
            </div>`;
        }).join("");
        const rows = seasonality
          .map((count, index) => `<tr><td>${MONTHS[index]}</td><td>${formatNumber(count)}</td></tr>`)
          .join("");
        seasonalityMarkup = `
          <section class="panel">
            <div class="chart-head">
              <h2 class="panel-title" style="margin-bottom:0">${icon("calendar")} When to look</h2>
              <span class="chart-caption">${location ? `Near ${escapeHtml(location.name)} · ` : "Worldwide · "}${year - 2}–${year}</span>
            </div>
            <div class="chart" role="img" aria-label="Monthly observations of ${escapeHtml(commonName)}">${bars}</div>
            <details class="chart-table">
              <summary>View as table</summary>
              <table>
                <thead><tr><th>Month</th><th>Observations</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </details>
          </section>`;
      } else {
        seasonalityMarkup = `
          <section class="panel">
            <h2 class="panel-title">${icon("calendar")} When to look</h2>
            <p class="prose prose-empty">Not enough ${location ? "local " : ""}observations to chart seasonality yet.</p>
          </section>`;
      }

      const recentMarkup = location
        ? `<section class="panel">
            <h2 class="panel-title">${icon("pin")} Recent nearby sightings</h2>
            ${recent.length
              ? `<div class="sighting-list">${recent.map((observation) => `
                  <div class="sighting">
                    <img class="sighting-photo" src="${escapeHtml(observation.photo || PHOTO_FALLBACK)}" alt="${escapeHtml(observation.commonName)}" loading="lazy">
                    <div class="sighting-body">
                      <div class="sighting-title">
                        <span>${escapeHtml(observation.commonName)}</span>
                        <a href="${escapeHtml(observation.uri)}" target="_blank" rel="noopener">observation ↗</a>
                      </div>
                      <div class="sighting-meta">
                        ${escapeHtml(formatDate(observation.observedOn))}
                        ${observation.observerName ? ` · ${escapeHtml(observation.observerName)}` : ""}
                        ${observation.placeGuess ? ` · ${escapeHtml(observation.placeGuess)}` : ""}
                      </div>
                    </div>
                  </div>`).join("")}</div>`
              : `<p class="prose prose-empty">No recent research-grade sightings of this species near this location.</p>`}
          </section>`
        : "";

      const taxonomyMarkup = taxonomy.length
        ? taxonomy.map((item) => `
            <div class="taxonomy-row">
              <dt>${escapeHtml(item.rank)}</dt>
              <dd>${item.rank === "genus" ? `<em>${escapeHtml(item.name)}</em>` : escapeHtml(item.name)}</dd>
            </div>`).join("")
        : `<p class="prose prose-empty">Taxonomy data unavailable.</p>`;

      const stats = [
        { value: formatNumber(taxon.observations_count), label: "Global sightings" },
        location ? { value: nearbyCount === null ? "—" : formatNumber(nearbyCount), label: "Nearby sightings" } : null,
        { value: escapeHtml(rankLabel), label: "Taxon rank" },
        { value: formatNumber(photos.length), label: "Photos" },
      ].filter(Boolean);

      const links = [
        { href: `https://www.inaturalist.org/taxa/${taxon.id}`, label: "iNaturalist taxon page" },
        wikiUrl ? { href: wikiUrl, label: "Wikipedia article" } : null,
        iucn?.url ? { href: iucn.url, label: "IUCN Red List assessment" } : null,
      ].filter(Boolean);

      container.innerHTML = `
        <section class="species-page">
          <div class="container">
            <div class="species-hero">
              <div class="species-hero-media">
                <img src="${escapeHtml(hero?.medium || hero?.thumb || PHOTO_FALLBACK)}" alt="${escapeHtml(commonName)}" width="800" height="600">
                ${credit}
              </div>
              <div class="species-hero-copy">
                <a class="back-link" href="${backHref}">${icon("arrowLeft", { size: 16 })} ${backLabel}</a>
                <p class="eyebrow" style="margin-top:18px">Species profile</p>
                <h1 class="species-title">${escapeHtml(commonName)}</h1>
                <p class="scientific">${escapeHtml(scientificName)}</p>
                <div class="species-badges">${badges}</div>
                ${description ? `<p class="species-lede">${escapeHtml(description)}</p>` : ""}
                <div class="species-actions">
                  <button class="favorite-toggle favorite-button ${saved ? "is-favorite" : ""}" type="button"
                    data-favorite-id="${taxon.id}" aria-pressed="${saved}"
                    aria-label="${saved ? "Remove" : "Save"} ${escapeHtml(commonName)} ${saved ? "from" : "to"} favorites">
                    ${icon("heart")}
                    <span class="favorite-label">${saved ? "Saved to favorites" : "Save to favorites"}</span>
                  </button>
                  <button class="btn btn-secondary" type="button" data-share>${icon("share")} Copy link</button>
                  <a class="btn btn-ghost" href="https://www.inaturalist.org/taxa/${taxon.id}" target="_blank" rel="noopener">${icon("external")} iNaturalist</a>
                </div>
              </div>
            </div>

            <div class="detail-grid">
              <div class="detail-main">
                <section class="panel">
                  <h2 class="panel-title">${icon("feather")} About</h2>
                  <div class="prose">
                    ${paragraphs.length
                      ? paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")
                      : `<p class="prose-empty">No description is available for this species yet.</p>`}
                  </div>
                  ${wikiUrl ? `<p class="prose" style="margin-top:14px"><a href="${escapeHtml(wikiUrl)}" target="_blank" rel="noopener">Read more on Wikipedia →</a></p>` : ""}
                </section>

                ${galleryMarkup}
                ${seasonalityMarkup}
                ${recentMarkup}
              </div>

              <aside class="detail-sidebar">
                <section class="panel">
                  <h2 class="panel-title">${icon("compass")} Taxonomy</h2>
                  <dl class="taxonomy-list">${taxonomyMarkup}</dl>
                </section>

                <section class="panel">
                  <h2 class="panel-title">${icon("leaf")} Conservation</h2>
                  ${conservationBadge(iucn)}
                  ${iucn?.url ? `<p class="prose" style="margin-top:12px"><a href="${escapeHtml(iucn.url)}" target="_blank" rel="noopener">View IUCN assessment →</a></p>` : ""}
                  ${!iucn ? `<p class="prose" style="margin-top:10px">This species has not been assessed by the IUCN Red List.</p>` : ""}
                </section>

                <section class="panel">
                  <h2 class="panel-title">${icon("eye")} At a glance</h2>
                  <div class="stat-grid">
                    ${stats.map((stat) => `
                      <div class="stat">
                        <span class="stat-value">${stat.value}</span>
                        <span class="stat-label">${escapeHtml(stat.label)}</span>
                      </div>`).join("")}
                  </div>
                </section>

                <section class="panel">
                  <h2 class="panel-title">${icon("external")} Elsewhere</h2>
                  <div class="link-list">
                    ${links.map((link) => `
                      <a href="${escapeHtml(link.href)}" target="_blank" rel="noopener">
                        ${escapeHtml(link.label)} ${icon("external", { size: 16 })}
                      </a>`).join("")}
                  </div>
                </section>
              </aside>
            </div>
          </div>
        </section>`;

      const favoriteButton = container.querySelector(".favorite-button");
      favoriteButton?.addEventListener("click", () => {
        const savedNow = toggleFavorite(
          {
            id: taxon.id,
            commonName,
            scientificName,
            photo: hero?.medium || hero?.thumb || null,
          },
          location,
        );
        favoriteButton.classList.toggle("is-favorite", savedNow);
        favoriteButton.setAttribute("aria-pressed", String(savedNow));
        favoriteButton.setAttribute(
          "aria-label",
          `${savedNow ? "Remove" : "Save"} ${commonName} ${savedNow ? "from" : "to"} favorites`,
        );
        const label = favoriteButton.querySelector(".favorite-label");
        if (label) label.textContent = savedNow ? "Saved to favorites" : "Save to favorites";
        toast(
          savedNow ? `Saved ${commonName} to favorites.` : `Removed ${commonName} from favorites.`,
          savedNow ? "success" : "info",
          2600,
        );
      });

      container.querySelector("[data-share]")?.addEventListener("click", async () => {
        const copied = await copyText(window.location.href);
        toast(copied ? "Link copied to clipboard." : "Could not copy the link.", copied ? "success" : "error", 2600);
      });

      container.querySelectorAll("[data-gallery-index]").forEach((button) => {
        button.addEventListener("click", () => {
          const index = Number(button.dataset.galleryIndex);
          openLightbox(
            photos.map((photo, photoIndex) => ({
              ...photo,
              alt: `${commonName} photo ${photoIndex + 1}`,
              caption: photo.attribution,
            })),
            index,
          );
        });
      });
    } catch (error) {
      if (error.name === "AbortError" || !alive) return;
      console.error(error);
      container.innerHTML = `<div class="container" style="padding:60px 0">${errorState({
        title: "Could not load this species",
        text: "The field guide service did not respond. Check your connection and try again.",
      })}</div>`;
      container.querySelector("[data-retry]")?.addEventListener("click", load);
    }
  };

  load();

  return () => {
    alive = false;
    controller.abort();
  };
}
