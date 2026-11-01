/* js/owner/book-appointment.js
   Book Appointment: pick a pet, vet, date, time and services; the summary updates live.
   Reads the signed-in owner's pets, active veterinarians, and services from the API. */
(async () => {
  const esc = window.PawPets.esc;
  const $ = (id) => document.getElementById(id);
  const form = $("appt-form");
  const submitButton = document.querySelector('button[type="submit"][form="appt-form"]');
  if (!form || !submitButton) {
    $("booking-error").textContent = "The appointment form could not be initialized. Please reload the page.";
    $("booking-error").hidden = false;
    return;
  }
  if (!window.PawApi || !window.PawApi.isBackendSession()) {
    $("booking-error").textContent = "Sign in to load clinic data before booking an appointment.";
    $("booking-error").hidden = false;
    form.querySelectorAll("input, select, textarea, button").forEach((el) => { el.disabled = true; });
    return;
  }
  let pets, VETS, SERVICES;
  try {
    const [owners, vets, services] = await Promise.all([
      window.PawApi.loadOwners(),
      window.PawApi.request("/api/vets"),
      window.PawApi.request("/api/services")
    ]);
    const owner = owners[0];
    pets = await window.PawPets.refresh(owners);
    VETS = vets;
    SERVICES = services;
  } catch (error) {
    $("booking-error").textContent = error.message || "Clinic data could not be loaded.";
    $("booking-error").hidden = false;
    form.querySelectorAll("input, select, textarea, button").forEach((el) => { el.disabled = true; });
    return;
  }

  // Clinic hours: first slot, closing time (no slot starts at closing time), minutes per slot
  const HOURS = { open: "09:00", close: "17:00", step: 30 };
  const MIN_LEAD_MINUTES = 60;   // can't book a slot that starts sooner than this from now
  const MAX_DAYS_AHEAD = 180;    // how far ahead a request can be made

  const DOSES = [1, 2, 3];

  const peso = (n) => "₱" + n.toLocaleString("en-US");
  const pad = (n) => String(n).padStart(2, "0");
  const toIso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());

  const f = {
    pet: $("pet"), vet: $("vet"), date: $("date"), time: $("time"), reason: $("reason"),
    picker: $("date-picker"), services: $("services")
  };

  function setError(key, msg) {
    const el = $("err-" + key);
    if (el) { el.textContent = msg || ""; el.hidden = !msg; }
    if (f[key]) f[key].setAttribute("aria-invalid", msg ? "true" : "false");
  }

  /* ---------- Pet and vet dropdowns ---------- */
  if (pets.length) {
    pets.forEach((p) => f.pet.add(new Option(p.name + " (" + p.species + ")", p.id)));
    const wanted = new URLSearchParams(location.search).get("pet");
    if (wanted && pets.some((p) => p.id === wanted)) f.pet.value = wanted;
  } else {
    f.pet.disabled = true;
    f.pet.options[0].textContent = "No pets yet";
    $("no-pets").hidden = false;
  }
  VETS.forEach((v) => f.vet.add(new Option(v.name, v.id)));
  if (!VETS.length) f.vet.options[0].textContent = "No active veterinarians (staff can assign later)";

  /* ---------- Date: type MM/DD/YYYY or use the calendar ---------- */
  const todayIso = toIso(new Date());
  const maxDate = new Date(); maxDate.setDate(maxDate.getDate() + MAX_DAYS_AHEAD);
  const maxIso = toIso(maxDate);
  f.picker.min = todayIso;
  f.picker.max = maxIso;

  function parseDate(text) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
    if (!m) return null;
    const mo = +m[1], d = +m[2], y = +m[3];
    const date = new Date(y, mo - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
    return y + "-" + pad(mo) + "-" + pad(d);
  }
  const showDate = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? m[2] + "/" + m[3] + "/" + m[1] : "";
  };
  const longDate = (iso) => new Date(iso + "T00:00:00")
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const shortDate = (iso) => new Date(iso + "T00:00:00")
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  f.date.addEventListener("input", () => {
    const d = f.date.value.replace(/\D/g, "").slice(0, 8);
    f.date.value = d.length > 4 ? d.slice(0, 2) + "/" + d.slice(2, 4) + "/" + d.slice(4)
                 : d.length > 2 ? d.slice(0, 2) + "/" + d.slice(2)
                 : d;
    if (f.date.value.length === 10) onDateChanged();
  });
  f.date.addEventListener("blur", () => { if (f.date.value) onDateChanged(); });
  $("date-btn").addEventListener("click", () => {
    const iso = parseDate(f.date.value);
    window.PawCalendar.open({
      anchor: $("date-btn").closest(".ap-date"),
      value: iso && iso >= todayIso && iso <= maxIso ? iso : "",
      min: todayIso,
      max: maxIso,
      onPick: (v) => { f.date.value = showDate(v); onDateChanged(); }
    });
  });
  f.picker.addEventListener("change", () => {
    if (f.picker.value) { f.date.value = showDate(f.picker.value); onDateChanged(); }
  });

  /* ---------- Time slots ---------- */
  const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  function label12(min) {
    const h24 = Math.floor(min / 60), m = min % 60;
    const h = h24 % 12 === 0 ? 12 : h24 % 12;
    return h + ":" + pad(m) + " " + (h24 < 12 ? "AM" : "PM");
  }

  function buildTimes() {
    const keep = f.time.value;
    f.time.length = 1;
    const iso = parseDate(f.date.value);
    const now = new Date();
    const earliest = iso === todayIso ? now.getHours() * 60 + now.getMinutes() + MIN_LEAD_MINUTES : -1;
    let count = 0;
    for (let m = toMin(HOURS.open); m < toMin(HOURS.close); m += HOURS.step) {
      if (m < earliest) continue;
      const value = pad(Math.floor(m / 60)) + ":" + pad(m % 60);
      f.time.add(new Option(label12(m), value));
      count++;
    }
    if ([...f.time.options].some((o) => o.value === keep)) f.time.value = keep;
    return count;
  }

  function onDateChanged() {
    const iso = parseDate(f.date.value);
    if (!iso) { setError("date", "Use a real date in the format MM/DD/YYYY."); buildTimes(); return renderSummary(); }
    if (iso < todayIso) { setError("date", "Pick today or a later date."); buildTimes(); return renderSummary(); }
    if (iso > maxIso) { setError("date", "Requests open up to " + MAX_DAYS_AHEAD / 30 + " months ahead."); buildTimes(); return renderSummary(); }
    setError("date", "");
    const slots = buildTimes();
    setError("time", slots ? "" : "No time slots left that day. Please pick another date.");
    renderSummary();
  }
  buildTimes();

  /* ---------- Services ---------- */
  function serviceHtml(s) {
    const head =
      `<label class="ap-svc-head">
         <input type="checkbox" class="ap-check" value="${s.id}" />
         <span class="ap-box" aria-hidden="true"></span>
         <span class="ap-svc-name">${esc(s.name)}</span>
         ${s.options ? "" : `<span class="ap-svc-price">${peso(s.price)}</span>`}
       </label>`;
    const sub = s.options
      ? `<div class="ap-sub" hidden>${s.options.map((o) =>
          `<div class="ap-sub-row">
             <span class="ap-sub-name">${esc(o.name)}</span>
             <span class="ap-sub-price">${peso(o.price)}</span>
             <select class="ap-qty" data-opt="${o.id}" aria-label="${esc(o.name)} number of doses">
               <option value="0"></option>${DOSES.map((d) => `<option value="${d}">${d}x</option>`).join("")}
             </select>
           </div>`).join("")}</div>`
      : "";
    return `<div class="ap-svc" data-id="${s.id}">${head}${sub}</div>`;
  }
  f.services.innerHTML = SERVICES.map(serviceHtml).join("");
  if (!SERVICES.length) {
    f.services.innerHTML = `<p class="ap-error" role="status">No active clinic services are configured yet. Please contact the clinic administrator.</p>`;
    submitButton.disabled = true;
  }

  const rowOf = (el) => el.closest(".ap-svc");

  f.services.addEventListener("change", (e) => {
    const t = e.target;
    const row = rowOf(t);
    if (!row) return;

    if (t.classList.contains("ap-check")) {
      row.classList.toggle("is-on", t.checked);
      const sub = row.querySelector(".ap-sub");
      if (sub) {
        sub.hidden = !t.checked;
        const qtys = [...sub.querySelectorAll(".ap-qty")];
        if (t.checked && qtys.every((q) => q.value === "0")) { qtys[0].value = "1"; qtys[0].classList.add("is-set"); }
        if (!t.checked) qtys.forEach((q) => { q.value = "0"; q.classList.remove("is-set"); });
      }
      setError("services", "");
    } else if (t.classList.contains("ap-qty")) {
      t.classList.toggle("is-set", t.value !== "0");
      setError("services", "");
    }
    renderSummary();
  });

  // what the owner has picked, as lines for the summary and for saving
  function selectedLines() {
    const lines = [];
    SERVICES.forEach((s) => {
      const row = f.services.querySelector(`[data-id="${s.id}"]`);
      if (!row.querySelector(".ap-check").checked) return;
      if (s.options) {
        s.options.forEach((o) => {
          const qty = +row.querySelector(`select[data-opt="${o.id}"]`).value || 0;
          if (qty > 0) lines.push({ id: Number(o.id), name: o.name, quantity: qty, qty, unit: o.price, price: o.price * qty });
        });
      } else {
          lines.push({ id: s.id, name: s.name, quantity: 1, qty: 1, unit: s.price, price: s.price });
      }
    });
    return lines;
  }

  /* ---------- Summary ---------- */
  function renderSummary() {
    const pet = pets.find((p) => p.id === f.pet.value);
    $("sum-pet").textContent = pet ? pet.name : "—";
    $("sum-vet").textContent = f.vet.selectedOptions[0]?.textContent || "To be assigned";

    const iso = parseDate(f.date.value);
    const when = iso && iso >= todayIso && iso <= maxIso
      ? shortDate(iso) + (f.time.value ? ", " + label12(toMin(f.time.value)) : "")
      : "";
    $("sum-when").textContent = when || "—";

    const lines = selectedLines();
    $("sum-lines").innerHTML = lines.length
      ? lines.map((l) => `<div class="ap-sum-row"><span>${esc(l.name)}${l.qty > 1 ? " ×" + l.qty : ""}</span><strong>${peso(l.price)}</strong></div>`).join("")
      : `<p class="ap-sum-empty">No services selected yet.</p>`;
    $("sum-total").textContent = peso(lines.reduce((t, l) => t + l.price, 0));
  }

  [f.pet, f.vet, f.time].forEach((el) => el.addEventListener("change", () => {
    if (el === f.pet) setError("pet", "");
    if (el === f.time) setError("time", "");
    renderSummary();
  }));

  // opened from the Services page: book-appointment.html?service=<id> ticks that service
  const wantedService = new URLSearchParams(location.search).get("service");
  if (wantedService) {
    const box = f.services.querySelector(`[data-id="${CSS.escape(wantedService)}"] .ap-check`);
    if (box) { box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true })); }
  }
  renderSummary();

  /* ---------- Submit ---------- */
  $("appt-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const iso = parseDate(f.date.value);
    const lines = selectedLines();
    const vaccinationOn = f.services.querySelector('[data-id="vaccination"] .ap-check')?.checked;

    const errors = {};
    if (!f.pet.value) errors.pet = pets.length ? "Choose a pet." : "Add a pet first, then book an appointment.";
    if (!f.date.value.trim()) errors.date = "Enter the date.";
    else if (!iso) errors.date = "Use a real date in the format MM/DD/YYYY.";
    else if (iso < todayIso) errors.date = "Pick today or a later date.";
    else if (iso > maxIso) errors.date = "Requests open up to " + MAX_DAYS_AHEAD / 30 + " months ahead.";
    if (!f.time.value) errors.time = errors.time || "Choose a time.";
    if (!lines.length) errors.services = vaccinationOn ? "Choose at least one vaccine (1x, 2x or 3x)." : "Choose at least one service.";

    ["pet", "date", "time", "services"].forEach((k) => setError(k, errors[k]));
    const first = ["pet", "date", "time", "services"].find((k) => errors[k]);
    if (first) { (f[first] || f.services).scrollIntoView({ block: "center", behavior: "smooth" }); if (f[first] && first !== "services") f[first].focus(); return; }

    const pet = pets.find((p) => p.id === f.pet.value);
    const total = lines.reduce((t, l) => t + l.price, 0);
    submitButton.disabled = true;
    try {
      await window.PawApi.request("/api/appointments", {
        method: "POST",
        body: {
          petId: Number(pet.id),
          veterinarianId: f.vet.value ? Number(f.vet.value) : null,
          date: iso,
          time: f.time.value,
          reason: f.reason.value.trim(),
          services: lines.map((line) => ({ id: Number(line.id), quantity: line.quantity }))
        }
      });
    } catch (error) {
      setError("services", error.message || "The appointment could not be booked.");
      submitButton.disabled = false;
      return;
    }
    const saved = { date: iso, time: f.time.value };

    // confirmation panel
    $("done-text").textContent =
      pet.name + " · " + longDate(saved.date) + ", " + label12(toMin(saved.time)) + " · Estimated " + peso(total);
    // keep the form and summary; show the confirmation under the summary
    $("done").hidden = false;
    document.querySelectorAll(".ap-sum-actions").forEach((el) => { el.hidden = true; });
    $("appt-form").querySelectorAll("input, select, textarea, button").forEach((el) => { el.disabled = true; });
    $("done").scrollIntoView({ block: "nearest", behavior: "smooth" });
  });

  $("book-another").addEventListener("click", () => { location.href = "book-appointment.html"; });
})().catch((error) => {
  const alert = document.getElementById("booking-error");
  if (alert) {
    alert.textContent = error.message || "Clinic data could not be loaded.";
    alert.hidden = false;
  }
});