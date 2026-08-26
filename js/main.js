/* =========================================================
   A3DIA — Scripts
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
  // Activate reveal-on-scroll only when JS is present
  document.documentElement.classList.add('js-reveal');
  initMobileNav();
  initCarousel();
  initActuFilters();
  initForms();
  initReveal();
  initActiveLink();
  initHeaderScroll();
});

/* -------- Header sticky : ajoute .scrolled après quelques px de scroll -------- */
function initHeaderScroll() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const onScroll = () => {
    if (window.scrollY > 16) header.classList.add('scrolled');
    else header.classList.remove('scrolled');
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

/* -------- Mobile nav toggle -------- */
function initMobileNav() {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.nav');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', () => {
    nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', nav.classList.contains('open'));
  });
}

/* -------- Set active nav link based on URL -------- */
function initActiveLink() {
  const links = document.querySelectorAll('.nav-link');
  const path = window.location.pathname.split('/').pop() || 'index.html';
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href === path || (path === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
}

/* -------- Carousel for actualités -------- */
function initCarousel() {
  const track = document.querySelector('.carousel-track');
  const prev = document.querySelector('.carousel-nav.prev');
  const next = document.querySelector('.carousel-nav.next');
  if (!track || !prev || !next) return;

  const scrollAmount = () => {
    const card = track.querySelector('.actu-card');
    if (!card) return 300;
    const style = getComputedStyle(track);
    const gap = parseInt(style.columnGap || style.gap || 20);
    return card.offsetWidth + gap;
  };

  prev.addEventListener('click', () => {
    track.scrollBy({ left: -scrollAmount(), behavior: 'smooth' });
  });
  next.addEventListener('click', () => {
    track.scrollBy({ left: scrollAmount(), behavior: 'smooth' });
  });
}

/* -------- Fil d'actualités : filtres par type d'opération -------- */
function initActuFilters() {
  const grid = document.getElementById('actu-grid');
  if (!grid) return;
  const buttons = document.querySelectorAll('.actu-filter');
  const cards = Array.from(grid.querySelectorAll('.actu-card'));
  const empty = document.getElementById('actu-empty');
  if (!buttons.length || !cards.length) return;

  const typeOf = card => {
    const badge = card.querySelector('.badge');
    return badge ? badge.textContent.trim() : '';
  };

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      buttons.forEach(b => b.classList.toggle('is-active', b === btn));
      let shown = 0;
      cards.forEach(card => {
        const match = filter === '*' || typeOf(card) === filter;
        card.hidden = !match;
        if (match) shown++;
      });
      if (empty) empty.hidden = shown > 0;
    });
  });
}

/* -------- Forms : validation + envoi AJAX si action serveur, sinon toast simple -------- */
function initForms() {
  const messages = {
    newsletter: 'Merci ! Vous êtes inscrit·e à notre newsletter.',
    contact: 'Votre message a bien été envoyé. Nous vous répondrons rapidement.',
    adhesion: 'Votre demande d\'adhésion a été enregistrée. Suivez les instructions reçues par email.'
  };

  document.querySelectorAll('form[data-form]').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formType = form.dataset.form;

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      // Si le formulaire a une action serveur (PHP ou /api/...), on envoie en AJAX
      const action = form.getAttribute('action');
      const hasServerAction = action && (action.endsWith('.php') || action.startsWith('/api/'));

      if (hasServerAction) {
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn ? btn.textContent : '';
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Envoi en cours…';
        }

        try {
          const useJson = action.startsWith('/api/');
          const fetchOptions = useJson
            ? {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify(Object.fromEntries(new FormData(form))),
              }
            : {
                method: 'POST',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                body: new FormData(form),
              };
          const res = await fetch(action, fetchOptions);
          const data = await res.json().catch(() => ({ success: false, error: 'Réponse serveur invalide' }));

          if (data.success) {
            form.reset();
            showToast(messages[formType] || 'Message envoyé', 'success');
          } else {
            showToast(data.error || 'Erreur lors de l\'envoi.', 'error');
          }
        } catch (err) {
          showToast('Problème de connexion. Veuillez réessayer.', 'error');
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
          }
        }
      } else {
        // Pas d'action serveur : juste un toast (formulaires non encore branchés)
        form.reset();
        showToast(messages[formType] || 'Envoyé avec succès', 'success');
      }
    });
  });
}

function showToast(message, type = '') {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = 'toast' + (type ? ' ' + type : '');
  // force reflow
  void toast.offsetWidth;
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), 3500);
}

/* -------- Reveal on scroll -------- */
function initReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || !els.length) {
    els.forEach(el => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  els.forEach(el => io.observe(el));
}
