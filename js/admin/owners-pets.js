/* js/admin/owners-pets.js - admin Owners and Pets: every owner (search, edit, deactivate / activate) and the pets of the selected owner.
   Data comes from PawOwners (owners-store.js); changes are written to the audit log (admin-store.js).
   Nothing is deleted: an owner or a pet is deactivated (and can be activated again), so the clinic history stays. */
(() => {
  const O = window.PawOwners, A = window.PawAdmin, S = window.PawStaff, $ = (id) => document.getElementById(id);
  const esc = O.esc;
  const backend = window.PawApi.isBackendSession();
  let owners = [], selected = new URLSearchParams(location.search).get("owner") || "", q = "", pending = null;
  let loading = backend, loadError = "";

  const phoneShow = (p) => { const d = String(p || "").replace(/\D/g, ""); return /^09\d{9}$/.test(d) ? d.slice(0, 4) + " " + d.slice(4, 7) + " " + d.slice(7) : (p || "-"); };
  const q2 = (s) => String(s || "").toLowerCase();

  function renderOwners() {
    if (backend && (loading || loadError)) {
      $("o-rows").innerHTML = `<p class="u-empty">${loading ? "Loading owners…" : "Could not load owners: " + esc(loadError)}</p>`;
      return;
    }
    if (!backend) owners = O.list();
    owners.sort((a, b) => String(a.registered || "").localeCompare(String(b.registered || "")));
    if (!owners.some((o) => o.id === selected)) selected = owners.length ? owners[0].id : "";
    const rows = owners.filter((o) => !q || [o.name, o.phone, o.email].some((x) => q2(x).includes(q)));
    $("o-rows").innerHTML = rows.length ? rows.map((o) => `
      <div class="o-row o-orow${o.id === selected ? " sel" : ""}" role="row" data-owner="${esc(o.id)}">
        <span role="cell"><span class="o-main">${esc(o.name)}${A.ownerStatus(o.id) === "inactive" ? ' <span class="o-tag">Inactive</span>' : ""}</span><span class="o-sub">${esc(o.email || "-")}</span><span class="o-sub">${esc(phoneShow(o.phone))}</span></span>
        <span role="cell" data-label="Pets">${o.petCount}</span>
        <span role="cell" data-label="Registered">${esc(O.fmtShort(o.registered))}</span>
        <span role="cell" class="o-acts"><a class="u-act" href="owner-edit.html?id=${encodeURIComponent(o.id)}">Edit</a>${backend && !o.userId ? '<span class="u-empty" title="This owner has no linked account; the database schema has no standalone owner status.">No account to deactivate</span>' : A.ownerStatus(o.id) === "inactive" ? `<button type="button" class="u-act u-act-green" data-act-owner="${esc(o.id)}">Activate</button>` : `<button type="button" class="u-act u-act-red" data-act-owner="${esc(o.id)}">Deactivate</button>`}</span>
      </div>`).join("") : `<p class="u-empty">${owners.length ? "No owners match your search." : "No owners yet."}</p>`;
  }

  function renderPets() {
    if (backend && (loading || loadError)) {
      $("p-rows").innerHTML = `<p class="u-empty">${loading ? "Loading pets…" : "Owner data could not be loaded."}</p>`;
      return;
    }
    const o = owners.find((x) => x.id === selected);
    $("pets-title").textContent = o ? "Pets of " + o.name : "Pets";
    const add = $("add-pet"); add.hidden = !o; if (o) add.href = "owner-pet-form.html?owner=" + encodeURIComponent(o.id);
    const pets = o ? O.petsOf(o.id) : [];
    $("p-rows").innerHTML = !o ? `<p class="u-empty">Select an owner to see their pets.</p>` : pets.length ? pets.map((p) => `
      <div class="o-row o-prow" role="row">
        <span role="cell" class="o-main" data-label="Name">${esc(p.name)}${p.status === "inactive" ? ' <span class="o-tag">Inactive</span>' : ""}</span>
        <span role="cell" data-label="Species">${esc(p.species || "-")}</span>
        <span role="cell" data-label="Breed">${esc(p.breed || "-")}</span>
        <span role="cell" data-label="Gender">${esc(p.sex || "-")}</span>
        <span role="cell" data-label="Born">${esc(O.fmtShort(p.dob))}</span>
        <span role="cell" class="o-acts"><a class="u-act" href="owner-pet-form.html?owner=${encodeURIComponent(o.id)}&id=${encodeURIComponent(p.id)}">Edit</a>${p.status === "inactive" ? `<button type="button" class="u-act u-act-green" data-act-pet="${esc(p.id)}">Activate</button>` : `<button type="button" class="u-act u-act-red" data-act-pet="${esc(p.id)}">Deactivate</button>`}</span>
      </div>`).join("") : `<p class="u-empty">${esc(o.name)} has no pets yet.</p>`;
  }
  const render = () => { renderOwners(); renderPets(); };

  $("o-search").addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); renderOwners(); });

  const dlg = $("del-dialog");
  function ask(title, text, okLabel, danger, run) {
    $("del-title").textContent = title; $("del-sub").textContent = text;
    $("del-ok").textContent = okLabel; $("del-ok").className = "btn " + (danger ? "btn-danger" : "btn-primary");
    pending = run; dlg.showModal();
  }
  document.addEventListener("click", (e) => {
    const bOwner = e.target.closest("[data-act-owner]"), bPet = e.target.closest("[data-act-pet]");
    if (bOwner) {
      const o = owners.find((x) => x.id === bOwner.dataset.actOwner); if (!o) return;
      const off = A.ownerStatus(o.id) !== "inactive";
      ask(off ? "Deactivate owner" : "Activate owner",
        off ? o.name + " will be marked inactive. Their pets, appointments and records stay in the clinic history. You can activate them again anytime." : o.name + " will be active again.",
        off ? "Deactivate" : "Activate", off,
        async () => {
          if (backend) {
            await window.PawApi.request("/api/owners/" + encodeURIComponent(o.id) + "/status", { method: "PATCH", body: { status: off ? "inactive" : "active" } });
            await window.PawApi.loadOwners();
          } else {
            A.setOwnerStatus(o.id, o.name, off ? "inactive" : "active");
          }
          render();
          S.toast(o.name + (off ? " deactivated." : " activated."));
        });
      return;
    }
    if (bPet) {
      const o = owners.find((x) => x.id === selected), p = o && O.petsOf(o.id).find((x) => x.id === bPet.dataset.actPet); if (!p) return;
      const off = p.status !== "inactive";
      ask(off ? "Deactivate pet" : "Activate pet",
        off ? p.name + " of " + o.name + " will be marked inactive. The history stays and you can activate the pet again anytime." : p.name + " will be active again.",
        off ? "Deactivate" : "Activate", off,
        async () => {
          if (backend) {
            await window.PawApi.request("/api/owners/" + encodeURIComponent(o.id) + "/pets/" + encodeURIComponent(p.id), { method: "PATCH", body: { status: off ? "inactive" : "active" } });
            await window.PawApi.loadOwners();
          } else {
            A.setPetStatus(o.id, p.id, p.name, o.name, off ? "inactive" : "active");
          }
          render();
          S.toast(p.name + (off ? " deactivated." : " activated."));
        });
      return;
    }
    const row = e.target.closest("[data-owner]");   // click a row (not its buttons) to see that owner's pets
    if (row && !e.target.closest("a, button")) { selected = row.dataset.owner; render(); }
  });
  $("del-cancel").addEventListener("click", () => dlg.close());
  $("del-ok").addEventListener("click", async () => {
    if (pending) {
      try { await pending(); }
      catch (error) { S.toast(error.message); return; }
    }
    dlg.close();
  });

  render();
  if (backend) window.PawApi.loadOwners().then((data) => {
    owners = data.map((owner) => ({ ...O.owner(String(owner.id)), userId: owner.user_id }));
    loading = false;
    loadError = "";
    render();
  }).catch((error) => {
    loading = false;
    loadError = error.message || "Request failed.";
    render();
    S.toast(loadError);
  });
})();