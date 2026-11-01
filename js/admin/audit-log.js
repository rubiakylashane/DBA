/* js/admin/audit-log.js - admin Audit Log (read-only)
   Reads "pawpaw_audit" (newest last): [ { at, user, role, action: create|update|delete, record, details, text } ]
   Written by admin-store.js (admin actions) and by audit() in owners-store.js, staff-appts-store.js and
   the owner's appts-store.js (staff, vet and owner actions).
   Backend: GET /api/audit-log?user=&action=&record=&from=&to=&page=   (the server writes the entries; there is no edit or delete endpoint)
            GET /api/audit-log/export.csv  with the same filters */
(() => {
  const $ = (id) => document.getElementById(id);
  const S = window.PawStaff, PAGE = 10;
  const ROLE = { admin: "Admin", staff: "Staff", vet: "Veterinarian", owner: "Owner" };
  const RECORDS = ["owner", "pet", "appointment", "medical_record", "prescription", "vaccination", "veterinarian", "user", "service"];
  const ACTIONS = { create: "CREATE", update: "UPDATE", deactivate: "DEACTIVATE", login: "LOGIN", logout: "LOGOUT" };
  const backend = window.PawApi.isBackendSession();

  const plain = (h) => String(h || "").replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").trim();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* entries saved before this page existed only have { at, text }: work the other fields out of the sentence */
  function normal(e) {
    let user = e.user, details = e.details;
    if (!user || !details) {
      const m = String(e.text || "").match(/^<strong>(.*?)<\/strong>\s*([\s\S]*)$/);
      user = user || (m ? plain(m[1]) : "Unknown");
      const d = plain(m ? m[2] : e.text);
      details = details || (d.charAt(0).toUpperCase() + d.slice(1) + (/[.!?]$/.test(d) ? "" : "."));
    }
    const low = details.toLowerCase();
    /* there is no delete in the clinic: turning an account / record off is a "deactivate" (old "delete" entries and "Deactivated ..." sentences land here too) */
    let action = e.action === "delete" ? "deactivate" : ACTIONS[e.action] ? e.action : /^(regist|add|creat|book|request)/.test(low) ? "create" : /^(delet|remov|deactivat)/.test(low) ? "deactivate" : "update";
    if (action === "update" && /\bdeactivat/.test(low)) action = "deactivate";
    const record = e.record || (/veterinarian/.test(low) ? "veterinarian" : /appointment/.test(low) ? "appointment" : /\bpet\b/.test(low) ? "pet" : /owner/.test(low) ? "owner" : /service/.test(low) ? "service" : "user");
    const role = String(e.role || (String(user).toLowerCase() === "admin" ? "admin" : "")).toLowerCase();
    return { at: e.at, t: Date.parse(e.at) || 0, user, userId: e.user_id == null ? null : String(e.user_id), role, action, record, details };
  }
  function load() {
    let raw = [];
    try { const v = JSON.parse(localStorage.getItem("pawpaw_audit") || "[]"); if (Array.isArray(v)) raw = v; } catch (_) { /* ignore */ }
    return raw.map((e, i) => ({ ...normal(e), i })).sort((a, b) => b.t - a.t || b.i - a.i);   // newest first (same-second entries: the later one first)
  }

  let all = backend ? [] : load();
  let page = 1;
  const pad = (n) => String(n).padStart(2, "0");
  const dayOf = (t) => { const d = new Date(t); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };   // local date, to match the date pickers
  const fmtDate = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const fmtTime = (t) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const recLabel = (r) => String(r || "").replace(/\s+/g, "_");                                       // raw value (filters, CSV)
  const recNice = (r) => { const t = String(r || "").replace(/_/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };   // shown on screen: "Medical record"

  /* Backend filters use database users and audit actors; demo storage is only used without a backend session. */
  const A = window.PawAdmin;
  let people = [];
  function renderPeople() {
    const opts = people.map((p, i) => ({
      i,
      label: p.label + (p.role && String(p.label).toLowerCase() !== String(ROLE[p.role] || p.role).toLowerCase()
        ? " (" + (ROLE[p.role] || p.role) + ")" : "")
    })).sort((a, b) => a.label.localeCompare(b.label));
    $("f-user").innerHTML = '<option value="">All users</option>' + opts.map((o) => `<option value="${o.i}">${esc(o.label)}</option>`).join("");
  }
  if (!backend) {
    try {
      (A ? A.list() : []).forEach((u) => people.push({
        label: u.name, role: u.role, keys: [String(u.name).toLowerCase(), String(u.username || "").toLowerCase()].filter(Boolean)
      }));
    } catch (_) { /* demo store may be unavailable */ }
    all.forEach((e) => {
      if (!people.some((p) => p.keys.includes(String(e.user).toLowerCase()))) {
        people.push({ label: e.user, role: e.role, keys: [String(e.user).toLowerCase()] });
      }
    });
    renderPeople();
  }
  $("f-action").innerHTML = '<option value="">All actions</option>' + Object.keys(ACTIONS).map((a) => `<option value="${a}">${a.charAt(0).toUpperCase() + a.slice(1)}</option>`).join("");
  const recs = [...new Set([...RECORDS, ...all.map((e) => e.record)])];
  $("f-record").innerHTML = '<option value="">All records</option>' + recs.map((r) => `<option value="${esc(r)}">${esc(recNice(r))}</option>`).join("");

  function filtered() {
    const u = $("f-user").value, a = $("f-action").value, r = $("f-record").value, from = $("f-from").value, to = $("f-to").value;
    const person = u === "" ? null : people[+u];
    return all.filter((e) => (!person || (backend && person.userId
      ? person.userId === e.userId
      : person.keys.includes(String(e.user).toLowerCase()))) && (!a || e.action === a) && (!r || e.record === r)
      && (!from || dayOf(e.t) >= from) && (!to || dayOf(e.t) <= to));
  }

  function render() {
    const rows = filtered(), pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (page > pages) page = pages;
    const start = (page - 1) * PAGE, shown = rows.slice(start, start + PAGE);
    $("au-rows").innerHTML = shown.length ? shown.map((e) => `
      <div class="au-row" role="row">
        <span class="au-when"><b>${esc(fmtDate(e.t))}</b><i>${esc(fmtTime(e.t))}</i></span>
        <span class="au-who"><b>${esc(e.user)}</b>${e.role && String(e.user).toLowerCase() !== String(ROLE[e.role] || e.role).toLowerCase() ? `<i>${esc(ROLE[e.role] || e.role)}</i>` : ""}</span>
        <span><span class="au-pill au-${e.action === "deactivate" ? "delete" : e.action}" style="min-width:96px">${ACTIONS[e.action]}</span></span>
        <span><span class="au-rec">${esc(recNice(e.record))}</span></span>
        <span class="au-det">${esc(e.details)}</span>
      </div>`).join("")
      : `<p class="au-empty">${all.length ? "No entries match these filters." : "No activity has been recorded yet. Changes made in the clinic will show up here."}</p>`;
    $("au-count").textContent = rows.length ? `Showing ${start + 1} to ${start + shown.length} of ${rows.length} entries` : "Showing 0 of 0 entries";
    $("au-prev").disabled = page <= 1;
    $("au-next").disabled = page >= pages;
  }

  async function refreshFromBackend() {
    if (!window.PawApi.isBackendSession()) return;
    const [data, users] = await Promise.all([
      window.PawApi.request("/api/audit-log"),
      window.PawApi.request("/api/admin/users")
    ]);
    all = data.map((entry, i) => ({ ...normal(entry), i })).sort((a, b) => b.t - a.t || b.i - a.i);
    people = users.map((u) => ({
      label: u.name || u.username,
      role: String(u.role || "").toLowerCase(),
      userId: String(u.id),
      keys: [String(u.name || "").toLowerCase(), String(u.username || "").toLowerCase()].filter(Boolean)
    }));
    all.forEach((entry) => {
      if (people.some((person) => (entry.userId && person.userId === entry.userId)
        || person.keys.includes(String(entry.user).toLowerCase()))) return;
      people.push({
        label: entry.user || "Unknown",
        role: entry.role,
        userId: entry.userId,
        keys: [String(entry.user || "Unknown").toLowerCase()]
      });
    });
    renderPeople();
    page = 1;
    render();
  }

  ["f-user", "f-action", "f-record", "f-from", "f-to"].forEach((id) => $(id).addEventListener("change", () => { page = 1; render(); }));
  $("au-prev").addEventListener("click", () => { if (page > 1) { page--; render(); } });
  $("au-next").addEventListener("click", () => { page++; render(); });
  if (backend) refreshFromBackend().catch((error) => S.toast(error.message));

  /* export: the filtered rows (all pages) as a .csv that opens in Excel */
  const cell = (v) => {
    let t = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;                       // stops Excel from running a cell as a formula
    return '"' + t.replace(/"/g, '""') + '"';
  };
  $("export-btn").addEventListener("click", () => {
    const rows = filtered();
    if (!rows.length) return S.toast("Nothing to export with these filters.");
    const lines = [["Timestamp", "User", "Role", "Action", "Record type", "Details"].map(cell).join(",")];
    rows.forEach((e) => lines.push([fmtDate(e.t) + " " + fmtTime(e.t), e.user, ROLE[e.role] || e.role, ACTIONS[e.action], recLabel(e.record), e.details].map(cell).join(",")));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "audit-log-" + dayOf(Date.now()) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    S.toast("Exported " + rows.length + (rows.length === 1 ? " entry." : " entries."));
  });

  render();
})();