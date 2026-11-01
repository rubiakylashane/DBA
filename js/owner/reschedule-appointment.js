/* js/owner/reschedule-appointment.js
   Reschedule one appointment (reschedule-appointment.html?id=...).
   The new date and time are saved and the request goes back to "pending" until staff confirm. */
(async () => {
  const { esc } = window.PawPets;
  const Appts = window.PawAppts;
  const $ = (id) => document.getElementById(id);
  const backend = window.PawApi && window.PawApi.isBackendSession();

  /* same clinic hours as book-appointment.js */
  const HOURS = { open: "09:00", close: "17:00", step: 30 };
  const MIN_LEAD_MINUTES = 60;
  const MAX_DAYS_AHEAD = 180;

  const peso = (n) => "₱" + n.toLocaleString("en-US");
  const pad = (n) => String(n).padStart(2, "0");
  const toIso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const longDate = (iso) => new Date(iso + "T00:00:00")
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  function label12(min) {
    const h24 = Math.floor(min / 60), m = min % 60;
    const h = h24 % 12 === 0 ? 12 : h24 % 12;
    return h + ":" + pad(m) + " " + (h24 < 12 ? "AM" : "PM");
  }

  const id = new URLSearchParams(location.search).get("id");
  let appt = null;
  if (backend) {
    try {
      const appointments = await window.PawApi.request("/api/appointments");
      appt = appointments.find((appointment) => String(appointment.id) === String(id));
    } catch (error) {
      $("rs-missing").hidden = false;
      $("rs-missing").querySelector("p").textContent = error.message || "Appointments could not be loaded.";
      return;
    }
  } else appt = id ? Appts.get(id) : null;
  if (!appt || ["pending", "confirmed"].indexOf(appt.status) < 0 || appt.date < new Date().toISOString().slice(0, 10)) { $("rs-missing").hidden = false; return; }
  $("rs-layout").hidden = false;

  /* ----- summary (left card) ----- */
  $("rs-pet").textContent = appt.petName;
  $("rs-vet").textContent = appt.vet || "To be assigned";
  $("rs-current").textContent = longDate(appt.date) + ", " + label12(toMin(appt.time));
  $("rs-lines").innerHTML = (appt.services || []).map((l) =>
    `<div class="ap-sum-row"><span>${esc(l.name)}${l.qty > 1 ? " ×" + l.qty : ""}</span><strong>${peso(l.price)}</strong></div>`).join("");
  $("rs-total").textContent = peso(appt.total || 0);
  $("rs-reason").textContent = appt.reason || "None";

  /* ----- date and time (right card) ----- */
  const f = { date: $("date"), time: $("time") };
  const todayIso = toIso(new Date());
  const maxD = new Date(); maxD.setDate(maxD.getDate() + MAX_DAYS_AHEAD);
  const maxIso = toIso(maxD);

  function setError(key, msg) {
    const el = $("err-" + key);
    el.textContent = msg || ""; el.hidden = !msg;
    f[key].setAttribute("aria-invalid", msg ? "true" : "false");
  }
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

  function buildTimes() {
    const keep = f.time.value;
    f.time.length = 1;
    const iso = parseDate(f.date.value);
    const now = new Date();
    const earliest = iso === todayIso ? now.getHours() * 60 + now.getMinutes() + MIN_LEAD_MINUTES : -1;
    let count = 0;
    for (let m = toMin(HOURS.open); m < toMin(HOURS.close); m += HOURS.step) {
      if (m < earliest) continue;
      f.time.add(new Option(label12(m), pad(Math.floor(m / 60)) + ":" + pad(m % 60)));
      count++;
    }
    if ([...f.time.options].some((o) => o.value === keep)) f.time.value = keep;
    return count;
  }
  function onDateChanged() {
    const iso = parseDate(f.date.value);
    if (!iso) { setError("date", "Use a real date in the format MM/DD/YYYY."); buildTimes(); return; }
    if (iso < todayIso) { setError("date", "Pick today or a later date."); buildTimes(); return; }
    if (iso > maxIso) { setError("date", "Requests open up to " + MAX_DAYS_AHEAD / 30 + " months ahead."); buildTimes(); return; }
    setError("date", "");
    setError("time", buildTimes() ? "" : "No time slots left that day. Please pick another date.");
  }

  f.date.addEventListener("input", () => {
    const d = f.date.value.replace(/\D/g, "").slice(0, 8);
    f.date.value = d.length > 4 ? d.slice(0, 2) + "/" + d.slice(2, 4) + "/" + d.slice(4)
                 : d.length > 2 ? d.slice(0, 2) + "/" + d.slice(2) : d;
    if (f.date.value.length === 10) onDateChanged();
  });
  f.date.addEventListener("blur", () => { if (f.date.value) onDateChanged(); });
  $("date-btn").addEventListener("click", () => {
    const iso = parseDate(f.date.value);
    window.PawCalendar.open({
      anchor: $("date-btn").closest(".ap-date"),
      value: iso && iso >= todayIso && iso <= maxIso ? iso : "",
      min: todayIso, max: maxIso,
      onPick: (v) => { f.date.value = showDate(v); onDateChanged(); }
    });
  });
  f.time.addEventListener("change", () => setError("time", ""));
  buildTimes();

  $("rs-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const iso = parseDate(f.date.value);
    let bad = false;
    if (!f.date.value.trim()) { setError("date", "Enter the new date."); bad = true; }
    else if (!iso) { setError("date", "Use a real date in the format MM/DD/YYYY."); bad = true; }
    else if (iso < todayIso) { setError("date", "Pick today or a later date."); bad = true; }
    else if (iso > maxIso) { setError("date", "Requests open up to " + MAX_DAYS_AHEAD / 30 + " months ahead."); bad = true; }
    if (!f.time.value) { setError("time", "Choose a time."); bad = true; }
    else if (iso === appt.date && f.time.value === String(appt.time).slice(0, 5)) { setError("time", "That is your current schedule. Choose a different date or time."); bad = true; }
    if (bad) return;

    const submit = $("rs-form").querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      if (backend) {
        await window.PawApi.request("/api/appointments/" + encodeURIComponent(appt.id), {
          method: "PATCH",
          body: {
            date: iso,
            time: f.time.value,
            status: "pending",
            rescheduledFrom: { date: appt.date, time: appt.time },
            rescheduleReason: "Owner requested a new appointment time."
          }
        });
      } else {
        Appts.update(appt.id, { date: iso, time: f.time.value, status: "pending", rescheduledFrom: { date: appt.date, time: appt.time } });
      }
    } catch (error) {
      setError("time", error.message || "The reschedule request could not be saved.");
      submit.disabled = false;
      return;
    }
    try { sessionStorage.setItem("pawpaw_flash", "Reschedule requested. The clinic will confirm it."); } catch (_) { /* ignore */ }
    location.href = "my-appointments.html";
  });
})();