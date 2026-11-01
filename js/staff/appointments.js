/* js/staff/appointments.js - staff Appointments page
   tabs, date filter, search, sort, show more, approve + assign, check in, reschedule,
   no-show, decline (with reason), add appointment, vet conflict warning. */
(() => {
  const A = window.PawStaffAppts, O = window.PawOwners, S = window.PawStaff, $ = (id) => document.getElementById(id);
  const esc = O.esc, PAGE = 6, TBA = A.TBA;
  const signedInUser = (() => { try { return JSON.parse(sessionStorage.getItem("pawpaw_user") || localStorage.getItem("pawpaw_user") || "{}"); } catch (_) { return {}; } })();
  if (A.backend && String(signedInUser.role || "").toLowerCase() === "owner") {
    location.replace("my-appointments.html");
    return;
  }
  let all = A.load(), tab = "all", dateF = "", shown = PAGE, dataReady = !A.backend;

  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const today = () => iso(new Date());
  const uid = (a) => a._key + "|" + a.id;
  const find = (u) => all.find((a) => uid(a) === u);

  const ownerName = (a) => { try { return O.owner(a.owner).short; } catch (_) { return a.owner || "Owner"; } };
  const petName = (a) => a.petName || a.pet || "-";
  const vetName = (a) => a.vet || TBA;
  const services = (a) => (a.services || []).map((s) => s.name).join(", ") || a.service || "-";
  const stamp = (a) => (a.date || "") + " " + (a.time || "");
  const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const fmtShort = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const fmtTime = (t) => { const [h, m] = String(t || "00:00").split(":").map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }); };

  /* every half hour, 8:00 AM - 5:00 PM */
  const TIMES = []; for (let h = 8; h <= 17; h++) [0, 30].forEach((m) => { if (!(h === 17 && m)) TIMES.push(pad(h) + ":" + pad(m)); });
  const timeOptions = (sel) => TIMES.map((t) => `<option value="${t}"${t === sel ? " selected" : ""}>${fmtTime(t)}</option>`).join("");
  const vetOptions = (sel, withTba) => (withTba ? `<option value="${TBA}">Assign later</option>` : "") + A.VETS.map((v) => `<option${v === sel ? " selected" : ""}>${esc(v)}</option>`).join("");

  const sorters = {
    soon: (a, b) => stamp(a).localeCompare(stamp(b)),
    late: (a, b) => stamp(b).localeCompare(stamp(a)),
    status: (a, b) => A.ORDER.indexOf(a.status) - A.ORDER.indexOf(b.status) || stamp(a).localeCompare(stamp(b)),
    pet: (a, b) => petName(a).localeCompare(petName(b))
  };

  /* 9: same vet, same date and time as another active appointment */
  const clash = (a) => A.ACTIVE.indexOf(a.status) >= 0 ? A.conflict(all, a.vet, a.date, a.time, a.id) : null;

  /* ---------- tabs ---------- */
  const TABS = [["all", "All"], ["pending", "Pending"], ["today", "Today"], ["confirmed", "Confirmed"], ["checked_in", "Checked in"], ["completed", "Completed"], ["no_show", "No-show"], ["cancelled", "Cancelled"]];
  const inTab = (a, t) => t === "all" || (t === "today" ? a.date === today() : a.status === t);
  /* the dashboard cards open this page with ?tab=...: a real tab, or "scheduled" (today's confirmed / checked-in / with-vet visits, shown under the Today tab) */
  let sub = "";
  { const qt = new URLSearchParams(location.search).get("tab");
    if (qt === "scheduled") { tab = "today"; sub = qt; }
    else if (TABS.some((x) => x[0] === qt)) tab = qt; }
  const inSub = (a) => !sub || ["confirmed", "checked_in", "with_vet"].indexOf(a.status) >= 0;
  function renderTabs() {
    $("tabs").innerHTML = TABS.map(([k, label]) => {
      const n = all.filter((a) => inTab(a, k)).length;
      return `<button type="button" role="tab" class="apt-tab${k === tab ? " on" : ""}" data-tab="${k}" aria-selected="${k === tab}">${label} <i>${n}</i></button>`;
    }).join("");
  }

  /* ---------- rows ---------- */
  function actions(a) {
    const u = `data-id="${esc(uid(a))}"`;
    const btn = (act, cls, text) => `<button type="button" class="obtn ${cls} obtn-sm" data-act="${act}" ${u}>${text}</button>`;
    switch (a.status) {
      case "pending": return btn("approve", "obtn-green", "Approve &amp; Assign") + btn("decline", "obtn-cancel", "Decline");
      case "confirmed": return btn("checkin", "obtn-green", "Check In") + btn("resched", "obtn-outline", "Reschedule") + btn("noshow", "obtn-outline", "No-show");
      case "checked_in": return btn("assign", "obtn-outline", "Assign Vet");
      case "with_vet": return "";                                   // the vet completes the visit
      case "completed": return `<a class="obtn obtn-outline obtn-sm" href="medical-records.html?owner=${encodeURIComponent(a.owner)}&petid=${encodeURIComponent(a.petId || "")}&q=${encodeURIComponent(petName(a))}">View Record</a>`;
      default: return "";
    }
  }
  function row(a) {
    const c = clash(a);
    const warn = c ? `<span class="a-warn"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/></svg>Same time as ${esc(petName(c))}</span>` : "";
    return `
      <div class="orow arow${c ? " is-clash" : ""}" role="row" tabindex="0" data-open="${esc(uid(a))}" aria-label="Details of ${esc(petName(a))}">
        <span role="cell"><span class="o-name">${esc(a.date ? fmtDate(a.date) : "-")}</span><span class="o-email">${esc(fmtTime(a.time))}</span></span>
        <span role="cell"><span class="o-name">${esc(petName(a))}</span><span class="o-email">${esc(ownerName(a))}</span></span>
        <span role="cell"><span class="${vetName(a) === TBA ? "a-muted" : ""}">${esc(vetName(a))}</span>${warn}</span>
        <span role="cell">${esc(services(a))}</span>
        <span role="cell"><span class="spill spill-${esc(a.status)}">${esc(A.STATUS[a.status] || a.status)}</span>${a.status === "pending" && a.rescheduledFrom ? `<span class="resch-tag" title="Was ${esc(a.rescheduledFrom.date)} ${esc(a.rescheduledFrom.time)}">Rescheduled</span>` : ""}</span>
        <span role="cell" class="a-actions">${actions(a)}</span>
      </div>`;
  }

  function render() {
    renderTabs();
    const q = $("search").value.trim().toLowerCase();
    const list = all
      .filter((a) => inTab(a, tab) && inSub(a) && (!dateF || a.date === dateF) &&
        (!q || [petName(a), ownerName(a), vetName(a), services(a), A.STATUS[a.status] || a.status, a.date].join(" ").toLowerCase().includes(q)))
      .sort(sorters[$("sort").value] || sorters.soon);
    const part = list.slice(0, shown);
    $("appt-rows").innerHTML = part.length
      ? part.map(row).join("")
      : `<p class="o-empty">${all.length ? "No appointments match your filters." : "No appointment requests yet."}</p>`;
    $("count").textContent = list.length ? `Showing 1-${part.length} of ${list.length}` : "";
    $("more").hidden = list.length <= part.length;
    $("date-label").textContent = dateF ? fmtShort(dateF) : "All dates";
    $("date-clear").hidden = !dateF;
  }

  /* ---------- dialogs ---------- */
  const D = { detail: $("detail-dialog"), approve: $("approve-dialog"), vet: $("vet-dialog"), resched: $("resched-dialog"), decline: $("decline-dialog"), add: $("add-dialog") };
  let cur = null;
  const who = (a) => petName(a) + " - " + ownerName(a);
  const when = (a) => (a.date ? fmtDate(a.date) : "") + " " + fmtTime(a.time);
  const hint = (el, c) => { el.textContent = c ? "Warning: " + vetName(c) + " already has " + petName(c) + " at this time." : ""; el.className = "dlg-hint" + (c ? " bad" : ""); };

  function openDetails(a) {
    const rows = [["Pet", petName(a)], ["Owner", ownerName(a)], ["Date", a.date ? fmtDate(a.date) : "-"], ["Time", fmtTime(a.time)],
      ["Veterinarian", vetName(a)], ["Services", services(a)], ["Reason", a.reason || "-"],
      ["Estimated", a.total ? "₱" + Number(a.total).toLocaleString("en-US") : "-"], ["Status", A.STATUS[a.status] || a.status]];
    if (a.declineReason) rows.push(["Decline reason", a.declineReason]);
    if (a.rescheduleReason) rows.push(["Reschedule note", a.rescheduleReason]);
    $("detail-facts").innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
    D.detail.showModal();
  }
  function openApprove(a) {
    cur = a; $("approve-sub").textContent = who(a) + ", " + when(a);
    $("approve-vet").innerHTML = vetOptions(A.VETS.includes(a.vet) ? a.vet : A.VETS[0], true);
    checkApprove(); D.approve.showModal();
  }
  const checkApprove = () => hint($("approve-hint"), A.conflict(all, $("approve-vet").value, cur.date, cur.time, cur.id));
  function openAssign(a) {
    cur = a; $("vet-sub").textContent = who(a);
    $("vet-select").innerHTML = vetOptions(A.VETS.includes(a.vet) ? a.vet : A.VETS[0], false);
    checkAssign(); D.vet.showModal();
  }
  const checkAssign = () => hint($("vet-hint"), A.conflict(all, $("vet-select").value, cur.date, cur.time, cur.id));
  function openResched(a) {
    cur = a; $("resched-sub").textContent = who(a) + ", now " + when(a);
    $("resched-date").min = today(); $("resched-date").value = a.date || today();
    $("resched-time").innerHTML = timeOptions(a.time); $("resched-reason").value = "";
    checkResched(); D.resched.showModal();
  }
  const checkResched = () => hint($("resched-hint"), A.conflict(all, cur.vet, $("resched-date").value, $("resched-time").value, cur.id));
  function openDecline(a) { cur = a; $("decline-sub").textContent = who(a) + ", " + when(a); $("decline-reason").value = ""; D.decline.showModal(); }

  /* 10: add appointment */
  function openAdd() {
    if (!dataReady) { S.toast("Clinic data is still loading."); return; }
    if (A.backend && !A.SERVICES.length) { S.toast("No active clinic services are configured. Ask an administrator to add a service first."); return; }
    const owners = (A.backend ? A.getOwners().map((owner) => O.owner(String(owner.id))) : O.list()).filter((o) => o.id);
    if (!owners.length) { S.toast("Register an owner first."); return; }
    $("add-owner").innerHTML = owners.map((o) => `<option value="${esc(o.id)}">${esc(o.short || o.name)}</option>`).join("");
    $("add-service").innerHTML = A.SERVICES.map((s) => `<option>${esc(s)}</option>`).join("");
    $("add-date").min = today(); $("add-date").value = today();
    $("add-time").innerHTML = timeOptions("09:00"); $("add-vet").innerHTML = vetOptions(A.VETS[0], true);
    fillPets(); checkAdd(); D.add.showModal();
  }
  function fillPets() {
    const pets = O.petsOf($("add-owner").value);
    $("add-pet").innerHTML = pets.length ? pets.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("") : `<option value="">No pets yet</option>`;
  }
  const checkAdd = () => hint($("add-hint"), A.conflict(all, $("add-vet").value, $("add-date").value, $("add-time").value));

  /* tell the owner (notification bell) what the clinic just did */
  function tell(a, before, patch) {
    const what = petName(a) + ", " + (a.date ? fmtShort(a.date) : "") + " " + fmtTime(a.time);
    const n = (title, text) => A.notify(a.owner, "appointment", title, text);
    if (patch.date || patch.time) n("Appointment rescheduled", what + (patch.rescheduleReason ? ". Reason: " + patch.rescheduleReason : "") + ".");
    else if (patch.status === "confirmed" && before === "pending") n("Appointment approved", what + (a.vet && a.vet !== TBA ? " with " + a.vet : "") + ".");
    else if (patch.status === "cancelled") n("Request declined", petName(a) + ", " + (a.date ? fmtShort(a.date) : "") + "." + (patch.declineReason ? " Reason: " + patch.declineReason : ""));
    else if (patch.status === "completed") n("Visit completed", petName(a) + " has finished the visit.");
    else if (patch.status === "checked_in") n("Checked in", petName(a) + " has checked in for the " + fmtShort(a.date) + " " + fmtTime(a.time) + " appointment.");
    else if (patch.status === "no_show") n("Marked as no-show", petName(a) + " did not arrive for the " + fmtShort(a.date) + " appointment.");
  }
  /* ask the staff first: "has the pet really checked in?" / "is it really a no-show?" */
  const CONFIRM = {
    checkin: { title: (a) => "Has " + petName(a) + " really checked in?", note: "Confirm only if the owner and the pet are already at the clinic.",
      no: "Not yet", yes: "Yes, checked in", cls: "btn-primary", patch: { status: "checked_in" }, msg: (a) => petName(a) + " checked in." },
    noshow: { title: (a) => "Did " + petName(a) + " really not show up?", note: "Confirm only if the owner did not arrive for this appointment.",
      no: "Go back", yes: "Yes, no-show", cls: "btn-danger", patch: { status: "no_show" }, msg: (a) => petName(a) + " marked as no-show." }
  };
  const cfm = document.createElement("dialog");
  cfm.className = "dlg"; cfm.setAttribute("aria-labelledby", "cfm-title");
  cfm.innerHTML = `<h2 id="cfm-title"></h2><p class="dlg-sub" id="cfm-who"></p><p class="dlg-sub" id="cfm-note"></p>
    <div class="dlg-actions" style="justify-content:center">
    <button type="button" class="btn btn-outline" data-close id="cfm-no"></button><button type="button" class="btn" id="cfm-yes"></button></div>`;
  document.body.appendChild(cfm);
  let cfmA = null, cfmK = null;
  function askConfirm(a, kind) {
    cfmA = a; cfmK = CONFIRM[kind];
    $("cfm-title").textContent = cfmK.title(a);
    $("cfm-who").textContent = who(a) + ", " + when(a);
    $("cfm-note").textContent = cfmK.note;
    $("cfm-no").textContent = cfmK.no;
    $("cfm-yes").textContent = cfmK.yes; $("cfm-yes").className = "btn " + cfmK.cls;
    cfm.showModal();
  }
  $("cfm-yes").addEventListener("click", () => { cfm.close(); set(cfmA, cfmK.patch, cfmK.msg(cfmA)); });

  async function set(a, patch, msg) {
    const before = a.status;
    try { await A.change(a, patch); }
    catch (error) { S.toast(error.message); return; }
    tell(a, before, patch);
    render();
    S.toast(msg);
  }

  /* ---------- events ---------- */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tab]");
    if (t) { tab = t.dataset.tab; sub = ""; shown = PAGE; render(); return; }
    if (e.target.closest("[data-close]")) { e.target.closest("dialog").close(); return; }
    const b = e.target.closest("[data-act]");
    if (b) {
      e.stopPropagation();
      if (!dataReady) { S.toast("Clinic appointments and veterinarian data are still loading."); return; }
      const a = find(b.dataset.id); if (!a) return;
      ({
        approve: () => openApprove(a), decline: () => openDecline(a), assign: () => openAssign(a), resched: () => openResched(a),
        checkin: () => askConfirm(a, "checkin"),
        noshow: () => askConfirm(a, "noshow")
      })[b.dataset.act]();
      return;
    }
    if (e.target.closest("a")) return;
    const r = e.target.closest("[data-open]");
    if (r) { const a = find(r.dataset.open); if (a) openDetails(a); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.target.closest("button, a, dialog")) return;
    const r = e.target.closest("[data-open]");
    if (r) { const a = find(r.dataset.open); if (a) openDetails(a); }
  });

  $("detail-close").addEventListener("click", () => D.detail.close());
  $("more").addEventListener("click", () => { shown += PAGE; render(); });
  $("search").addEventListener("input", () => { shown = PAGE; render(); });
  $("sort").addEventListener("change", render);
  $("add-btn").addEventListener("click", openAdd);

  /* 2: date filter (calendar popup) */
  $("date-btn").addEventListener("click", () => {
    window.PawCalendar.open({ anchor: $("date-btn"), value: dateF || today(), onPick: (v) => { dateF = v; shown = PAGE; render(); } });
  });
  $("date-clear").addEventListener("click", () => { dateF = ""; render(); });

  $("approve-vet").addEventListener("change", checkApprove);
  $("approve-ok").addEventListener("click", () => {
    const vet = $("approve-vet").value; D.approve.close();
    set(cur, { status: "confirmed", vet }, "Request approved" + (vet !== TBA ? " - " + vet + "." : "."));
  });
  $("vet-select").addEventListener("change", checkAssign);
  $("vet-save").addEventListener("click", () => { const vet = $("vet-select").value; D.vet.close(); set(cur, { vet, status: "with_vet" }, "Assigned to " + vet + "."); });

  $("resched-date").addEventListener("change", checkResched);
  $("resched-time").addEventListener("change", checkResched);
  $("resched-ok").addEventListener("click", () => {
    const date = $("resched-date").value, time = $("resched-time").value;
    if (!date) { S.toast("Pick a new date."); return; }
    D.resched.close();
    set(cur, { date, time, rescheduleReason: $("resched-reason").value.trim(), rescheduledAt: new Date().toISOString() }, "Rescheduled to " + fmtShort(date) + ", " + fmtTime(time) + ".");
  });

  $("decline-ok").addEventListener("click", () => { const r = $("decline-reason").value.trim(); D.decline.close(); set(cur, { status: "cancelled", declineReason: r }, "Request declined."); });

  $("add-owner").addEventListener("change", fillPets);
  ["add-vet", "add-date", "add-time"].forEach((id) => $(id).addEventListener("change", checkAdd));
  $("add-ok").addEventListener("click", async () => {
    const key = $("add-owner").value, petId = $("add-pet").value, date = $("add-date").value;
    const time = $("add-time").value;
    if (!petId) { S.toast("This owner has no pet yet."); return; }
    if (!date) { S.toast("Pick a date."); return; }
    const pet = O.getPet(key, petId), svc = $("add-service").value;
    let a;
    try {
      a = await A.add(key, { petId, petName: pet ? pet.name : "", vet: $("add-vet").value, date, time, services: [{ name: svc, price: 0 }] });
    } catch (error) { S.toast(error.message); return; }
    A.notify(a.owner, "appointment", "Appointment booked", petName(a) + ", " + fmtShort(a.date) + " " + fmtTime(a.time) + ", " + services(a) + ".");
    all.push(a); D.add.close(); render(); S.toast("Appointment added for " + petName(a) + ".");
  });

  render();
  A.ready.then(() => {
    dataReady = true;
    all = A.load();
    render();
    const params = new URLSearchParams(location.search), ownerId = params.get("owner");
    if (ownerId) {
      openAdd();
      if ([...$("add-owner").options].some((option) => option.value === ownerId)) $("add-owner").value = ownerId;
      fillPets();
      const petId = params.get("petid");
      if (petId && [...$("add-pet").options].some((option) => option.value === petId)) $("add-pet").value = petId;
      const service = params.get("service");
      if (service && [...$("add-service").options].some((option) => option.value.toLowerCase() === service.toLowerCase())) $("add-service").value = service;
    }
  }).catch((error) => S.toast(error.message));
})();