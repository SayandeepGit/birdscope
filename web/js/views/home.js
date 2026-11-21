import { geocodePlace, reverseGeocode } from "../api.js";
import { icon } from "../icons.js";
import { navigate } from "../router.js";
import { addRecentLocation, getFavorites, getRecentLocations, setLastLocation, toggleFavorite } from "../storage.js";
import { debounce, escapeHtml } from "../utils.js";
import { setButtonLoading, toast } from "../ui.js";
import { speciesCard } from "../components/species-card.js";

const POPULAR_PLACES = [
  { name: "Kolkata, West Bengal, India", short: "Kolkata", lat: 22.56263, lng: 88.36304 },
  { name: "Seattle, Washington, United States", short: "Seattle", lat: 47.60621, lng: -122.33207 },
  { name: "London, England, United Kingdom", short: "London", lat: 51.5074, lng: -0.1278 },
  { name: "New York, New York, United States", short: "New York", lat: 40.7128, lng: -74.006 },
  { name: "Cape Town, Western Cape, South Africa", short: "Cape Town", lat: -33.9249, lng: 18.4241 },
  { name: "Singapore", short: "Singapore", lat: 1.3521, lng: 103.8198 },
];

function heroArt() {
  return `
    <svg class="hero-illustration" viewBox="0 0 560 520" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <clipPath id="scope-clip">
          <circle cx="318" cy="226" r="152"/>
        </clipPath>
        <radialGradient id="scope-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(318 226) rotate(90) scale(152)">
          <stop stop-color="var(--hero-cream)"/>
          <stop offset="1" stop-color="color-mix(in srgb, var(--hero-cream) 72%, var(--gold))"/>
        </radialGradient>
      </defs>

      <circle cx="318" cy="226" r="168" stroke="var(--line)" stroke-width="2" stroke-dasharray="2 9" opacity=".7"/>
      <circle cx="318" cy="226" r="152" fill="url(#scope-glow)" stroke="var(--line)" stroke-width="2"/>

      <g clip-path="url(#scope-clip)">
        <circle cx="372" cy="158" r="50" fill="var(--hero-sun)" opacity=".95"/>
        <path d="M170 302c42-42 92-56 150-42 40 10 68 34 88 72H154c4-12 9-22 16-30Z" fill="var(--hero-hill-1)"/>
        <path d="M150 350c54-26 110-30 168-12 46 14 80 40 104 74H136c2-24 6-44 14-62Z" fill="var(--hero-hill-2)"/>
        <path d="M170 370c66-28 136-34 210-18" stroke="var(--hero-branch)" stroke-width="9" stroke-linecap="round"/>
        <path d="M232 358c-18-18-34-30-52-38M286 362c8-20 20-35 36-45" stroke="var(--hero-branch)" stroke-width="5" stroke-linecap="round"/>

        <ellipse cx="312" cy="314" rx="52" ry="35" fill="var(--hero-bird)"/>
        <circle cx="356" cy="290" r="24" fill="var(--hero-bird)"/>
        <path d="M378 286l30 8-30 11Z" fill="var(--gold)"/>
        <path d="M286 301c18-17 41-23 68-18-11 25-34 39-69 41Z" fill="var(--hero-hill-2)" opacity=".82"/>
        <path d="M260 326l-40 27 36 6 26-19Z" fill="var(--hero-bird)"/>
        <circle cx="364" cy="284" r="4" fill="var(--hero-hill-2)"/>
        <path d="M312 348v18M330 346v18" stroke="var(--hero-branch)" stroke-width="4" stroke-linecap="round"/>
        <path d="M300 368h18M318 368h18" stroke="var(--hero-branch)" stroke-width="4" stroke-linecap="round"/>

        <ellipse cx="214" cy="336" rx="15" ry="7" transform="rotate(-24 214 336)" fill="var(--hero-leaf)"/>
        <ellipse cx="246" cy="342" rx="14" ry="6.5" transform="rotate(18 246 342)" fill="var(--hero-leaf)"/>
        <ellipse cx="348" cy="354" rx="14" ry="6.5" transform="rotate(-18 348 354)" fill="var(--hero-leaf)"/>
        <ellipse cx="380" cy="366" rx="13" ry="6" transform="rotate(24 380 366)" fill="var(--hero-leaf)"/>
      </g>

      <g class="floating-bird b1" fill="var(--hero-bird)">
        <path d="M96 142c12-8 22-9 34-3-6 10-16 15-30 15Z" opacity=".85"/>
        <path d="M96 142c-9-5-17-6-25-2 5 7 12 10 21 10Z" opacity=".55"/>
      </g>
      <g class="floating-bird b2" fill="var(--hero-bird)">
        <path d="M438 104c10-7 19-8 29-3-5 9-14 13-26 13Z" opacity=".8"/>
        <path d="M438 104c-8-4-15-5-21-2 4 6 10 9 18 9Z" opacity=".5"/>
      </g>
      <g class="floating-bird b3" fill="var(--hero-bird)">
        <path d="M452 322c8-5 15-6 23-2-4 7-11 10-20 10Z" opacity=".7"/>
        <path d="M452 322c-6-3-12-4-17-1 3 4 8 7 14 7Z" opacity=".45"/>
      </g>

      <circle cx="94" cy="250" r="4" fill="var(--accent)" opacity=".45"/>
      <circle cx="120" cy="286" r="2.5" fill="var(--gold)" opacity=".7"/>
      <circle cx="462" cy="212" r="3" fill="var(--primary)" opacity=".5"/>
      <circle cx="492" cy="242" r="2" fill="var(--accent)" opacity=".55"/>
    </svg>`;
}

function recentLocationsMarkup(locations) {
  if (!locations.length) return "";
  return `
    <div class="recent">
      <span class="recent-label">Recent</span>
      ${locations.map((location) => `
        <button class="chip" type="button" data-place
          data-name="${escapeHtml(location.name)}"
          data-lat="${location.lat}"
          data-lng="${location.lng}"
          data-radius="${location.radius || 25}">
          ${icon("pin", { size: 14 })}${escapeHtml(location.name)}
        </button>`).join("")}
    </div>`;
}

export function renderHome(container) {
  const recent = getRecentLocations();
  const favorites = getFavorites().slice(0, 4);
  document.title = "BirdScope — Discover the birds around you";

  container.innerHTML = `
    <div class="container">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">Field notes, wherever you are</p>
          <h1>Find the birds <em>around you.</em></h1>
          <p class="lede">Search any place on Earth to see which bird species have been spotted nearby — with photos, facts, conservation status, and the best months to look.</p>

          <form class="location-search" id="home-search" role="search" novalidate>
            <div class="search-field">
              <span class="search-icon">${icon("search", { size: 20 })}</span>
              <label class="sr-only" for="location-input">City or place</label>
              <input id="location-input" type="text" placeholder="Try Kolkata, Seattle, or London" autocomplete="off"
                aria-autocomplete="list" aria-controls="location-suggestions" aria-expanded="false" spellcheck="false">
              <div class="suggestions" id="location-suggestions" role="listbox" aria-label="Place suggestions" hidden></div>
            </div>
            <div class="search-actions">
              <label class="select-wrap">
                <span class="sr-only">Search radius</span>
                <select id="radius-select" aria-label="Search radius">
                  <option value="5">Within 5 km</option>
                  <option value="10">Within 10 km</option>
                  <option value="25" selected>Within 25 km</option>
                  <option value="50">Within 50 km</option>
                </select>
              </label>
              <button class="btn btn-primary" type="submit">
                ${icon("compass", { size: 17 })}
                <span class="btn-label">Explore birds</span>
              </button>
              <button class="btn btn-ghost" type="button" id="locate-btn">
                ${icon("locate", { size: 17 })}
                <span class="btn-label">Use my location</span>
              </button>
            </div>
          </form>

          ${recentLocationsMarkup(recent)}
        </div>

        <div class="hero-art">
          ${heroArt()}
          <div class="hero-note">
            ${icon("leaf", { size: 19 })}
            <span>Live sightings from iNaturalist, mapped to your patch.</span>
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="places-title">
        <div class="section-heading">
          <div>
            <h2 id="places-title">Start somewhere</h2>
            <p>Pick a place with a rich birding record, or search for your own.</p>
          </div>
        </div>
        <div class="place-chips">
          ${POPULAR_PLACES.map((place) => `
            <button class="place-chip" type="button" data-place
              data-name="${escapeHtml(place.name)}"
              data-lat="${place.lat}"
              data-lng="${place.lng}">
              ${icon("pin", { size: 16 })}${escapeHtml(place.short)}
            </button>`).join("")}
        </div>
      </section>

      <section class="section" aria-labelledby="how-title">
        <div class="section-heading">
          <div>
            <h2 id="how-title">A field guide that starts with where you are</h2>
            <p>Three steps from a place name to a list of birds worth looking for.</p>
          </div>
        </div>
        <div class="feature-grid">
          <article class="feature-card">
            <span class="feature-number">01</span>
            <h3>Pick your patch</h3>
            <p>Search a city, town, or landmark — or let your device find you. Choose a radius from 5 to 50 km.</p>
          </article>
          <article class="feature-card">
            <span class="feature-number">02</span>
            <h3>Meet the locals</h3>
            <p>See the species reported nearby, ranked by how often they have been observed. Photos and names included.</p>
          </article>
          <article class="feature-card">
            <span class="feature-number">03</span>
            <h3>Go deeper</h3>
            <p>Open a species for field-guide facts, taxonomy, conservation status, a seasonality chart, and recent sightings.</p>
          </article>
        </div>
      </section>

      <section class="section favorites-preview" aria-labelledby="favorites-title">
        <div class="section-heading">
          <div>
            <h2 id="favorites-title">Your field notes</h2>
            <p>${favorites.length ? "The birds you have saved for another look." : "Save birds you want to find again."}</p>
          </div>
          ${favorites.length ? `<a class="section-link" href="#/favorites">View all favorites →</a>` : ""}
        </div>
        ${favorites.length
          ? `<div class="species-grid">${favorites.map((favorite) => speciesCard(favorite, { location: favorite.location })).join("")}</div>`
          : `<div class="favorites-empty-note">${icon("heart", { size: 22 })}<span>Tap the heart on any bird to keep a personal field list. It stays in this browser.</span></div>`}
      </section>
    </div>`;

  const form = container.querySelector("#home-search");
  const input = container.querySelector("#location-input");
  const suggestionsBox = container.querySelector("#location-suggestions");
  const radiusSelect = container.querySelector("#radius-select");
  const submitButton = form.querySelector('button[type="submit"]');
  const locateButton = container.querySelector("#locate-btn");

  let suggestions = [];
  let activeIndex = -1;
  let selected = null;
  let searchController = null;
  let alive = true;

  const hideSuggestions = () => {
    suggestionsBox.hidden = true;
    input.setAttribute("aria-expanded", "false");
    activeIndex = -1;
  };

  const renderSuggestions = () => {
    if (!suggestions.length) {
      suggestionsBox.innerHTML = `<div class="suggestion-empty">No places found. Try a city, town, or region.</div>`;
      suggestionsBox.hidden = false;
      input.setAttribute("aria-expanded", "true");
      return;
    }
    suggestionsBox.innerHTML = suggestions.map((place, index) => `
      <button class="suggestion ${index === activeIndex ? "is-active" : ""}" type="button" role="option"
        aria-selected="${index === activeIndex}" data-index="${index}">
        <span class="suggestion-main">${escapeHtml(place.shortName)}</span>
        <span class="suggestion-sub">${escapeHtml([place.admin1, place.country].filter(Boolean).join(", "))}</span>
      </button>`).join("");
    suggestionsBox.hidden = false;
    input.setAttribute("aria-expanded", "true");
  };

  const runSearch = debounce(async () => {
    const query = input.value.trim();
    if (query.length < 2) {
      suggestions = [];
      hideSuggestions();
      return;
    }
    searchController?.abort();
    searchController = new AbortController();
    try {
      suggestions = await geocodePlace(query, searchController.signal);
      if (!alive) return;
      selected = null;
      activeIndex = suggestions.length ? 0 : -1;
      renderSuggestions();
    } catch (error) {
      if (error.name !== "AbortError") {
        suggestions = [];
        suggestionsBox.innerHTML = `<div class="suggestion-empty">Could not search places right now. Check your connection.</div>`;
        suggestionsBox.hidden = false;
      }
    }
  }, 320);

  const chooseLocation = (place, radius) => {
    const location = {
      name: place.name,
      lat: Number(place.lat),
      lng: Number(place.lng),
      radius: Number(radius) || 25,
    };
    setLastLocation(location);
    navigate("/explore", {
      lat: location.lat,
      lng: location.lng,
      radius: location.radius,
      name: location.name,
    });
  };

  const submitSearch = async () => {
    const radius = Number(radiusSelect.value) || 25;
    if (selected) {
      chooseLocation(selected, radius);
      return;
    }
    if (activeIndex >= 0 && suggestions[activeIndex]) {
      chooseLocation(suggestions[activeIndex], radius);
      return;
    }
    const query = input.value.trim();
    if (!query) {
      toast("Type a city or place to start exploring.", "error");
      input.focus();
      return;
    }

    setButtonLoading(submitButton, true);
    searchController?.abort();
    searchController = new AbortController();
    try {
      const results = await geocodePlace(query, searchController.signal);
      if (!alive) return;
      if (!results.length) {
        toast("No place found. Try a nearby city or a broader name.", "error");
        return;
      }
      chooseLocation(results[0], radius);
    } catch (error) {
      if (error.name !== "AbortError") toast("Could not reach the place search. Please try again.", "error");
    } finally {
      if (alive) setButtonLoading(submitButton, false);
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitSearch();
  });

  input.addEventListener("input", () => {
    selected = null;
    runSearch();
  });

  input.addEventListener("keydown", (event) => {
    if (suggestionsBox.hidden) {
      if (event.key === "ArrowDown" && input.value.trim().length >= 2) {
        event.preventDefault();
        runSearch();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, suggestions.length - 1);
      renderSuggestions();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      renderSuggestions();
    } else if (event.key === "Enter") {
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        event.preventDefault();
        selected = suggestions[activeIndex];
        chooseLocation(selected, Number(radiusSelect.value) || 25);
      }
    } else if (event.key === "Escape") {
      hideSuggestions();
    }
  });

  suggestionsBox.addEventListener("click", (event) => {
    const button = event.target.closest(".suggestion");
    if (!button) return;
    const place = suggestions[Number(button.dataset.index)];
    if (!place) return;
    selected = place;
    chooseLocation(place, Number(radiusSelect.value) || 25);
  });

  const onDocumentClick = (event) => {
    if (!form.contains(event.target)) hideSuggestions();
  };
  document.addEventListener("click", onDocumentClick);

  container.addEventListener("click", (event) => {
    const placeButton = event.target.closest("[data-place]");
    if (placeButton) {
      const radius = Number(placeButton.dataset.radius || radiusSelect.value) || 25;
      radiusSelect.value = String(radius);
      chooseLocation(
        {
          name: placeButton.dataset.name,
          lat: Number(placeButton.dataset.lat),
          lng: Number(placeButton.dataset.lng),
        },
        radius,
      );
      return;
    }

    const favoriteButton = event.target.closest(".favorite-toggle");
    if (favoriteButton) {
      event.preventDefault();
      const favorite = favorites.find((item) => Number(item.id) === Number(favoriteButton.dataset.favoriteId));
      if (favorite) {
        const saved = toggleFavorite(favorite, favorite.location);
        favoriteButton.classList.toggle("is-favorite", saved);
        favoriteButton.setAttribute("aria-pressed", String(saved));
        toast(saved ? `Saved ${favorite.commonName} to favorites.` : `Removed ${favorite.commonName} from favorites.`, saved ? "success" : "info", 2600);
      }
    }
  });

  locateButton.addEventListener("click", () => {
    if (!navigator.geolocation) {
      toast("This browser does not support location access. Search for a place instead.", "error");
      return;
    }
    setButtonLoading(locateButton, true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        let name = `My location (${lat.toFixed(3)}, ${lng.toFixed(3)})`;
        try {
          const place = await reverseGeocode(lat, lng);
          name = place.name;
        } catch {
          /* coordinates are enough */
        }
        if (!alive) return;
        const radius = Number(radiusSelect.value) || 25;
        const location = { name, lat, lng, radius };
        addRecentLocation(location);
        setLastLocation(location);
        navigate("/explore", { lat, lng, radius, name });
      },
      (error) => {
        if (!alive) return;
        setButtonLoading(locateButton, false);
        const message = error.code === error.PERMISSION_DENIED
          ? "Location permission was denied. Search for a place instead."
          : "Could not get your location. Try searching for a place.";
        toast(message, "error");
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
  });

  return () => {
    alive = false;
    searchController?.abort();
    runSearch.cancel();
    document.removeEventListener("click", onDocumentClick);
  };
}
