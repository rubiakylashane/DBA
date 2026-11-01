/* js/staff/owners-store.js
   Demo storage for the staff "Owners and Pets" pages (this browser's localStorage).
   An owner is identified by the same key the owner pages use for their own data:
     pawpaw_profile:<key>   { name, firstName, middleName, lastName, email, phone, address, photo, memberSince, walkIn }
     pawpaw_pets:<key>      [ { id, name, species, breed, sex, dob, allergies, notes, photo } ]
   Owners who registered themselves are found from those keys; walk-in owners (registered by staff)
   get a key like "walkin-xxxx" and are also listed in pawpaw_walkins.
   When the backend is ready, replace the read/write helpers with fetch() calls:
     GET /api/owners, GET /api/owners/:id, POST /api/owners (walk-in), PUT /api/owners/:id,
     POST /api/owners/:id/pets, PUT /api/owners/:id/pets/:petId */
window.PawOwners = (() => {
  const PETS = "pawpaw_pets:", PROF = "pawpaw_profile:", APPT = "pawpaw_appointments:", WALK = "pawpaw_walkins";
  const STAFF_NAMES = ["guest", "staff", "vet", "admin"];
  const memory = {};

  const read = (k, d) => {
    try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; }
    catch (_) { return k in memory ? memory[k] : d; }
  };
  const write = (k, v) => {
    memory[k] = v;
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* ignore */ }
  };
  const today = () => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); };

  /* every owner key we know about */
  function keys() {
    const set = new Set(read(WALK, []).map((w) => w.key));
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || "";
        for (const pre of [PETS, PROF, APPT]) if (k.indexOf(pre) === 0) set.add(k.slice(pre.length));
      }
    } catch (_) { /* ignore */ }
    return [...set].filter((k) => k && !STAFF_NAMES.includes(k));
  }

  /* split "Juan Maria Dela Cruz" when first / middle / last were not saved separately */
  function parts(prof, key) {
    if (prof.firstName || prof.lastName) return { first: prof.firstName || "", middle: prof.middleName || "", last: prof.lastName || "" };
    const t = String(prof.name || key).trim().split(/\s+/).filter(Boolean);
    if (t.length <= 1) return { first: t[0] || key, middle: "", last: "" };
    return { first: t[0], middle: t.slice(1, -1).join(" "), last: t[t.length - 1] };
  }

  function owner(key) {
    const prof = read(PROF + key, {}) || {};
    const p = parts(prof, key);
    const pets = read(PETS + key, []);
    const full = [p.first, p.middle, p.last].filter(Boolean).join(" ");
    return {
      id: key, first: p.first, middle: p.middle, last: p.last,
      name: full || key,
      short: [p.first, p.last].filter(Boolean).join(" ") || key,                       // FirstName LastName
      formal: p.last ? p.last + ", " + p.first + (p.middle ? " " + p.middle.charAt(0).toUpperCase() + "." : "") : p.first,  // LastName, FirstName M.I.
      email: prof.email || "", phone: prof.phone || "", address: prof.address || "", photo: prof.photo || "",
      registered: prof.memberSince || "", walkIn: !!prof.walkIn,
      petCount: pets.length
    };
  }
  const exists = (key) => keys().includes(key);
  const list = () => keys().map(owner);

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

  /* quiet = true when the caller writes its own audit line (or the profile is brand new) */
  function saveProfile(key, patch, quiet) {
    const name = (read(PROF + key, {}) || {}).name;
    write(PROF + key, { ...(read(PROF + key, {}) || {}), ...patch });
    if (!quiet) audit("update", "owner", "Updated owner " + (patch.name || name || key) + ".");
  }

  /* walk-in owner registered by staff */
  function createWalkin({ first, middle, last, phone, email }) {
    const key = "walkin-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const w = read(WALK, []); w.push({ key }); write(WALK, w);
    const full = [first, middle, last].filter(Boolean).join(" ");
    audit("create", "owner", "Registered walk-in owner " + full + ".");
    saveProfile(key, {
      name: full,
      firstName: first, middleName: middle, lastName: last,
      phone, email, address: "", photo: "", memberSince: today(), walkIn: true
    }, true);
    return key;
  }

  /* ----- pets of one owner ----- */
  const petsOf = (key) => read(PETS + key, []);
  const getPet = (key, id) => petsOf(key).find((p) => p.id === id) || null;
  function addPet(key, pet) {
    const list = petsOf(key);
    const created = { ...pet, id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) };
    list.push(created); write(PETS + key, list);
    audit("create", "pet", "Added pet " + (created.name || "") + " for " + (owner(key).name || key) + ".");
    return created;
  }
  function updatePet(key, id, patch) {
    const list = petsOf(key), i = list.findIndex((p) => p.id === id);
    if (i < 0) return null;
    list[i] = { ...list[i], ...patch, id }; write(PETS + key, list);
    audit("update", "pet", "Updated pet " + (list[i].name || "") + " of " + (owner(key).name || key) + ".");
    return list[i];
  }

  /* ----- helpers ----- */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /* A date from the backend can be "2024-09-29" or a timestamp like "2024-09-28T16:00:00.000Z" (= Sep 29 in Manila).
     Read the calendar day in local time, so the birthday / registered date is never shifted by a day. */
  function dayOf(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(s);
    return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function fmtLong(iso) {
    const d = dayOf(iso);
    return d ? d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "-";
  }
  function fmtShort(iso) {
    const d = dayOf(iso);
    return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-";
  }
  function ageText(dob) {
    const b = dayOf(dob), n = new Date();
    if (!b || b > n) return "";
    let m = (n.getFullYear() - b.getFullYear()) * 12 + n.getMonth() - b.getMonth();
    if (n.getDate() < b.getDate()) m--;
    if (m < 1) return "Under 1 month";
    if (m < 12) return m + (m === 1 ? " mo" : " mos");
    const y = Math.floor(m / 12);
    return y + (y === 1 ? " yr" : " yrs");
  }
  /* Philippine mobile: 09XXXXXXXXX or +639XXXXXXXXX */
  const validPhone = (s) => /^(09\d{9}|\+639\d{9})$/.test(String(s).replace(/[\s-]/g, ""));
  const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

  const setFlash = (msg) => { try { sessionStorage.setItem("pawpaw_flash", msg); } catch (_) { /* ignore */ } };
  function takeFlash() {
    try { const m = sessionStorage.getItem("pawpaw_flash"); if (m) sessionStorage.removeItem("pawpaw_flash"); return m || ""; }
    catch (_) { return ""; }
  }

  return { audit, list, owner, exists, saveProfile, createWalkin, petsOf, getPet, addPet, updatePet,
           esc, fmtLong, fmtShort, ageText, validPhone, validEmail, setFlash, takeFlash };
})();