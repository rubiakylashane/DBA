/* js/owner/my-pets.js
   Renders the pet cards and, on the same page, the pet details (#view=<id>) and the "pet added / saved" message. */
(() => {
  const { esc, load, get, ageText, fmtDate, takeFlash } = window.PawPets;
  const $ = (id) => document.getElementById(id);

  const grid = $("pets-grid");
  const toast = $("toast");

  const photoStyle = (p) => (p.photo ? ` style="background-image:url('${esc(p.photo)}')"` : "");

  function card(p) {
    const age = ageText(p.dob);
    return `
      <article class="pet-card">
        <div class="pet-card-top">
          <span class="pet-photo"${photoStyle(p)} aria-hidden="true"></span>
          <div class="pet-id">
            <h2>${esc(p.name)}</h2>
            <p>${esc(p.species)}${age ? " - " + esc(age) : ""}</p>
          </div>
        </div>
        <dl class="pet-facts">
          <div><dt>Breed</dt><dd>${esc(p.breed)}</dd></div>
          <div><dt>Gender</dt><dd>${esc(p.sex)}</dd></div>
          <div><dt>Date of Birth</dt><dd>${esc(fmtDate(p.dob))}</dd></div>
        </dl>
        <div class="pet-actions">
          <a class="pbtn pbtn-outline" href="#view=${encodeURIComponent(p.id)}">View Details</a>
          <a class="pbtn pbtn-primary" href="edit-pet.html?id=${encodeURIComponent(p.id)}">Edit</a>
        </div>
      </article>`;
  }

  function render() {
    const pets = load();
    grid.innerHTML = pets.length
      ? pets.map(card).join("")
      : `<div class="pets-empty">
           <h2>No pets yet</h2>
           <p>Add your first pet so we can prepare for your visit.</p>
           <a class="pbtn pbtn-primary" href="add-pet.html">Add Pet</a>
         </div>`;
  }

  /* ----- Pet details, shown on this same page (link: my-pets.html#view=<id>) ----- */
  const head = { title: $("page-title"), sub: $("page-sub"), add: $("btn-add"), back: $("btn-back") };

  function showList() {
    grid.hidden = false;
    $("pd-card").hidden = true;
    $("pd-missing").hidden = true;
    head.add.hidden = false;
    head.back.hidden = true;
    document.title = "My Pets | Pawpaw Clinic";
  }

  function showDetails(id) {
    const p = get(id);
    grid.hidden = true;
    head.add.hidden = true;
    head.back.hidden = false;
    if (!p) { $("pd-card").hidden = true; $("pd-missing").hidden = false; return; }
    $("pd-missing").hidden = true;
    $("pd-photo").style.backgroundImage = p.photo ? `url('${p.photo}')` : "";
    $("pd-name").textContent = p.name;
    $("pd-species").textContent = p.species || "-";
    $("pd-breed").textContent = p.breed || "-";
    $("pd-age").textContent = ageText(p.dob) || "-";
    $("pd-sex").textContent = p.sex || "-";
    $("pd-dob").textContent = fmtDate(p.dob) || "-";
    $("pd-allergies").textContent = p.allergies || "None noted";
    $("pd-notes").textContent = p.notes || "None";
    $("pd-edit").href = "edit-pet.html?id=" + encodeURIComponent(p.id);
    $("pd-card").hidden = false;
    document.title = p.name + " | Pawpaw Clinic";
    window.scrollTo(0, 0);
  }

  function route() {
    const m = /^#view=(.+)$/.exec(location.hash);
    if (m) showDetails(decodeURIComponent(m[1])); else showList();
  }
  head.back.addEventListener("click", (e) => {
    e.preventDefault();
    history.pushState("", document.title, location.pathname + location.search); // clears #view=...
    route();
  });
  window.addEventListener("hashchange", route);

  /* ----- Message from add / edit ----- */
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2800);
  }

  Promise.resolve(window.PawPets.refresh()).then(() => {
    render();
    route();
    const flash = takeFlash();
    if (flash) showToast(flash);
  }).catch((error) => {
    grid.innerHTML = `<div class="pets-empty" role="alert">Could not load your pets. ${esc(error.message)}</div>`;
  });
})();