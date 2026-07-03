/* A3DIA — Shell partagé : menu overlay plein écran */
(() => {
  const burger = document.getElementById('x-burger');
  const menu = document.getElementById('x-menu');
  if (!burger || !menu) return;

  burger.addEventListener('click', () => {
    const open = document.body.classList.toggle('x-menu-open');
    burger.setAttribute('aria-expanded', open);
    menu.setAttribute('aria-hidden', !open);
  });

  menu.querySelectorAll('a').forEach(a =>
    a.addEventListener('click', () => document.body.classList.remove('x-menu-open'))
  );

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('x-menu-open')) burger.click();
  });
})();
