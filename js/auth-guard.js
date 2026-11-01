/* js/auth-guard.js - keeps a page for its own role using the API-issued session token.
   Put it in <head> of every page that is not public, BEFORE the other scripts:
     <script src="../../js/auth-guard.js" data-role="staff"></script>
   data-role takes one role or a list: "owner" | "staff" | "vet" | "admin" | "staff,admin".
   - not signed in            -> pages/auth/login.html
   - signed in with a wrong role -> that role's own home page
   Backend: this only hides pages in the browser. The server must still check the role on every request. */
(() => {
  const me = document.currentScript;
  const allowed = String((me && me.dataset.role) || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allowed.length === 1) document.documentElement.dataset.appRole = allowed[0];
  const base = location.pathname.replace(/\/pages\/[^/]*\/[^/]*$/, "/pages/");   // .../pages/
  const HOME = { owner: "owner/dashboard.html", staff: "staff/dashboard.html", vet: "vet/dashboard.html", admin: "admin/dashboard.html" };

  let user = null, token = "";
  for (const store of ["sessionStorage", "localStorage"]) {
    try {
      const u = JSON.parse(window[store].getItem("pawpaw_user") || "null");
      if (!user && u && u.name) user = u;
      token = token || window[store].getItem("token") || window[store].getItem("pawpaw_token") || "";
    } catch (_) { /* ignore */ }
  }
  if (!allowed.length) return;
  document.documentElement.style.visibility = "hidden";                          // no flash of the page while redirecting
  if (!user || !token || token === "demo-token") { location.replace(base + "auth/login.html"); return; }
  if (user.role && allowed.indexOf(user.role) < 0) { location.replace(base + (HOME[user.role] || "auth/login.html")); return; }
  document.documentElement.style.visibility = "";
})();

/* ---- Confirm before logging out (every role) ----
   Any link/button that is #logout, .logout, [data-logout], or whose text is "Log out" asks first.
   "Log out" carries on with the link's normal action (clears the saved user and goes to login);
   "Cancel", Esc or a click outside closes the box and stays on the page. */
(() => {
  const SEL = "#logout, .logout, [data-logout]";
  const TEXT = /^\s*log\s*-?\s*out\s*$/i;
  let box = null, lastFocus = null, confirmed = false;

  function findTrigger(target) {
    if (!target || !target.closest || target.closest(".pp-lo")) return null;   // not the box's own buttons
    const hit = target.closest(SEL);
    if (hit) return hit;
    const el = target.closest("a, button");
    return el && TEXT.test(el.textContent || "") ? el : null;
  }

  function close() {
    if (!box) return;
    box.remove(); box = null;
    document.removeEventListener("keydown", onKey, true);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "Tab" && box) {                       // keep focus inside the box
      const btns = box.querySelectorAll("button");
      const first = btns[0], last = btns[btns.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function ask(trigger) {
    if (box) return;
    lastFocus = trigger;
    if (!document.getElementById("pp-lo-style")) {
      const st = document.createElement("style");
      st.id = "pp-lo-style";
      st.textContent =
        ".pp-lo{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,24,20,.55);font-family:Inter,system-ui,sans-serif}" +
        ".pp-lo-card{width:100%;max-width:380px;background:#fff;color:#1a1a1a;border-radius:14px;padding:24px 24px 20px;box-shadow:0 18px 50px rgba(0,0,0,.35)}" +
        ".pp-lo-card h2{margin:0 0 6px;font-size:18px;font-weight:700}" +
        ".pp-lo-card p{margin:0 0 20px;font-size:14px;line-height:1.45;color:#555}" +
        ".pp-lo-row{display:flex;gap:10px;justify-content:flex-end}" +
        ".pp-lo-row button{font:inherit;font-size:14px;font-weight:600;padding:9px 18px;border-radius:8px;cursor:pointer;border:1px solid #cfd8d5;background:#fff;color:#1a1a1a}" +
        ".pp-lo-row .pp-lo-ok{background:#0f6b5c;border-color:#0f6b5c;color:#fff}" +
        ".pp-lo-row .pp-lo-ok:hover{background:#0b5649}.pp-lo-row button:focus-visible{outline:2px solid #f2d64f;outline-offset:2px}";
      document.head.appendChild(st);
    }
    box = document.createElement("div");
    box.className = "pp-lo";
    box.innerHTML =
      '<div class="pp-lo-card" role="alertdialog" aria-modal="true" aria-labelledby="pp-lo-t" aria-describedby="pp-lo-d">' +
      '<h2 id="pp-lo-t">Log out?</h2><p id="pp-lo-d">Are you sure you want to log out of your account?</p>' +
      '<div class="pp-lo-row"><button type="button" class="pp-lo-cancel">Cancel</button><button type="button" class="pp-lo-ok">Log out</button></div></div>';
    box.addEventListener("click", (e) => { if (e.target === box) close(); });
    box.querySelector(".pp-lo-cancel").addEventListener("click", close);
    box.querySelector(".pp-lo-ok").addEventListener("click", () => {
      const t = trigger;
      close();
      confirmed = true;
      let bearer = "";
      for (const store of [sessionStorage, localStorage]) {
        bearer = bearer || store.getItem("token") || store.getItem("pawpaw_token") || "";
        ["currentUser", "user", "loggedInUser", "loggedUser", "authUser", "userData", "pawpaw_user", "token", "pawpaw_token"].forEach((key) => store.removeItem(key));
      }
      const done = () => t.click();
      if (bearer) {
        fetch("/api/auth/logout", { method: "POST", headers: { Authorization: "Bearer " + bearer } })
          .catch((error) => console.warn("Could not record logout:", error))
          .finally(done);
      } else done();
    });
    document.body.appendChild(box);
    document.addEventListener("keydown", onKey, true);
    box.querySelector(".pp-lo-cancel").focus();
  }

  document.addEventListener("click", (e) => {
    if (confirmed) { confirmed = false; return; }       // the click we re-sent after "Log out"
    const t = findTrigger(e.target);
    if (!t) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    ask(t);
  }, true);
})();

/* ---- Owner sidebar: the profile picture and the name open "My Profile" ----
   Only runs on pages loaded with data-role that includes "owner". No change needed in the HTML:
   it finds .sidebar-user > .avatar and its name (#sidebar-name) and makes them a link to profile.html. */
(() => {
  const me = document.currentScript;
  const roles = String((me && me.dataset.role) || "").split(",").map((s) => s.trim());
  if (roles.indexOf("owner") < 0) return;

  function wire() {
    const box = document.querySelector(".sidebar-user");
    if (!box) return;
    if (!document.getElementById("pp-own-link-style")) {
      const st = document.createElement("style");
      st.id = "pp-own-link-style";
      st.textContent =
        ".sidebar-user .pp-prof-link{cursor:pointer}" +
        ".sidebar-user .avatar.pp-prof-link:hover{box-shadow:0 0 0 2px rgba(255,255,255,.55)}" +
        ".sidebar-user strong.pp-prof-link:hover{text-decoration:underline}" +
        ".sidebar-user .pp-prof-link:focus-visible{outline:2px solid #f2d64f;outline-offset:2px;border-radius:6px}";
      document.head.appendChild(st);
    }
    const go = () => { location.href = "profile.html"; };      // same folder: pages/owner/
    const items = [box.querySelector(".avatar"), box.querySelector("#sidebar-name, .user-meta strong")];
    items.forEach((el) => {
      if (!el || el.classList.contains("pp-prof-link")) return;
      el.classList.add("pp-prof-link");
      el.setAttribute("role", "link");
      el.setAttribute("tabindex", "0");
      el.setAttribute("title", "My Profile");
      el.addEventListener("click", go);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();

/* ---- One look for every button (all roles) ----
   Page CSS gave buttons many different sizes. This marks them and gives each KIND one size:
     pp-act     normal buttons: Cancel / Save / Save Changes / Confirm, header buttons (Go Back, Add User ...),
                dialog buttons, form buttons ...................... 44px high, 150px wide at least
     pp-act-sm  small buttons inside table rows and lists (Edit, Reset password, Deactivate, View and Edit ...)
                ................................................... 34px high
   Not touched: tabs / filter chips, sidebar links, icon buttons (menu, close, eye, calendar), text links.
   Colors stay as each page defines them. Works for dialogs that JS builds later too.
   To change a size everywhere, edit the numbers in the "pp-act-style" block below. */
(() => {
  const WORDS = /^\s*(cancel|save|save changes|confirm|update|reset|deactivate|activate|delete|log out)\s*$/i;
  const BTN = /^(btn|obtn|abtn|pbtn|a-btn|u-btn|sv-btn|o-btn|ve-save|ve-cancel|u-act|ma-btn)$/;            // button class names used in the pages
  const SMALL_TOKEN = /(^|-)sm$|^u-act$|^ma-btn$/;                                          // obtn-sm, btn-sm, u-act, ma-btn
  const NEVER = /tab|chip|pill|nav|menu|date|close|toggle|eye|upload|link|avatar|brand|logo|carousel|dot|arrow|prev|next|cal/i;
  const NEVER_SEL = "[data-close-x], .close, .dlg-x, [aria-label='Close'], .sidebar, nav, .sidebar-user, .pp-lo-card .x";
  const ROWS = "tr, li, [role=row], [class*='row'], .req-actions, .a-actions, .v-actions, .ap-acts";   // buttons in a row of a list
  const FORMLIKE = "form, dialog, [role=dialog], .dlg, .pp-lo";

  function addStyle() {
    if (document.getElementById("pp-act-style")) return;
    const st = document.createElement("style");
    st.id = "pp-act-style";
    const base = "box-sizing:border-box!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;" +
      "width:auto!important;flex:0 0 auto!important;margin-top:0!important;margin-bottom:0!important;line-height:1!important;" +
      "border-radius:8px!important;white-space:nowrap;text-decoration:none!important;cursor:pointer;";
    st.textContent =
      ".pp-act{" + base + "height:44px!important;min-height:44px!important;min-width:150px!important;padding:0 24px!important;font-size:14px!important;font-weight:700!important}" +
      ".pp-act-sm{" + base + "height:34px!important;min-height:34px!important;min-width:0!important;padding:0 14px!important;font-size:13px!important;font-weight:600!important}" +
      ".pp-act[hidden],.pp-act-sm[hidden]{display:none!important}" +          /* keep the hidden attribute working */
      ".pp-act-gap{gap:24px!important}" +
      ".pp-act-center{justify-content:center!important;gap:14px!important}" +
      ".pp-act-center .pp-act{flex:0 1 150px!important;min-width:0!important;padding:0 12px!important;white-space:nowrap}" +   /* 3 buttons in a dialog shrink to fit instead of overflowing */
      "select:not([multiple]):not([size]){-webkit-appearance:none!important;-moz-appearance:none!important;appearance:none!important;" +   /* drop-downs: the arrow sits a little in from the edge */
        "background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%23333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")!important;" +
        "background-repeat:no-repeat!important;background-position:right 16px center!important;background-size:12px 8px!important;padding-right:42px!important;text-overflow:ellipsis}" +
      "select:disabled{opacity:.7}" +
      ".pp-act-bar{display:flex!important;flex-wrap:wrap;justify-content:center!important;align-items:center!important;gap:24px!important;grid-template-columns:none!important}" +
      ".pet-actions.pp-act-bar{display:grid!important;grid-template-columns:1fr 1fr!important;gap:14px!important}" +   /* My Pets cards: View Details and Edit side by side, same size */
      ".pet-actions .pp-act{width:100%!important;min-width:0!important;padding:0 10px!important;white-space:nowrap}" +
      "@media (max-width:600px){.pp-act{flex:1 1 0!important;min-width:0!important;padding:0 14px!important}.pp-act-bar{gap:12px!important}}";
    document.head.appendChild(st);
  }

  function kind(el) {
    if (el.closest(".pp-lo")) return "std";
    if (el.matches(NEVER_SEL) || el.closest("nav, .sidebar, .sidebar-user")) return null;
    const cls = [...el.classList].filter((c) => !/^pp-act/.test(c));
    if (cls.some((c) => NEVER.test(c) && !BTN.test(c))) return null;            // tabs, chips, icon buttons, text links
    const isBtn = cls.some((c) => BTN.test(c));
    const text = (el.textContent || el.value || "").trim();
    if (!isBtn && !WORDS.test(text) && !el.closest(".dlg-actions, .of-actions, [class*='-actions'] ")) return null;
    if (!isBtn && el.tagName === "A") return null;                              // a plain link is not a button
    if (!text && !el.value) return null;                                        // icon-only
    if (cls.some((c) => SMALL_TOKEN.test(c))) return "sm";
    if (el.closest(FORMLIKE) || el.closest("header, .head-row, .page-head, .page-actions, .toolbar")) return "std";   // page header buttons are normal size
    if (el.closest(ROWS)) return "sm";
    return "std";
  }

  function mark(root) {
    (root.querySelectorAll ? root : document).querySelectorAll("button, a[class], input[type=submit]").forEach((el) => {
      if (el.classList.contains("pp-act") || el.classList.contains("pp-act-sm")) return;
      const k = kind(el);
      if (!k) return;
      el.classList.add(k === "sm" ? "pp-act-sm" : "pp-act");
      if (k === "std") {
        const par = el.parentElement;                  // a grid with fixed columns would stretch the buttons
        if (par && par !== document.body) {
          const d = getComputedStyle(par).display;
          if (/grid/.test(d)) par.classList.add("pp-act-bar");
          else if (/flex/.test(d)) par.classList.add(par.closest("dialog, [role=dialog], .pp-lo") ? "pp-act-center" : "pp-act-gap");   // dialogs: buttons in the middle; forms: same space between them
        }
      }
    });
  }

  function start() {
    addStyle();
    mark(document);
    new MutationObserver((list) => {
      for (const m of list) m.addedNodes.forEach((n) => { if (n.nodeType === 1) mark(n.matches && n.matches("button, a") ? n.parentNode || document : n); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();