/* js/vet/vet-vaccinations.js - Vet: Vaccinations
   "Record Vaccination" saves a vaccine given (also saved automatically when a visit is completed).
   Demo data: "pawpaw_vaccinations:<owner>" (feeds the staff Vaccine Reminders and the owner Vaccination History).
   Backend: GET /api/vet/vaccinations           -> [{ id, owner, pet, vaccine, dateAdministered, nextDue }]
            POST /api/vaccinations              { owner, petId, vaccine, dateAdministered, nextDue, notes } */
(() => {
  const V = window.PawVet, O = V.O, S = window.PawStaff, $ = (id) => document.getElementById(id), esc = O.esc;
  const SOON = 30;
  const VACCINES = ["Anti Rabies", "5-in-1 (DHPP)", "6-in-1", "4-in-1 (Cat)", "Kennel Cough", "Other"];
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const daysTo = (iso) => Math.round((new Date(iso + "T00:00:00") - now) / 86400000);
  const KEY = "pawpaw_vaccinations:";

  function readAll() {
    const rows = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf(KEY) !== 0) continue;
        const owner = k.slice(KEY.length);
        (V.readJson(k, []) || []).forEach((r) => { if (!V.mine || !r.administeredBy || r.administeredBy === V.mine) rows.push({ ...r, owner }); });
      }
    } catch (_) { /* storage blocked */ }
    return rows;
  }
  let rows = readAll();
  let loadError = "";

  const cls = (r) => { if (!r.nextDue) return "ok"; const d = daysTo(r.nextDue); return d < 0 ? "late" : d <= SOON ? "soon" : "ok"; };
  const SORTS = {
    recent: (a, b) => (b.dateAdministered || "").localeCompare(a.dateAdministered || ""),
    due: (a, b) => (a.nextDue || "9999").localeCompare(b.nextDue || "9999"),
    pet: (a, b) => (a.pet || "").localeCompare(b.pet || "")
  };

  function render() {
    if (loadError) {
      $("vx-rows").textContent = loadError;
      return;
    }
    const q = $("search").value.trim().toLowerCase();
    const list = rows.filter((r) => !q || [r.pet, r.vaccine, V.ownerName(r.owner)].join(" ").toLowerCase().includes(q)).sort(SORTS[$("sort").value] || SORTS.recent);
    $("vx-rows").innerHTML = list.length ? list.map((r) => `
      <div class="orow vrow-vx" role="row">
        <span role="cell" class="o-name">${esc(r.pet || "-")}</span>
        <span role="cell" class="vx-muted">${esc(r.vaccine || "-")}</span>
        <span role="cell" class="vx-bold">${esc(O.fmtShort(r.dateAdministered))}</span>
        <span role="cell" class="vx-due vx-${cls(r)}">${r.nextDue ? esc(O.fmtShort(r.nextDue)) : "-"}</span>
      </div>`).join("") : `<p class="o-empty">${rows.length ? "Nothing matches your search." : "No vaccinations recorded yet."}</p>`;
  }

  /* ----- Record Vaccination ----- */
  const dlg = $("rv-dialog");
  const err = (m) => { $("rv-err").textContent = m || ""; $("rv-err").hidden = !m; return !m; };
  const suggest = (from) => { const d = new Date(from + "T00:00:00"); d.setFullYear(d.getFullYear() + 1); return V.iso(d); };
  function fillPets() {
    const pets = O.petsOf($("rv-owner").value);
    $("rv-pet").innerHTML = pets.length ? pets.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("") : `<option value="">No pets</option>`;
  }
  function openRecord() {
    const owners = O.list();
    $("rv-owner").innerHTML = owners.map((o) => `<option value="${esc(o.id)}">${esc(o.short)}</option>`).join("");
    $("rv-vaccine").innerHTML = VACCINES.map((v) => `<option>${esc(v)}</option>`).join("");
    $("rv-other").value = ""; $("rv-other-box").hidden = true;
    $("rv-date").value = V.today(); $("rv-due").value = suggest(V.today()); $("rv-notes").value = "";
    fillPets(); err(""); dlg.showModal();
  }
  async function save() {
    const owner = $("rv-owner").value, petId = $("rv-pet").value;
    let vaccine = $("rv-vaccine").value; if (vaccine === "Other") vaccine = $("rv-other").value.trim();
    const given = $("rv-date").value, due = $("rv-due").value;
    if (!owner) return err("Pick an owner.");
    if (!petId) return err("This owner has no pet yet.");
    if (!vaccine) return err("Enter the vaccine name.");
    if (!given) return err("Pick the date given.");
    if (given > V.today()) return err("The date given cannot be in the future.");
    if (!due) return err("Pick the next due date.");
    if (due <= given) return err("The next due date must be after the date given.");
    const pet = O.getPet(owner, petId);
    if (window.PawApi.isBackendSession()) {
      try {
        await window.PawApi.request("/api/vaccinations", {
          method: "POST",
          body: { petId, vaccine, dateAdministered: given, nextDue: due, notes: $("rv-notes").value.trim() }
        });
        rows = await window.PawApi.request("/api/vet/vaccinations");
      } catch (error) {
        return err(error.message || "Could not save the vaccination.");
      }
    } else {
      const k = KEY + owner, list = V.readJson(k, []);
      list.push({ id: "vx-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), apptId: "", petId, pet: pet ? pet.name : "", vaccine, dateAdministered: given, nextDue: due, administeredBy: V.mine || "Vet", notes: $("rv-notes").value.trim() });
      try { localStorage.setItem(k, JSON.stringify(list)); } catch (_) { return err("Could not save. Storage is blocked."); }
      window.PawOwners.audit("create", "vaccination", "Recorded " + vaccine + " vaccination for " + (pet ? pet.name : "a pet") + ".");
      window.PawStaffAppts.notify(owner, "record", "Vaccination recorded", vaccine + " given to " + (pet ? pet.name : "your pet") + ". See Vaccination History for the next due date.");
      rows = readAll();
    }
    dlg.close(); render(); S.toast("Vaccination recorded.");
  }
  $("record-btn").addEventListener("click", openRecord);
  $("rv-owner").addEventListener("change", fillPets);
  $("rv-vaccine").addEventListener("change", () => { $("rv-other-box").hidden = $("rv-vaccine").value !== "Other"; });
  $("rv-date").addEventListener("change", () => { if ($("rv-date").value) $("rv-due").value = suggest($("rv-date").value); });
  $("rv-ok").addEventListener("click", save);
  $("rv-cancel").addEventListener("click", () => dlg.close());
  $("search").addEventListener("input", render);
  $("sort").addEventListener("change", render);
  if (window.PawApi.isBackendSession()) {
    window.PawApi.request("/api/vet/vaccinations")
      .then((data) => { rows = data; render(); })
      .catch((error) => { loadError = error.message; S.toast(error.message); render(); });
  } else render();
})();