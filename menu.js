// menu.js
// Loads menu data from Firestore and renders the accordion

import { db } from "./firebase-config.js";
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const MENU_ERROR_MESSAGE =
  "The menu couldn't load right now. Please refresh the page or ask us in person.";

// Replaces the accordion content with a single status message
function showMenuMessage(message) {
  const accordion = document.getElementById("menu-accordion");
  const messageElement = document.createElement("p");
  messageElement.className = "menu-status";
  messageElement.setAttribute("role", "status");
  messageElement.textContent = message;
  accordion.replaceChildren(messageElement);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

async function loadMenu() {
  try {
    const menuRef = collection(db, "menu");
    const q = query(menuRef, orderBy("order"));
    const snapshot = await getDocs(q);

    const categories = [];
    snapshot.forEach((doc) => {
      categories.push(doc.data());
    });

    renderMenu(categories);
  } catch (error) {
    console.error("Error loading menu:", error);
    showMenuMessage(MENU_ERROR_MESSAGE);
  }
}

function renderMenu(categories) {
  const accordion = document.getElementById("menu-accordion");

  // Skip categories with no name or no dishes, so one bad document
  // can't stop the rest of the menu from rendering
  const validCategories = categories.filter(
    (category) => category.category && (category.items || []).length > 0
  );

  if (validCategories.length === 0) {
    showMenuMessage(MENU_ERROR_MESSAGE);
    return;
  }

  accordion.innerHTML = ""; // clear the loading message

  validCategories.forEach((category, index) => {
    const dishesHTML = category.items
      .map(
        (item) => `
      <div class="dish">
        <h4>${escapeHtml(item.name)}</h4>
        <p>${escapeHtml(item.description)}</p>
      </div>
    `
      )
      .join("");

    const isFirst = index === 0; // keep first category open by default

    const accItem = document.createElement("div");
    accItem.className = `acc-item${isFirst ? " active" : ""}`;
    accItem.innerHTML = `
      <button class="acc-header" aria-expanded="${isFirst}">
        <span>${escapeHtml(category.category)}</span>
        <span class="acc-icon"></span>
      </button>
      <div class="acc-panel">
        <div class="acc-panel-inner">
          <div class="dish-grid">
            ${dishesHTML}
          </div>
        </div>
      </div>
    `;

    accordion.appendChild(accItem);
  });

  attachAccordionListeners();
}

// Accordion menu — one category open at a time
function attachAccordionListeners() {
  const accItems = document.querySelectorAll("#menu-accordion .acc-item");
  const allPanels = document.querySelectorAll("#menu-accordion .acc-panel");

  accItems.forEach((item) => {
    const header = item.querySelector(".acc-header");
    header.addEventListener("click", () => {
      const willOpen = !item.classList.contains("active");
      const wasActive = Array.from(accItems).find((i) => i.classList.contains("active"));

      // --- Step 1: figure out where the header will end up, with no
      // animation and no visible change, by momentarily applying the final
      // state, measuring it, then instantly reverting. ---
      allPanels.forEach((p) => (p.style.transition = "none"));

      accItems.forEach((i) => i.classList.remove("active"));
      if (willOpen) item.classList.add("active");
      void document.body.offsetHeight; // force layout to read final positions

      const targetTop = header.getBoundingClientRect().top + window.pageYOffset - 90;

      accItems.forEach((i) => i.classList.remove("active"));
      if (wasActive) wasActive.classList.add("active");
      void document.body.offsetHeight; // force layout back to the starting state

      allPanels.forEach((p) => (p.style.transition = ""));

      // --- Step 2: apply the real change and scroll to the pre-calculated
      // target in one smooth motion, at the same time the panels animate. ---
      requestAnimationFrame(() => {
        accItems.forEach((other) => {
          other.classList.remove("active");
          other.querySelector(".acc-header").setAttribute("aria-expanded", "false");
        });
        if (willOpen) {
          item.classList.add("active");
          header.setAttribute("aria-expanded", "true");
        }
        window.scrollTo({ top: targetTop, behavior: "smooth" });
      });
    });
  });
}

loadMenu();