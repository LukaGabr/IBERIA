// Load menu data from JSON and render it
fetch("menu.json")
  .then(response => response.json())
  .then(data => {
    renderMenu(data.menu);
  })
  .catch(error => {
    console.error("Error loading menu:", error);
  });

function renderMenu(categories) {
  const accordion = document.getElementById("menu-accordion");
  accordion.innerHTML = ""; // clear any static content

  categories.forEach((category, index) => {
    const dishesHTML = category.items.map(item => `
      <div class="dish">
        <h4>${item.name}</h4>
        <p>${item.description}</p>
      </div>
    `).join("");

    const isFirst = index === 0; // keep first category open by default

    const accItem = document.createElement("div");
    accItem.className = `acc-item${isFirst ? " active" : ""}`;
    accItem.innerHTML = `
      <button class="acc-header" aria-expanded="${isFirst}">
        <span>${category.category}</span>
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
  const accItems = document.querySelectorAll('#menu-accordion .acc-item');

  accItems.forEach(item => {
    const header = item.querySelector('.acc-header');
    header.addEventListener('click', () => {
      const isActive = item.classList.contains('active');

      accItems.forEach(other => {
        other.classList.remove('active');
        other.querySelector('.acc-header').setAttribute('aria-expanded', 'false');
      });

      if (!isActive) {
        item.classList.add('active');
        header.setAttribute('aria-expanded', 'true');
      }
    });
  });
}