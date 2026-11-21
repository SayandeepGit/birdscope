import { icon } from "./icons.js";
import { escapeHtml } from "./utils.js";

/* ---------------- toasts ---------------- */

export function toast(message, tone = "info", timeout = 4200) {
  const region = document.getElementById("toast-region");
  if (!region) return;
  const element = document.createElement("div");
  element.className = `toast toast-${tone}`;
  element.setAttribute("role", tone === "error" ? "alert" : "status");
  element.textContent = message;
  region.appendChild(element);

  window.setTimeout(() => {
    element.style.opacity = "0";
    element.style.transform = "translateY(6px)";
    element.style.transition = "opacity .2s ease, transform .2s ease";
    window.setTimeout(() => element.remove(), 220);
  }, timeout);
}

/* ---------------- states ---------------- */

export function emptyState({ iconName = "bird", title, text, action = "" }) {
  return `
    <div class="empty-state">
      <span class="state-icon">${icon(iconName, { size: 28 })}</span>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(text)}</p>
      ${action ? `<div class="state-actions">${action}</div>` : ""}
    </div>`;
}

export function errorState({ title = "Something went wrong", text, retry = true }) {
  return `
    <div class="error-state">
      <span class="state-icon">${icon("alert", { size: 28 })}</span>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(text || "The field guide could not load this section. Check your connection and try again.")}</p>
      ${retry ? `<div class="state-actions"><button class="btn btn-primary" type="button" data-retry>Try again</button></div>` : ""}
    </div>`;
}

export function skeletonGrid(count = 8) {
  return `
    <div class="skeleton-grid" aria-hidden="true">
      ${Array.from({ length: count }, () => `
        <div class="skeleton-card">
          <div class="skeleton-media"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
          <div class="skeleton-line tiny"></div>
        </div>`).join("")}
    </div>`;
}

export function skeletonSpecies() {
  return `
    <div class="species-loading" aria-hidden="true">
      <div class="skeleton-hero skeleton-media"></div>
      <div class="skeleton-line" style="width: 46%"></div>
      <div class="skeleton-line" style="width: 28%"></div>
      <div class="skeleton-line" style="width: 72%"></div>
    </div>`;
}

/* ---------------- buttons ---------------- */

export function setButtonLoading(button, loading) {
  if (!button) return;
  button.classList.toggle("is-loading", loading);
  button.disabled = loading;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/* ---------------- favorites ---------------- */

export function bindFavoriteButtons(root, getSpecies, onChange) {
  if (!root) return () => {};
  const handler = (event) => {
    const button = event.target.closest(".favorite-toggle");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const species = getSpecies(button.dataset.favoriteId);
    if (!species) return;
    const saved = button.getAttribute("aria-pressed") !== "true";
    const isNowSaved = onChange(species, saved);
    button.classList.toggle("is-favorite", isNowSaved);
    button.setAttribute("aria-pressed", String(isNowSaved));
    button.setAttribute("aria-label", `${isNowSaved ? "Remove" : "Save"} ${species.commonName} ${isNowSaved ? "from" : "to"} favorites`);
    toast(isNowSaved ? `Saved ${species.commonName} to favorites.` : `Removed ${species.commonName} from favorites.`, isNowSaved ? "success" : "info", 2600);
  };
  root.addEventListener("click", handler);
  return () => root.removeEventListener("click", handler);
}

/* ---------------- lightbox ---------------- */

let lightboxPhotos = [];
let lightboxIndex = 0;
let lastFocused = null;

function renderLightbox() {
  const image = document.getElementById("lightbox-img");
  const caption = document.getElementById("lightbox-caption");
  const prev = document.querySelector("[data-lightbox-prev]");
  const next = document.querySelector("[data-lightbox-next]");
  if (!image || !caption) return;

  const photo = lightboxPhotos[lightboxIndex];
  if (!photo) return;
  image.src = photo.large || photo.medium || photo.thumb || "";
  image.alt = photo.alt || "Bird photo";
  caption.textContent = photo.caption || photo.attribution || "";

  const multiple = lightboxPhotos.length > 1;
  if (prev) prev.hidden = !multiple;
  if (next) next.hidden = !multiple;
}

function stepLightbox(direction) {
  if (lightboxPhotos.length < 2) return;
  lightboxIndex = (lightboxIndex + direction + lightboxPhotos.length) % lightboxPhotos.length;
  renderLightbox();
}

export function openLightbox(photos, index = 0) {
  if (!photos?.length) return;
  lightboxPhotos = photos;
  lightboxIndex = Math.min(Math.max(index, 0), photos.length - 1);
  lastFocused = document.activeElement;
  const lightbox = document.getElementById("lightbox");
  if (!lightbox) return;
  lightbox.hidden = false;
  document.body.style.overflow = "hidden";
  renderLightbox();
  lightbox.querySelector("[data-lightbox-close]")?.focus();
}

export function closeLightbox() {
  const lightbox = document.getElementById("lightbox");
  if (!lightbox || lightbox.hidden) return;
  lightbox.hidden = true;
  document.body.style.overflow = "";
  const image = document.getElementById("lightbox-img");
  if (image) image.removeAttribute("src");
  if (lastFocused instanceof HTMLElement) lastFocused.focus();
}

function initLightbox() {
  const lightbox = document.getElementById("lightbox");
  if (!lightbox) return;

  lightbox.querySelector("[data-lightbox-close]")?.addEventListener("click", closeLightbox);
  lightbox.querySelector("[data-lightbox-prev]")?.addEventListener("click", () => stepLightbox(-1));
  lightbox.querySelector("[data-lightbox-next]")?.addEventListener("click", () => stepLightbox(1));

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) closeLightbox();
  });

  document.addEventListener("keydown", (event) => {
    if (lightbox.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeLightbox();
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      stepLightbox(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      stepLightbox(1);
    }
  });
}

initLightbox();
