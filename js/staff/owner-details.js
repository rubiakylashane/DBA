/* js/staff/owner-details.js - owner profile + pet cards (owner-details.html?id=<owner>) */
(() => {
  const O = window.PawOwners, S = window.PawStaff, $ = (id) => document.getElementById(id);
  const put = (id, text) => { const el = $(id); if (el) el.textContent = text; };   /* a missing element never stops the rest of the page */
  const id = S.ownerId();

  function render() {
  if (!id || !O.exists(id)) { $("detail").hidden = true; $("missing").hidden = false; return; }
  const o = O.owner(id);

  put("o-name", o.formal);
  put("o-since", o.registered ? O.fmtLong(o.registered) : "-");
  put("o-email", o.email || "-");
  put("o-address", o.address || "-");
  put("o-phone", o.phone || "-");
  if (o.photo) {
    const p = $("o-photo");
    p.style.backgroundImage = `url('${o.photo}')`;
  }
  const q = "?id=" + encodeURIComponent(id);
  $("o-edit").href = "owner-edit.html" + q;
  $("add-pet").href = "owner-pet-form.html?owner=" + encodeURIComponent(id);
  document.title = o.short + " | Pawpaw Clinic Staff";

  const pets = O.petsOf(id);
  $("pets-grid").innerHTML = pets.length ? pets.map((p) => {
    const age = O.ageText(p.dob);
    const photo = p.photo ? ` style="background-image:url('${O.esc(p.photo)}')"` : "";
    return `
      <a class="spet" href="owner-pet-form.html?owner=${encodeURIComponent(id)}&id=${encodeURIComponent(p.id)}" aria-label="View and edit ${O.esc(p.name)}">
        <div class="spet-top">
          <span class="spet-photo"${photo} aria-hidden="true"></span>
          <div><h3>${O.esc(p.name)}</h3><p>${O.esc(p.species || "-")}${age ? " - " + O.esc(age) : ""}</p></div>
        </div>
        <dl class="spet-facts">
          <div><dt>Breed</dt><dd>${O.esc(p.breed || "-")}</dd></div>
          <div><dt>Gender</dt><dd>${O.esc(p.sex || "-")}</dd></div>
          <div><dt>Date of Birth</dt><dd>${O.esc(O.fmtShort(p.dob))}</dd></div>
        </dl>
      </a>`;
  }).join("") : `<p class="spets-empty">No pets yet. Click "Add Pet" to register one.</p>`;
  }

  if (window.PawApi.isBackendSession()) {
    window.PawApi.loadOwners().then(render).catch((error) => {
      $("detail").hidden = true;
      $("missing").hidden = false;
      S.toast(error.message || "Owner data could not be loaded.");
    });
  } else {
    render();
  }
})();