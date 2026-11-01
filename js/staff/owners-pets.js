/* js/staff/owners-pets.js - Owner and Pets list (search + sort) */
(() => {
  const O = window.PawOwners, $ = (id) => document.getElementById(id);
  const rowsEl = $("owner-rows");
  const backend = window.PawApi.isBackendSession();
  const signedInUser = (() => { try { return JSON.parse(sessionStorage.getItem("pawpaw_user") || localStorage.getItem("pawpaw_user") || "{}"); } catch (_) { return {}; } })();
  if (backend && String(signedInUser.role || "").toLowerCase() === "owner") {
    location.replace("my-pets.html");
    return;
  }
  let owners = backend ? [] : O.list(), loading = backend, loadError = "";

  const sorters = {
    "name-asc": (a, b) => a.name.localeCompare(b.name),
    "name-desc": (a, b) => b.name.localeCompare(a.name),
    newest: (a, b) => (b.registered || "").localeCompare(a.registered || ""),
    oldest: (a, b) => (a.registered || "9999").localeCompare(b.registered || "9999"),
    pets: (a, b) => b.petCount - a.petCount || a.name.localeCompare(b.name)
  };

  function row(o) {
    return `
      <div class="orow" role="row">
        <span role="cell"><span class="o-name">${O.esc(o.short)}</span><span class="o-email">${O.esc(o.email || "-")}</span></span>
        <span role="cell" class="o-phone">${O.esc(o.phone || "-")}</span>
        <span role="cell" class="c-center">${o.petCount}</span>
        <span role="cell" class="c-center">${O.esc(O.fmtLong(o.registered))}</span>
        <span role="cell" class="c-center"><a class="obtn obtn-outline obtn-sm" href="owner-details.html?id=${encodeURIComponent(o.id)}">View and Edit</a></span>
      </div>`;
  }

  function render() {
    if (loading || loadError) {
      rowsEl.innerHTML = `<p class="o-empty">${loading ? "Loading owners…" : "Could not load owners: " + O.esc(loadError)}</p>`;
      return;
    }
    const q = $("search").value.trim().toLowerCase();
    const list = owners
      .filter((o) => !q || [o.name, o.email, o.phone].join(" ").toLowerCase().includes(q))
      .sort(sorters[$("sort").value] || sorters["name-asc"]);
    rowsEl.innerHTML = list.length
      ? list.map(row).join("")
      : `<p class="o-empty">${owners.length ? "No owners match your search." : "No owners yet."}</p>`;
  }

  async function refreshFromBackend() {
    if (!backend) return;
    loading = true;
    loadError = "";
    render();
    const data = await window.PawApi.loadOwners();
    owners = data.map((owner) => ({ ...O.owner(String(owner.id)), userId: owner.user_id }));
    loading = false;
    render();
  }

  $("search").addEventListener("input", render);
  $("sort").addEventListener("change", render);
  render();
  if (backend) refreshFromBackend().catch((error) => {
    loading = false;
    loadError = error.message || "Request failed.";
    render();
  });
})();