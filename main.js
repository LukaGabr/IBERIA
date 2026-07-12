// Header scroll state — collapses utility bar, shrinks logo, adds shadow
const header = document.getElementById('site-header');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 40);
});

// Mobile nav toggle
const toggle = document.getElementById('menu-toggle');
const nav = document.getElementById('main-nav');
toggle.addEventListener('click', () => {
  const open = nav.style.display === 'flex';
  nav.style.display = open ? 'none' : 'flex';
  nav.style.cssText = open ? '' :
    'display:flex;flex-direction:column;position:fixed;top:0;right:0;bottom:0;width:70%;background:#FBF7EF;padding:100px 40px;gap:28px;z-index:99;box-shadow:-10px 0 30px rgba(92,26,36,0.1);';
});
nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  if(window.innerWidth <= 760){ nav.style.cssText=''; }
}));