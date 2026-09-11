// EV AutoGlass — shared site behavior
document.addEventListener('DOMContentLoaded', () => {

  // Mobile nav toggle
  const toggle = document.querySelector('.nav-toggle');
  const menu = document.querySelector('.mobile-menu');
  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      const open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // FAQ accordion
  document.querySelectorAll('.faq-item').forEach(item => {
    const q = item.querySelector('.faq-q');
    if (!q) return;
    q.addEventListener('click', () => {
      const wasOpen = item.classList.contains('open');
      item.parentElement.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });

  // Generic "scroll to element" trigger: any element with [data-scroll-to="#id"]
  document.querySelectorAll('[data-scroll-to]').forEach(el => {
    el.addEventListener('click', (e) => {
      const target = document.querySelector(el.getAttribute('data-scroll-to'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
});
