/* =========================================================
   A3DIA — Auth nav manager
   Injecte les liens Espace Membres / Admin / Déconnexion
   dans la nav de chaque page selon l'état de connexion.
   ========================================================= */

(async function initAuthNav() {
  let user = null;
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) ({ user } = await res.json());
  } catch { /* offline ou non connecté */ }

  const navList = document.getElementById('nav-list') ?? document.querySelector('.nav-list');
  const navCta = document.querySelector('.nav-cta');
  if (!navList) return;

  if (user) {
    // Remplacer le bouton Connexion par Déconnexion dans la liste desktop
    const connexionItem = navList.querySelector('.nav-link-cta')?.closest('li');
    if (connexionItem) connexionItem.remove();

    // Ajouter Espace Membres si pas déjà présent
    const currentPath = window.location.pathname.replace(/\/$/, '').split('/').pop() || 'index.html';
    if (!navList.querySelector('[href="espace-membres.html"]') && !navList.querySelector('[href="/espace-membres"]')) {
      const emItem = document.createElement('li');
      emItem.innerHTML = `<a href="espace-membres.html" class="nav-link${currentPath === 'espace-membres.html' || currentPath === 'espace-membres' ? ' active' : ''}">Espace Membres</a>`;
      // Insérer avant Contact
      const contactItem = [...navList.querySelectorAll('.nav-link')].find(a => a.textContent.trim() === 'Contact')?.closest('li');
      contactItem ? navList.insertBefore(emItem, contactItem) : navList.appendChild(emItem);
    }

    // Ajouter Administration si admin
    if (user.role === 'admin' && !navList.querySelector('[href="admin.html"]')) {
      const adminItem = document.createElement('li');
      adminItem.innerHTML = `<a href="admin.html" class="nav-link">Administration</a>`;
      navList.appendChild(adminItem);
    }

    // Ajouter Déconnexion (mobile menu)
    const logoutMobileItem = document.createElement('li');
    logoutMobileItem.innerHTML = `<a href="#" class="nav-link nav-logout-trigger">Déconnexion</a>`;
    navList.appendChild(logoutMobileItem);

    // Remplacer le bouton CTA "Connexion" par "Déconnexion"
    if (navCta) {
      navCta.textContent = 'Déconnexion';
      navCta.removeAttribute('href');
      navCta.removeAttribute('target');
      navCta.removeAttribute('rel');
      navCta.style.cursor = 'pointer';
    }

    // Handlers déconnexion
    async function handleLogout(e) {
      e.preventDefault();
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
      window.location.href = '/';
    }
    navCta?.addEventListener('click', handleLogout);
    navList.querySelectorAll('.nav-logout-trigger').forEach(el => el.addEventListener('click', handleLogout));

  } else {
    // Pas connecté : mettre à jour l'URL Connexion vers /login
    const connexionLinks = navList.querySelectorAll('.nav-link-cta');
    connexionLinks.forEach(a => {
      a.href = 'login.html';
      a.removeAttribute('target');
      a.removeAttribute('rel');
    });
    if (navCta) {
      navCta.href = 'login.html';
      navCta.removeAttribute('target');
      navCta.removeAttribute('rel');
    }
  }
})();
