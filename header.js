// Header scroll state — collapses utility bar, shrinks logo, adds shadow
const header = document.getElementById('site-header');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 40);
});

// Mobile nav toggle — the open panel is styled by nav.main-nav.open in styles.css
// Must match the hamburger media query in styles.css (max-width:1118px)
const HAMBURGER_MAX_WIDTH = 1118;
const hamburgerQuery = window.matchMedia(`(max-width:${HAMBURGER_MAX_WIDTH}px)`);
const toggle = document.getElementById('menu-toggle');
const nav = document.getElementById('main-nav');

function setMenuOpen(open) {
  nav.classList.toggle('open', open);
  toggle.classList.toggle('active', open);
  toggle.setAttribute('aria-expanded', String(open));
}

toggle.addEventListener('click', () => {
  setMenuOpen(!nav.classList.contains('open'));
});

nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenuOpen(false)));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && nav.classList.contains('open')) {
    setMenuOpen(false);
    toggle.focus();
  }
});

// Close when the window crosses the breakpoint in either direction
hamburgerQuery.addEventListener('change', () => setMenuOpen(false));

// Footer copyright year — fills in automatically, updates itself every year
const footerYear = document.getElementById('footer-year');
if (footerYear) {
  footerYear.textContent = new Date().getFullYear();
}