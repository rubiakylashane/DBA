/* js/staff/vet-patients.js - Vet: Patient Profile
   Grid of the pets assigned to this vet. "View Details" opens one pet: pet card, owner details,
   visit records and prescriptions. Also opened from "View Patient" as patients.html?owner=&petid=&pet=
   Backend: GET /api/vet/patients -> assigned patients, and
            GET /api/vet/patients/:petId -> pet, owner, visits and prescriptions. */
(() => {
  const V = window.PawVet, O = V.O, $ = (id) => document.getElementById(id), esc = O.esc;
  let appts = V.A.load().filter(V.visible), detailData = null;
  const qs = new URLSearchParams(location.search);
  let sel = qs.get("owner") ? { owner: qs.get("owner"), petId: qs.get("petid") || "", name: qs.get("pet") || "" } : null;

  const keyOf = (p) => p.owner + "|" + (p.petId || p.name);
  const patients = [];
  function addAppointmentPatients() {
    appts.forEach((a) => {
    const p = { owner: a.owner, petId: a.petId || "", name: V.petName(a) };
    if (!patients.some((x) => keyOf(x) === keyOf(p))) patients.push(p);
    });
  }
  addAppointmentPatients();
  const petOf = (p) => (p.petId && O.getPet(p.owner, p.petId)) || O.petsOf(p.owner).find((x) => x.name === p.name) || null;
  const ownerOf = (key) => { try { return O.owner(key); } catch (_) { return { short: key, name: key, phone: "", email: "" }; } };
  const same = (p, r) => (p.petId && r.petId ? r.petId === p.petId : r.pet === p.name);
  const photo = (pet) => pet && pet.photo ? ` style="background-image:url('${esc(pet.photo)}')"` : "";
  const sub = (pet) => { const age = pet && pet.dob ? O.ageText(pet.dob) : ""; return ((pet && pet.species) || "-") + (age ? " - " + age : ""); };

  /* ----- grid ----- */
  function renderGrid() {
    const q = $("search").value.trim().toLowerCase();
    const list = patients.filter((p) => { const pet = petOf(p) || {}; return !q || [p.name, ownerOf(p.owner).short, pet.breed, pet.species].join(" ").toLowerCase().includes(q); });
    $("pt-grid").innerHTML = list.length ? list.map((p) => { const pet = petOf(p), o = ownerOf(p.owner); return `
      <article class="vp-card">
        <div class="vp-top"><span class="vp-photo"${photo(pet)} aria-hidden="true"></span><div><h3>${esc(p.name)}</h3><p>${esc(sub(pet))}</p></div></div>
        <dl class="vp-rows">
          <div><dt>Owner</dt><dd>${esc(o.short)}</dd></div>
          <div><dt>Breed</dt><dd>${esc((pet && pet.breed) || "-")}</dd></div>
          <div><dt>Gender</dt><dd>${esc((pet && pet.sex) || "-")}</dd></div>
          <div><dt>Date of Birth</dt><dd>${pet && pet.dob ? esc(O.fmtShort(pet.dob)) : "-"}</dd></div>
        </dl>
        <button type="button" class="vp-view" data-k="${esc(keyOf(p))}">View Details</button>
      </article>`; }).join("") : `<p class="vp-empty">${patients.length ? "No patients match." : "No patients yet. They appear once an appointment is assigned to you."}</p>`;
  }

  /* ----- one patient ----- */
  const table = (head, cols, rows, empty) => rows.length
    ? `<div class="vp-table"><div class="vp-tr vp-th" style="--cols:${cols}">${head.map((h) => `<span>${esc(h)}</span>`).join("")}</div>` +
      rows.map((r) => `<div class="vp-tr" style="--cols:${cols}">${r.map((c) => `<span>${esc(c)}</span>`).join("")}</div>`).join("") + `</div>`
    : `<p class="vp-none">${esc(empty)}</p>`;

  function renderDetail() {
    const pet = detailData && detailData.pet || petOf(sel);
    const remoteOwner = detailData && detailData.owner;
    const cachedOwner = ownerOf(sel.owner);
    const o = remoteOwner ? {
      name: remoteOwner.ownerName,
      short: remoteOwner.ownerName,
      phone: remoteOwner.ownerPhone,
      email: remoteOwner.ownerEmail
    } : cachedOwner;
    const rec = V.readJson("pawpaw_records:" + sel.owner, { visits: [], prescriptions: [] });
    const visits = detailData ? detailData.visits : (rec.visits || []).filter((r) => same(sel, r));
    const rx = detailData ? detailData.prescriptions : (rec.prescriptions || []).filter((r) => same(sel, r));
    visits.sort((a, b) => String(b.date || b.record_date || "").localeCompare(String(a.date || a.record_date || "")));
    rx.sort((a, b) => String(b.date || b.date_prescribed || "").localeCompare(String(a.date || a.date_prescribed || "")));
    const others = O.petsOf(sel.owner).filter((x) => !(pet && x.id === pet.id) && x.name !== sel.name);
    /* 2 x 2 grid: pet card | visit records, owner details | prescription, so each row has the same height */
    $("pt-detail").innerHTML = `
      <section class="vd-card vd-pet">
        <div class="vp-top"><span class="vp-photo vp-photo-lg"${photo(pet)} aria-hidden="true"></span><div><h2>${esc(sel.name)}</h2><p>${esc(sub(pet))}</p></div></div>
        <dl class="vp-rows">
          <div><dt>Breed</dt><dd>${esc((pet && pet.breed) || "-")}</dd></div>
          <div><dt>Gender</dt><dd>${esc((pet && pet.sex) || "-")}</dd></div>
          <div><dt>Date of Birth</dt><dd>${pet && pet.dob ? esc(O.fmtShort(pet.dob)) : "-"}</dd></div>
          <div><dt>Allergies</dt><dd>${esc((pet && pet.allergies) || "None")}</dd></div>
        </dl>
      </section>
      <section class="vd-card vd-visits"><h2>Visit Records</h2>${table(["Date", "Diagnosis", "Treatment", "Notes"], 4, visits.map((r) => [O.fmtShort(r.date || r.record_date), r.diagnosis, r.treatment || "-", r.notes || "-"]), "No visit records yet.")}</section>
      <section class="vd-card vd-owner">
        <h2>Owner Details</h2>
        <dl class="vp-rows">
          <div><dt>Name</dt><dd>${esc(o.name || o.short)}</dd></div>
          <div><dt>Contact No.</dt><dd>${esc(o.phone || "-")}</dd></div>
          <div><dt>Email</dt><dd>${esc(o.email || "-")}</dd></div>
          <div><dt>Other Pets</dt><dd>${others.length ? others.map((x) => `<a href="#" class="vp-link" data-owner="${esc(sel.owner)}" data-id="${esc(x.id)}" data-name="${esc(x.name)}">${esc(x.name)}</a>`).join(", ") : "None"}</dd></div>
        </dl>
      </section>
      <section class="vd-card vd-rx"><h2>Prescription</h2>${table(["Date", "Medication", "Dose", "Instructions", "Quantity"], 5, rx.map((r) => [O.fmtShort(r.date || r.date_prescribed), r.medication || r.medication_name, r.dose || r.dosage || "-", r.instructions || "-", r.quantity || "-"]), "No prescriptions yet.")}</section>`;
  }

  function show() {
    const detail = !!sel;
    $("pt-grid").hidden = detail; $("pt-detail").hidden = !detail; $("go-back").hidden = !detail;
    $("pt-sub").textContent = "Pet details and full history.";
    if (detail) renderDetail(); else renderGrid();
  }

  async function selectPatient(patient) {
    sel = patient;
    detailData = null;
    show();
    if (V.A.backend && patient.petId) {
      try {
        detailData = await window.PawApi.request("/api/vet/patients/" + encodeURIComponent(patient.petId));
        show();
      } catch (error) {
        window.PawStaff.toast(error.message);
      }
    }
  }
  document.addEventListener("click", (e) => {
    const v = e.target.closest(".vp-view");
    if (v) { const patient = patients.find((p) => keyOf(p) === v.dataset.k); if (patient) selectPatient(patient); window.scrollTo(0, 0); return; }
    const l = e.target.closest(".vp-link");
    if (l) { e.preventDefault(); selectPatient({ owner: l.dataset.owner, petId: l.dataset.id, name: l.dataset.name }); window.scrollTo(0, 0); }
  });
  $("go-back").addEventListener("click", () => { sel = null; detailData = null; show(); });
  $("search").addEventListener("input", () => { if (sel) { sel = null; show(); } renderGrid(); });
  V.A.ready.then(async (appointments) => {
    appts = appointments.filter(V.visible);
    patients.splice(0, patients.length);
    if (V.A.backend) {
      const directory = await window.PawApi.request("/api/vet/patients");
      directory.forEach((p) => {
        const patient = { owner: String(p.owner), petId: String(p.petId), name: p.name };
        if (!patients.some((x) => keyOf(x) === keyOf(patient))) patients.push(patient);
      });
    } else addAppointmentPatients();
    if (sel && V.A.backend && sel.petId) {
      detailData = await window.PawApi.request("/api/vet/patients/" + encodeURIComponent(sel.petId));
    }
    show();
  }).catch((error) => window.PawStaff.toast(error.message));
})();