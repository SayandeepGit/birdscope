import { speciesCard } from "../components/species-card.js";
import { icon } from "../icons.js";
import { getFavorites, removeFavorite } from "../storage.js";
import { formatDate, pluralize } from "../utils.js";
import { emptyState, toast } from "../ui.js";

export function renderFavorites(container) {
  document.title = "Your favorites — BirdScope";

  const paint = () => {
    const favorites = getFavorites();

    if (!favorites.length) {
      container.innerHTML = `
        <section class="favorites-page">
          <div class="container">
            <div class="favorites-header">
              <div>
                <p class="eyebrow">Personal field list</p>
                <h1>Your favorite birds</h1>
                <p>Tap the heart on any species to build a field list that stays in this browser.</p>
              </div>
            </div>
            ${emptyState({
              iconName: "heart",
              title: "No favorites yet",
              text: "Find a bird you love, tap the heart, and it will wait for you here.",
              action: `<a class="btn btn-primary" href="#/">Explore birds near you</a>`,
            })}
          </div>
        </section>`;
      return;
    }

    container.innerHTML = `
      <section class="favorites-page">
        <div class="container">
          <div class="favorites-header">
            <div>
              <p class="eyebrow">Personal field list</p>
              <h1>Your favorite birds</h1>
              <p><strong>${favorites.length}</strong> ${pluralize(favorites.length, "species", "species")} saved in this browser. Open any bird to revisit its profile.</p>
            </div>
            <a class="btn btn-primary" href="#/">${icon("search", { size: 17 })} Find more birds</a>
          </div>
          <div class="species-grid favorites-grid">
            ${favorites.map((favorite) => speciesCard(favorite, {
              location: favorite.location,
              note: favorite.savedAt ? `Saved ${formatDate(favorite.savedAt)}` : "",
            })).join("")}
          </div>
        </div>
      </section>`;

    container.querySelector(".species-grid")?.addEventListener("click", (event) => {
      const button = event.target.closest(".favorite-toggle");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const id = Number(button.dataset.favoriteId);
      const favorite = getFavorites().find((item) => Number(item.id) === id);
      if (!favorite) return;
      removeFavorite(id);
      toast(`Removed ${favorite.commonName} from favorites.`, "info", 2400);
      paint();
    });
  };

  paint();

  return () => {};
}
