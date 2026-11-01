/* js/admin/veterinarians.js - Veterinarians page: list, edit, deactivate / activate (adding is done on register-vet.html).
   Veterinarians are never deleted: deactivating keeps their appointments, records and vaccinations, hides them from
   the "assign a vet" lists and turns off their login account. Activate brings them back. */
(() => {
  const A = window.PawAdmin, S = window.PawStaff, $ = (id) => document.getElementById(id);
  const backend = window.PawApi.isBackendSession();
  let list = backend ? [] : A.vets(), current = null;

  const off = (v) => v.status === "inactive";
  const row = (v) => `
    <div class="v-row${off(v) ? " is-off" : ""}" role="row">
      <span role="cell" class="v-name" data-label="Name">${A.esc(v.name)}${off(v) ? ` <em class="v-tag">Inactive</em>` : ""}</span>
      <span role="cell" data-label="Specialization">${A.esc(v.specialization)}</span>
      <span role="cell" data-label="License">${A.esc(v.license)}</span>
      <span role="cell" data-label="Phone">${A.esc(A.phoneShow(v.phone))}</span>
      <span role="cell" class="v-email" data-label="Email">${A.esc(v.email)}</span>
      <span role="cell" class="v-acts"><button type="button" class="u-act" data-act="edit" data-id="${A.esc(v.id)}">Edit</button>${off(v)
        ? `<button type="button" class="u-act u-act-green" data-act="status" data-id="${A.esc(v.id)}">Activate</button>`
        : `<button type="button" class="u-act u-act-red" data-act="status" data-id="${A.esc(v.id)}">Deactivate</button>`}</span>
    </div>`;
  function render() {
    if (!backend) list = A.vets();
    $("v-rows").innerHTML = list.length ? list.map(row).join("") : `<p class="u-empty">No veterinarians yet.</p>`;
  }
  async function refreshFromBackend() {
    if (!backend) return;
    const data = await window.PawApi.request("/api/admin/veterinarians");
    localStorage.setItem("pawpaw_vets", JSON.stringify(data.map((v) => ({
      ...v,
      id: String(v.id),
      userId: v.userId == null ? null : String(v.userId),
      license: v.license || v.license_number,
      status: String(v.status || "active").toLowerCase()
    }))));
    list = JSON.parse(localStorage.getItem("pawpaw_vets") || "[]");
    render();
  }

  /* Specialization is a dropdown (the list lives in admin-store.js); an older saved value that is not in the list is kept as an extra option */
  const fillSpec = (sel, extra) => { const list = A.SPECS.slice(); if (extra && list.indexOf(extra) < 0) list.push(extra); sel.innerHTML = `<option value="" selected disabled>Select specialization</option>` + list.map((x) => `<option>${A.esc(x)}</option>`).join(""); };
  fillSpec($("e-spec"));

  const err = (p, k, m) => { const e = $("err-" + p + k), i = $(p + k); e.textContent = m || ""; e.hidden = !m; i.setAttribute("aria-invalid", m ? "true" : "false"); };
  /* checks for the edit form; p = "e-" */
  function check(p, exceptId) {
    const v = { name: $(p + "name").value.trim().replace(/\s+/g, " "), specialization: $(p + "spec").value.trim().replace(/\s+/g, " "), license: A.normLicense($(p + "license").value), phone: $(p + "phone").value.replace(/[\s-]/g, ""), email: $(p + "email").value.trim() }, e = {};
    if (!v.name) e.name = "Enter the veterinarian's name.";
    else if (!A.validName(v.name)) e.name = "Use letters only.";
    if (!v.specialization) e.spec = "Choose a specialization.";
    if (!$(p + "license").value.trim()) e.license = "Enter the license number.";
    else if (!v.license) e.license = "Use the format PRC 0012345.";
    else if (list.some((item) => item.id !== exceptId && item.license === v.license)) e.license = "This license number is already registered.";
    if (!v.phone) e.phone = "Enter the phone number.";
    else if (!A.validPhone(v.phone)) e.phone = "Use a mobile number like 09XXXXXXXXX.";
    if (!v.email) e.email = "Enter the email address.";
    else if (!A.validEmail(v.email)) e.email = "Enter a valid email address.";
    else if (list.some((item) => item.id !== exceptId && String(item.email).toLowerCase() === v.email.toLowerCase())) e.email = "This email is already used by another veterinarian.";
    ["name", "spec", "license", "phone", "email"].forEach((k) => err(p, k, e[k]));
    const first = ["name", "spec", "license", "phone", "email"].find((k) => e[k]);
    if (first) $(p + first).focus();
    return first ? null : v;
  }
  ["e-"].forEach((p) => ["name", "spec", "license", "phone", "email"].forEach((k) => ["input", "change"].forEach((ev) => $(p + k).addEventListener(ev, () => err(p, k, "")))));

  const editDlg = $("edit-dialog"), stDlg = $("st-dialog");
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    current = list.find((v) => v.id === b.dataset.id); if (!current) return;
    if (b.dataset.act === "edit") {
      $("e-name").value = current.name; fillSpec($("e-spec"), current.specialization); $("e-spec").value = current.specialization; $("e-license").value = current.license; $("e-phone").value = A.phoneShow(current.phone); $("e-email").value = current.email;
      ["name", "spec", "license", "phone", "email"].forEach((k) => err("e-", k, "")); editDlg.showModal();
    } else {
      const to = off(current) ? "active" : "inactive";
      $("st-ok").dataset.to = to;
      $("st-title").textContent = to === "inactive" ? "Deactivate veterinarian" : "Activate veterinarian";
      $("st-sub").textContent = to === "inactive"
        ? "Deactivate " + current.name + "? They will not appear when assigning appointments and cannot log in. Their appointments, records and vaccinations are kept."
        : "Activate " + current.name + "? They will appear in the assign lists again and can log in.";
      $("st-ok").textContent = to === "inactive" ? "Deactivate" : "Activate";
      $("st-ok").className = "btn " + (to === "inactive" ? "btn-danger" : "btn-primary");
      stDlg.showModal();
    }
  });
  $("edit-cancel").addEventListener("click", () => editDlg.close());
  $("edit-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const v = check("e-", current.id);
    if (!v) return;
    if (backend) {
      try {
        await window.PawApi.request("/api/admin/veterinarians/" + encodeURIComponent(current.id), { method: "PATCH", body: v });
        A.updateVet(current, v);
        await refreshFromBackend();
      } catch (error) { S.toast(error.message); return; }
    } else A.updateVet(current, v);
    editDlg.close();
    render();
    S.toast("Changes saved.");
  });
  $("st-cancel").addEventListener("click", () => stDlg.close());
  $("st-ok").addEventListener("click", async () => {
    const to = $("st-ok").dataset.to;
    if (backend) {
      try {
        await window.PawApi.request("/api/admin/veterinarians/" + encodeURIComponent(current.id) + "/status", { method: "PATCH", body: { status: to } });
        A.setVetStatus(current, to);
        await refreshFromBackend();
      } catch (error) { S.toast(error.message); return; }
    } else A.setVetStatus(current, to);
    stDlg.close();
    render();
    S.toast(current.name + (to === "active" ? " activated." : " deactivated."));
  });

  render();
  if (backend) refreshFromBackend().catch((error) => S.toast(error.message));
  S.toast(A.takeFlash());
})();