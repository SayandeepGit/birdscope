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
  // This is triggered when the app is launched via protocol
  // The location is passed in the URL hash or search
  const hash = window.location.hash;
  if (hash.startsWith("#/explore")) {
    const location = parseLocation(new URLSearchParams(hash.split("?")[1] || ""));
    if (location) {
      navigate("/explore", location);
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

  addRoute("/", renderHome);
  addRoute("/explore", renderExplore);
  addRoute("/species/:id", renderSpecies);
  addRoute("/favorites", renderFavorites);
  setNotFound(renderNotFound);

  start();
}

init();
