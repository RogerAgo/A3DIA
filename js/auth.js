/* =========================================================
   A3DIA — Auth nav manager (shell x-nav)
   Adapte la navigation à l'état de connexion :
   - connecté : le CTA « Espace adhérents » pointe directement sur
     l'espace, et le menu overlay gagne Administration (si admin)
     et Déconnexion.
   - non connecté : rien à faire, le CTA pointe déjà sur login.html.
   ========================================================= */

(async function initAuthNav() {
  let user = null;
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) ({ user } = await res.json());
  } catch { /* offline ou non connecté */ }
  if (!user) return;

  // CTA topbar + entrée du menu : accès direct à l'espace adhérents
  document.querySelectorAll('.x-nav-cta, #x-menu a[href="login.html"]').forEach(a => {
    if (a.tagName === 'A') a.href = 'espace-membres.html';
  });

  // Menu overlay : Administration (admin) + Déconnexion
  const menuList = document.querySelector('#x-menu nav ul');
  if (!menuList) return;

  const addItem = (html) => {
    const li = document.createElement('li');
    li.innerHTML = html;
    menuList.appendChild(li);
    return li;
  };

  const pad = n => String(n).padStart(2, '0');
  let next = menuList.children.length + 1;

  if (user.role === 'admin' && !menuList.querySelector('[href="admin.html"]')) {
    addItem(`<a href="admin.html"><i>${pad(next++)}</i>Administration</a>`);
  }

  const logoutItem = addItem(`<a href="#" id="x-menu-logout"><i>${pad(next)}</i>Déconnexion</a>`);
  logoutItem.querySelector('a').addEventListener('click', async e => {
    e.preventDefault();
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    window.location.href = '/';
  });
})();
