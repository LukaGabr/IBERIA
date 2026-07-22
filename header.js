// Header scroll state — collapses utility bar, shrinks logo, adds shadow
const header = document.getElementById('site-header');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 40);
});

// Mobile nav toggle
const toggle = document.getElementById('menu-toggle');
const nav = document.getElementById('main-nav');
let syncFrame = null;

function syncNavPosition() {
  nav.style.top = header.getBoundingClientRect().height + 'px';
  syncFrame = requestAnimationFrame(syncNavPosition);
}

toggle.addEventListener('click', () => {
  const open = nav.style.display === 'flex';

  if (open) {
    nav.style.cssText = '';
    toggle.classList.remove('active');
    cancelAnimationFrame(syncFrame);
  } else {
    const headerHeight = header.getBoundingClientRect().height;
    nav.style.cssText =
      `display:flex;flex-direction:column;position:fixed;top:${headerHeight}px;right:0;height:auto;width:70%;background:#FBF7EF;padding:24px 40px 40px;gap:28px;z-index:99;box-shadow:-10px 0 30px rgba(92,26,36,0.1);overflow-y:auto;`;
    toggle.classList.add('active');
    syncFrame = requestAnimationFrame(syncNavPosition);
  }
});

nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  if(window.innerWidth <= 760){
    nav.style.cssText='';
    toggle.classList.remove('active');
    cancelAnimationFrame(syncFrame);
  }
}));