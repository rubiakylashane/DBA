/* js/owner/profile-store.js
   Demo storage for the owner's profile (this browser's localStorage, one profile per signed-in user).
   When the backend is ready, replace load / save with fetch() calls (GET / PUT /api/me). */
window.PawProfile = (() => {
  const BASE = "pawpaw_profile";
  let memory = null;

  function signedIn() {
    for (const store of ["sessionStorage", "localStorage"]) {
      try {
        const u = JSON.parse(window[store].getItem("pawpaw_user") || "null");
        if (u && u.name) return String(u.name).trim();
      } catch (_) { /* ignore */ }
    }
    return "";
  }
  const key = () => BASE + ":" + (signedIn().toLowerCase() || "guest");

  /* { name, email, phone, address, photo, memberSince } */
  function load() {
    let p = null;
    try { p = JSON.parse(localStorage.getItem(key()) || "null"); } catch (_) { p = memory; }
    p = p || {};
    const profile = {
      name: p.name || signedIn() || "User",
      email: p.email || "",
      phone: p.phone || "",
      address: p.address || "",
      photo: p.photo || "",
      memberSince: p.memberSince || new Date().toISOString().slice(0, 10)
    };
    if (!p.memberSince) save(profile);   // remember the first day this account was used
    return profile;
  }

  function save(patch) {
    const next = { ...(memory || {}), ...patch };
    memory = next;
    try { localStorage.setItem(key(), JSON.stringify(next)); } catch (_) { /* ignore */ }
    return next;
  }

  return { load, save };
})();