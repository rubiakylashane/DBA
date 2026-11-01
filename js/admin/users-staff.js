/* js/admin/users-staff.js - Users and Staff list (filter by role, edit details, edit role, reset password, activate / deactivate).
   Data and rules live in admin-store.js. */
(() => {
  const A = window.PawAdmin, S = window.PawStaff, $ = (id) => document.getElementById(id);
  const toast = (m) => { try { if (S && S.toast) S.toast(m); } catch (_) { /* ignore */ } };
  const fail = (msg) => { const box = $("u-rows"); if (box) box.innerHTML = `<p class="u-empty">Could not load the users: ${String(msg).replace(/[<>&]/g, "")}. Open the browser console (F12) for details.</p>`; };
  if (!A) { fail("js/admin/admin-store.js did not load"); return; }
  /* skip broken saved entries (a null or a record without a username) so one bad record cannot stop the whole page */
  const load = () => { try { return A.list().filter((u) => u && typeof u.username === "string"); } catch (e) { console.error(e); loadFailed = e.message; return []; } };
  const backend = window.PawApi.isBackendSession();
  let all = backend ? [] : load(), filter = "all", current = null, loadFailed = "", loading = backend;

  /* the signed-in account, taken from the saved login (userId / username), not the display name */
  const mine = (() => {
    for (const st of [sessionStorage, localStorage]) {
      try { const u = JSON.parse(st.getItem("pawpaw_user") || "null"); if (u) return { id: String(u.userId || u.id || ""), username: String(u.username || "").toLowerCase() }; } catch (_) { /* ignore */ }
    }
    return { id: "", username: "" };
  })();
  const isMe = (u) => Boolean(u) && ((mine.id && String(u.id) === mine.id) || (mine.username && String(u.username || "").toLowerCase() === mine.username));

  const btn = (act, cls, label, id) => `<button type="button" class="u-act ${cls}" data-act="${act}" data-id="${A.esc(id)}">${label}</button>`;
  /* Every account can be managed consistently, including reversible role changes. */
  function actions(u) {
    const edit = btn("edit", "", "Edit details", u.id);
    const role = btn("role", "", "Edit role", u.id);
    const reset = btn("reset", "", "Reset password", u.id);
    const toggle = u.status === "active"
      ? (isMe(u) ? `<button type="button" class="u-act u-act-red" disabled title="You cannot deactivate your own account." style="opacity:.45;cursor:not-allowed">Deactivate</button>` : btn("deactivate", "u-act-red", "Deactivate", u.id))
      : btn("activate", "u-act-green", "Activate", u.id);
    return edit + role + reset + toggle;
  }
  const row = (u) => `
    <div class="u-row" role="row">
      <span role="cell" class="u-name" data-label="Username">${A.esc(u.username)}</span>
      <span role="cell" class="u-email" data-label="Email">${A.esc(u.email || "-")}</span>
      <span role="cell" data-label="Role">${A.esc(A.ROLES[u.role])}</span>
      <span role="cell" data-label="Status"><span class="u-pill ${u.status === "active" ? "u-on" : "u-off"}">${u.status === "active" ? "Active" : "Inactive"}</span></span>
      <span role="cell" data-label="Created">${A.esc(A.fmtDate(u.createdAt))}</span>
      <span role="cell" class="u-actions-cell">${actions(u)}</span>
    </div>`;

  function render() {
    const rows = all.filter((u) => filter === "all" || u.role === filter);
    if (loadFailed) { fail(loadFailed); return; }
    if (loading) { $("u-rows").innerHTML = `<p class="u-empty">Loading users…</p>`; return; }
    try { $("u-rows").innerHTML = rows.length ? rows.map(row).join("") : `<p class="u-empty">No users here yet.</p>`; } catch (e) { console.error(e); fail(e.message); }
    document.querySelectorAll(".u-tab").forEach((t) => { const on = t.dataset.role === filter; t.classList.toggle("on", on); t.setAttribute("aria-selected", String(on)); });
  }

  async function refreshFromBackend() {
    if (!backend) return;
    loading = true;
    render();
    const data = await window.PawApi.request("/api/admin/users");
    all = data.map((u) => ({
      ...u,
      id: String(u.id),
      role: String(u.role || "").toLowerCase(),
      status: String(u.status || "active").toLowerCase()
    }));
    loading = false;
    loadFailed = "";
    render();
  }

  document.querySelector(".u-tabs").addEventListener("click", (e) => { const t = e.target.closest("[data-role]"); if (t) { filter = t.dataset.role; render(); } });

  const roleDlg = $("role-dialog"), pwDlg = $("pw-dialog"), stDlg = $("st-dialog"), edDlg = $("ed-dialog");
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    current = all.find((u) => u.id === b.dataset.id); if (!current) return;
    if (b.dataset.act === "edit") {
      $("ed-sub").textContent = current.username + " (" + A.ROLES[current.role] + ")";
      $("ed-name").value = current.name || ""; $("ed-phone").value = current.phone || ""; $("ed-email").value = current.email || "";
      ["name", "phone", "email"].forEach((k) => edErr(k, "")); $("ed-note").hidden = current.role !== "vet";
      edDlg.showModal(); $("ed-name").focus();
    }
    else if (b.dataset.act === "role") { $("role-sub").textContent = current.username + " (" + A.ROLES[current.role] + ")"; $("role-select").value = current.role; $("role-err").hidden = true; roleDlg.showModal(); }
    else if (b.dataset.act === "reset") { $("pw-sub").textContent = current.username + " · " + (current.email || ""); $("pw-new").value = ""; $("pw-err").hidden = true; pwDlg.showModal(); $("pw-new").focus(); }
    else if (b.dataset.act === "deactivate" && isMe(current)) { toast("You cannot deactivate your own account."); }
    else if (b.dataset.act === "deactivate" && current.role === "admin" && all.filter((u) => u.role === "admin" && u.status === "active").length < 2) {
      toast("This is the only active admin, so it cannot be deactivated.");
    }
    else { const on = b.dataset.act === "deactivate"; $("st-title").textContent = on ? "Deactivate account" : "Activate account"; $("st-sub").textContent = on ? current.username + " will not be able to sign in until you activate the account again." : current.username + " will be able to sign in again."; $("st-ok").textContent = on ? "Deactivate" : "Activate"; $("st-ok").className = "btn " + (on ? "btn-danger" : "btn-primary"); $("st-ok").dataset.to = on ? "inactive" : "active"; stDlg.showModal(); }
  });

  const edErr = (k, m) => { const e = $("ed-err-" + k); e.textContent = m || ""; e.hidden = !m; $("ed-" + k).setAttribute("aria-invalid", m ? "true" : "false"); };
  ["name", "phone", "email"].forEach((k) => $("ed-" + k).addEventListener("input", () => edErr(k, "")));
  $("ed-cancel").addEventListener("click", () => edDlg.close());
  $("ed-save").addEventListener("click", async () => {
    const v = { name: $("ed-name").value.trim().replace(/\s+/g, " "), phone: $("ed-phone").value.replace(/[\s-]/g, ""), email: $("ed-email").value.trim() }, e = {};
    if (!v.name) e.name = "Enter the full name."; else if (!A.validName(v.name)) e.name = "Use letters only.";
    if (!v.phone) e.phone = "Enter the phone number."; else if (!A.validPhone(v.phone)) e.phone = "Use a mobile number like 09XXXXXXXXX.";
    if (!v.email) e.email = "Enter the email address."; else if (!A.validEmail(v.email)) e.email = "Enter a valid email address."; else if (A.emailTaken(v.email, current.id)) e.email = "This email is already used by another account.";
    ["name", "phone", "email"].forEach((k) => edErr(k, e[k]));
    const bad = ["name", "phone", "email"].find((k) => e[k]); if (bad) { $("ed-" + bad).focus(); return; }
    if (backend) {
      try {
        await window.PawApi.request("/api/admin/users/" + encodeURIComponent(current.id), { method: "PATCH", body: v });
        await refreshFromBackend();
      } catch (error) { toast(error.message); return; }
    } else {
      A.updateUser(current, v);
      render();
    }
    edDlg.close();
    toast("Details updated for " + current.username + ".");
  });
  $("role-cancel").addEventListener("click", () => roleDlg.close());
  $("role-save").addEventListener("click", async () => {
    const r = $("role-select").value;
    /* keep at least one active admin, otherwise nobody could manage the system */
    if (current.role === "admin" && r !== "admin" && all.filter((u) => u.role === "admin" && u.status === "active").length < 2) { $("role-err").textContent = "This is the only active admin. Add or promote another admin first."; $("role-err").hidden = false; return; }
    if (r !== current.role && backend) {
      try {
        await window.PawApi.request("/api/admin/users/" + encodeURIComponent(current.id), { method: "PATCH", body: { role: r } });
        await refreshFromBackend();
      } catch (error) { $("role-err").textContent = error.message; $("role-err").hidden = false; return; }
    } else if (r !== current.role) {
      A.setRole(current, r);
      render();
    }
    roleDlg.close();
    if (r !== current.role) toast("Role changed to " + A.ROLES[r] + ".");
  });
  $("pw-cancel").addEventListener("click", () => pwDlg.close());
  $("pw-save").addEventListener("click", async () => {
    const v = $("pw-new").value;
    if (v.length < 8) { $("pw-err").textContent = "Use at least 8 characters."; $("pw-err").hidden = false; return; }
    if (backend) {
      try {
        await window.PawApi.request("/api/admin/users/" + encodeURIComponent(current.id) + "/reset-password", {
          method: "POST",
          body: { temporaryPassword: v }
        });
      } catch (error) { $("pw-err").textContent = error.message; $("pw-err").hidden = false; return; }
    }
    pwDlg.close(); A.resetPassword(current); toast("Password reset. " + current.username + " must change it at the next login.");
  });
  $("st-cancel").addEventListener("click", () => stDlg.close());
  $("st-ok").addEventListener("click", async () => {
    const to = $("st-ok").dataset.to;
    if (backend) {
      try {
        await window.PawApi.request("/api/admin/users/" + encodeURIComponent(current.id), { method: "PATCH", body: { status: to } });
        await refreshFromBackend();
      } catch (error) { toast(error.message); return; }
    } else {
      A.setStatus(current, to);
      render();
    }
    stDlg.close();
    toast(current.username + (to === "active" ? " activated." : " deactivated."));
  });

  render();
  if (backend) refreshFromBackend().catch((error) => {
    loading = false;
    loadFailed = error.message;
    render();
  });
  toast(A.takeFlash());
})();