import { errorState } from "./ui.js";

const routes = [];
let notFound = null;
let cleanup = null;
let hasRendered = false;

export function addRoute(path, handler) {
  const keys = [];
  const pattern = path
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
      keys.push(key);
      return "([^/]+)";
    });
  routes.push({ regex: new RegExp(`^${pattern}/?$`), keys, handler });
}

export function setNotFound(handler) {
  notFound = handler;
}

export function parseHash() {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [pathPart, queryPart] = raw.split("?");
  return {
    path: pathPart || "/",
    query: new URLSearchParams(queryPart || ""),
  };
}

export function navigate(path, params = {}) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  const suffix = query.toString();
  const nextHash = `#${cleanPath}${suffix ? `?${suffix}` : ""}`;
  if (window.location.hash === nextHash) {
    render();
  } else {
    window.location.hash = nextHash;
  }
}

export function start() {
  window.addEventListener("hashchange", render);
  render();
}

async function render() {
  const { path, query } = parseHash();
  const view = document.getElementById("view");
  if (!view) return;

  if (cleanup) {
    try {
      cleanup();
    } catch (error) {
      console.error("View cleanup failed", error);
    }
    cleanup = null;
  }

  let match = null;
  for (const route of routes) {
    const result = route.regex.exec(path);
    if (result) {
      const params = {};
      route.keys.forEach((key, index) => {
        params[key] = decodeURIComponent(result[index + 1]);
      });
      match = { route, params };
      break;
    }
  }

  view.innerHTML = "";

  if (!match) {
    if (notFound) {
      notFound(view, {}, query);
    } else {
      view.innerHTML = errorState({ title: "Page not found", text: "That trail does not exist.", retry: false });
    }
  } else {
    try {
      const result = await match.route.handler(view, match.params, query);
      cleanup = typeof result === "function" ? result : null;
    } catch (error) {
      if (error.name === "AbortError") return;
      console.error("View failed to render", error);
      view.innerHTML = errorState({
        title: "Could not open this page",
        text: "Something interrupted the field guide. Please try again.",
      });
      view.querySelector("[data-retry]")?.addEventListener("click", render);
    }
  }

  if (hasRendered) {
    window.scrollTo({ top: 0, behavior: "instant" });
    view.focus({ preventScroll: true });
  }
  hasRendered = true;
}
