/* js/staff/medical-records.js - Records page, shared by staff (view only) and vet (view + add): visit records + prescriptions of every pet
   Demo storage (same lists the owner's Medical Records page reads):
     "pawpaw_records:<owner>" = { visits: [{ id, pet, date, diagnosis, treatment, notes }],
                                  prescriptions: [{ id, pet, date, medication, dose, instructions, quantity }] }
   Backend records are stored through the clinic API.
     GET  /api/staff/records            -> { visits: [{ ..., owner }], prescriptions: [{ ..., owner }] }
     POST /api/staff/records/visits           body: { owner, pet, date, diagnosis, treatment, notes }
     POST /api/staff/records/prescriptions    body: { owner, pet, date, medication, dose, instructions, quantity }
   Open with ?q=<pet name> to start with the search filled in (used by Appointments > View Record). */
(() => {
  const USE_BACKEND = true;
  const O = window.PawOwners, S = window.PawStaff, $ = (id) => document.getElementById(id), esc = O.esc;
  const KEY = "pawpaw_records:";

  const read = (key) => { try { const v = JSON.parse(localStorage.getItem(KEY + key) || "null"); return { visits: (v && v.visits) || [], prescriptions: (v && v.prescriptions) || [] }; } catch (_) { return { visits: [], prescriptions: [] }; } };
  const write = (key, v) => { try { localStorage.setItem(KEY + key, JSON.stringify(v)); } catch (_) {} };
  const uid = () => "r-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const pad = (n) => String(n).padStart(2, "0");
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  const fmt = (iso) => { const d = new Date(iso + "T00:00:00"); return !iso || isNaN(d) ? "-" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }); };
  const ownerName = (key, fallback) => { try { return O.owner(key).short || fallback || key; } catch (_) { return fallback || key; } };

  let visits = [], rxs = [], loadError = "";
  async function load() {
    visits = []; rxs = []; loadError = "";
    if (USE_BACKEND && window.PawApi.isBackendSession()) {
      const data = await window.PawApi.request("/api/staff/records");
      visits = data.visits || [];
      rxs = data.prescriptions || [];
      return;
    }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf(KEY) !== 0) continue;
        const owner = k.slice(KEY.length), d = read(owner);
        d.visits.forEach((v) => visits.push({ ...v, owner }));
        d.prescriptions.forEach((r) => rxs.push({ ...r, owner }));
      }
    } catch (_) { /* storage blocked */ }
  }

  /* opened from "View Record": only this owner's pet (matched by pet id; older records without an id by name) */
  const params = new URLSearchParams(location.search);
  let scope = params.get("owner") ? { owner: params.get("owner"), petId: params.get("petid") || "", name: params.get("q") || "" } : null;
  const inScope = (r) => !scope || (String(r.owner) === String(scope.owner) && (scope.petId && r.petId ? String(r.petId) === String(scope.petId) : !scope.name || r.pet === scope.name));
  function drawScope() {
    const el = $("scope"); if (!el) return;
    el.hidden = !scope;
    if (scope) el.innerHTML = `Showing records of <strong>${esc(scope.name || "this pet")}</strong> (${esc(ownerName(scope.owner))}) <button type="button" id="scope-clear">Show all</button>`;
  }
  const by = {
    new: (a, b) => (b.date || "").localeCompare(a.date || ""),
    old: (a, b) => (a.date || "").localeCompare(b.date || ""),
    pet: (a, b) => String(a.pet).localeCompare(String(b.pet)) || (b.date || "").localeCompare(a.date || "")
  };
  const cell = (t) => `<span role="cell" class="r-clip" title="${esc(t || "")}">${t ? esc(t) : '<span class="a-muted">-</span>'}</span>`;
  const who = (r) => `<span role="cell"><span class="o-name">${esc(r.pet)}</span><span class="o-email">${esc(ownerName(r.owner, r.ownerName))}</span></span>`;

  function render() {
    drawScope();
    if (loadError) {
      $("visit-rows").textContent = loadError;
      $("rx-rows").textContent = loadError;
      return;
    }
    const q = $("search").value.trim().toLowerCase(), sort = by[$("sort").value] || by.new;
    const hit = (r) => inScope(r) && (!q || Object.values({ ...r, ownerName: ownerName(r.owner) }).join(" ").toLowerCase().includes(q));
    const v = visits.filter(hit).sort(sort), r = rxs.filter(hit).sort(sort);
    $("visit-rows").innerHTML = v.length ? v.map((x) => `
      <div class="orow rrow rrow-visit" role="row" tabindex="0" data-kind="v" data-id="${esc(x.id)}">
        ${who(x)}<span role="cell" class="o-name">${esc(fmt(x.date))}</span>${cell(x.diagnosis)}${cell(x.treatment)}${cell(x.notes)}
      </div>`).join("") : `<p class="o-empty">${visits.length ? "No visit records match your search." : "No visit records yet."}</p>`;
    $("rx-rows").innerHTML = r.length ? r.map((x) => `
      <div class="orow rrow rrow-rx" role="row" tabindex="0" data-kind="r" data-id="${esc(x.id)}">
        ${who(x)}<span role="cell" class="o-name">${esc(fmt(x.date))}</span>${cell(x.medication)}${cell(x.dose)}${cell(x.instructions)}${cell(x.quantity)}
      </div>`).join("") : `<p class="o-empty">${rxs.length ? "No prescriptions match your search." : "No prescriptions yet."}</p>`;
  }

  /* ----- details ----- */
  function details(kind, id) {
    const x = (kind === "v" ? visits : rxs).find((r) => r.id === id); if (!x) return;
    const rows = kind === "v"
      ? [["Pet", x.pet], ["Owner", ownerName(x.owner)], ["Date", fmt(x.date)], ["Diagnosis", x.diagnosis], ["Treatment", x.treatment], ["Notes", x.notes]]
      : [["Pet", x.pet], ["Owner", ownerName(x.owner)], ["Date", fmt(x.date)], ["Medication", x.medication], ["Dose", x.dose], ["Instructions", x.instructions], ["Quantity", x.quantity]];
    $("detail-title").textContent = kind === "v" ? "Visit record" : "Prescription";
    $("detail-facts").innerHTML = rows.map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${esc(val || "-")}</dd></div>`).join("");
    $("detail-dialog").showModal();
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) { e.target.closest("dialog").close(); return; }
    const r = e.target.closest("[data-kind]"); if (r) details(r.dataset.kind, r.dataset.id);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Enter") { const r = e.target.closest("[data-kind]"); if (r) details(r.dataset.kind, r.dataset.id); } });

  /* ----- add dialogs ----- */
  /* the add buttons and dialogs exist only on the vet page (staff only view records) */
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  const petNameOf = (owner, id) => { const p = O.petsOf(owner).find((x) => x.id === id); return p ? p.name : ""; };
  const owners = () => O.list().filter((o) => o.id);
  function fillOwner(prefix) {
    const list = owners();
    $(prefix + "-owner").innerHTML = list.map((o) => `<option value="${esc(o.id)}">${esc(o.short || o.name)}</option>`).join("");
    fillPets(prefix);
  }
  function fillPets(prefix) {
    const pets = O.petsOf($(prefix + "-owner").value);
    $(prefix + "-pet").innerHTML = pets.length ? pets.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("") : `<option value="">No pets yet</option>`;
  }
  const err = (id, m) => { $(id).textContent = m || ""; $(id).hidden = !m; return !m; };
  function openAdd(dialog, prefix) {
    if (!owners().length) { S.toast("Register an owner first."); return; }
    fillOwner(prefix); $(prefix + "-date").value = today(); $(prefix + "-date").max = today(); err(prefix + "-err", "");
    $(dialog).showModal();
  }
  async function save(owner, kind, rec) {
    if (USE_BACKEND && window.PawApi.isBackendSession()) {
      await window.PawApi.request("/api/staff/records/" + (kind === "v" ? "visits" : "prescriptions"), {
        method: "POST",
        body: { owner, ...rec }
      });
    } else {
      const d = read(owner); d[kind === "v" ? "visits" : "prescriptions"].push(rec); write(owner, d);
    }
    await load(); render();
  }
  on("add-visit", "click", () => openAdd("visit-dialog", "v"));
  on("add-rx", "click", () => openAdd("rx-dialog", "r"));
  on("v-owner", "change", () => fillPets("v"));
  on("r-owner", "change", () => fillPets("r"));

  on("v-save", "click", async () => {
    const owner = $("v-owner").value, petId = $("v-pet").value, pet = petNameOf(owner, petId), date = $("v-date").value, diagnosis = $("v-diag").value.trim();
    if (!petId) return err("v-err", "This owner has no pet yet.");
    if (!date) return err("v-err", "Pick the visit date.");
    if (!diagnosis) return err("v-err", "Enter the diagnosis.");
    try { await save(owner, "v", { id: uid(), petId, pet, date, diagnosis, treatment: $("v-treat").value.trim(), notes: $("v-notes").value.trim() }); }
    catch (error) { return err("v-err", error.message || "Could not save. Try again."); }
    ["v-diag", "v-treat", "v-notes"].forEach((id) => { $(id).value = ""; });
    $("visit-dialog").close(); S.toast("Visit record saved.");
  });
  on("r-save", "click", async () => {
    const owner = $("r-owner").value, petId = $("r-pet").value, pet = petNameOf(owner, petId), date = $("r-date").value, medication = $("r-med").value.trim();
    if (!petId) return err("r-err", "This owner has no pet yet.");
    if (!date) return err("r-err", "Pick the date.");
    if (!medication) return err("r-err", "Enter the medication.");
    try { await save(owner, "r", { id: uid(), petId, pet, date, medication, dose: $("r-dose").value.trim(), instructions: $("r-inst").value.trim(), quantity: $("r-qty").value.trim() }); }
    catch (error) { return err("r-err", error.message || "Could not save. Try again."); }
    ["r-med", "r-dose", "r-qty", "r-inst"].forEach((id) => { $(id).value = ""; });
    $("rx-dialog").close(); S.toast("Prescription saved.");
  });

  document.addEventListener("click", (e) => { if (e.target.id === "scope-clear") { scope = null; $("search").value = ""; render(); } });
  $("search").addEventListener("input", render);
  $("sort").addEventListener("change", render);
  if (!scope) { try { const q = params.get("q"); if (q) $("search").value = q; } catch (_) {} }
  load().then(render).catch((error) => { loadError = error.message; S.toast(error.message); render(); });
})();
