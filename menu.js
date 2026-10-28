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

// Scroll animation for the accordion: brings an opened header to 90px from the top
const ACCORDION_SCROLL_OFFSET = 90;
const ACCORDION_SCROLL_DURATION = 350; // matches the .acc-panel transition
let scrollAnimationFrameId = null;

function cancelScrollAnimation() {
  if (scrollAnimationFrameId !== null) {
    cancelAnimationFrame(scrollAnimationFrameId);
    scrollAnimationFrameId = null;
  }
}

// CSS "ease" timing curve, cubic-bezier(0.25, 0.1, 0.25, 1)
function cssEase(progress) {
  const bezierPoint = (curveParameter, firstControl, secondControl) =>
    3 * (1 - curveParameter) ** 2 * curveParameter * firstControl +
    3 * (1 - curveParameter) * curveParameter ** 2 * secondControl +
    curveParameter ** 3;
  // find the curve parameter whose x equals progress, then return its y
  let lowerBound = 0;
  let upperBound = 1;
  let curveParameter = progress;
  for (let iteration = 0; iteration < 20; iteration++) {
    curveParameter = (lowerBound + upperBound) / 2;
    if (bezierPoint(curveParameter, 0.25, 0.25) < progress) lowerBound = curveParameter;
    else upperBound = curveParameter;
  }
  return bezierPoint(curveParameter, 0.1, 1);
}

// Animated by hand rather than behavior:"smooth", because the page is still
// growing while the panel opens and a native smooth scroll can get clamped
// to the old, shorter page height
function animateScrollTo(targetScrollPosition) {
  cancelScrollAnimation();
  const startScrollPosition = window.scrollY;
  const scrollDistance = targetScrollPosition - startScrollPosition;
  const startTime = performance.now();

  const animationStep = (currentTime) => {
    const progress = Math.min(Math.max((currentTime - startTime) / ACCORDION_SCROLL_DURATION, 0), 1);
    if (progress < 1) {
      window.scrollTo(0, startScrollPosition + scrollDistance * cssEase(progress));
      scrollAnimationFrameId = requestAnimationFrame(animationStep);
    } else {
      window.scrollTo(0, targetScrollPosition); // exact target on the final frame
      scrollAnimationFrameId = null;
    }
  };
  scrollAnimationFrameId = requestAnimationFrame(animationStep);
}

// Never fight the visitor: stop the animation as soon as they scroll themselves
["wheel", "touchstart", "keydown"].forEach((eventName) => {
  window.addEventListener(eventName, cancelScrollAnimation, { passive: true });
});

// Accordion menu — one category open at a time
function attachAccordionListeners() {
  const accItems = document.querySelectorAll("#menu-accordion .acc-item");

  accItems.forEach((item) => {
    const header = item.querySelector(".acc-header");
    header.addEventListener("click", () => {
      cancelScrollAnimation(); // only one scroll animation at a time

      // Clicking the open category just closes it with the normal animation
      if (item.classList.contains("active")) {
        item.classList.remove("active");
        header.setAttribute("aria-expanded", "false");
        return;
      }

      // Close the other open categories instantly (no animation), then scroll by
      // however far that moved the clicked header, so it stays put on screen
      // instead of bouncing while a tall panel above it collapses
      const otherOpenItems = Array.from(accItems).filter(
        (otherItem) => otherItem !== item && otherItem.classList.contains("active")
      );
      const otherOpenPanels = otherOpenItems.map((otherItem) => otherItem.querySelector(".acc-panel"));
      const headerTopBefore = header.getBoundingClientRect().top;

      otherOpenPanels.forEach((panel) => panel.classList.add("no-transition"));
      void document.body.offsetHeight; // force reflow so transition:none applies before the change
      otherOpenItems.forEach((otherItem) => {
        otherItem.classList.remove("active");
        otherItem.querySelector(".acc-header").setAttribute("aria-expanded", "false");
      });

      const headerTopAfter = header.getBoundingClientRect().top;
      window.scrollBy(0, headerTopAfter - headerTopBefore);
      requestAnimationFrame(() => {
        otherOpenPanels.forEach((panel) => panel.classList.remove("no-transition"));
      });

      // Then open the clicked category with the normal 0.35s animation
      item.classList.add("active");
      header.setAttribute("aria-expanded", "true");

      // and glide the header to 90px from the top while it opens. The header
      // doesn't move as its own panel grows below it, so the target stays valid;
      // near the bottom of the page the browser clamps it
      const targetScrollPosition =
        window.scrollY + header.getBoundingClientRect().top - ACCORDION_SCROLL_OFFSET;
      animateScrollTo(targetScrollPosition);
    });
  });
}

loadMenu();