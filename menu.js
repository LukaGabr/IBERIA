// Accordion menu — one category open at a time
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