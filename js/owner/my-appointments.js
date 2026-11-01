/* js/owner/my-appointments.js
   My Appointments: list, search, sort, cancel. Reschedule opens reschedule-appointment.html.
   Needs pets-store.js (esc) and appts-store.js loaded first. */
(() => {
  const { esc } = window.PawPets;
  const Appts = window.PawAppts;
  const $ = (id) => document.getElementById(id);
  const backend = window.PawApi && window.PawApi.isBackendSession();
  let appointmentList = [], loading = backend, loadError = "";

  const rowsEl = $("rows"), search = $("search"), sortEl = $("sort");
  const dialog = $("cancel-dialog"), toast = $("toast");

  const pad = (n) => String(n).padStart(2, "0");
  const longDate = (iso) => new Date(iso + "T00:00:00")
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  function time12(hhmm) {
    const [h24, m] = (hhmm || "00:00").split(":").map(Number);
    const h = h24 % 12 === 0 ? 12 : h24 % 12;
    return h + ":" + pad(m) + " " + (h24 < 12 ? "AM" : "PM");
  }
  const LABELS = { checked_in: "Checked in", with_vet: "With vet", no_show: "No-show" };
  const label = (s) => LABELS[s] || s.charAt(0).toUpperCase() + s.slice(1);
  // order for "Sort: status" (statuses the clinic staff set are included)
  /* clinic note: decline reason only when cancelled; reschedule reason only while pending / confirmed
     (it disappears once the pet is checked in, with the vet, or done) */
  const noteOf = (a) => a.status === "cancelled" ? (a.declineReason || "") : (["pending", "confirmed"].indexOf(a.status) >= 0 ? (a.rescheduleReason || "") : "");
  const STATUS_ORDER = { confirmed: 0, pending: 1, checked_in: 2, with_vet: 3, completed: 4, no_show: 5, cancelled: 6 };
  const orderOf = (s) => (s in STATUS_ORDER ? STATUS_ORDER[s] : 9);

  // pill colours for the new statuses (the clinic staff set these)
  (function () {
    const st = document.createElement("style");
    st.textContent = ".ma-pill.ma-checked_in{background:#f3e27a}.ma-pill.ma-with_vet{background:#9cc7ee}.ma-pill.ma-completed{background:#cfcfcf}" +
      ".ma-pill.ma-no_show{background:#e3c4f0}.ma-pill.ma-cancelled{background:#f3b1b1}.ma-note{display:block;margin-top:5px;font-size:11px;line-height:1.3;color:#7a4a00}";
    document.head.appendChild(st);
  })();

  const today = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  // Reschedule / Cancel only while the visit has not happened yet
  const canChange = (a) => (a.status === "pending" || a.status === "confirmed") && a.date >= today();

  function services(a) {
    const names = (a.services || []).map((l) => l.name);
    if (!names.length) return "-";
    return names.length > 2 ? names.slice(0, 2).join(", ") + " +" + (names.length - 2) : names.join(", ");
  }

  function row(a) {
    const actions = !canChange(a)
      ? `<span class="ma-none">-</span>`
      : `<a class="abtn abtn-outline ma-btn" href="reschedule-appointment.html?id=${encodeURIComponent(a.id)}">Reschedule</a>
         <button type="button" class="abtn abtn-cancel ma-btn" data-cancel="${esc(a.id)}">Cancel</button>`;
    return `
      <div class="ma-row" role="row">
        <span role="cell"><strong>${esc(longDate(a.date))}</strong><small>${esc(time12(a.time))}</small></span>
        <span role="cell"><strong>${esc(a.petName)}</strong><small>${esc(a.vet || "To be assigned")}</small></span>
        <span role="cell" class="ma-services" title="${esc((a.services || []).map((l) => l.name).join(", "))}">${esc(services(a))}</span>
        <span role="cell" class="ma-c"><span class="ma-pill ma-${esc(a.status)}">${esc(label(a.status))}</span>${noteOf(a) ? `<span class="ma-note">${esc(noteOf(a))}</span>` : ""}</span>
        <span role="cell" class="ma-c ma-actions">${actions}</span>
      </div>`;
  }

  function visible() {
    const q = search.value.trim().toLowerCase();
    let list = backend ? appointmentList.slice() : Appts.load();
    if (q) {
      list = list.filter((a) => [a.petName, a.vet, a.status, longDate(a.date), (a.services || []).map((l) => l.name).join(" ")]
        .join(" ").toLowerCase().includes(q));
    }
    const key = (a) => a.date + " " + a.time;
    const by = {
      soon: (a, b) => key(a).localeCompare(key(b)),
      late: (a, b) => key(b).localeCompare(key(a)),
      status: (a, b) => (orderOf(a.status) - orderOf(b.status)) || key(a).localeCompare(key(b)),
      pet: (a, b) => a.petName.localeCompare(b.petName) || key(a).localeCompare(key(b))
    };
    return list.sort(by[sortEl.value] || by.soon);
  }

  function render() {
    const all = backend ? appointmentList : Appts.load();
    const list = visible();
    rowsEl.innerHTML = list.length
      ? list.map(row).join("")
      : `<div class="ma-empty">${loading ? "Loading your appointments…" : loadError ? "Could not load appointments: " + esc(loadError) : all.length
          ? "No appointments match your search."
          : `No appointments yet. <a href="book-appointment.html">Book an appointment</a>`}</div>`;
  }
  async function refresh() {
    if (!backend) { loading = false; render(); return; }
    loading = true;
    loadError = "";
    render();
    try {
      appointmentList = await window.PawApi.request("/api/appointments");
    } catch (error) {
      loadError = error.message || "Request failed.";
    } finally {
      loading = false;
      render();
    }
  }

  /* ----- Cancel ----- */
  let cancelId = null;
  rowsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cancel]");
    if (!btn) return;
    const a = backend ? appointmentList.find((item) => String(item.id) === btn.dataset.cancel) : Appts.get(btn.dataset.cancel);
    if (!a) return;
    cancelId = a.id;
    $("cancel-text").textContent = a.petName + " · " + longDate(a.date) + ", " + time12(a.time);
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
  });
  $("cancel-keep").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  $("cancel-yes").addEventListener("click", async () => {
    if (!cancelId) return;
    const id = cancelId;
    $("cancel-yes").disabled = true;
    try {
      if (backend) {
        await window.PawApi.request("/api/appointments/" + encodeURIComponent(id), {
          method: "PATCH", body: { status: "cancelled" }
        });
        await refresh();
      } else {
        Appts.update(id, { status: "cancelled" });
        render();
      }
      cancelId = null;
      dialog.close();
      showToast("Appointment cancelled.");
    } catch (error) {
      showToast(error.message || "The appointment could not be cancelled.");
    } finally {
      $("cancel-yes").disabled = false;
    }
  });

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2800);
  }

  search.addEventListener("input", render);
  sortEl.addEventListener("change", render);

  render();
  if (backend) refresh();
  try {
    const m = sessionStorage.getItem("pawpaw_flash");
    if (m) { sessionStorage.removeItem("pawpaw_flash"); showToast(m); }
  } catch (_) { /* ignore */ }
})();