/* js/vet/vet-records.js - Vet: Medical Record
   List: completed appointments with no record yet / with a record. "Add Record" or "Edit Details" opens the editor;
   "View" opens the same page read-only (with an Edit button to switch to editing).
   (also opened from other vet pages as medical-records.html?appt=<owner>|<id>; a visit that already has a record opens read-only).
   Save writes, for that appointment (replacing what it saved before):
     "pawpaw_records:<owner>".visits          { id, apptId, petId, pet, date, diagnosis, treatment, notes, vet, services:[{type,name,notes}] }
     "pawpaw_records:<owner>".prescriptions   { id, apptId, petId, pet, date, medication, dose, instructions, quantity }
     "pawpaw_vaccinations:<owner>"            { id, apptId, petId, vaccine, pet, dateAdministered, nextDue, administeredBy, notes }
   Backend records are loaded from /api/vet/patients/:petId and saved with
   PUT /api/appointments/:id/record. */
(() => {
  const V = window.PawVet, A = V.A, O = V.O, S = window.PawStaff, $ = (id) => document.getElementById(id), esc = O.esc;
  const PREVIEW = 5;
  let all = A.load(), showAllNo = false, showAllDone = false, cur = null, blocks = [], rx = [], rxEdit = -1, viewing = false;

  const key = (a) => a.owner + "|" + a.id;
  const done = () => all.filter((a) => V.visible(a) && a.status === "completed").sort((a, b) => V.stamp(b).localeCompare(V.stamp(a)));
  const recOf = (a) => V.readJson("pawpaw_records:" + a.owner, { visits: [], prescriptions: [] }) || { visits: [], prescriptions: [] };
  const visitOf = (a) => (recOf(a).visits || []).find((r) => r.apptId === a.id) || null;

  /* ----- list ----- */
  const row = (a, btn) => `
    <div class="orow vrow-rec" role="row">
      <span role="cell"><span class="o-name">${esc(V.fmtDate(a.date))}</span><span class="o-email">${esc(V.fmtTime(a.time))}</span></span>
      <span role="cell"><span class="o-name">${esc(V.petName(a))}</span><span class="o-email">${esc(V.ownerName(a))}</span></span>
      <span role="cell">${esc(V.services(a))}</span>
      <span role="cell"><span class="spill spill-${esc(a.status)}">${esc(V.label(a))}</span></span>
      <span role="cell">${btn}</span>
    </div>`;
  function renderList() {
    const d = done(), none = d.filter((a) => !V.hasRecord(a)), has = d.filter(V.hasRecord);
    const fill = (rows, el, allBtn, showAll, mk, empty) => {
      const list = showAll ? rows : rows.slice(0, PREVIEW);
      $(el).innerHTML = list.length ? list.map(mk).join("") : `<p class="o-empty">${empty}</p>`;
      $(allBtn).hidden = rows.length <= PREVIEW; $(allBtn).textContent = showAll ? "Show less" : "View All";
    };
    fill(none, "nr-rows", "nr-all", showAllNo, (a) => row(a, `<button type="button" class="vr-btn vr-add" data-open="${esc(key(a))}">Add Record</button>`), "Every completed appointment has a record.");
    fill(has, "cp-rows", "cp-all", showAllDone, (a) => row(a, `<span style="display:grid;gap:6px"><button type="button" class="vr-btn vr-view" data-view="${esc(key(a))}">View</button><button type="button" class="vr-btn vr-edit" data-open="${esc(key(a))}">Edit Details</button></span>`), "No completed appointments with a record yet.");
  }

  /* ----- editor ----- */
  const err = (m) => { $("ve-err").textContent = m || ""; $("ve-err").hidden = !m; return !m; };
  const isVacc = (n) => /vaccin/i.test(n || "");
  const plusYear = (d) => { const x = new Date(d + "T00:00:00"); x.setFullYear(x.getFullYear() + 1); return V.iso(x); };

  function loadState(a) {
    const rec = recOf(a), visit = visitOf(a);
    const date = visit ? visit.date : (a.date <= V.today() ? a.date : V.today());
    $("ve-date").value = date; $("ve-date").max = V.today();
    $("ve-diag").value = visit ? visit.diagnosis : ""; $("ve-treat").value = visit ? visit.treatment || "" : ""; $("ve-notes").value = visit ? visit.notes || "" : "";
    rx = (rec.prescriptions || []).filter((r) => r.apptId === a.id).map((r) => ({ medication: r.medication, dose: r.dose || "", quantity: r.quantity || "", instructions: r.instructions || "" }));
    if (visit) {
      const vx = V.readJson("pawpaw_vaccinations:" + a.owner, []).filter((r) => r.apptId === a.id);
      blocks = vx.map((r) => ({ type: "Vaccination", vaccine: r.vaccine, given: r.dateAdministered, due: r.nextDue || "" }))
        .concat((visit.services || []).map((s) => ({ type: s.type, name: s.name || "", notes: s.notes || "" })));
    } else {
      blocks = (a.services || []).map((s) => isVacc(s.name)
        ? { type: "Vaccination", vaccine: ((s.name.match(/\(([^)]+)\)/) || [])[1] || "").trim(), given: date, due: plusYear(date) }
        : { type: s.name, name: "", notes: "" });
    }
    rxEdit = -1; clearRx(); err("");
  }
  function openEditor(a, readOnly) {
    cur = a; viewing = !!readOnly; loadState(a);
    $("ve-bar").innerHTML = `<span>Pet: <strong>${esc(V.petName(a))}${petInfo(a)}</strong></span><span>Owner: <strong>${esc(V.ownerName(a))}</strong></span><span>Visit: <strong>${esc(V.fmtShort(a.date))} &middot; ${esc(V.services(a))}</strong></span><span>Status: <strong>${esc(V.label(a))}</strong></span>${viewing ? "<span><strong>View only</strong></span>" : ""}`;
    $("ve-svc").innerHTML = ["Vaccination"].concat(A.SERVICES.filter((s) => !isVacc(s))).map((s) => `<option>${esc(s)}</option>`).join("");
    drawBlocks(); drawRx(); applyMode();
    $("rec-list").hidden = true; $("rec-edit").hidden = false; window.scrollTo(0, 0);
  }
  /* View only: every field is locked and the add / remove / edit controls are hidden; Save becomes Edit and Cancel becomes Back. */
  function applyMode() {
    const v = viewing, root = $("rec-edit");
    root.querySelectorAll("input, select, textarea").forEach((el) => { el.disabled = v; });
    const hide = (el) => { if (el) el.style.display = v ? "none" : ""; };
    [$("ve-svc").closest(".ve-add"), root.querySelector('label[for="ve-svc"]'), $("ve-rx-h"),
     root.querySelector('label[for="ve-med"]'), $("ve-med"), $("ve-dose").closest(".ve-two"),
     root.querySelector('label[for="ve-inst"]'), $("ve-inst"), $("ve-rx-add")].forEach(hide);
    root.querySelectorAll(".ve-remove, .ve-edit").forEach(hide);
    if (v && !blocks.length) $("ve-blocks").innerHTML = `<p class="o-empty">No services recorded.</p>`;
    if (v && !rx.length) $("ve-rx-list").innerHTML = `<p class="o-empty">No prescriptions.</p>`;
    $("ve-save").textContent = v ? "Edit" : "Save";
    $("ve-cancel").textContent = v ? "Back" : "Cancel";
    err("");
  }
  const petInfo = (a) => { const p = (a.petId && O.getPet(a.owner, a.petId)) || null; return p ? " (" + [p.species, p.breed].filter(Boolean).join(", ") + ")" : ""; };
  function closeEditor() { cur = null; viewing = false; $("rec-edit").hidden = true; $("rec-list").hidden = false; renderList(); window.scrollTo(0, 0); }

  function drawBlocks() {
    $("ve-blocks").innerHTML = blocks.map((b, i) => b.type === "Vaccination" ? `
      <div class="ve-block">
        <div class="ve-bhead"><span class="ve-chip ve-chip-v">Vaccination</span><button type="button" class="ve-remove" data-rm="${i}">Remove</button></div>
        <div class="ve-three">
          <div><label class="ve-label">Vaccine name</label><input type="text" class="ve-input" data-i="${i}" data-f="vaccine" value="${esc(b.vaccine)}" maxlength="80" /></div>
          <div><label class="ve-label">Date administered</label><input type="date" class="ve-input" data-i="${i}" data-f="given" value="${esc(b.given)}" max="${V.today()}" /></div>
          <div><label class="ve-label">Next due</label><input type="date" class="ve-input" data-i="${i}" data-f="due" value="${esc(b.due)}" /></div>
        </div>
      </div>` : `
      <div class="ve-block">
        <div class="ve-bhead"><span class="ve-chip">${esc(b.type)}</span><button type="button" class="ve-remove" data-rm="${i}">Remove</button></div>
        <div class="ve-two">
          <div><label class="ve-label">Service name</label><input type="text" class="ve-input" data-i="${i}" data-f="name" value="${esc(b.name)}" maxlength="120" placeholder="e.g. Nail trim and bath" /></div>
          <div><label class="ve-label">Notes</label><input type="text" class="ve-input" data-i="${i}" data-f="notes" value="${esc(b.notes)}" maxlength="200" placeholder="Optional" /></div>
        </div>
      </div>`).join("");
  }

  function drawRx() {
    $("ve-rx-list").innerHTML = rx.map((r, i) => `
      <div class="ve-rxitem">
        <div><strong>${esc(r.medication)}</strong><p>${esc([r.dose, r.instructions].filter(Boolean).join(" · "))}${r.quantity ? " · Qty " + esc(r.quantity) : ""}</p></div>
        <div class="ve-rxbtns"><button type="button" class="ve-edit" data-rxe="${i}">Edit</button><button type="button" class="ve-remove" data-rxr="${i}">Remove</button></div>
      </div>`).join("");
    $("ve-rx-add").textContent = rxEdit >= 0 ? "Update prescription" : "Add prescription";
    $("ve-rx-h").textContent = rxEdit >= 0 ? "Edit prescription" : "Add prescription";
  }
  function clearRx() { ["ve-med", "ve-dose", "ve-inst"].forEach((id) => { $(id).value = ""; }); $("ve-qty").value = "1"; }
  function saveRx() {
    const medication = $("ve-med").value.trim();
    if (!medication) return err("Enter the medication name.");
    const quantity = $("ve-qty").value.trim();
    if (!/^[1-9]\d*$/.test(quantity)) return err("Enter a positive whole-number quantity.");
    const item = { medication, dose: $("ve-dose").value.trim(), quantity, instructions: $("ve-inst").value.trim() };
    if (rxEdit >= 0) rx[rxEdit] = item; else rx.push(item);
    rxEdit = -1; clearRx(); err(""); drawRx(); return true;
  }

  async function save() {
    const a = cur, diag = $("ve-diag").value.trim(), date = $("ve-date").value;
    if (!diag) return err("Enter the diagnosis.");
    if (!date) return err("Pick the record date.");
    if (date > V.today()) return err("The record date cannot be in the future.");
    if ($("ve-med").value.trim() && !saveRx()) return;
    for (const b of blocks) if (b.type === "Vaccination") {
      if (!b.vaccine.trim()) return err("Enter the vaccine name for each vaccination.");
      if (!b.given || b.given > V.today()) return err("Check the date administered of " + b.vaccine + ".");
      if (!b.due || b.due <= b.given) return err("The next due date of " + b.vaccine + " must be after the date administered.");
    }
    const rk = "pawpaw_records:" + a.owner, rec = recOf(a), old = visitOf(a), id = old ? old.id : "r-" + Date.now().toString(36);
    const base = { apptId: a.id, petId: a.petId || "", pet: V.petName(a) };
    rec.visits = (rec.visits || []).filter((r) => r.apptId !== a.id);
    rec.visits.push({ id, ...base, date, diagnosis: diag, treatment: $("ve-treat").value.trim(), notes: $("ve-notes").value.trim(), vet: a.vet,
      services: blocks.filter((b) => b.type !== "Vaccination").map((b) => ({ type: b.type, name: b.name.trim(), notes: b.notes.trim() })) });
    rec.prescriptions = (rec.prescriptions || []).filter((r) => r.apptId !== a.id);
    rx.forEach((r, i) => rec.prescriptions.push({ id: id + "-rx" + i, ...base, date, medication: r.medication, dose: r.dose, instructions: r.instructions, quantity: r.quantity }));
    const vk = "pawpaw_vaccinations:" + a.owner, vx = V.readJson(vk, []).filter((r) => r.apptId !== a.id);
    const vaccinations = blocks.filter((b) => b.type === "Vaccination").map((b, i) => ({
      id: "vx-" + Date.now().toString(36) + i, apptId: a.id, petId: a.petId || "", vaccine: b.vaccine.trim(),
      pet: V.petName(a), dateAdministered: b.given, nextDue: b.due, administeredBy: a.vet, notes: ""
    }));
    vx.push(...vaccinations);
    if (A.backend) {
      try {
        await window.PawApi.request("/api/appointments/" + encodeURIComponent(a.id) + "/record", {
          method: "PUT",
          body: {
            date,
            diagnosis: diag,
            treatment: $("ve-treat").value.trim(),
            notes: $("ve-notes").value.trim(),
            prescriptions: rx
          }
        });
      } catch (error) {
        return err(error.message);
      }
    }
    try { localStorage.setItem(rk, JSON.stringify(rec)); localStorage.setItem(vk, JSON.stringify(vx)); } catch (_) { return err("Could not save. Storage is blocked."); }
    window.PawOwners.audit(old ? "update" : "create", "medical_record", (old ? "Updated" : "Added") + " the medical record of " + V.petName(a) + ".");
    if (rx.length) window.PawOwners.audit(old ? "update" : "create", "prescription", (old ? "Updated" : "Added") + " " + rx.length + " prescription" + (rx.length === 1 ? "" : "s") + " for " + V.petName(a) + ": " + rx.map((r) => r.medication).join(", ") + ".");
    A.notify(a.owner, "record", old ? "Medical record updated" : "Medical record added", V.petName(a) + "'s medical record is ready. See Medical Records for the details.");
    if (vaccinations.length) A.notify(a.owner, "record", "Vaccination recorded", vaccinations.map((b) => b.vaccine).join(", ") + " given to " + V.petName(a) + ". See Vaccination History for the next due date.");
    closeEditor(); S.toast("Record saved for " + V.petName(a) + ".");
  }

  /* ----- events ----- */
  document.addEventListener("click", (e) => {
    const vw = e.target.closest("[data-view]"); if (vw) { const a = all.find((x) => key(x) === vw.dataset.view); if (a) openEditor(a, true); return; }
    const o = e.target.closest("[data-open]"); if (o) { const a = all.find((x) => key(x) === o.dataset.open); if (a) openEditor(a); return; }
    const rm = e.target.closest("[data-rm]"); if (rm) { blocks.splice(+rm.dataset.rm, 1); drawBlocks(); return; }
    const re = e.target.closest("[data-rxe]"); if (re) { rxEdit = +re.dataset.rxe; const r = rx[rxEdit]; $("ve-med").value = r.medication; $("ve-dose").value = r.dose; $("ve-qty").value = r.quantity; $("ve-inst").value = r.instructions; drawRx(); $("ve-med").focus(); return; }
    const rr = e.target.closest("[data-rxr]"); if (rr) { rx.splice(+rr.dataset.rxr, 1); rxEdit = -1; clearRx(); drawRx(); }
  });
  document.addEventListener("input", (e) => { const f = e.target.dataset && e.target.dataset.f; if (f && blocks[+e.target.dataset.i]) blocks[+e.target.dataset.i][f] = e.target.value; });
  $("nr-all").addEventListener("click", () => { showAllNo = !showAllNo; renderList(); });
  $("cp-all").addEventListener("click", () => { showAllDone = !showAllDone; renderList(); });
  $("ve-svc-add").addEventListener("click", () => {
    const t = $("ve-svc").value, d = $("ve-date").value || V.today();
    blocks.push(t === "Vaccination" ? { type: t, vaccine: "", given: d, due: plusYear(d) } : { type: t, name: "", notes: "" }); drawBlocks();
  });
  $("ve-rx-add").addEventListener("click", saveRx);
  $("ve-save").addEventListener("click", () => { if (viewing) openEditor(cur, false); else save(); });
  $("ve-cancel").addEventListener("click", closeEditor);

  async function hydrateRecords(appointments) {
    if (!A.backend) return;
    const pets = [...new Set(appointments.filter(V.visible).map((a) => String(a.petId || "")).filter(Boolean))];
    const details = await Promise.all(pets.map((petId) => window.PawApi.request("/api/vet/patients/" + encodeURIComponent(petId))));
    const recordsByOwner = new Map();
    for (const detail of details) {
      const ownerId = String(detail.pet.owner);
      const rec = recordsByOwner.get(ownerId) || { visits: [], prescriptions: [] };
      for (const visit of detail.visits || []) {
        const appt = appointments.find((a) => String(a.id) === String(visit.appointment_id));
        if (!appt) continue;
        rec.visits.push({
          id: visit.id, apptId: String(visit.appointment_id), petId: String(detail.pet.id), pet: detail.pet.name,
          date: String(visit.date || "").slice(0, 10), diagnosis: visit.diagnosis, treatment: visit.treatment || "",
          notes: visit.notes || "", vet: visit.vet,
          services: (appt.services || []).map((service) => ({ type: service.name, name: service.name, notes: "" }))
        });
      }
      for (const prescription of detail.prescriptions || []) {
        const visit = rec.visits.find((r) => String(r.id) === String(prescription.record_id));
        if (!visit) continue;
        rec.prescriptions.push({
          id: prescription.id, apptId: visit.apptId, petId: visit.petId, pet: visit.pet,
          date: String(prescription.date || "").slice(0, 10), medication: prescription.medication,
          dose: prescription.dose || "", instructions: prescription.instructions || "", quantity: prescription.quantity
        });
      }
      recordsByOwner.set(ownerId, rec);
    }
    recordsByOwner.forEach((records, ownerId) => localStorage.setItem("pawpaw_records:" + ownerId, JSON.stringify(records)));
  }
  A.ready.then(async (appointments) => {
    all = appointments;
    await hydrateRecords(all);
    renderList();
    const want = new URLSearchParams(location.search).get("appt");
    if (want) { const a = all.find((x) => key(x) === want && V.visible(x)); if (a) openEditor(a, V.hasRecord(a)); }
  }).catch((error) => S.toast(error.message));
})();

