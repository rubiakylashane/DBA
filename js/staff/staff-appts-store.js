/* js/staff/staff-appts-store.js
   Demo data for the staff Appointments page: reads the requests that owners made
   (saved by js/owner/appts-store.js, one list per owner: "pawpaw_appointments:<owner>").
   Replace load / change / add with fetch() calls when the backend is ready:
     GET   /api/staff/appointments
     PATCH /api/staff/appointments/:id   { status, vet, date, time, reason }
     POST  /api/staff/appointments       { owner, petId, service, date, time, vet } */
window.PawStaffAppts = (() => {
  const KEY = "pawpaw_appointments:";
  const backend = Boolean(window.PawApi && window.PawApi.isBackendSession());
  const signedInRole = (() => {
    try { return String(JSON.parse(sessionStorage.getItem("pawpaw_user") || localStorage.getItem("pawpaw_user") || "{}").role || "").toLowerCase(); }
    catch (_) { return ""; }
  })();
  let VETS = backend ? [] : (() => { try { const v = JSON.parse(localStorage.getItem("pawpaw_vets") || "null"); if (Array.isArray(v) && v.length) return v.filter((x) => x.status !== "inactive").map((x) => x.name); } catch (_) { /* default */ } return []; })();
  let SERVICES = backend ? [] : (() => { try { const v = JSON.parse(localStorage.getItem("pawpaw_services") || "null"); if (Array.isArray(v) && v.length) return v.filter((x) => x.status !== "inactive").map((x) => x.name); } catch (_) { /* default */ } return []; })();
  const STATUS = { pending: "Pending", confirmed: "Confirmed", checked_in: "Checked in", with_vet: "With vet", completed: "Completed", cancelled: "Cancelled", no_show: "No-show" };
  const ORDER = ["pending", "confirmed", "checked_in", "with_vet", "completed", "no_show", "cancelled"];
  const ACTIVE = ["pending", "confirmed", "checked_in", "with_vet"];   // still occupy a vet's time
  const TBA = "To be assigned";
  let remoteAppointments = [];
  let remoteOwners = [];
  const ready = backend ? Promise.all([
    window.PawApi.request(signedInRole === "vet" ? "/api/vet/appointments" : signedInRole === "owner" ? "/api/appointments" : "/api/staff/appointments"),
    window.PawApi.loadOwners(),
    window.PawApi.request("/api/vets"),
    window.PawApi.request("/api/services")
  ]).then(([appointments, owners, vets, services]) => {
    remoteAppointments = appointments.map((a) => ({ ...a, id: String(a.id), owner: String(a.owner), _key: KEY + String(a.owner), pet: a.petName }));
    remoteOwners = owners;
    VETS = vets.filter((v) => v.status !== "inactive").map((v) => v.name);
    SERVICES = services.filter((s) => s.status !== "inactive").map((s) => s.name);
    return remoteAppointments;
  }) : Promise.resolve([]);

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /* audit trail (demo): shared list "pawpaw_audit", read by the admin Audit Log page.
     Backend: the server writes this itself, from the signed-in user, whenever a record is created, changed or deleted. */
  function audit(action, record, details) {
    try {
      let u = null;
      for (const st of ["sessionStorage", "localStorage"]) { try { const x = JSON.parse(window[st].getItem("pawpaw_user") || "null"); if (x && x.name) { u = x; break; } } catch (_) { /* ignore */ } }
      const raw = (u && u.name) || "Unknown", who = raw === raw.toLowerCase() ? raw.charAt(0).toUpperCase() + raw.slice(1) : raw;
      const a = JSON.parse(localStorage.getItem("pawpaw_audit") || "[]");
      a.push({ at: new Date().toISOString(), user: who, role: (u && u.role) || "", action, record, details,
        text: "<strong>" + esc(who) + "</strong> " + esc(details.charAt(0).toLowerCase() + details.slice(1)) });
      localStorage.setItem("pawpaw_audit", JSON.stringify(a.slice(-500)));
    } catch (_) { /* ignore */ }
  }
  function ownerLabel(key) { try { return (JSON.parse(localStorage.getItem("pawpaw_profile:" + key) || "{}") || {}).name || key; } catch (_) { return key; } }

  function load() {
    if (backend) return remoteAppointments.slice();
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf(KEY) !== 0) continue;
        const owner = k.slice(KEY.length);
        (JSON.parse(localStorage.getItem(k) || "[]") || []).forEach((a) => out.push({ ...a, owner, _key: k }));
      }
    } catch (_) { /* storage blocked */ }
    return out;
  }

  /* a message for a vet's notification bell ("pawpaw_notifications:vet:<vet name>").
     Backend: the server creates this itself when the staff / owner action is saved. */
  function notifyVet(vet, title, text) {
    if (!vet || vet === TBA) return;
    const key = "pawpaw_notifications:vet:" + String(vet).toLowerCase();
    try {
      const list = JSON.parse(localStorage.getItem(key) || "[]");
      list.push({ id: "n-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type: "appointment", title, text, createdAt: new Date().toISOString(), readAt: null });
      localStorage.setItem(key, JSON.stringify(list.slice(-50)));
    } catch (_) { /* ignore */ }
  }
  /* tell the vet what staff / owner just did to a patient of theirs (not for the vet's own start / complete) */
  function vetChanged(before, patch) {
    const after = { ...before, ...patch };
    const what = (after.petName || after.pet || "Pet") + ", " + after.date + " " + (after.time || "") + ".";
    const newVet = patch.vet && patch.vet !== before.vet;
    if (newVet && before.vet && before.vet !== TBA) notifyVet(before.vet, "Patient reassigned", what);
    if (!after.vet || after.vet === TBA) return;
    if (newVet || (patch.status === "confirmed" && before.status === "pending")) notifyVet(after.vet, "New patient assigned", what);
    else if (patch.status === "with_vet" && patch.vet) notifyVet(after.vet, "Patient is ready", what);   // staff "Assign Vet" on a checked-in patient
    else if (patch.status === "checked_in") notifyVet(after.vet, "Patient checked in", what);
    else if (patch.status === "cancelled") notifyVet(after.vet, "Appointment cancelled", what);
    else if (patch.status === "no_show") notifyVet(after.vet, "Marked as no-show", what);
    else if ((patch.date && patch.date !== before.date) || (patch.time && patch.time !== before.time)) notifyVet(after.vet, "Appointment rescheduled", what);
  }

  /* save a change (status / vet / date / time ...) back to the owner's list */
  /* quiet = true when the caller writes its own audit line (the admin Appointments page does) */
  async function change(appt, patch, quiet) {
    const before = { ...appt };
    if (backend) {
      await window.PawApi.request("/api/appointments/" + encodeURIComponent(appt.id), { method: "PATCH", body: patch });
    } else try {
      const list = JSON.parse(localStorage.getItem(appt._key) || "[]");
      const i = list.findIndex((a) => a.id === appt.id);
      if (i >= 0) { list[i] = { ...list[i], ...patch, updatedAt: new Date().toISOString() }; localStorage.setItem(appt._key, JSON.stringify(list)); }
    } catch (_) { /* ignore */ }
    if (!backend) vetChanged(before, patch);
    if (!backend && !quiet) {
      const bits = [];
      if (patch.status && patch.status !== before.status) bits.push("status from " + (STATUS[before.status] || before.status) + " to " + (STATUS[patch.status] || patch.status));
      if (patch.vet && patch.vet !== before.vet) bits.push("veterinarian to " + patch.vet);
      if ((patch.date && patch.date !== before.date) || (patch.time && patch.time !== before.time)) bits.push("schedule to " + (patch.date || before.date) + " " + (patch.time || before.time || ""));
      if (bits.length) audit("update", "appointment", "Changed the appointment of " + (before.petName || "a pet") + " (" + ownerLabel(before.owner) + "): " + bits.join(", ") + ".");
    }
    Object.assign(appt, patch);
    return appt;
  }

  /* staff books for an owner that is already registered */
  async function add(ownerKey, data) {
    const key = KEY + ownerKey;
    const now = new Date().toISOString();
    const a = { id: "ap-" + Date.now().toString(36), status: "confirmed", total: 0, reason: "", createdAt: now, updatedAt: now, ...data };
    if (backend) {
      const saved = await window.PawApi.request("/api/appointments", {
        method: "POST",
        body: { ownerId: ownerKey, petId: data.petId, vet: data.vet, date: data.date, time: data.time, reason: data.reason, services: data.services }
      });
      const mapped = { ...saved, id: String(saved.id), owner: String(saved.owner), _key: KEY + String(saved.owner), pet: saved.petName };
      remoteAppointments.push(mapped);
      return mapped;
    }
    try {
      const list = JSON.parse(localStorage.getItem(key) || "[]");
      list.push(a);
      localStorage.setItem(key, JSON.stringify(list));
    } catch (_) { /* ignore */ }
    audit("create", "appointment", "Booked an appointment for " + (a.petName || "a pet") + " (" + ownerLabel(ownerKey) + ") on " + a.date + " " + (a.time || "") + ".");
    if (a.vet && a.vet !== TBA) notifyVet(a.vet, "New patient assigned", (a.petName || "Pet") + ", " + a.date + " " + (a.time || "") + ".");
    return { ...a, owner: ownerKey, _key: key };
  }

  /* another active appointment with the same vet at the same date and time */
  function conflict(all, vet, date, time, exceptId) {
    if (!vet || vet === TBA || !date || !time) return null;
    return all.find((x) => x.id !== exceptId && x.vet === vet && x.date === date && x.time === time && ACTIVE.indexOf(x.status) >= 0) || null;
  }
  /* a message for the owner's notification bell ("pawpaw_notifications:<owner>").
     Backend: the server creates this itself when the staff action is saved. */
  function notify(ownerKey, type, title, text) {
    if (!ownerKey) return;
    const key = "pawpaw_notifications:" + ownerKey;
    try {
      const list = JSON.parse(localStorage.getItem(key) || "[]");
      list.push({ id: "n-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type, title, text, createdAt: new Date().toISOString(), readAt: null });
      localStorage.setItem(key, JSON.stringify(list.slice(-50)));
    } catch (_) { /* ignore */ }
  }
  return {
    load, change, add, ready, backend, conflict, notify, notifyVet, vetChanged,
    get VETS() { return VETS; },
    get SERVICES() { return SERVICES; },
    getOwners: () => remoteOwners,
    STATUS, ORDER, ACTIVE, TBA
  };
})();