/* js/admin/dashboard.js - admin dashboard backed by authenticated clinic data. */
(() => {
  const USE_BACKEND = Boolean(window.PawApi && window.PawApi.isBackendSession());
  const P = window.PawStaffAppts;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const peso = (n) => "₱" + Number(n || 0).toLocaleString("en-US");
  const pad = (n) => String(n).padStart(2, "0");
  const month = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1); };
  const STAFF_NAMES = ["guest", "staff", "vet", "admin"];

  /* ---------- Demo data from localStorage ---------- */
  function fromStorage() {
    const owners = new Set();
    let pets = 0, appts = 0, revenue = 0;
    const byService = {}, events = [];
    const m = month();
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || "";
        const grab = (pre) => (k.indexOf(pre) === 0 ? k.slice(pre.length) : null);
        let key;
        if ((key = grab("pawpaw_pets:")) !== null) { if (key && !STAFF_NAMES.includes(key)) { owners.add(key); pets += (JSON.parse(localStorage.getItem(k) || "[]") || []).length; } }
        else if ((key = grab("pawpaw_profile:")) !== null) { if (key && !STAFF_NAMES.includes(key)) owners.add(key); }
        else if ((key = grab("pawpaw_appointments:")) !== null) {
          if (!key || STAFF_NAMES.includes(key)) continue;
          owners.add(key);
          (JSON.parse(localStorage.getItem(k) || "[]") || []).forEach((a) => {
            if (String(a.date || "").slice(0, 7) === m && a.status !== "cancelled") appts++;
            if (a.status === "completed" && String(a.date || "").slice(0, 7) === m) {
              revenue += Number(a.total) || 0;
              (a.services || []).forEach((s) => { byService[s.name] = (byService[s.name] || 0) + (Number(s.price) || 0); });   // s.price is already unit x qty
            }
            const at = a.updatedAt || a.createdAt;
            if (at) {
              const who = "<strong>" + esc(key) + "</strong>";
              const what = a.status === "pending" ? "booked an appointment for " : a.status === "confirmed" ? "has an approved appointment for " :
                a.status === "completed" ? "completed a visit for " : a.status === "cancelled" ? "cancelled an appointment for " : "updated an appointment for ";
              events.push({ at, text: who + " " + what + esc(a.petName || "a pet") });
            }
          });
        } else if ((key = grab("pawpaw_records:")) !== null) {
          const r = JSON.parse(localStorage.getItem(k) || "{}") || {};
          (r.visits || []).forEach((v) => { if (v.date) events.push({ at: v.date + "T12:00:00", text: "<strong>" + esc(v.vet || "A vet") + "</strong> created a medical record" }); });
        }
      }
    } catch (_) { /* storage blocked */ }
    try { JSON.parse(localStorage.getItem("pawpaw_audit") || "[]").forEach((e) => events.push({ at: e.at, text: e.text })); } catch (_) { /* none */ }
    if (!owners.size) return null;
    events.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return {
      ...extras(),
      owners: owners.size, pets, appointmentsThisMonth: appts, revenueThisMonth: revenue,
      revenueByService: Object.keys(byService).map((n) => ({ name: n, amount: byService[n] })).sort((a, b) => b.amount - a.amount),
      activity: events.slice(0, 5).map((e) => ({ text: e.text, at: when(e.at) }))
    };
  }

  /* ---------- Today's schedule, revenue vs last month (from localStorage) ---------- */
  const pad2 = (n) => String(n).padStart(2, "0");
  const isoOf = (d) => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());   // local date
  const readJson = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (_) { return d; } };
  function extras() {
    const now = new Date(), today = isoOf(now), soon = isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
    const thisM = month(), lastM = (() => { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return d.getFullYear() + "-" + pad2(d.getMonth() + 1); })();
    let revLast = 0, revThis = 0, doneThis = 0, pending = 0, noVet = 0, base = 0, cx = 0, ns = 0, unassignedToday = 0;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)), wkFrom = isoOf(monday), wkTo = isoOf(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6));
    const weekRev = [0, 0, 0, 0, 0, 0, 0], wkSvc = {};
    const svcNames = (a) => [...new Set((a.services || []).map((l) => String(l.name || "").split(" (")[0]).filter(Boolean))];
    const todayRows = [], latest = {}, vetNames = ((readJson("pawpaw_vets", []) || []).map((v) => v.name).filter(Boolean)), byVet = {};
    const from90 = isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89)), days = [0, 0, 0, 0, 0, 0, 0], hours = {};
    vetNames.forEach((n) => { byVet[n] = { name: n, done: 0, total: 0 }; });
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      if (k.indexOf("pawpaw_appointments:") === 0) {
        const key = k.slice("pawpaw_appointments:".length), owner = (readJson("pawpaw_profile:" + key, {}) || {}).name || key;
        (readJson(k, []) || []).forEach((a) => {
          const ym = String(a.date || "").slice(0, 7);
          if (a.status === "completed" && ym === lastM) revLast += Number(a.total) || 0;
          if (a.status === "completed" && ym === thisM) { revThis += Number(a.total) || 0; doneThis++; }
          if (ym === thisM && a.date <= today) { base++; if (a.status === "cancelled") cx++; if (a.status === "no_show") ns++; }
          if (a.date >= wkFrom && a.date <= wkTo) {
            if (a.status === "completed") weekRev[(new Date(a.date + "T00:00:00").getDay() + 6) % 7] += Number(a.total) || 0;
            if (a.status !== "cancelled") svcNames(a).forEach((n) => { wkSvc[n] = (wkSvc[n] || 0) + 1; });
          }
          if (a.date >= from90 && a.date <= today && a.status !== "cancelled") {
            const wd = (new Date(a.date + "T00:00:00").getDay() + 6) % 7;   // Monday = 0
            days[wd]++; const hr = parseInt(String(a.time || "").slice(0, 2), 10); if (!isNaN(hr)) hours[hr] = (hours[hr] || 0) + 1;
          }
          if (a.status === "pending") pending++;
          if (["pending", "confirmed", "checked_in"].indexOf(a.status) >= 0 && a.date >= today && (!a.vet || a.vet === "To be assigned")) noVet++;
          if (a.date === today && a.status !== "cancelled") {
            if (!a.vet || a.vet === "To be assigned") unassignedToday++;
            else { const v = byVet[a.vet] || (byVet[a.vet] = { name: a.vet, done: 0, total: 0 }); v.total++; if (a.status === "completed") v.done++; }
          }
          if (a.date === today && a.status !== "cancelled") todayRows.push({ time: a.time || "", pet: a.petName || "Pet", owner, vet: a.vet || "To be assigned", status: a.status });
        });
      } else if (k.indexOf("pawpaw_vaccinations:") === 0) {
        const key = k.slice("pawpaw_vaccinations:".length);
        (readJson(k, []) || []).forEach((v) => {          // only the latest dose of each vaccine counts for a pet
          const id = key + "|" + (v.petId || v.pet) + "|" + String(v.vaccine).toLowerCase();
          if (!latest[id] || String(v.dateAdministered) > String(latest[id].dateAdministered)) latest[id] = v;
        });
      }
    }
    const due = Object.keys(latest).map((id) => latest[id].nextDue).filter(Boolean);
    const overdue = due.filter((d) => d < today).length, dueSoon = due.filter((d) => d >= today && d <= soon).length;
    todayRows.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    return {
      revenueLastMonth: revLast, completedThisMonth: doneThis, cancelRate: base ? Math.round(cx / base * 100) : null, noShowRate: base ? Math.round(ns / base * 100) : null,
      vetsToday: Object.keys(byVet).map((k) => byVet[k]).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)), unassignedToday,
      weekRevenue: weekRev, topServices: Object.keys(wkSvc).map((n) => ({ name: n, n: wkSvc[n] })).sort((a, b) => b.n - a.n).slice(0, 5),
      today: todayRows
    };
  }

  function when(iso) {
    const d = new Date(iso); if (isNaN(d)) return "";
    const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
    if (days <= 0) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return days === 1 ? "Yesterday" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  async function load() {
    if (!USE_BACKEND) return { owners: 0, pets: 0, appointmentsThisMonth: 0, revenueThisMonth: 0, revenueByService: [], activity: [], today: [], vetsToday: [], weekRevenue: [0, 0, 0, 0, 0, 0, 0], topServices: [] };
    await P.ready;
    const [owners, veterinarians, services] = await Promise.all([
      window.PawApi.loadOwners(),
      window.PawApi.request("/api/vets"),
      window.PawApi.request("/api/services")
    ]);
    const appointments = P.load();
    const now = new Date();
    const today = isoOf(now), thisMonth = month();
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = lastMonthDate.getFullYear() + "-" + pad(lastMonthDate.getMonth() + 1);
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const weekStart = isoOf(monday), weekEnd = isoOf(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6));
    const weekRevenue = [0, 0, 0, 0, 0, 0, 0], revenueByService = {}, topServices = {};
    let revenueThisMonth = 0, revenueLastMonth = 0, completedThisMonth = 0, cancelled = 0, noShows = 0, nonCancelledThisMonth = 0;
    const veterinarianStats = new Map(veterinarians.map((vet) => [vet.name, { name: vet.name, done: 0, total: 0 }]));
    const todayAppointments = [];
    const activity = [];
    for (const appointment of appointments) {
      const monthKey = String(appointment.date || "").slice(0, 7);
      if (monthKey === thisMonth && appointment.status !== "cancelled") {
        nonCancelledThisMonth++;
        if (appointment.status === "cancelled") cancelled++;
        if (appointment.status === "no_show") noShows++;
        if (appointment.status === "completed") {
          completedThisMonth++;
          revenueThisMonth += Number(appointment.total) || 0;
          for (const service of appointment.services || []) {
            const amount = (Number(service.price) || 0) * (Number(service.quantity) || 1);
            revenueByService[service.name] = (revenueByService[service.name] || 0) + amount;
          }
        }
      } else if (monthKey === thisMonth && appointment.status === "cancelled") cancelled++;
      if (monthKey === lastMonth && appointment.status === "completed") revenueLastMonth += Number(appointment.total) || 0;
      if (appointment.date >= weekStart && appointment.date <= weekEnd && appointment.status === "completed") {
        const index = Math.round((new Date(appointment.date + "T00:00:00") - new Date(weekStart + "T00:00:00")) / 86400000);
        weekRevenue[index] += Number(appointment.total) || 0;
        for (const service of appointment.services || []) topServices[service.name] = (topServices[service.name] || 0) + (Number(service.quantity) || 1);
      }
      if (appointment.date === today) {
        if (!appointment.vet || appointment.vet === "To be assigned") {
          // Unassigned appointments are counted separately from veterinarian workload.
        } else {
          const stats = veterinarianStats.get(appointment.vet);
          if (stats) {
            stats.total++;
            if (appointment.status === "completed") stats.done++;
          }
        }
        todayAppointments.push({
          time: appointment.time,
          pet: appointment.petName,
          owner: appointment.ownerName,
          vet: appointment.vet || "To be assigned",
          status: appointment.status
        });
      }
      const at = appointment.updatedAt || appointment.createdAt;
      if (at) {
        const action = appointment.status === "pending" ? "requested an appointment for"
          : appointment.status === "confirmed" ? "has an approved appointment for"
            : appointment.status === "completed" ? "completed a visit for"
              : appointment.status === "cancelled" ? "cancelled an appointment for" : "updated an appointment for";
        activity.push({ at, text: `<strong>${esc(appointment.ownerName || "Owner")}</strong> ${action} ${esc(appointment.petName || "a pet")}` });
      }
    }
    for (const service of services) {
      if (!(service.name in revenueByService)) revenueByService[service.name] = 0;
    }
    activity.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    todayAppointments.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    const allToday = appointments.filter((appointment) => appointment.date === today);
    return {
      sample: false,
      owners: owners.length,
      pets: owners.reduce((total, owner) => total + (owner.pets || []).length, 0),
      appointmentsThisMonth: appointments.filter((appointment) => String(appointment.date || "").slice(0, 7) === thisMonth && appointment.status !== "cancelled").length,
      revenueThisMonth,
      revenueByService: Object.entries(revenueByService).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
      activity: activity.slice(0, 5).map((entry) => ({ text: entry.text, at: when(entry.at) })),
      revenueLastMonth,
      completedThisMonth,
      cancelRate: nonCancelledThisMonth + cancelled ? Math.round(cancelled / (nonCancelledThisMonth + cancelled) * 100) : null,
      noShowRate: nonCancelledThisMonth ? Math.round(noShows / nonCancelledThisMonth * 100) : null,
      vetsToday: [...veterinarianStats.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
      unassignedToday: allToday.filter((appointment) => !appointment.vet || appointment.vet === "To be assigned").length,
      weekRevenue,
      topServices: Object.entries(topServices).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n).slice(0, 5),
      today: todayAppointments
    };
  }

  function render(d) {
    $("s-owners").textContent = d.owners;
    $("s-pets").textContent = d.pets;
    $("s-appts").textContent = d.appointmentsThisMonth;
    $("s-rev").textContent = peso(d.revenueThisMonth);
    /* revenue compared with last month */
    const dl = $("s-rev-delta"), last = Number(d.revenueLastMonth) || 0, now = Number(d.revenueThisMonth) || 0;
    dl.className = "stat-delta";
    if (!last) dl.textContent = now ? "No revenue last month" : "";
    else if (now === last) dl.textContent = "Same as last month";
    else { const pct = Math.round(Math.abs(now - last) / last * 100); dl.classList.add(now > last ? "up" : "down"); dl.textContent = (now > last ? "\u25B2 " : "\u25BC ") + pct + "% vs last month"; }

    /* weekly revenue (Mon-Sun, the best day is dark) */
    const wr = d.weekRevenue || [0, 0, 0, 0, 0, 0, 0], wmax = Math.max(...wr), wtop = wr.indexOf(wmax), wtoday = (new Date().getDay() + 6) % 7, WD = ["M", "T", "W", "T", "F", "S", "S"], WDN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    $("wk-total").textContent = wr.reduce((a, b) => a + b, 0) ? peso(wr.reduce((a, b) => a + b, 0)) + " this week" : "";
    $("wk-cols").innerHTML = wr.map((v, i) => `<div class="wk-col${wmax > 0 && i === wtop ? " top" : ""}${i === wtoday ? " today" : ""}" title="${WDN[i]}: ${peso(v)}">${wmax > 0 && i === wtop ? `<b>${peso(v)}</b>` : ""}<i style="height:${wmax ? Math.round(v / wmax * 130) : 0}px"></i><span>${WD[i]}</span></div>`).join("");

    /* top services this week */
    const ts = d.topServices || [], tsum = ts.reduce((a, x) => a + x.n, 0), tsmax = Math.max(1, ...ts.map((x) => x.n));
    $("ts-wrap").innerHTML = ts.length
      ? `<div class="ts-main"><small>Most booked</small><strong>${esc(ts[0].name)}</strong><em>${Math.round(ts[0].n / tsum * 100)}%</em><p>${tsum} service${tsum === 1 ? "" : "s"} booked this week</p></div>
         <div>${ts.map((x, i) => `<div class="ts-row${i === 0 ? " top" : ""}"><span>${esc(x.name)}</span><span class="vw-track"><i style="width:${Math.round(x.n / tsmax * 100)}%"></i></span><b>${x.n}</b></div>`).join("")}</div>`
      : `<p class="ts-empty">No bookings yet this week.</p>`;

    /* notes under the stat cards */
    const sub = [];
    if (d.cancelRate != null) sub.push("Cancelled " + d.cancelRate + "%");
    if (d.noShowRate != null) sub.push("No-shows " + d.noShowRate + "%");
    $("s-appt-sub").textContent = sub.join(" \u00B7 ");
    $("s-rev-avg").textContent = d.completedThisMonth > 0 ? peso(Math.round(now / d.completedThisMonth)) + " average per visit" : "";

    /* veterinarians today */
    const vw = d.vetsToday || [];
    $("vw-list").innerHTML = (vw.length ? vw.map((v) => `<div class="vw-row"><span class="vw-name">${esc(v.name)}</span><span class="vw-track"><i style="width:${v.total ? Math.round(v.done / v.total * 100) : 0}%"></i></span><span class="vw-val${v.total ? "" : " none"}">${v.total ? v.done + " / " + v.total : "None today"}</span></div>`).join("") : `<p class="empty">No veterinarians yet.</p>`)
      + (d.unassignedToday ? `<p class="vw-note">${d.unassignedToday} appointment${d.unassignedToday === 1 ? "" : "s"} today ${d.unassignedToday === 1 ? "has" : "have"} no veterinarian yet.</p>` : "");

    /* today's schedule (first 5) */
    const LABEL = { pending: "Pending", confirmed: "Approved", checked_in: "Checked-in", with_vet: "In Progress", completed: "Completed", no_show: "No-show", cancelled: "Cancelled" };
    const td = d.today || [];
    $("td-count").textContent = td.length ? td.length + (td.length === 1 ? " appointment" : " appointments") : "";
    $("td-list").innerHTML = td.length
      ? td.slice(0, 5).map((t) => { const [h, m] = String(t.time || "00:00").split(":").map(Number); const time = t.time ? new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "-";
          return `<li><span class="td-time">${esc(time)}</span><span class="td-main"><b>${esc(t.pet)}</b><i>${esc(t.owner)} · ${esc(t.vet)}</i></span><span class="td-pill td-${esc(t.status)}">${esc(LABEL[t.status] || t.status)}</span></li>`; }).join("")
      : `<li class="empty">No appointments today.</li>`;
    $("subtitle").textContent = "Clinic totals at a glance.";

    const max = Math.max(1, ...d.revenueByService.map((r) => r.amount));
    $("rev-list").innerHTML = d.revenueByService.length
      ? d.revenueByService.map((r) => `<div class="rev-row"><span>${esc(r.name)}</span><span class="rev-bar"><i style="width:${Math.max(4, Math.round(r.amount / max * 100))}%"></i></span><span class="rev-amt">${peso(r.amount)}</span></div>`).join("")
      : `<p class="empty">No completed visits this month yet.</p>`;
    $("act-list").innerHTML = d.activity.length
      ? d.activity.map((a) => `<li><span>${a.text}</span><time>${esc(a.at)}</time></li>`).join("")
      : `<li class="empty">No activity yet.</li>`;
  }

  /* greeting with the signed-in name: "Good afternoon, Admin" */
  (() => {
    let name = "";
    for (const store of ["sessionStorage", "localStorage"]) {
      try { const u = JSON.parse(window[store].getItem("pawpaw_user") || "null"); if (u && u.name) { name = String(u.name).trim(); break; } } catch (_) { /* ignore */ }
    }
    try { const pf = JSON.parse(localStorage.getItem("pawpaw_admin_profile:" + name.toLowerCase()) || "null"); if (pf && pf.name) name = pf.name; } catch (_) { /* ignore */ }
    if (name && name === name.toLowerCase()) name = name.charAt(0).toUpperCase() + name.slice(1);
    const h = new Date().getHours();
    $("greeting").textContent = (h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening") + (name ? ", " + name : "");
  })();

  $("today").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  load().then(render).catch((error) => {
    console.error("[admin dashboard] Could not load clinic data:", error);
    render({ owners: 0, pets: 0, appointmentsThisMonth: 0, revenueThisMonth: 0, revenueByService: [], activity: [], today: [], vetsToday: [], weekRevenue: [0, 0, 0, 0, 0, 0, 0], topServices: [] });
    $("subtitle").textContent = "Unable to load live clinic data. Refresh the page to try again.";
  });
})();