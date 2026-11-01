/* js/owner/calendar.js
   Small calendar popup used by the date fields (Date of Birth, Appointment date).
   Replaces the browser's own date picker. Its look (size, colors) is in css/pages/pets.css (.pcal).
   PawCalendar.open({ anchor, value, min, max, onPick })
     anchor : the element the popup opens under (the .pf-date / .ap-date wrapper)
     value  : "YYYY-MM-DD" to highlight (optional)
     min/max: "YYYY-MM-DD" limits (optional)
     onPick : function(iso) called when a day is chosen */
window.PawCalendar = (() => {
  let current = null;

  const pad = (n) => String(n).padStart(2, "0");
  const iso = (y, m, d) => y + "-" + pad(m + 1) + "-" + pad(d);
  const parse = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null; };
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  function close() {
    if (!current) return;
    current.el.remove();
    document.removeEventListener("mousedown", current.onDoc, true);
    document.removeEventListener("keydown", current.onKey, true);
    window.removeEventListener("resize", current.onMove);
    window.removeEventListener("scroll", current.onMove, true);
    const back = current.anchor.querySelector("button");
    current = null;
    if (back) back.focus({ preventScroll: true });
  }

  function open({ anchor, value, min, max, onPick }) {
    if (current) { const same = current.anchor === anchor; close(); if (same) return; }

    const now = new Date();
    const today = iso(now.getFullYear(), now.getMonth(), now.getDate());
    const sel = parse(value);
    const lo = parse(min), hi = parse(max);
    const startYear = lo ? lo.y : Math.min(now.getFullYear() - 40, sel ? sel.y : 9999);
    const endYear = hi ? hi.y : now.getFullYear() + 5;
    let view = sel || (hi && today > max ? hi : lo && today < min ? lo : { y: now.getFullYear(), m: now.getMonth() });
    view = { y: view.y, m: view.m };

    const el = document.createElement("div");
    el.className = "pcal";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Choose a date");

    let mode = "days"; // "days" | "months" | "years"
    const SHORT = MONTHS.map((n) => n.slice(0, 3));
    const ARROW_UP = '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M1 7l4-5 4 5z" fill="currentColor"/></svg>';
    const ARROW_DOWN = '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M1 3l4 5 4-5z" fill="currentColor"/></svg>';
    let yearBase = 0;

    function draw() {
      const selIso = sel ? iso(sel.y, sel.m, sel.d) : "";
      if (mode === "months") {
        el.innerHTML = `
          <div class="pcal-head">
            <button type="button" class="pcal-title" data-mode="years">${view.y}</button>
            <span class="pcal-arrows">
              <button type="button" class="pcal-nav" data-year="-1" aria-label="Previous year"${view.y <= startYear ? " disabled" : ""}>${ARROW_UP}</button>
              <button type="button" class="pcal-nav" data-year="1" aria-label="Next year"${view.y >= endYear ? " disabled" : ""}>${ARROW_DOWN}</button>
            </span>
          </div>
          <div class="pcal-pick">${SHORT.map((n, i) => `<button type="button" class="pcal-cell${i === view.m ? " is-sel" : ""}" data-month="${i}">${n}</button>`).join("")}</div>`;
        return;
      }
      if (mode === "years") {
        const base = yearBase;
        let cells = "";
        for (let y = base; y < base + 12; y++) {
          if (y > endYear || y < startYear) continue; // out-of-range years are hidden, not greyed
          cells += `<button type="button" class="pcal-cell${y === view.y ? " is-sel" : ""}" data-y="${y}">${y}</button>`;
        }
        const laterOk = base + 12 <= endYear, earlierOk = base - 1 >= startYear;
        el.innerHTML = `
          <div class="pcal-head">
            <span class="pcal-title is-static">${Math.max(base, startYear)} – ${Math.min(base + 11, endYear)}</span>
            <span class="pcal-arrows">
              <button type="button" class="pcal-nav" data-page="-1" aria-label="Earlier years"${earlierOk ? "" : " disabled"}>${ARROW_UP}</button>
              <button type="button" class="pcal-nav" data-page="1" aria-label="Later years"${laterOk ? "" : " disabled"}>${ARROW_DOWN}</button>
            </span>
          </div>
          <div class="pcal-pick">${cells}</div>`;
        return;
      }
      const first = new Date(view.y, view.m, 1).getDay();
      const days = new Date(view.y, view.m + 1, 0).getDate();
      const prevOk = !lo || iso(view.y, view.m, 1) > min;
      const nextOk = !hi || iso(view.y, view.m, days) < max;
      let cells = ["Su","Mo","Tu","We","Th","Fr","Sa"].map((d) => `<span class="pcal-dow">${d}</span>`).join("");
      const prevDays = new Date(view.y, view.m, 0).getDate();
      const py = view.m === 0 ? view.y - 1 : view.y, pm = view.m === 0 ? 11 : view.m - 1;
      const ny = view.m === 11 ? view.y + 1 : view.y, nm = view.m === 11 ? 0 : view.m + 1;
      const btn = (v, d, extra) => {
        const off = (min && v < min) || (max && v > max);
        const cls = "pcal-day" + extra + (v === today ? " is-today" : "") + (v === selIso ? " is-sel" : "");
        return `<button type="button" class="${cls}" data-v="${v}"${off ? " disabled" : ""}>${d}</button>`;
      };
      for (let i = first - 1; i >= 0; i--) cells += btn(iso(py, pm, prevDays - i), prevDays - i, " is-other");
      for (let d = 1; d <= days; d++) cells += btn(iso(view.y, view.m, d), d, "");
      const total = first + days, tail = (7 - (total % 7)) % 7;
      for (let d = 1; d <= tail; d++) cells += btn(iso(ny, nm, d), d, " is-other");
      el.innerHTML = `
        <div class="pcal-head">
          <button type="button" class="pcal-title" data-mode="months">${MONTHS[view.m]} ${view.y}</button>
          <span class="pcal-arrows">
            <button type="button" class="pcal-nav" data-nav="-1" aria-label="Previous month"${prevOk ? "" : " disabled"}>${ARROW_UP}</button>
            <button type="button" class="pcal-nav" data-nav="1" aria-label="Next month"${nextOk ? "" : " disabled"}>${ARROW_DOWN}</button>
          </span>
        </div>
        <div class="pcal-grid">${cells}</div>`;
    }

    el.addEventListener("click", (e) => {
      const t = e.target;
      const q = (sel) => { const n = t.closest(sel); return n && el.contains(n) ? n : null; };
      const nav = q("[data-nav]");
      if (nav) {
        view.m += +nav.dataset.nav;
        if (view.m < 0) { view.m = 11; view.y--; } else if (view.m > 11) { view.m = 0; view.y++; }
        draw(); return;
      }
      const md = q("[data-mode]");
      if (md) {
        mode = md.dataset.mode;
        // year list always ends at the latest allowed year (this year), so recent years are never greyed out
        if (mode === "years") {
          yearBase = hi
            ? endYear - 11 - 12 * Math.floor(Math.max(0, endYear - view.y) / 12)   // past dates (birthdays): newest years first
            : startYear + 12 * Math.floor(Math.max(0, view.y - startYear) / 12);   // future dates (appointments): from this year on
        }
        draw(); return;
      }
      const yr = q("[data-year]");
      if (yr) { view.y += +yr.dataset.year; draw(); return; }
      const pg = q("[data-page]");
      if (pg) { yearBase += 12 * +pg.dataset.page; draw(); return; }
      const mo = q("[data-month]");
      if (mo) { view.m = +mo.dataset.month; mode = "days"; draw(); return; }
      const yy = q("[data-y]");
      if (yy) { view.y = +yy.dataset.y; mode = "months"; draw(); return; }
      const day = q("[data-v]");
      if (day && !day.disabled) { const v = day.dataset.v; close(); onPick(v); }
    });

    draw();
    // Attach to <body> with fixed position so no card/overflow/stacking rule can hide or clip it.
    document.body.appendChild(el);
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const w = el.offsetWidth || 264, h = el.offsetHeight || 320;
      let left = Math.min(r.right - w, window.innerWidth - w - 8);
      left = Math.max(8, left);
      let top = r.bottom + 6;
      if (top + h > window.innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
      el.style.cssText += ";position:fixed;z-index:9999;right:auto;left:" + left + "px;top:" + top + "px";
    };
    place();
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    const onDoc = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey, true);
    current = { el, anchor, onDoc, onKey, onMove };
    (el.querySelector(".is-sel, .is-today, .pcal-day:not(:disabled)") || el).focus?.({ preventScroll: true });
  }

  return { open, close };
})();