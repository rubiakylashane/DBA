/* js/staff/staff-shell.js
   Shared by the staff pages: mobile menu, user name, log out, and the little "saved" message. */
window.PawStaff = (() => {
  const $ = (id) => document.getElementById(id);

  for (const store of ["sessionStorage", "localStorage"]) {
    try {
      const u = JSON.parse(window[store].getItem("pawpaw_user") || "null");
      if (u && u.name) { if ($("sidebar-name")) $("sidebar-name").textContent = u.name; ownProfile(u.name, u.role); break; }
    } catch (_) { /* ignore */ }
  }

  /* admin and staff pages: the sidebar shows the name / picture saved in My Profile, and the name and picture link to it */
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

  const logout = $("logout");
  if (logout) logout.addEventListener("click", () => {
    try { localStorage.removeItem("token"); localStorage.removeItem("pawpaw_user"); sessionStorage.clear(); } catch (_) { /* ignore */ }
  });

  let timer;
  function toast(msg) {
    const t = $("toast");
    if (!t || !msg) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(timer);
    timer = setTimeout(() => t.classList.remove("show"), 2600);
  }
  if (window.PawOwners) toast(window.PawOwners.takeFlash());

  /* small helpers used by the form pages */
  const ownerId = () => new URLSearchParams(location.search).get("id") || new URLSearchParams(location.search).get("owner") || "";
  function setError(key, msg) {
    const el = $("err-" + key), input = $(key);
    if (el) { el.textContent = msg || ""; el.hidden = !msg; }
    if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
  }
  /* shrink a picked image to a small data URL so it fits in localStorage */
  function resize(file, max = 480) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const r = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image.")); };
      img.src = url;
    });
  }
  return { toast, ownerId, setError, resize };
})();