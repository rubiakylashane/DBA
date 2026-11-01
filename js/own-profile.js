/* js/own-profile.js - for the pages that do not load staff-shell.js (the staff Dashboard):
   the sidebar shows the name / picture saved in My Profile, a "My Profile" link is added to the menu,
   and the name and picture open it. (staff-shell.js does the same on every other admin / staff page.) */
(() => {
  const $ = (id) => document.getElementById(id);
  let user = null;
  for (const store of ["sessionStorage", "localStorage"]) {
    try { const u = JSON.parse(window[store].getItem("pawpaw_user") || "null"); if (u && u.name) { user = u; break; } } catch (_) { /* ignore */ }
  }
  if (!user) return;
  function ownProfile(login, role) {
    role = role || (document.body.classList.contains("adm") ? "admin" : "");
    if (role !== "admin" && role !== "staff" && role !== "vet") return;
    if (role === "admin" && !document.body.classList.contains("adm")) return;   // an admin looking at a staff page has no staff profile
    try {
      const p = JSON.parse(localStorage.getItem("pawpaw_" + role + "_profile:" + String(login).trim().toLowerCase()) || "null");
      if (p && p.name && $("sidebar-name")) $("sidebar-name").textContent = p.name;
      if (p && p.photo && $("user-avatar")) $("user-avatar").style.backgroundImage = "url(" + p.photo + ")";
    } catch (_) { /* ignore */ }
    const nav = document.querySelector(".sidebar .nav");                // a visible "My Profile" link in the menu
    if (nav && !nav.querySelector('a[href="profile.html"]')) {
      const here = /\/profile\.html$/.test(location.pathname), l = document.createElement("a");
      l.href = "profile.html"; l.className = "nav-link" + (here ? " active" : "");
      if (here) l.setAttribute("aria-current", "page");
      l.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18.2c1.2-2 3.2-3 5.500-3s4.300 1 5.500 3"/></svg><span>My Profile</span>';
      nav.appendChild(l);
    }
    ["user-avatar", "sidebar-name"].forEach((id) => {
      const el = $(id); if (!el || !el.parentNode) return;
      const a = document.createElement("a");
      a.href = "profile.html"; a.className = "user-link"; a.title = "My profile"; a.setAttribute("aria-label", "My profile");
      el.parentNode.insertBefore(a, el); a.appendChild(el);
    });
  }


  ownProfile(user.name, user.role);
})();