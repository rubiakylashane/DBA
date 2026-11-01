/* js/owner/appts-store.js
   Demo storage for appointment requests (this browser's localStorage).
   Replace load / save with fetch() calls when the backend is ready.
   The My Appointments page and the dashboard can read the same list. */
window.PawAppts = (() => {
  const BASE = "pawpaw_appointments";
  let memory = [];

  /* Data is saved per signed-in user, so each account only sees its own records. */
  function userKey(base) {
    let name = "guest";
    for (const store of ["sessionStorage", "localStorage"]) {
      try {
        const u = JSON.parse(window[store].getItem("pawpaw_user") || "null");
        if (u && u.name) { name = String(u.name).trim().toLowerCase(); break; }
      } catch (_) { /* ignore */ }
    }
    return base + ":" + name;
  }

  function ownerName() {
    for (const store of ["sessionStorage", "localStorage"]) {
      try { const u = JSON.parse(window[store].getItem("pawpaw_user") || "null"); if (u && u.name) return String(u.name).trim(); } catch (_) { /* ignore */ }
    }
    return "An owner";
  }
  /* message for the STAFF bell ("pawpaw_notifications:staff"). Backend: the server creates this itself. */
  function tellStaff(title, a) {
    try {
      const k = "pawpaw_notifications:staff", list = JSON.parse(localStorage.getItem(k) || "[]");
      list.push({ id: "n-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type: "appointment", title,
        text: ownerName() + " - " + (a.petName || "pet") + ", " + a.date + " " + (a.time || "") + ".", createdAt: new Date().toISOString(), readAt: null });
      localStorage.setItem(k, JSON.stringify(list.slice(-50)));
    } catch (_) { /* ignore */ }
  }

  /* message for the vet's bell, when the appointment already has a vet */
  function tellVet(title, a) {
    if (!a.vet || a.vet === "To be assigned") return;
    try {
      const k = "pawpaw_notifications:vet:" + String(a.vet).toLowerCase(), list = JSON.parse(localStorage.getItem(k) || "[]");
      list.push({ id: "n-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type: "appointment", title,
        text: (a.petName || "Pet") + ", " + a.date + " " + (a.time || "") + ".", createdAt: new Date().toISOString(), readAt: null });
      localStorage.setItem(k, JSON.stringify(list.slice(-50)));
    } catch (_) { /* ignore */ }
  }

  /* audit trail (demo): shared list "pawpaw_audit", read by the admin Audit Log page. Backend: the server writes this itself. */
  function audit(action, details) {
    try {
      const who = ownerName(), a = JSON.parse(localStorage.getItem("pawpaw_audit") || "[]"), esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
      a.push({ at: new Date().toISOString(), user: who, role: "owner", action, record: "appointment", details, text: "<strong>" + esc(who) + "</strong> " + esc(details.charAt(0).toLowerCase() + details.slice(1)) });
      localStorage.setItem("pawpaw_audit", JSON.stringify(a.slice(-500)));
    } catch (_) { /* ignore */ }
  }

  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(userKey(BASE)) || "null");
      return Array.isArray(v) ? v : [];
    } catch (_) { /* storage blocked: use memory */ }
    return memory;
  }
  function save(list) {
    memory = list;
    try { localStorage.setItem(userKey(BASE), JSON.stringify(list)); } catch (_) { /* ignore */ }
  }

  /* a new request always starts as "pending" until staff approve it */
  function add(appt) {
    const list = load();
    const created = {
      ...appt,
      id: "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      status: "pending",
      createdAt: new Date().toISOString()
    };
    list.push(created);
    save(list);
    tellStaff("New appointment request", created);
    audit("create", "Requested an appointment for " + (created.petName || "a pet") + " on " + created.date + " " + (created.time || "") + ".");
    return created;
  }

  const get = (id) => load().find((a) => a.id === id) || null;

  /* change fields of one appointment (reschedule, cancel ...) */
  function update(id, patch) {
    const list = load();
    const i = list.findIndex((a) => a.id === id);
    if (i < 0) return null;
    const before = list[i];
    list[i] = { ...before, ...patch, updatedAt: new Date().toISOString() };
    save(list);
    if (patch.status === "cancelled" && before.status !== "cancelled") { tellStaff("Appointment cancelled by owner", list[i]); tellVet("Appointment cancelled", list[i]); audit("update", "Cancelled the appointment of " + (list[i].petName || "a pet") + " on " + list[i].date + " " + (list[i].time || "") + "."); }
    else if ((patch.date && patch.date !== before.date) || (patch.time && patch.time !== before.time)) { tellStaff("Reschedule request", list[i]); tellVet("Appointment rescheduled", list[i]); audit("update", "Rescheduled the appointment of " + (list[i].petName || "a pet") + " to " + list[i].date + " " + (list[i].time || "") + "."); }
    return list[i];
  }

  return { load, get, add, update };
})();