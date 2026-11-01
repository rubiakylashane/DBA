/* js/owner/app-shell.js
   Sidebar behaviour shared by every owner page: mobile menu, user name, log out. */
(() => {
  const $ = (id) => document.getElementById(id);

  /* ----- Mobile menu ----- */
  const sidebar = $("sidebar"), overlay = $("overlay"), menuBtn = $("menu-btn");
  if (sidebar && overlay && menuBtn) {
    const setMenu = (open) => {
      sidebar.classList.toggle("open", open);
      overlay.classList.toggle("show", open);
      menuBtn.setAttribute("aria-expanded", String(open));
    };
    menuBtn.addEventListener("click", () => setMenu(!sidebar.classList.contains("open")));
    overlay.addEventListener("click", () => setMenu(false));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
  }

  /* ----- User name (saved by login.js) ----- */
  let saved = null;
  for (const store of ["sessionStorage", "localStorage"]) {
    try {
      const u = JSON.parse(window[store].getItem("pawpaw_user") || "null");
      if (u && u.name) { saved = u; break; }
    } catch (_) { /* ignore */ }
  }
  if (saved) {
    if ($("sidebar-name")) $("sidebar-name").textContent = saved.name;
    // "Good day, <span id="greeting-name">User</span>" on any page
    if ($("greeting-name")) $("greeting-name").textContent = saved.name;
  }

  /* ----- Profile picture in the sidebar (saved on Edit Profile) ----- */
  try {
    const avatar = $("user-avatar");
    if (avatar && saved) {
      const prof = JSON.parse(localStorage.getItem("pawpaw_profile:" + String(saved.name).trim().toLowerCase()) || "null");
      const photo = (prof && prof.photo) || saved.photo;
      if (photo) avatar.style.cssText += `;background-image:url('${photo}');background-size:cover;background-position:center`;
    }
  } catch (_) { /* ignore */ }

  /* ----- Log out ----- */
  const logout = $("logout");
  if (logout) {
    logout.addEventListener("click", () => {
      try { localStorage.removeItem("token"); localStorage.removeItem("pawpaw_user"); sessionStorage.clear(); } catch (_) { /* ignore */ }
    });
  }
})();