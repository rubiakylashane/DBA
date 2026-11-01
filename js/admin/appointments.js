/* js/admin/appointments.js - admin Appointments: every appointment in the clinic.
   Filter by status / veterinarian / date, edit (vet, date, time), cancel, and override a status with a reason.
   Data comes from PawStaffAppts (the owners' appointment lists); every change is written to the audit log.
   Backend: GET /api/admin/appointments?status=&vet=&from=&to=&page=  PATCH /api/admin/appointments/:id { vet, date, time }
            POST /api/admin/appointments/:id/override { status, reason }   POST /api/admin/appointments/:id/cancel { reason } */
(() => {
  const P = window.PawStaffAppts, O = window.PawOwners, A = window.PawAdmin, S = window.PawStaff, $ = (id) => document.getElementById(id);
  const esc = A.esc, TBA = P.TBA, PAGE = 10;
  const LABEL = { pending: "Pending", confirmed: "Approved", checked_in: "Checked-in", with_vet: "In Progress", completed: "Completed", cancelled: "Cancelled", no_show: "No-show" };
  const OPEN = ["pending", "confirmed", "checked_in", "with_vet"];        // can still be edited / cancelled
  const pad = (n) => String(n).padStart(2, "0");
  const todayIso = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const fmtTime = (t) => { const [h, m] = String(t || "00:00").split(":").map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); };
  const peso = (n) => "₱" + Number(n || 0).toLocaleString("en-US");

  let all = [], tab = "all", page = 0, cur = null;
  const ownerName = (a) => { try { return O.owner(a.owner).name; } catch (_) { return a.owner; } };
  const label = (a) => fmtDate(a.date).replace(/, \d{4}$/, "") + " · " + (a.petName || "Pet") + " · " + ownerName(a);

  function load() { all = P.load(); }
  function filtered() {
    const vet = $("f-vet").value, from = $("f-from").value, to = $("f-to").value;
    return all.filter((a) => (tab === "all" || a.status === tab) && (!vet || (vet === "__tba" ? (!a.vet || a.vet === TBA) : a.vet === vet)) && (!from || a.date >= from) && (!to || a.date <= to))
      .sort((a, b) => {   // open ones first by date, then the finished ones, newest first
        const ao = OPEN.indexOf(a.status) >= 0, bo = OPEN.indexOf(b.status) >= 0;
        if (ao !== bo) return ao ? -1 : 1;
        const k = (a.date + a.time).localeCompare(b.date + b.time);
        return ao ? k : -k;
      });
  }
  function render() {
    const list = filtered(), pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (page >= pages) page = pages - 1;
    const shown = list.slice(page * PAGE, page * PAGE + PAGE);
    $("ap-rows").innerHTML = shown.length ? shown.map((a) => {
      const open = OPEN.indexOf(a.status) >= 0, tba = !a.vet || a.vet === TBA;
      return `<div class="ap-row" role="row">
        <span role="cell" class="ap-when"><b>${esc(fmtDate(a.date))}</b><i>${esc(fmtTime(a.time))}</i></span>
        <span role="cell" data-label="Pet">${esc(a.petName || "Pet")} · ${esc(ownerName(a))}</span>
        <span role="cell" data-label="Vet" class="${tba ? "ap-tba" : ""}">${tba ? "Unassigned" : esc(a.vet)}</span>
        <span role="cell" data-label="Services">${esc((a.services || []).map((s) => s.name).join(", ") || "-")}</span>
        <span role="cell" class="ap-total" data-label="Total">${peso(a.total)}</span>
        <span role="cell"><span class="ap-pill ap-${esc(a.status)}">${esc(LABEL[a.status] || a.status)}</span></span>
        <span role="cell" class="ap-acts"><button type="button" class="u-act" data-act="edit" data-k="${esc(a._key)}|${esc(a.id)}">Edit</button>${open ? `<button type="button" class="u-act u-act-red" data-act="cancel" data-k="${esc(a._key)}|${esc(a.id)}">Cancel</button>` : ""}</span>
      </div>`;
    }).join("") : `<p class="u-empty">No appointments match.</p>`;
    $("ap-count").textContent = list.length ? "Showing " + (page * PAGE + 1) + "-" + (page * PAGE + shown.length) + " of " + list.length : "Showing 0 of 0";
    $("ap-prev").disabled = page === 0; $("ap-next").disabled = page >= pages - 1;
    document.querySelectorAll(".ap-tab").forEach((t) => { const on = t.dataset.s === tab; t.classList.toggle("on", on); t.setAttribute("aria-selected", String(on)); });
  }

  /* filters */
  function renderVetFilter() {
    $("f-vet").innerHTML = `<option value="">All veterinarians</option><option value="__tba">Unassigned</option>` + P.VETS.map((v) => `<option>${esc(v)}</option>`).join("");
  }
  renderVetFilter();
  ["f-vet", "f-from", "f-to"].forEach((id) => $(id).addEventListener("change", () => { page = 0; render(); }));
  document.querySelector(".ap-tabs").addEventListener("click", (e) => { const t = e.target.closest("[data-s]"); if (t) { tab = t.dataset.s; page = 0; render(); } });
  $("ap-prev").addEventListener("click", () => { page--; render(); });
  $("ap-next").addEventListener("click", () => { page++; render(); });

  const backend = Boolean(P.backend);
  /* the list is re-read from the server after every save, so the page always shows what is really stored */
  async function reload() {
    if (!backend) { all = P.load(); return; }
    const data = await window.PawApi.request("/api/admin/appointments");
    all = data.map((a) => ({ ...a, id: String(a.id), owner: String(a.owner), _key: "pawpaw_appointments:" + String(a.owner), pet: a.petName }));
  }
  const find = (k) => { const [key, id] = k.split("|"); return all.find((a) => a._key === key && String(a.id) === id); };
  const done = async (msg) => {
    try { await reload(); } catch (error) { S.toast(error.message); return; }
    render(); S.toast(msg);
  };
  /* owner bell + audit line are written by the server when there is a backend; only the demo needs them here */
  const tell = (a, type, title, text) => { if (!backend) P.notify(a.owner, type, title, text); };
  const log = (text) => { if (!backend) A.log(text, "update", "appointment"); };

  /* ----- edit (vet, date, time) ----- */
  const eDlg = $("edit-dialog");
  const slots = (keep) => { const out = []; for (let m = 9 * 60; m < 17 * 60; m += 30) out.push(pad(Math.floor(m / 60)) + ":" + pad(m % 60)); if (keep && out.indexOf(keep) < 0) out.push(keep); return out.sort(); };
  function hint() {
    const c = P.conflict(all, $("e-vet").value, $("e-date").value, $("e-time").value, cur && cur.id);
    $("e-hint").textContent = c ? "Warning: " + c.vet + " already has " + (c.petName || "a patient") + " at this time." : "";
    $("e-hint").className = "dlg-hint" + (c ? " bad" : "");
  }
  function openEdit(a) {
    cur = a;
    $("edit-sub").textContent = label(a) + " · " + (LABEL[a.status] || a.status);
    const open = OPEN.indexOf(a.status) >= 0;
    $("e-vet").innerHTML = `<option value="${TBA}">Unassigned</option>` + P.VETS.concat(a.vet && a.vet !== TBA && P.VETS.indexOf(a.vet) < 0 ? [a.vet] : []).map((v) => `<option>${esc(v)}</option>`).join("");
    $("e-vet").value = a.vet || TBA;
    $("e-date").value = a.date; $("e-time").innerHTML = slots(a.time).map((t) => `<option value="${t}">${fmtTime(t)}</option>`).join(""); $("e-time").value = a.time;
    ["e-vet", "e-date", "e-time", "e-save"].forEach((id) => { $(id).disabled = !open; });   // finished appointments: only the status override
    hint(); eDlg.showModal();
  }
  ["e-vet", "e-date", "e-time"].forEach((id) => $(id).addEventListener("change", hint));
  $("e-cancel").addEventListener("click", () => eDlg.close());
  $("e-save").addEventListener("click", async () => {
    const patch = { vet: $("e-vet").value, date: $("e-date").value, time: $("e-time").value };
    const bad = (m) => { $("e-hint").textContent = m; $("e-hint").className = "dlg-hint bad"; };
    if (!patch.date) return bad("Choose a date.");
    if (patch.date < todayIso()) return bad("Choose today or a later date.");
    const was = { ...cur }, moved = patch.date !== was.date || patch.time !== was.time, vetChanged = patch.vet !== (was.vet || TBA);
    if (!moved && !vetChanged) { eDlg.close(); return; }
    const btn = $("e-save"); btn.disabled = true;
    try {
      await P.change(cur, patch, true);
    } catch (error) { bad(error.message || "Could not save the changes."); btn.disabled = false; return; }
    btn.disabled = false; eDlg.close();
    const bits = [];
    if (vetChanged) bits.push("reassigned to " + (patch.vet === TBA ? "no vet" : patch.vet));
    if (moved) { bits.push("moved to " + fmtDate(patch.date) + " " + fmtTime(patch.time)); tell(cur, "appointment", "Appointment rescheduled", (cur.petName || "") + ", " + patch.date + " " + patch.time + "."); }
    log("edited the appointment of " + esc(cur.petName) + " (" + esc(ownerName(cur)) + "): " + esc(bits.join(", ")));
    await done("Appointment updated.");
  });
  $("e-override").addEventListener("click", () => { eDlg.close(); openOverride(cur); });

  /* ----- override status ----- */
  const oDlg = $("ov-dialog");
  function openOverride(a) {
    cur = a; $("ov-appt").value = label(a);
    $("ov-status").innerHTML = P.ORDER.map((s) => `<option value="${s}">${esc(LABEL[s])}</option>`).join(""); $("ov-status").value = a.status;
    $("ov-reason").value = ""; $("ov-err").hidden = true; oDlg.showModal();
  }
  $("ov-cancel").addEventListener("click", () => oDlg.close());
  $("ov-ok").addEventListener("click", async () => {
    const status = $("ov-status").value, reason = $("ov-reason").value.trim();
    const err = (m) => { $("ov-err").textContent = m; $("ov-err").hidden = false; };
    if (!cur) return err("Choose an appointment first.");
    if (status === cur.status) return err("Choose a different status.");
    if (reason.length < 5) return err("Enter a reason (at least 5 characters).");
    $("ov-err").hidden = true;
    const patch = { status, overrideReason: reason };
    if (status === "cancelled") patch.declineReason = reason;
    const btn = $("ov-ok"); btn.disabled = true;
    try {
      await P.change(cur, patch, true);        // wait for the server; a refused change stays open with the reason shown
    } catch (error) { err(error.message || "Could not change the status."); btn.disabled = false; return; }
    btn.disabled = false; oDlg.close();
    if (status === "cancelled") tell(cur, "appointment", "Appointment cancelled", (cur.petName || "") + ", " + cur.date + " " + cur.time + ". Reason: " + reason);
    else if (status === "confirmed") tell(cur, "appointment", "Appointment approved", (cur.petName || "") + ", " + cur.date + " " + cur.time + ".");
    log("overrode the status of " + esc(cur.petName) + " (" + esc(ownerName(cur)) + ") to " + esc(LABEL[status]) + ". Reason: " + esc(reason));
    await done("Status changed to " + LABEL[status] + ".");
  });

  /* ----- cancel ----- */
  const cDlg = $("cx-dialog");
  function openCancel(a) { cur = a; $("cx-sub").textContent = label(a); $("cx-reason").value = ""; cDlg.showModal(); }
  $("cx-keep").addEventListener("click", () => cDlg.close());
  $("cx-ok").addEventListener("click", async () => {
    const reason = $("cx-reason").value.trim(), btn = $("cx-ok"); btn.disabled = true;
    try {
      await P.change(cur, { status: "cancelled", declineReason: reason }, true);
    } catch (error) { cDlg.close(); S.toast(error.message || "Could not cancel the appointment."); btn.disabled = false; return; }
    btn.disabled = false; cDlg.close();
    tell(cur, "appointment", "Appointment cancelled", (cur.petName || "") + ", " + cur.date + " " + cur.time + "." + (reason ? " Reason: " + reason : ""));
    log("cancelled the appointment of " + esc(cur.petName) + " (" + esc(ownerName(cur)) + ")" + (reason ? ". Reason: " + esc(reason) : ""));
    await done("Appointment cancelled.");
  });

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = find(b.dataset.k); if (!a) return;
    if (b.dataset.act === "edit") openEdit(a); else openCancel(a);
  });

  /* links from the Dashboard: appointments.html?status=pending  or  ?vet=unassigned */
  const q = new URLSearchParams(location.search);
  if (q.get("status") && document.querySelector('.ap-tab[data-s="' + q.get("status") + '"]')) tab = q.get("status");
  if (q.get("vet") === "unassigned") $("f-vet").value = "__tba";

  load(); render();
  P.ready.then(() => {
    all = P.load();
    renderVetFilter();
    render();
  }).catch((error) => S.toast(error.message));
})();