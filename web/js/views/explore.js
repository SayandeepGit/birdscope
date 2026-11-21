import { getRecentObservations, getSpeciesNearby } from "../api.js";
import { speciesCard, speciesHref } from "../components/species-card.js";
import { icon } from "../icons.js";
import { navigate } from "../router.js";
import { setLastLocation, toggleFavorite } from "../storage.js";
import {
  debounce,
  escapeHtml,
  formatDate,
  formatNumber,
  parseLocation,
  PHOTO_FALLBACK,
  pluralize,
} from "../utils.js";
import {
  bindFavoriteButtons,
  emptyState,
  errorState,
  setButtonLoading,
  skeletonGrid,
  toast,
} from "../ui.js";

const PAGE_SIZE = 50;

function radiusOptions(selected) {
  return [5, 10, 25, 50]
    .map((radius) => `<option value="${radius}" ${radius === selected ? "selected" : ""}>Within ${radius} km</option>`)
    .join("");
}

function mapPopup(observation, location) {
  const photo = observation.photo || PHOTO_FALLBACK;
  const href = observation.speciesId
    ? speciesHref(observation.speciesId, location)
    : observation.uri;
  const external = !observation.speciesId;
  const meta = [formatDate(observation.observedOn), observation.observerName].filter(Boolean).join(" · ");
  return `
    <div class="map-popup">
      <img src="${escapeHtml(photo)}" alt="${escapeHtml(observation.commonName)}" loading="lazy">
      <strong>${escapeHtml(observation.commonName)}</strong>
      <span>${escapeHtml(meta || "Recent sighting")}</span>
      <a href="${escapeHtml(href)}" ${external ? 'target="_blank" rel="noopener"' : ""}>Open species →</a>
    </div>`;
}

export function renderExplore(container, _params, query) {
  const location = parseLocation(query);
  if (!location) {
    navigate("/");
    return () => {};
  }

  const { lat, lng, radius, name } = location;
  document.title = `Birds near ${name} — BirdScope`;

  let page = 1;
  let total = 0;
  let allSpecies = [];
  let loading = false;
  let alive = true;
  let filterText = "";
  let sortMode = "count";
  let viewMode = "grid";
  let listController = null;
  let mapController = null;
  let map = null;
  let mapLoaded = false;

  container.innerHTML = `
    <section class="explore">
      <div class="container">
        <div class="explore-top">
          <a class="back-link" href="#/">${icon("arrowLeft", { size: 16 })} Change location</a>
          <div class="explore-title">
            <p class="eyebrow">Field survey</p>
            <h1>Birds near <span>${escapeHtml(name)}</span></h1>
            <p class="explore-meta" id="explore-meta">Loading species…</p>
          </div>
          <div class="explore-actions">
            <label>
              Radius
              <select id="explore-radius" aria-label="Search radius">${radiusOptions(radius)}</select>
            </label>
          </div>
        </div>

        <div class="toolbar">
          <div class="filter-field">
            ${icon("search", { size: 18 })}
            <label class="sr-only" for="species-filter">Filter species by name</label>
            <input id="species-filter" type="text" placeholder="Filter by common or scientific name" autocomplete="off">
          </div>
          <label class="sort-field">
            Sort
            <select id="species-sort" aria-label="Sort species">
              <option value="count">Most observed</option>
              <option value="az">A–Z</option>
            </select>
          </label>
          <div class="view-toggle" role="group" aria-label="Results view">
            <button type="button" data-view="grid" class="is-active">${icon("grid", { size: 15 })} Grid</button>
            <button type="button" data-view="map">${icon("map", { size: 15 })} Map</button>
          </div>
        </div>

        <p class="results-status" id="results-status" aria-live="polite"></p>
        <div id="results">${skeletonGrid(8)}</div>

        <div id="map-view" hidden>
          <div class="map-wrap">
            <div class="map-panel" id="sightings-map" aria-label="Map of recent bird sightings"></div>
            <div class="map-loading" id="map-loading">Loading recent sightings…</div>
          </div>
        </div>

        <div class="load-more-wrap">
          <button class="btn btn-secondary" id="load-more" type="button" hidden>
            <span class="btn-label">Load more species</span>
          </button>
        </div>
      </div>
    </section>`;

  const meta = container.querySelector("#explore-meta");
  const results = container.querySelector("#results");
  const status = container.querySelector("#results-status");
  const loadMore = container.querySelector("#load-more");
  const filterInput = container.querySelector("#species-filter");
  const sortSelect = container.querySelector("#species-sort");
  const radiusSelect = container.querySelector("#explore-radius");
  const viewButtons = [...container.querySelectorAll("[data-view]")];
  const mapView = container.querySelector("#map-view");
  const mapLoading = container.querySelector("#map-loading");

  const updateLoadMore = () => {
    const hasMore = allSpecies.length < total;
    loadMore.hidden = viewMode === "map" || !hasMore || allSpecies.length === 0;
  };

  const updateMeta = () => {
    if (total > 0) {
      meta.innerHTML = `<strong>${formatNumber(total)}</strong> ${pluralize(total, "species", "species")} reported within ${radius} km`;
    } else {
      meta.textContent = `No species reported within ${radius} km yet`;
    }
  };

  const filteredSpecies = () => {
    const needle = filterText.trim().toLowerCase();
    const list = needle
      ? allSpecies.filter((species) =>
          `${species.commonName} ${species.scientificName}`.toLowerCase().includes(needle))
      : [...allSpecies];
    if (sortMode === "az") {
      list.sort((a, b) => a.commonName.localeCompare(b.commonName));
    } else {
      list.sort((a, b) => b.count - a.count);
    }
    return list;
  };

  const renderResults = () => {
    if (!allSpecies.length) {
      results.innerHTML = emptyState({
        iconName: "bird",
        title: "No birds found in this patch",
        text: "There may not be enough research-grade sightings here yet. Try a wider radius or another place.",
        action: radius < 50
          ? `<button class="btn btn-primary" type="button" data-wider>Try a 50 km radius</button>`
          : `<a class="btn btn-primary" href="#/">Search another place</a>`,
      });
      results.querySelector("[data-wider]")?.addEventListener("click", () => {
        navigate("/explore", { lat, lng, radius: 50, name });
      });
      status.textContent = "";
      updateLoadMore();
      return;
    }

    const list = filteredSpecies();
    if (!list.length) {
      results.innerHTML = emptyState({
        iconName: "search",
        title: "No matches in this list",
        text: `No loaded species match “${filterText.trim()}”. Clear the filter to see every bird again.`,
        action: `<button class="btn btn-secondary" type="button" data-clear-filter>Clear filter</button>`,
      });
      results.querySelector("[data-clear-filter]")?.addEventListener("click", () => {
        filterInput.value = "";
        filterText = "";
        renderResults();
      });
      status.textContent = `No matches among ${formatNumber(allSpecies.length)} loaded species.`;
      updateLoadMore();
      return;
    }

    results.innerHTML = `<div class="species-grid">${list
      .map((species, index) => speciesCard(species, { location, eager: index < 4 }))
      .join("")}</div>`;

    if (filterText.trim()) {
      status.innerHTML = `Showing <strong>${formatNumber(list.length)}</strong> matching ${pluralize(list.length, "species", "species")} out of <strong>${formatNumber(allSpecies.length)}</strong> loaded.`;
    } else {
      status.innerHTML = `Showing <strong>1–${formatNumber(allSpecies.length)}</strong> of <strong>${formatNumber(total)}</strong> species.`;
    }
    updateLoadMore();
  };

  const loadPage = async (nextPage) => {
    if (loading || !alive) return;
    loading = true;
    if (nextPage === 1) {
      results.innerHTML = skeletonGrid(8);
      status.textContent = "";
    } else {
      setButtonLoading(loadMore, true);
    }

    listController?.abort();
    listController = new AbortController();

    try {
      const data = await getSpeciesNearby({
        lat,
        lng,
        radius,
        page: nextPage,
        perPage: PAGE_SIZE,
        signal: listController.signal,
      });
      if (!alive) return;

      total = data.total;
      allSpecies = nextPage === 1 ? data.species : [...allSpecies, ...data.species];
      page = nextPage;
      updateMeta();
      renderResults();
    } catch (error) {
      if (error.name === "AbortError" || !alive) return;
      console.error(error);
      if (nextPage === 1) {
        results.innerHTML = errorState({
          title: "Could not load the bird list",
          text: "The sighting service did not respond. Check your connection and try again.",
        });
        results.querySelector("[data-retry]")?.addEventListener("click", () => loadPage(1));
        meta.textContent = "Species list unavailable";
      } else {
        toast("Could not load more species. Please try again.", "error");
      }
    } finally {
      loading = false;
      if (alive) setButtonLoading(loadMore, false);
    }
  };

  const ensureMap = async (force = false) => {
    if (!window.L) {
      mapLoading.hidden = false;
      mapLoading.innerHTML = errorState({
        title: "Map library unavailable",
        text: "The map could not load. The species grid still works.",
        retry: false,
      });
      return;
    }

    if (map && !force) {
      window.setTimeout(() => map.invalidateSize(), 0);
      return;
    }

    if (map) {
      map.remove();
      map = null;
    }
    mapLoaded = false;
    mapLoading.hidden = false;
    mapLoading.textContent = "Loading recent sightings…";

    mapController?.abort();
    mapController = new AbortController();

    try {
      const observations = await getRecentObservations({
        lat,
        lng,
        radius,
        perPage: 100,
        signal: mapController.signal,
      });
      if (!alive) return;

      map = window.L.map("sightings-map", { scrollWheelZoom: false }).setView([lat, lng], 10);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      const area = window.L.circle([lat, lng], {
        radius: radius * 1000,
        color: "#c96f43",
        weight: 1.5,
        fillColor: "#c96f43",
        fillOpacity: 0.06,
      }).addTo(map);

      const withCoords = observations.filter(
        (observation) => Number.isFinite(observation.lat) && Number.isFinite(observation.lng),
      );

      for (const observation of withCoords) {
        window.L.circleMarker([observation.lat, observation.lng], {
          radius: 6,
          color: "#fffdf8",
          weight: 1.5,
          fillColor: "#1f5e4b",
          fillOpacity: 0.9,
        })
          .bindPopup(mapPopup(observation, location), { maxWidth: 230 })
          .addTo(map);
      }

      if (withCoords.length) {
        const bounds = window.L.latLngBounds(withCoords.map((observation) => [observation.lat, observation.lng]));
        bounds.extend(area.getBounds());
        map.fitBounds(bounds, { padding: [26, 26], maxZoom: 13 });
      } else {
        map.fitBounds(area.getBounds(), { padding: [26, 26] });
      }

      mapLoaded = true;
      mapLoading.hidden = true;
      window.setTimeout(() => map.invalidateSize(), 0);
    } catch (error) {
      if (error.name === "AbortError" || !alive) return;
      console.error(error);
      mapLoading.hidden = false;
      mapLoading.innerHTML = errorState({
        title: "Could not load the sightings map",
        text: "The map service did not respond. Try again or switch back to the grid.",
      });
      mapLoading.querySelector("[data-retry]")?.addEventListener("click", () => ensureMap(true));
    }
  };

  const setView = (nextView) => {
    viewMode = nextView;
    viewButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.view === nextView));
    if (nextView === "map") {
      results.hidden = true;
      mapView.hidden = false;
      ensureMap();
    } else {
      mapView.hidden = true;
      results.hidden = false;
      if (map) window.setTimeout(() => map.invalidateSize(), 0);
    }
    updateLoadMore();
  };

  const onFilter = debounce(() => {
    filterText = filterInput.value;
    renderResults();
  }, 160);

  filterInput.addEventListener("input", onFilter);
  sortSelect.addEventListener("change", () => {
    sortMode = sortSelect.value;
    renderResults();
  });
  radiusSelect.addEventListener("change", () => {
    const nextRadius = Number(radiusSelect.value) || 25;
    setLastLocation({ name, lat, lng, radius: nextRadius });
    navigate("/explore", { lat, lng, radius: nextRadius, name });
  });
  viewButtons.forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
  loadMore.addEventListener("click", () => loadPage(page + 1));

  bindFavoriteButtons(
    results,
    (id) => allSpecies.find((species) => Number(species.id) === Number(id)),
    (species) => toggleFavorite(species, location),
  );

  results.addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="#/species/"]');
    if (!link) return;
    try {
      sessionStorage.setItem(
        "bs:explore-scroll",
        JSON.stringify({ lat, lng, radius, scrollY: window.scrollY, ts: Date.now() }),
      );
    } catch {
      /* ignore */
    }
  });

  const savedScroll = (() => {
    try {
      const raw = sessionStorage.getItem("bs:explore-scroll");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || Date.now() - parsed.ts > 5 * 60 * 1000) return null;
      if (Math.abs(parsed.lat - lat) > 0.001 || Math.abs(parsed.lng - lng) > 0.001 || parsed.radius !== radius) return null;
      sessionStorage.removeItem("bs:explore-scroll");
      return parsed.scrollY;
    } catch {
      return null;
    }
  })();

  loadPage(1).then(() => {
    if (alive && Number.isFinite(savedScroll)) {
      window.setTimeout(() => window.scrollTo({ top: savedScroll, behavior: "instant" }), 0);
    }
  });

  return () => {
    alive = false;
    listController?.abort();
    mapController?.abort();
    onFilter.cancel();
    if (map) {
      map.remove();
      map = null;
    }
  };
}
