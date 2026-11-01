/* js/owner/notifications.js - notification bell for the owner pages
   Add ONE line before </body> on every owner page (after the other scripts):
       <script src="../../js/owner/notifications.js"></script>
   The bell is added by this script (top right), no HTML or CSS changes needed.

   Demo data: localStorage "pawpaw_notifications:<owner>" = [{ id, type, title, text, createdAt, readAt }]
   (the staff pages write to it). Backend API:
     GET   /api/notifications            -> [{ id, type, title, text, createdAt, readAt }]
     PATCH /api/notifications/:id/read
     POST  /api/notifications/read-all */
(() => {
  const USE_BACKEND = true;
  const API = { list: "/api/notifications", read: (id) => "/api/notifications/" + encodeURIComponent(id) + "/read", readAll: "/api/notifications/read-all" };
  const backendToken = () => {
    for (const store of [sessionStorage, localStorage]) {
      for (const key of ["token", "pawpaw_token"]) {
        const value = store.getItem(key);
        if (value) return value;
      }
    }
    return "";
  };
  const backendSession = () => window.PawApi
    ? window.PawApi.isBackendSession()
    : Boolean(backendToken() && backendToken() !== "demo-token");
  async function backendRequest(url, options = {}) {
    if (window.PawApi) return window.PawApi.request(url, options);
    const headers = new Headers(options.headers || {});
    const token = backendToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(url, { ...options, headers });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || data.message || `Request failed (${response.status}).`);
    return data;
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /* Notifications are scoped to locally known vet identities only in demo mode. */
  const VETS = (() => { try { const v = JSON.parse(localStorage.getItem("pawpaw_vets") || "null"); if (Array.isArray(v)) return v.map((x) => x.name); } catch (_) { /* use no cached names */ } return []; })();
  const user = (() => {
    for (const st of ["sessionStorage", "localStorage"]) {
      try { const u = JSON.parse(window[st].getItem("pawpaw_user") || "null"); if (u && u.name) return u; } catch (_) {}
    }
    return null;
  })();
  const role = user ? String(user.role || "owner") : "";
  const vetOf = () => { const w = String(user.name).toLowerCase().split(/[\s_.-]+/); return VETS.find((v) => w.some((x) => x.length > 2 && x !== "dr" && v.toLowerCase().includes(x))) || null; };
  function ownerKey() {                                     // identity used for this browser's "already shown" list
    if (!user) return "";
    if (role === "staff" || role === "admin") return "staff";
    if (role === "vet") return "vet:" + (vetOf() || "all").toLowerCase();
    return String(user.name).trim().toLowerCase();
  }
  const KEYS = !user ? [] : (role === "staff" || role === "admin") ? ["pawpaw_notifications:staff"]
    : role === "vet" ? (vetOf() ? [vetOf()] : VETS).map((v) => "pawpaw_notifications:vet:" + v.toLowerCase())
    : ["pawpaw_notifications:" + String(user.name).trim().toLowerCase()];
  if (!user) return;                                         // not signed in

  let items = [];
  async function load() {
    if (USE_BACKEND && backendSession()) {
      return backendRequest(API.list);
    }
    const out = [];
    KEYS.forEach((k) => { try { const v = JSON.parse(localStorage.getItem(k) || "[]"); if (Array.isArray(v)) v.forEach((n) => out.push({ ...n, _k: k })); } catch (_) {} });
    return out;
  }
  const save = () => KEYS.forEach((k) => { try { localStorage.setItem(k, JSON.stringify(items.filter((n) => n._k === k).map(({ _k, ...n }) => n))); } catch (_) {} });

  const IS_STAFF = role === "staff" || role === "admin";   // staff bell reads "pawpaw_notifications:staff" (owner book / cancel / reschedule)
  const IS_VET = role === "vet";                            // vet bell: new patient, check-in, reschedule, cancel
  const ACCENT = "#f2d64f";
  /* Where a notification leads: the page of what it is about. A notification can carry its own page in
     "link" (e.g. "medical-records.html"); older ones are matched by their title / type. */
  function pageOf(n) {
    if (n.link && /^[\w-]+\.html(\?[\w=&%.-]*)?$/.test(n.link)) return n.link;
    const t = String(n.title || "");
    if (IS_STAFF) return n.type === "reminder" ? "vaccine-reminders.html" : "appointments.html";
    if (IS_VET) return "my-appointments.html";
    if (/medical record/i.test(t)) return "medical-records.html";
    if (/vaccin\w* (recorded|added)/i.test(t)) return "vaccination-history.html";
    if (n.type === "reminder") return "vaccination-history.html";
    return "my-appointments.html";
  }
  function kindOf(n) {
    const t = String(n.title || "");
    if (/medical record/i.test(t)) return "record";
    if (/vaccin\w* (recorded|added)/i.test(t)) return "reminder";
    return n.type;
  }
  const ICON = {
    record: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M9.5 13h6M9.5 17h6"/>',
    reminder: '<path d="M12 3 4.5 6v5.5c0 4.5 3 8 7.5 9.5 4.5-1.5 7.5-5 7.5-9.5V6L12 3Z"/>',
    appointment: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'
  };
  function ago(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
    if (s < 60) return "Just now";
    if (s < 3600) return Math.floor(s / 60) + " min ago";
    if (s < 86400) return Math.floor(s / 3600) + " hr ago";
    if (s < 172800) return "Yesterday";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  /* ---------- styles ---------- */
  const css = document.createElement("style");
  css.textContent = `
  .nb-bell{position:fixed;top:16px;right:24px;z-index:60;width:46px;height:46px;border-radius:50%;background:#fff;color:#0f6b5c;display:grid;place-items:center;cursor:pointer;border:3px solid ${ACCENT};box-shadow:0 2px 10px rgba(0,0,0,.3)}
  .nb-bell:hover{background:#f1f6f3}.nb-bell:focus-visible{outline:3px solid ${ACCENT};outline-offset:2px}
  .nb-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#d9534f;color:#fff;font:700 12px/20px Inter,sans-serif;text-align:center;box-sizing:border-box}
  .nb-panel{position:fixed;top:72px;right:24px;z-index:61;width:min(380px,calc(100vw - 32px));max-height:min(520px,calc(100vh - 100px));display:flex;flex-direction:column;background:#fff;color:#222;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.28);font-family:Inter,sans-serif;overflow:hidden}
  .nb-panel[hidden]{display:none}
  .nb-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid #e3e6e3}
  .nb-head h2{margin:0;font-size:17px;font-weight:700}
  .nb-all{border:0;background:none;color:#0f6b5c;font:600 13px Inter,sans-serif;cursor:pointer;padding:6px 4px}.nb-all:disabled{color:#999;cursor:default}
  .nb-list{margin:0;padding:0;list-style:none;overflow-y:auto}
  .nb-item{display:flex;gap:14px;padding:16px 20px;border-bottom:1px solid #eef0ee;cursor:pointer;text-decoration:none;color:inherit}
  .nb-item:hover{background:#f6f9f7}.nb-item.new{background:#fff8e6}.nb-item.new:hover{background:#fff1cf}
  .nb-ico{flex:none;width:38px;height:38px;border-radius:50%;background:#e8f1ee;color:#0f6b5c;display:grid;place-items:center}
  .nb-item.new .nb-ico{background:#0f6b5c;color:#fff}
  .nb-body{flex:1;min-width:0}
  .nb-title{display:block;font-size:14.5px;font-weight:700;line-height:1.3}
  .nb-text{display:block;margin-top:3px;font-size:13.5px;line-height:1.45;color:#444;overflow-wrap:anywhere}
  .nb-time{display:block;margin-top:5px;font-size:12px;color:#777}
  .nb-empty{padding:34px 20px;text-align:center;font-size:14px;color:#666}
  .nb-tabs{display:flex;gap:8px;padding:12px 20px 0}
  .nb-tab{border:0;border-radius:999px;padding:7px 16px;background:#eef1ee;color:#222;font:600 13px Inter,sans-serif;cursor:pointer}
  .nb-tab.on{background:#0f6b5c;color:#fff}
  .nb-group{padding:14px 20px 6px;font:700 12px Inter,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#6a6a6a;background:#fff;position:sticky;top:0}
  .nb-toasts{position:fixed;right:24px;bottom:24px;z-index:70;display:grid;gap:12px;width:min(360px,calc(100vw - 32px));font-family:Inter,sans-serif}
  .nb-toast{display:flex;gap:14px;align-items:flex-start;padding:16px 18px;border-radius:14px;background:#fff;color:#222;border-left:6px solid ${ACCENT};box-shadow:0 10px 30px rgba(0,0,0,.35);text-decoration:none;animation:nbin .25s ease-out}
  .nb-toast .nb-ico{background:#fdf0d2;color:#b97a00}
  .nb-toast strong{display:block;font-size:14.5px;line-height:1.3;color:#111}
  .nb-toast span.t{display:block;margin-top:3px;font-size:13px;line-height:1.45;color:#444}
  .nb-toast button{margin-left:auto;border:0;background:none;color:#555;font-size:20px;line-height:1;cursor:pointer}
  @keyframes nbin{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  @media (prefers-reduced-motion:reduce){.nb-toast{animation:none}}
  @media (max-width:900px){.nb-bell{top:10px;right:12px;width:42px;height:42px}.nb-panel{top:60px;right:16px}.nb-toasts{right:16px;bottom:16px}}`;
  document.head.appendChild(css);

  /* ---------- bell + panel ---------- */
  const bell = document.createElement("button");
  bell.type = "button"; bell.className = "nb-bell"; bell.setAttribute("aria-label", "Notifications"); bell.setAttribute("aria-haspopup", "true"); bell.setAttribute("aria-expanded", "false");
  bell.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg><span class="nb-badge" hidden></span>';
  const panel = document.createElement("div");
  panel.className = "nb-panel"; panel.hidden = true; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Notifications");
  panel.innerHTML = '<div class="nb-head"><h2>Notifications</h2><button type="button" class="nb-all">Mark all as read</button></div><div class="nb-tabs" role="tablist"><button type="button" class="nb-tab on" data-tab="all" role="tab">All</button><button type="button" class="nb-tab" data-tab="unread" role="tab">Unread</button></div><ul class="nb-list"></ul>';
  document.body.append(bell, panel);
  const badge = bell.querySelector(".nb-badge"), list = panel.querySelector(".nb-list"), allBtn = panel.querySelector(".nb-all");

  let tab = "all";
  const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  function groupOf(iso) {
    const days = Math.round((dayStart(Date.now()) - dayStart(iso)) / 86400000);
    return days <= 0 ? "Today" : days === 1 ? "Yesterday" : days < 7 ? "Earlier this week" : "Older";
  }
  const item = (n) => `
      <li><a class="nb-item${n.readAt ? "" : " new"}" href="${esc(pageOf(n))}" data-id="${esc(n.id)}">
        <span class="nb-ico"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[kindOf(n)] || ICON.appointment}</svg></span>
        <span class="nb-body"><span class="nb-title">${esc(n.title)}</span><span class="nb-text">${esc(n.text)}</span><span class="nb-time">${esc(ago(n.createdAt))}</span></span>
      </a></li>`;

  function render() {
    const sorted = [...items].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const unread = sorted.filter((n) => !n.readAt).length;
    badge.hidden = !unread; badge.textContent = unread > 9 ? "9+" : String(unread);
    bell.setAttribute("aria-label", unread ? "Notifications, " + unread + " unread" : "Notifications");
    allBtn.disabled = !unread;
    panel.querySelectorAll(".nb-tab").forEach((t) => { t.classList.toggle("on", t.dataset.tab === tab); t.setAttribute("aria-selected", String(t.dataset.tab === tab)); });
    const shown = tab === "unread" ? sorted.filter((n) => !n.readAt) : sorted;
    let html = "", last = "";
    shown.forEach((n) => { const g = groupOf(n.createdAt); if (g !== last) { html += `<li class="nb-group" role="presentation">${g}</li>`; last = g; } html += item(n); });
    list.innerHTML = html || `<li class="nb-empty">${tab === "unread" ? "You're all caught up." : "No notifications yet."}</li>`;
  }

  /* ---------- toast: a short pop-up for something new ---------- */
  const TKEY = "pawpaw_notif_toasted:" + ownerKey();
  const toastBox = document.createElement("div");
  toastBox.className = "nb-toasts"; toastBox.setAttribute("aria-live", "polite"); document.body.appendChild(toastBox);
  function popToasts() {
    let done = []; try { done = JSON.parse(localStorage.getItem(TKEY) || "[]"); } catch (_) {}
    const fresh = items.filter((n) => !n.readAt && done.indexOf(n.id) < 0).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    if (!fresh.length) return;
    try { localStorage.setItem(TKEY, JSON.stringify(done.concat(fresh.map((n) => n.id)).slice(-100))); } catch (_) {}
    fresh.slice(0, 2).forEach((n) => {
      const t = document.createElement("a");
      t.className = "nb-toast"; t.href = pageOf(n);
      t.innerHTML = `<span class="nb-ico"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[kindOf(n)] || ICON.appointment}</svg></span><span><strong>${esc(n.title)}</strong><span class="t">${esc(n.text)}</span></span><button type="button" aria-label="Close">&times;</button>`;
      t.querySelector("button").addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); t.remove(); });
      toastBox.appendChild(t);
      setTimeout(() => t.remove(), 7000);
    });
    if (fresh.length > 2) {
      const m = document.createElement("div"); m.className = "nb-toast"; m.innerHTML = `<span><strong>+ ${fresh.length - 2} more</strong><span class="t">Open the bell to read them.</span></span>`;
      toastBox.appendChild(m); setTimeout(() => m.remove(), 7000);
    }
  }

  async function markRead(id) {
    const n = items.find((x) => x.id === id); if (!n || n.readAt) return;
    if (USE_BACKEND && backendSession()) {
      const saved = await backendRequest(API.read(id), { method: "PATCH" });
      n.readAt = saved.readAt;
      render();
      return;
    }
    n.readAt = new Date().toISOString(); save();
  }
  async function markAll() {
    if (USE_BACKEND && backendSession()) {
      await backendRequest(API.readAll, { method: "POST" });
      const now = new Date().toISOString();
      items.forEach((n) => { if (!n.readAt) n.readAt = now; });
      render();
      return;
    }
    const now = new Date().toISOString(); items.forEach((n) => { if (!n.readAt) n.readAt = now; }); save(); render();
  }
  const setOpen = (open) => { if (open) tab = "all"; panel.hidden = !open; bell.setAttribute("aria-expanded", String(open)); if (open) render(); };

  bell.addEventListener("click", () => setOpen(panel.hidden));
  allBtn.addEventListener("click", () => { markAll().catch((error) => console.error("[notifications] could not mark all read:", error)); });
  panel.querySelector(".nb-tabs").addEventListener("click", (e) => { const t = e.target.closest("[data-tab]"); if (t) { tab = t.dataset.tab; render(); } });
  list.addEventListener("click", (e) => { const a = e.target.closest("[data-id]"); if (a) markRead(a.dataset.id).catch((error) => console.error("[notifications] could not mark read:", error)); });
  document.addEventListener("click", (e) => { if (!panel.hidden && !panel.contains(e.target) && !bell.contains(e.target)) setOpen(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) { setOpen(false); bell.focus(); } });

  /* refresh when the staff page (another tab) adds something, or when this tab is shown again */
  const refresh = () => load().then((v) => { items = v; render(); popToasts(); }).catch((error) => {
    console.error("[notifications] backend failed:", error);
    list.textContent = error.message || "Could not load notifications.";
  });
  window.addEventListener("storage", (e) => { if (KEYS.indexOf(e.key) >= 0) refresh(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  setInterval(refresh, 15000);
  refresh();
})();