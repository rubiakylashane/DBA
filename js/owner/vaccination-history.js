/* js/owner/vaccination-history.js
   Vaccination History (read only for the owner). Each record is put in a group by its "next due" date:
     overdue  = next due date already passed
     soon     = next due within DUE_SOON_DAYS days
     ok       = everything else (including records with no next due date)
   The vet / staff add the records. */
(() => {
  const USE_BACKEND = true;
  const API = { vaccinations: "/api/vaccinations" }; // [{ id, vaccine, pet, dateAdministered, nextDue, administeredBy, notes }]
  const DUE_SOON_DAYS = 30;

  /* Demo storage: this browser's localStorage, one list per signed-in user (empty until records are added). */
  const BASE = "pawpaw_vaccinations";
  function userKey() {
    let name = "guest";
    for (const store of ["sessionStorage", "localStorage"]) {
      try {
        const u = JSON.parse(window[store].getItem("pawpaw_user") || "null");
        if (u && u.name) { name = String(u.name).trim().toLowerCase(); break; }
      } catch (_) { /* ignore */ }
    }
    return BASE + ":" + name;
  }

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const toIso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const fmtDate = (iso) => {
    const d = new Date(iso + "T00:00:00");
    return !iso || isNaN(d) ? "" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  };

  async function loadData() {
    if (USE_BACKEND && window.PawApi.isBackendSession()) {
      try {
        return await window.PawApi.request(API.vaccinations);
      } catch (err) {
        console.error("[vaccinations] backend failed:", err);
        throw err;
      }
    }
    try {
      const v = JSON.parse(localStorage.getItem(userKey()) || "null");
      return Array.isArray(v) ? v : [];
    } catch (_) { return []; }
  }

  let records = [];
  let loadError = "";
  const sortEl = $("sort");

  function groupOf(r) {
    if (!r.nextDue) return "ok";
    const today = toIso(new Date());
    const soon = new Date(); soon.setDate(soon.getDate() + DUE_SOON_DAYS);
    if (r.nextDue < today) return "overdue";
    if (r.nextDue <= toIso(soon)) return "soon";
    return "ok";
  }

  function sorted(list) {
    const by = {
      due: (a, b) => (a.nextDue || "9999").localeCompare(b.nextDue || "9999"),
      new: (a, b) => (b.dateAdministered || "").localeCompare(a.dateAdministered || ""),
      pet: (a, b) => String(a.pet).localeCompare(String(b.pet)) || (a.nextDue || "9999").localeCompare(b.nextDue || "9999"),
      vaccine: (a, b) => String(a.vaccine).localeCompare(String(b.vaccine))
    };
    return [...list].sort(by[sortEl.value] || by.due);
  }

  const cell = (label, html, cls = "") => `<span role="cell" class="${cls}" data-label="${label}">${html}</span>`;
  const dash = (s) => (s ? esc(s) : "-");

  function rowHtml(r) {
    return `
      <div class="vh-row" role="row">
        ${cell("Vaccine", esc(r.vaccine), "vh-strong")}
        ${cell("Pet", esc(r.pet), "vh-strong")}
        ${cell("Date Administered", dash(fmtDate(r.dateAdministered)), "vh-strong")}
        ${cell("Next Due", dash(fmtDate(r.nextDue)))}
        ${cell("Administered By", dash(r.administeredBy))}
        ${cell("Notes", dash(r.notes))}
      </div>`;
  }

  const EMPTY = {
    overdue: "No overdue vaccinations.",
    soon: "Nothing is due soon.",
    ok: "No vaccination records yet. They appear here after your pet is vaccinated."
  };

  function render() {
    if (loadError) {
      ["overdue-rows", "soon-rows", "ok-rows"].forEach((id) => { $(id).textContent = loadError; });
      return;
    }
    const groups = { overdue: [], soon: [], ok: [] };
    records.forEach((r) => groups[groupOf(r)].push(r));
    for (const key of Object.keys(groups)) {
      $("stat-" + key).textContent = groups[key].length;
      $(key + "-rows").innerHTML = groups[key].length
        ? sorted(groups[key]).map(rowHtml).join("")
        : `<p class="vh-empty">${EMPTY[key]}</p>`;
    }
  }

  sortEl.addEventListener("change", render);
  loadData().then((d) => { records = d; render(); }).catch((error) => {
    console.error("[vaccinations] could not load records:", error);
    loadError = error.message || "Could not load vaccination records.";
    render();
  });
})();