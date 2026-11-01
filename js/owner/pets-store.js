/* js/owner/pets-store.js - shared pet helpers backed by the clinic API when signed in. */
window.PawPets = (() => {
  const BASE = "pawpaw_pets";
  let memory = []; // fallback when localStorage is blocked

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

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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

  /* A date can come as "2024-09-29" or as a timestamp like "2024-09-28T16:00:00.000Z" (= Sep 29 in Manila).
     dayOf() reads the calendar day in local time; dayIso() gives it back as "YYYY-MM-DD". */
  function dayOf(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(s);
    return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function dayIso(raw) {
    const d = dayOf(raw);
    if (!d) return "";
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function fromApi(pet) {
    return {
      ...pet,
      id: String(pet.id),
      dob: dayIso(pet.dateOfBirth || pet.date_of_birth || pet.dob),
      sex: pet.gender || pet.sex || ""
    };
  }

  async function refresh(ownerRows) {
    if (!window.PawApi || !window.PawApi.isBackendSession()) return load();
    const owners = ownerRows || await window.PawApi.loadOwners();
    const owner = owners[0];
    const localPets = load();
    if (owner && localPets.length) {
      const signature = (pet) => [pet.name, pet.species, pet.breed, dayIso(pet.dob || pet.dateOfBirth || pet.date_of_birth)]
        .map((value) => String(value || "").trim().toLowerCase()).join("|");
      const existing = new Set((owner.pets || []).map(signature));
      for (const pet of localPets) {
        if (/^\d+$/.test(String(pet.id)) || existing.has(signature(pet))) continue;
        const saved = await window.PawApi.request(`/api/owners/${encodeURIComponent(owner.id)}/pets`, {
          method: "POST",
          body: {
            name: pet.name,
            species: pet.species,
            breed: pet.breed || null,
            dateOfBirth: pet.dob || pet.date_of_birth || null,
            gender: pet.sex || pet.gender || null,
            allergies: pet.allergies || null,
            notes: pet.notes || null,
            photo: pet.photo || null
          }
        });
        owner.pets.push(saved);
        existing.add(signature(saved));
      }
    }
    const pets = (owner?.pets || []).map(fromApi);
    save(pets);
    return pets;
  }

  const get = (id) => load().find((p) => p.id === id) || null;

  function add(pet) {
    const list = load();
    const created = { ...pet, id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) };
    list.push(created);
    save(list);
    return created;
  }
  function update(id, patch) {
    const list = load();
    const i = list.findIndex((p) => p.id === id);
    if (i === -1) return null;
    list[i] = { ...list[i], ...patch, id };
    save(list);
    return list[i];
  }
  function cacheApiPet(pet) {
    const saved = fromApi(pet);
    const pets = load();
    const index = pets.findIndex((item) => item.id === saved.id);
    if (index < 0) pets.push(saved);
    else pets[index] = saved;
    save(pets);
    return saved;
  }

  /* dob is "YYYY-MM-DD" (a timestamp from the server also works) */
  function ageText(dob) {
    const b = dayOf(dob);
    if (!b) return "";
    const now = new Date();
    let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
    if (now.getDate() < b.getDate()) months -= 1;
    if (months < 0) return "";
    if (months >= 12) {
      const y = Math.floor(months / 12);
      return y + (y === 1 ? " yr" : " yrs");
    }
    return months >= 1 ? months + " mo" : "Under 1 mo";
  }
  function fmtDate(dob) {
    const d = dayOf(dob);
    return !d ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  /* one-time message shown on the next page (e.g. "Pet added.") */
  function setFlash(msg) { try { sessionStorage.setItem("pawpaw_flash", msg); } catch (_) { /* ignore */ } }
  function takeFlash() {
    try {
      const m = sessionStorage.getItem("pawpaw_flash");
      sessionStorage.removeItem("pawpaw_flash");
      return m;
    } catch (_) { return null; }
  }

  return { esc, load, get, add, update, refresh, cacheApiPet, fromApi, ageText, fmtDate, dayIso, setFlash, takeFlash };
})();