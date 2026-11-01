/* js/owner/dashboard.js - owner dashboard backed by authenticated clinic data. */
(() => {
  const USE_BACKEND = Boolean(window.PawApi && window.PawApi.isBackendSession());
  const API = {
    me: "/api/auth/me",
    appointments: "/api/appointments",
    overdue: "/api/owner/vaccinations/overdue"
  };

  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  const todayIso = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };

  // colours for the statuses the clinic staff can set
  (function () {
    const st = document.createElement("style");
    st.textContent = ".pill{display:inline-block;min-width:70px;padding:1px 12px;border-radius:999px;font-size:11px;line-height:1.6;text-align:center;color:#3a3a3a}"
      + ".pill-pending{background:var(--pill-yellow,#f6d98a)}.pill-confirmed{background:var(--pill-green,#a8dfb0)}.pill-cancelled{background:#f3b1b1}"
      + ".pill-checked_in{background:#f3e27a}.pill-with_vet{background:#9cc7ee}.pill-completed{background:#c9c9c9}.pill-no_show{background:#e3c4f0}"
      + ".cell-note{display:block;margin-top:3px;font-size:11px;line-height:1.3;color:#7a4a00}";
    document.head.appendChild(st);
  })();

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function loadData() {
    if (!USE_BACKEND) throw new Error("An authenticated clinic session is required.");
    const [profile, appointments, owners, overdue] = await Promise.all([
      window.PawApi.request(API.me),
      window.PawApi.request(API.appointments),
      window.PawApi.loadOwners(),
      window.PawApi.request(API.overdue)
    ]);
    const owner = owners[0] || {};
    return {
      user: {
        name: profile.user.name || owner.name || "User",
        avatar: profile.user.photo || owner.profile_photo || ""
      },
      appointments: appointments.map((appointment) => ({
        date: appointment.date,
        time: appointment.time || "00:00",
        pet: appointment.petName || "Pet",
        doctor: appointment.vet || "To be assigned",
        service: (appointment.services || []).map((service) => service.name).join(", ") || "-",
        status: appointment.status,
        note: appointment.status === "cancelled"
          ? appointment.declineReason || ""
          : appointment.status === "pending"
            ? appointment.rescheduleReason || ""
            : ""
      })),
      pets: (owner.pets || []).map((pet) => ({
        name: pet.name,
        species: pet.species || "",
        breed: pet.breed || "",
        photo: pet.photo || ""
      })),
      overdue: overdue.map((vaccination) => ({
        pet: vaccination.pet,
        photo: vaccination.photo || ""
      }))
    };
  }

  /* ---------- Formatting ---------- */
  function fmtDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }
  function fmtTime(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    const d = new Date(2000, 0, 1, h, m);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }
  const label = (s) => ({ checked_in: "Checked in", with_vet: "With vet", no_show: "No-show" }[s] || s.charAt(0).toUpperCase() + s.slice(1));

  /* ---------- Renderers ---------- */
  function appointmentRow(a) {
    return `
      <div class="row" role="row">
        <span role="cell">
          <span class="cell-main">${esc(fmtDate(a.date))}</span>
          <span class="cell-sub">${esc(fmtTime(a.time))}</span>
        </span>
        <span role="cell">
          <span class="cell-main">${esc(a.pet)}</span>
          <span class="cell-sub">${esc(a.doctor)}</span>
        </span>
        <span role="cell" class="cell-service">${esc(a.service)}</span>
        <span role="cell" class="status-cell">
          <span class="pill pill-${esc(a.status)}">${esc(label(a.status))}</span>${a.note ? `<span class="cell-note">${esc(a.note)}</span>` : ""}
        </span>
      </div>`;
  }

  function fillRows(id, items, emptyText) {
    $(id).innerHTML = items.length
      ? items.map(appointmentRow).join("")
      : `<p class="empty">${emptyText}</p>`;
  }

  function thumb(photo) {
    // inline size/position so the picture shows whatever the page CSS says
    return `<span class="list-thumb"${photo ? ` style="background-image:url('${esc(photo)}');background-size:cover;background-position:center;background-repeat:no-repeat"` : ""}></span>`;
  }

  function render(data) {
    const name = data.user.name || "User";
    $("greeting-name").textContent = name;
    $("sidebar-name").textContent = name;
    // profile picture: the one saved on Edit Profile (per user), else the one from the API
    const avatar = data.user.avatar || "";
    if (avatar) {
      const av = $("user-avatar");
      av.style.backgroundImage = `url('${avatar}')`;
      av.style.backgroundSize = "cover";
      av.style.backgroundPosition = "center";
      av.style.backgroundRepeat = "no-repeat";
    }

    $("today").textContent = new Date().toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric"
    });

    const byDate = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);
    const today = todayIso();
    const upcoming = data.appointments.filter((a) => ["confirmed", "checked_in", "with_vet"].includes(a.status) && a.date >= today).sort(byDate);
    const pending = data.appointments.filter((a) => a.status === "pending").sort(byDate);
    // requests the clinic declined stay in this box so the owner can read the reason
    const declined = data.appointments.filter((a) => a.status === "cancelled" && a.note).sort(byDate).reverse();

    $("stat-upcoming").textContent = upcoming.length;
    $("stat-pending").textContent = pending.length;
    $("stat-overdue").textContent = data.overdue.length;
    $("stat-pets").textContent = data.pets.length;

    fillRows("upcoming-rows", upcoming.slice(0, 3), "No upcoming appointments.");
    fillRows("pending-rows", pending.concat(declined).slice(0, 3), "No pending requests.");

    $("pets-list").innerHTML = data.pets.length
      ? data.pets.slice(0, 3).map((p) => `
          <li>${thumb(p.photo)}
            <div><strong>${esc(p.name)}</strong><small>${esc(p.species)} - ${esc(p.breed)}</small></div>
          </li>`).join("")
      : `<li class="empty">No pets yet. Click "Add pet" to get started.</li>`;

    $("vax-list").innerHTML = data.overdue.length
      ? data.overdue.slice(0, 3).map((v) => `
          <li>${thumb(v.photo)}
            <div><strong>${esc(v.pet)}</strong><small>Missed Vaccination</small></div>
          </li>`).join("")
      : `<li class="empty">No overdue vaccinations.</li>`;
  }

  /* ---------- Mobile menu ---------- */
  const sidebar = $("sidebar"), overlay = $("overlay"), menuBtn = $("menu-btn");
  function setMenu(open) {
    sidebar.classList.toggle("open", open);
    overlay.classList.toggle("show", open);
    menuBtn.setAttribute("aria-expanded", String(open));
  }
  menuBtn.addEventListener("click", () => setMenu(!sidebar.classList.contains("open")));
  overlay.addEventListener("click", () => setMenu(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

  /* ---------- Logout ---------- */
  $("logout").addEventListener("click", (event) => {
    if (!window.confirm("Are you sure you want to log out?")) {
      event.preventDefault();
      return;
    }
    try { localStorage.removeItem("token"); localStorage.removeItem("pawpaw_user"); sessionStorage.clear(); } catch (_) {}
    // then follows href="login.html"
  });

  loadData().then(render).catch((error) => {
    console.error("[owner dashboard] Could not load live clinic data:", error);
    $("greeting-name").textContent = "Dashboard unavailable";
    $("sidebar-name").textContent = "Dashboard unavailable";
    const notice = document.createElement("p");
    notice.setAttribute("role", "alert");
    notice.textContent = "Could not load clinic data. Refresh the page to try again.";
    document.querySelector(".main").prepend(notice);
  });
})();