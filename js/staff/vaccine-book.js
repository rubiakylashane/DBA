/* js/staff/vaccine-book.js - staff books a vaccination visit for an owner (opened from Vaccination Reminder)
   URL: vaccine-book.html?owner=<key>&pet=<pet name>&vaccine=<vaccine name>
   Saves a confirmed appointment in the owner's list, so it appears in Appointments and on the owner's Dashboard. */
(async () => {
  const A = window.PawStaffAppts, O = window.PawOwners, S = window.PawStaff, $ = (id) => document.getElementById(id), esc = O.esc;
  const qs = new URLSearchParams(location.search);
  const ownerKey = qs.get("owner") || "", petParam = qs.get("pet") || "", petIdParam = qs.get("petid") || "", vaccineParam = qs.get("vaccine") || "";
  if (A.backend) {
    try {
      await A.ready;
      const signedInUser = (() => { try { return JSON.parse(sessionStorage.getItem("pawpaw_user") || localStorage.getItem("pawpaw_user") || "{}"); } catch (_) { return {}; } })();
      const role = String(signedInUser.role || "").toLowerCase();
      const vaccination = (await window.PawApi.request("/api/services")).find((service) => /vaccin/i.test(service.name));
      if (!vaccination) throw new Error("No active vaccination service is configured by the clinic.");
      const destination = role === "owner"
        ? `book-appointment.html?service=${encodeURIComponent(vaccination.id)}&pet=${encodeURIComponent(petIdParam)}`
        : `appointments.html?owner=${encodeURIComponent(ownerKey)}&petid=${encodeURIComponent(petIdParam)}&service=${encodeURIComponent(vaccination.name)}`;
      location.replace(destination);
    } catch (error) {
      S.toast(error.message || "Clinic services could not be loaded.");
    }
    return;
  }
  if (!ownerKey || !O.exists(ownerKey)) { location.replace("vaccine-reminders.html"); return; }

  const owner = O.owner(ownerKey), pets = O.petsOf(ownerKey), TBA = A.TBA;
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const today = iso(new Date());
  const fmtTime = (t) => { const [h, m] = t.split(":").map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }); };
  const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  const peso = (n) => "PHP " + Number(n).toLocaleString("en-US");

  /* services and prices (same list the owner books from; edit prices here) */
  const SERVICES = [
    { id: "consult", name: "General Consultation", price: 500 },
    { id: "vacc", name: "Vaccination", types: [{ name: "Anti Rabies", price: 500 }, { name: "5-in-1 (DHPP)", price: 500 }, { name: "Feline 4-in-1", price: 500 }] },
    { id: "deworm", name: "Deworming", price: 500 },
    { id: "groom", name: "Grooming", price: 500 },
    { id: "dental", name: "Dental Cleaning", price: 500 },
    { id: "lab", name: "Laboratory Test", price: 500 }
  ];
  const state = { date: "", sel: {}, qty: {} };          // sel: service id -> true;  qty: vaccine type -> count

  $("who").textContent = "Booking for " + (owner.short || owner.name) + ". Pick a pet, a time, and what they need.";

  /* ----- fields ----- */
  $("f-pet").innerHTML = pets.length ? pets.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("") : `<option value="">No pets yet</option>`;
  const match = pets.find((p) => petIdParam && p.id === petIdParam) || pets.find((p) => p.name === petParam);
  if (match) $("f-pet").value = match.id;
  $("f-vet").innerHTML = `<option value="${TBA}">To be assigned</option>` + A.VETS.map((v) => `<option>${esc(v)}</option>`).join("");
  const TIMES = []; for (let h = 8; h <= 17; h++) [0, 30].forEach((m) => { if (!(h === 17 && m)) TIMES.push(pad(h) + ":" + pad(m)); });
  $("f-time").innerHTML = TIMES.map((t) => `<option value="${t}">${fmtTime(t)}</option>`).join("");
  $("f-reason").value = "Overdue Vaccination";

  /* pre-select Vaccination and the matching type */
  state.sel.vacc = true;
  const vt = SERVICES[1].types.find((t) => vaccineParam && (vaccineParam.toLowerCase().includes(t.name.toLowerCase().split(" ")[0]) || t.name.toLowerCase().includes(vaccineParam.toLowerCase())));
  state.qty[(vt || SERVICES[1].types[0]).name] = 1;

  /* ----- services list ----- */
  function renderSvcs() {
    $("svc-list").innerHTML = SERVICES.map((s) => {
      const on = !!state.sel[s.id];
      const head = `<label class="vx-svc-head"><input type="checkbox" data-svc="${s.id}" ${on ? "checked" : ""} /><span class="vx-svc-name">${esc(s.name)}</span>${s.types ? "" : `<span class="vx-price">${peso(s.price)}</span>`}</label>`;
      const types = s.types && on ? `<div class="vx-types">${s.types.map((t) => `
          <div class="vx-type"><span>${esc(t.name)}</span><span>${peso(t.price)}</span>
            <select data-qty="${esc(t.name)}" aria-label="Quantity of ${esc(t.name)}">${[0, 1, 2, 3].map((n) => `<option value="${n}"${(state.qty[t.name] || 0) === n ? " selected" : ""}>${n}x</option>`).join("")}</select></div>`).join("")}</div>` : "";
      return `<div class="vx-svc${on ? " on" : ""}">${head}${types}</div>`;
    }).join("");
  }

  /* ----- summary ----- */
  function lines() {
    const out = [];
    SERVICES.forEach((s) => {
      if (!state.sel[s.id]) return;
      if (s.types) s.types.forEach((t) => { const n = state.qty[t.name] || 0; if (n) out.push({ name: "Vaccination (" + t.name + ")" + (n > 1 ? " x" + n : ""), price: t.price * n, base: "Vaccination (" + t.name + ")", each: t.price, n }); });
      else out.push({ name: s.name, price: s.price, base: s.name, each: s.price, n: 1 });
    });
    return out;
  }
  function renderSum() {
    const pet = pets.find((p) => p.id === $("f-pet").value), L = lines();
    const total = L.reduce((t, x) => t + x.price, 0);
    $("sum-lines").innerHTML =
      `<div><dt>Pet</dt><dd>${esc(pet ? pet.name : "-")}</dd></div>` +
      `<div><dt>Vet</dt><dd>${esc($("f-vet").value === TBA ? "To be assigned" : $("f-vet").value)}</dd></div>` +
      (state.date ? `<div><dt>When</dt><dd>${esc(fmtDate(state.date) + ", " + fmtTime($("f-time").value))}</dd></div>` : "") +
      L.map((x) => `<div><dt>${esc(x.name)}</dt><dd>${peso(x.price)}</dd></div>`).join("");
    $("sum-total").textContent = peso(total);
    return { L, total };
  }
  const err = (m) => { $("f-err").textContent = m || ""; $("f-err").hidden = !m; };

  /* ----- events ----- */
  $("svc-list").addEventListener("change", (e) => {
    if (e.target.dataset.svc) { state.sel[e.target.dataset.svc] = e.target.checked; renderSvcs(); }
    if (e.target.dataset.qty) state.qty[e.target.dataset.qty] = Number(e.target.value);
    renderSum();
  });
  ["f-pet", "f-vet", "f-time"].forEach((id) => $(id).addEventListener("change", renderSum));

  $("f-date-btn").addEventListener("click", () => {
    window.PawCalendar.open({ anchor: $("f-date-btn"), value: state.date || today, min: today, onPick: (v) => {
      state.date = v; $("f-date-label").textContent = fmtDate(v); $("f-date-btn").classList.add("has"); err(""); renderSum();
    } });
  });

  $("book-btn").addEventListener("click", () => {
    const petId = $("f-pet").value, { L, total } = renderSum();
    if (!petId) return err("This owner has no pet yet. Add a pet first.");
    if (!state.date) return err("Pick a date.");
    if (!L.length) return err("Choose at least one service.");
    const vet = $("f-vet").value, time = $("f-time").value;
    if (A.conflict(A.load(), vet, state.date, time)) return err(vet + " already has an appointment at this time. Pick another time or vet.");
    const pet = pets.find((p) => p.id === petId);
    A.add(ownerKey, {
      petId, petName: pet.name, vet, date: state.date, time, reason: $("f-reason").value.trim(),
      services: L.map((x) => ({ name: x.base, price: x.each, qty: x.n })), total, status: "confirmed"
    });
    A.notify(ownerKey, "appointment", "Vaccination booked", pet.name + ", " + fmtDate(state.date) + " " + fmtTime(time) + ". See My Appointments.");
    O.setFlash("Vaccination booked for " + pet.name + ".");
    location.href = "appointments.html";
  });

  renderSvcs(); renderSum();
})();
