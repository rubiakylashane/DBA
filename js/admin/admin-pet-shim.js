/* js/admin/admin-pet-shim.js
   Lets the shared pet form (js/owner/pet-form.js) work for admin:
   it saves to the pets of the owner in the URL (owner-pet-form.html?owner=<owner>[&id=<pet>])
   and returns to that owner's page afterwards. Must be loaded BEFORE pet-form.js. */
(() => {
  const q = new URLSearchParams(location.search);
  const owner = q.get("owner") || "", petId = q.get("id") || "";
  const O = window.PawOwners;
  const back = "owners-pets.html?owner=" + encodeURIComponent(owner);

  document.body.dataset.mode = petId ? "edit" : "add";
  document.body.dataset.return = back;
  document.body.dataset.ownerId = owner;          // pet-form.js saves to THIS owner, not to the signed-in user
  document.body.dataset.speciesEditable = "1";   // admin may correct the species (owners cannot)
  document.getElementById("go-back").href = back;
  document.getElementById("cancel").href = back;

  if (!owner || !O.exists(owner)) { location.replace("owners-pets.html"); return; }

  /* The backend sends dateOfBirth / gender; the admin store uses dob / sex. */
  const toLocalPet = (p) => Object.assign({}, p, {
    dob: p.dob !== undefined ? p.dob : (p.dateOfBirth || ""),
    sex: p.sex !== undefined ? p.sex : (p.gender || "")
  });

  window.PawPets = {
    get: (id) => O.getPet(owner, id),
    add: (pet) => O.addPet(owner, pet),          // owners-store.js writes the audit line
    update: (id, patch) => O.updatePet(owner, id, patch),
    setFlash: (m) => O.setFlash(m),

    /* pet-form.js calls refresh() before loading a pet in Edit mode (backend sessions). */
    refresh: async () => {
      for (const name of ["refresh", "load", "reload"]) {
        if (typeof O[name] === "function") return O[name](owner);
      }
      if (O.ready && typeof O.ready.then === "function") return O.ready;
    },

    /* pet-form.js calls this after the backend saved the pet, to keep the local copy in step. */
    cacheApiPet: (pet) => {
      try {
        if (typeof O.cacheApiPet === "function") return O.cacheApiPet(owner, pet);
        if (pet && pet.id && O.getPet(owner, pet.id)) return O.updatePet(owner, pet.id, toLocalPet(pet));
      } catch (e) { /* the backend already saved it; the owner page reloads from the API */ }
      return pet;
    }
  };
})();