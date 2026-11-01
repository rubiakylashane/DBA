/* js/admin/reports.js - reports computed from live clinic appointments. */
(() => {
  const $ = (id) => document.getElementById(id);
  const S = window.PawStaff, P = window.PawStaffAppts;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const peso = (n) => "₱" + Number(n || 0).toLocaleString("en-US");
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());   // local date
  const parse = (s) => new Date(s + "T00:00:00");
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const nice = (s) => { const d = parse(s); return MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear(); };

  const STATUS_ORDER = ["completed", "confirmed", "checked_in", "with_vet", "pending", "cancelled", "no_show"];
  const STATUS_LABEL = { completed: "Completed", confirmed: "Approved", checked_in: "Checked-in", with_vet: "In Progress", pending: "Pending", cancelled: "Cancelled", no_show: "No-show" };
  const ALWAYS = ["completed", "confirmed", "pending", "cancelled"];   // always listed, the rest only when they have something

  const backend = P.backend;

  /* ---------- service prices (current) ---------- */
  function catalog() {
    try { const v = JSON.parse(localStorage.getItem("pawpaw_services") || "null"); if (Array.isArray(v) && v.length) return v; } catch (_) { /* default */ }
    return Array.isArray(window.PawServices) ? window.PawServices : [];
  }
  const CAT = backend ? [] : catalog();
  /* one appointment line -> { name: base service name, amount: current price x qty } */
  function priceLine(l) {
    const qty = Number(l.qty) || 1, id = String(l.id || ""), [base, opt] = id.split(":");
    if (backend && Number.isFinite(Number(l.price))) return { name: String(l.name || "Other"), amount: Number(l.price) * (Number(l.quantity) || qty) };
    let svc = CAT.find((s) => s.id === base);
    if (!svc) { const n = String(l.name || "").split(" (")[0].toLowerCase(); svc = CAT.find((s) => String(s.name).toLowerCase() === n); }
    if (!svc) return { name: String(l.name || "Other").split(" (")[0], amount: (Number(l.unit) || (Number(l.price) || 0) / qty) * qty };
    const o = opt && svc.options ? svc.options.find((x) => x.id === opt) : null;
    const unit = Number((o && o.price) ?? svc.price);
    return { name: svc.name, amount: (isNaN(unit) ? Number(l.unit) || 0 : unit) * qty };
  }

  /* ---------- periods ---------- */
  function range(kind) {
    const t = new Date(), y = t.getFullYear(), m = t.getMonth();
    if (kind === "this") return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    if (kind === "last") return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    if (kind === "3m") return { from: iso(new Date(y, m - 2, 1)), to: iso(t) };
    return { from: $("r-from").value, to: $("r-to").value };
  }
  const LABEL = { this: "Revenue this month", last: "Revenue last month", "3m": "Revenue, last 3 months", custom: "Revenue, custom range" };

  /* ---------- the numbers ---------- */
  function compute(all, from, to) {
    const rows = all.filter((a) => a.date && a.date >= from && a.date <= to);
    const byStatus = {}, svc = {}, vets = {};
    CAT.forEach((s) => { svc[s.name] = 0; });
    P.VETS.forEach((v) => { vets[v] = 0; });
    let revenue = 0;
    rows.forEach((a) => {
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
      if (a.vet && a.vet !== P.TBA) vets[a.vet] = (vets[a.vet] || 0) + 1;
      if (a.status !== "completed") return;
      const lines = a.services || [];
      if (!lines.length && Number(a.total)) { svc.Other = (svc.Other || 0) + Number(a.total); revenue += Number(a.total); return; }
      lines.forEach((l) => { const r = priceLine(l); svc[r.name] = (svc[r.name] || 0) + r.amount; revenue += r.amount; });
    });

    /* appointments per week (up to 6 weeks) or per month */
    const days = Math.round((parse(to) - parse(from)) / 864e5) + 1;
    let unit = "week", buckets = [];
    if (days <= 42) {
      for (let i = 0, n = Math.ceil(days / 7); i < n; i++) buckets.push({ label: "Week " + (i + 1), count: 0, test: (d) => Math.floor((parse(d) - parse(from)) / 864e5 / 7) === i });
    } else {
      unit = "month";
      for (let d = new Date(parse(from).getFullYear(), parse(from).getMonth(), 1); d <= parse(to); d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        const key = d.getFullYear() + "-" + pad(d.getMonth() + 1);
        buckets.push({ label: MONTHS[d.getMonth()] + (parse(from).getFullYear() !== parse(to).getFullYear() ? " " + String(d.getFullYear()).slice(2) : ""), count: 0, test: (x) => x.slice(0, 7) === key });
      }
    }
    rows.forEach((a) => { const b = buckets.find((x) => x.test(a.date)); if (b) b.count++; });

    return {
      sample: false, revenue, appointments: rows.length, completed: byStatus.completed || 0, cancelled: byStatus.cancelled || 0,
      revenueByService: Object.keys(svc).map((name) => ({ name, amount: svc[name] })).filter((r) => r.amount > 0 || CAT.some((s) => s.name === r.name)).sort((a, b) => b.amount - a.amount),
      unit, perPeriod: buckets.map((b) => ({ label: b.label, count: b.count })), byStatus,
      perVet: Object.keys(vets).map((name) => ({ name, count: vets[name] })).sort((a, b) => b.count - a.count)
    };
  }

  /* ---------- drawing ---------- */
  const bars = (items, fmt, cls) => {
    const max = Math.max(1, ...items.map((i) => i.value));
    return items.map((i) => `<div class="rp-bar ${cls || ""}"><span class="rp-name">${i.nameHtml || esc(i.name)}</span><span class="rp-track"><i style="width:${Math.round((i.value / max) * 100)}%"></i></span><span class="rp-val">${fmt(i.value)}</span></div>`).join("");
  };

  let kind = "this", data = null;
  function render() {
    const all = P.load();
    const r = range(kind);
    const bad = kind === "custom" && (!r.from || !r.to || r.from > r.to);
    $("rp-period").classList.toggle("bad", !!bad);
    $("rp-period").textContent = bad ? (!r.from || !r.to ? "Pick both dates to see the report." : "The From date must be on or before the To date.") : nice(r.from) + " to " + nice(r.to);
    data = bad ? compute([], "2000-01-01", "2000-01-31") : compute(all, r.from, r.to);
    data.range = r;
    $("subtitle").textContent = "Revenue and activity from recorded clinic appointments.";

    $("k-rev-l").textContent = LABEL[kind];
    $("k-rev").textContent = peso(data.revenue);
    $("k-all").textContent = data.appointments.toLocaleString("en-US");
    $("k-done").textContent = data.completed.toLocaleString("en-US");
    $("k-cx").textContent = data.cancelled.toLocaleString("en-US");

    $("c-svc").innerHTML = bars(data.revenueByService.map((x) => ({ name: x.name, value: x.amount })), peso);
    $("h-time").textContent = "Appointments per " + data.unit;
    $("c-time").innerHTML = data.perPeriod.length ? (() => {
      const max = Math.max(1, ...data.perPeriod.map((p) => p.count));
      return data.perPeriod.map((p) => `<div class="rp-col"><b>${p.count}</b><i style="height:${Math.round((p.count / max) * 140)}px"></i><span>${esc(p.label)}</span></div>`).join("");
    })() : `<p class="rp-empty">Nothing to show for these dates.</p>`;
    const st = STATUS_ORDER.filter((k) => ALWAYS.indexOf(k) >= 0 || (data.byStatus[k] || 0) > 0);
    $("c-status").innerHTML = bars(st.map((k) => ({ nameHtml: `<span class="rp-pill rp-st-${k}">${STATUS_LABEL[k]}</span>`, value: data.byStatus[k] || 0 })), (n) => n, "rp-bar-status");
    $("c-vet").innerHTML = data.perVet.length ? bars(data.perVet.map((v) => ({ name: v.name, value: v.count })), (n) => n) : `<p class="rp-empty">No veterinarians yet.</p>`;
  }

  document.querySelector(".rp-tabs").addEventListener("click", (e) => {
    const b = e.target.closest(".rp-tab"); if (!b) return;
    kind = b.dataset.p;
    document.querySelectorAll(".rp-tab").forEach((t) => { const on = t === b; t.classList.toggle("on", on); t.setAttribute("aria-selected", on); });
    $("rp-range").hidden = kind !== "custom";
    if (kind === "custom" && !$("r-from").value && !$("r-to").value) { const r = range("this"); $("r-from").value = r.from; $("r-to").value = iso(new Date()); }
    render();
  });
  ["r-from", "r-to"].forEach((id) => $(id).addEventListener("change", render));

  /* ---------- export: the figures on screen as a .csv that opens in Excel ---------- */
  const cell = (v) => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
  $("export-btn").addEventListener("click", () => {
    if (!data) return;
    const L = [], add = (...c) => L.push(c.map(cell).join(","));
    add("PAWPAW Clinic report"); add("Period", data.sample ? "Sample figures" : data.range.from + " to " + data.range.to); add();
    add("Summary", "Value"); add(LABEL[kind], data.revenue); add("Appointments", data.appointments); add("Completed", data.completed); add("Cancelled", data.cancelled); add();
    add("Service", "Revenue (PHP)"); data.revenueByService.forEach((r) => add(r.name, r.amount)); add();
    add(data.unit === "week" ? "Week" : "Month", "Appointments"); data.perPeriod.forEach((p) => add(p.label, p.count)); add();
    add("Status", "Appointments"); STATUS_ORDER.forEach((k) => { if (ALWAYS.indexOf(k) >= 0 || (data.byStatus[k] || 0) > 0) add(STATUS_LABEL[k], data.byStatus[k] || 0); }); add();
    add("Veterinarian", "Appointments"); data.perVet.forEach((v) => add(v.name, v.count));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + L.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    a.download = "report-" + (data.sample ? "sample" : data.range.from + "_to_" + data.range.to) + ".csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    S.toast("Report exported.");
  });

  render();
  P.ready.then(render).catch((error) => {
    S.toast("Could not load live clinic reports: " + error.message);
  });
})();