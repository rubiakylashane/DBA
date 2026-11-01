/* js/staff/vaccine-reminders.js - staff Vaccination Reminder list
   Reads the vaccination records saved per owner ("pawpaw_vaccinations:<owner>", each with a nextDue date).
   Reminder records and delivery are managed by the clinic API. */
(() => {
  const O = window.PawOwners, S = window.PawStaff, $ = (id) => document.getElementById(id), esc = O.esc;
  const USE_BACKEND = true;
  const API_NOTIFY = (id) => "/api/vaccination-reminders/" + encodeURIComponent(id) + "/notify";
  const SOON = 30;                                  // days: orange when due within this many days
  const KEY = "pawpaw_vaccinations:";
  let loadError = "";

  async function load() {
    if (USE_BACKEND && window.PawApi.isBackendSession()) {
      return window.PawApi.request("/api/staff/vaccination-reminders");
    }
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf(KEY) !== 0) continue;
        const owner = k.slice(KEY.length);
        (JSON.parse(localStorage.getItem(k) || "[]") || []).forEach((r, i) => { if (r && r.nextDue) out.push({ ...r, id: r.id || owner + "-" + i, owner }); });
      }
    } catch (_) { /* storage blocked */ }
    return out;
  }
  let all = [];

  const midnight = (iso) => new Date(iso + "T00:00:00");
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const daysTo = (iso) => Math.round((midnight(iso) - now) / 86400000);
  const ownerOf = (r) => { try { return { ...O.owner(r.owner), short: O.owner(r.owner).short || r.ownerName, phone: O.owner(r.owner).phone || r.phone }; } catch (_) { return { short: r.ownerName || r.owner, phone: r.phone || "" }; } };
  const fmtDate = (iso) => midnight(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const plural = (n) => n + (n === 1 ? " day" : " days");

  function status(r) {
    const d = daysTo(r.nextDue);
    if (d < 0) return { cls: "red", text: "Overdue for " + plural(-d) };
    if (d === 0) return { cls: "orange", text: "Due today" };
    return { cls: d <= SOON ? "orange" : "green", text: "Upcoming in " + plural(d) };
  }

  const sorters = {
    due: (a, b) => a.nextDue.localeCompare(b.nextDue),
    overdue: (a, b) => (daysTo(a.nextDue) < 0 ? 0 : 1) - (daysTo(b.nextDue) < 0 ? 0 : 1) || a.nextDue.localeCompare(b.nextDue),
    pet: (a, b) => String(a.pet).localeCompare(String(b.pet)),
    vaccine: (a, b) => String(a.vaccine).localeCompare(String(b.vaccine))
  };

  function row(r) {
    const o = ownerOf(r), st = status(r);
    const phone = o.phone || "";
    const q = "owner=" + encodeURIComponent(r.owner) + "&petid=" + encodeURIComponent(r.petId || "") + "&pet=" + encodeURIComponent(r.pet || "") + "&vaccine=" + encodeURIComponent(r.vaccine || "");
    return `
      <div class="orow vrow" role="row">
        <span role="cell">${esc(r.vaccine || "-")}</span>
        <span role="cell"><span class="o-name">${esc(r.pet || "-")}</span><span class="o-email">${esc(o.short || o.name || r.owner)}</span></span>
        <span role="cell">${phone ? esc(phone) : '<span class="a-muted">No number</span>'}</span>
        <span role="cell">${esc(fmtDate(r.nextDue))}</span>
        <span role="cell"><span class="vpill vpill-${st.cls}">${esc(st.text)}</span>${r.lastRemindedAt ? `<span class="v-sent">Reminded ${esc(fmtDate(r.lastRemindedAt.slice(0, 10)))}</span>` : ""}</span>
        <span role="cell" class="v-actions">
          <button type="button" class="obtn obtn-green obtn-sm" data-remind="${esc(r.id)}">${r.lastRemindedAt ? "Send Again" : "Send Reminder"}</button>
          <a class="obtn obtn-outline obtn-sm" href="vaccine-book.html?${q}">Book a visit</a>
        </span>
      </div>`;
  }

  function render() {
    if (loadError) {
      $("vx-rows").textContent = loadError;
      return;
    }
    const q = $("search").value.trim().toLowerCase();
    const list = all
      .filter((r) => !q || [r.vaccine, r.pet, ownerOf(r).short, ownerOf(r).phone, status(r).text].join(" ").toLowerCase().includes(q))
      .sort(sorters[$("sort").value] || sorters.due);
    $("vx-rows").innerHTML = list.length ? list.map(row).join("")
      : `<p class="o-empty">${all.length ? "No reminders match your search." : "No vaccination reminders yet. They appear once a vaccination record has a next due date."}</p>`;
  }

  async function remind(r, btn) {
    btn.disabled = true;
    let sentAt = new Date().toISOString();
    try {
      if (USE_BACKEND && window.PawApi.isBackendSession()) {
        sentAt = (await window.PawApi.request(API_NOTIFY(r.id), { method: "POST" })).sentAt || sentAt;
      } else {
        const key = KEY + r.owner, list = JSON.parse(localStorage.getItem(key) || "[]");
        const i = list.findIndex((x, n) => (x.id || r.owner + "-" + n) === r.id);
        if (i >= 0) { list[i].lastRemindedAt = sentAt; localStorage.setItem(key, JSON.stringify(list)); }
      }
      r.lastRemindedAt = sentAt; render();
      if (!USE_BACKEND || !window.PawApi.isBackendSession()) try {
        const nk = "pawpaw_notifications:" + r.owner, nl = JSON.parse(localStorage.getItem(nk) || "[]");
        nl.push({ id: "n-" + Date.now().toString(36), type: "reminder", title: "Vaccine reminder: " + (r.pet || ""),
          text: (r.vaccine || "Vaccine") + " is due on " + fmtDate(r.nextDue) + ". Book an appointment to keep your pet protected.", createdAt: sentAt, readAt: null });
        localStorage.setItem(nk, JSON.stringify(nl.slice(-50)));
      } catch (_) { /* ignore */ }
      S.toast("Reminder sent to " + (ownerOf(r).short || r.owner) + ".");
    } catch (err) {
      btn.disabled = false; S.toast(err.message || "Could not send the reminder. Try again.");
    }
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-remind]");
    if (b) { const r = all.find((x) => x.id === b.dataset.remind); if (r) remind(r, b); }
  });
  $("search").addEventListener("input", render);
  $("sort").addEventListener("change", render);
  load().then((items) => { all = items; render(); }).catch((error) => { loadError = error.message; S.toast(error.message); render(); });
})();
