/* js/staff/register-walkin.js - Register Walk-Ins form (shared by the staff and admin pages).
   Registers a walk-in OWNER and gives them an ACCOUNT (username + temporary password). Pets are added later from the Owners and Pets list.
   Temporary password rule (lighter than the normal password rule): at least 6 characters, must contain letters, no spaces.
   Backend: POST /api/owners { name, firstName, middleName, lastName, phone, email, username, password }
   The new owner then shows up in the staff Owners and Pets list, the admin Owners and Pets list, the admin Users and Staff
   list and the admin Audit Log. */
(() => {
  const O = window.PawOwners, S = window.PawStaff, $ = (id) => document.getElementById(id);
  const KEYS = ["first", "middle", "last", "phone", "email", "username", "password"];
  const f = {};
  KEYS.forEach((k) => { f[k] = $(k); });
  const form = $("walkin-form");
  if (!form) return;

  const err = (k, m) => {
    const el = $("err-" + k);
    if (el) { el.textContent = m || ""; el.hidden = !m; }
    if (f[k]) f[k].setAttribute("aria-invalid", m ? "true" : "false");
  };
  KEYS.forEach((k) => {
    if (!f[k]) return;
    f[k].addEventListener("input", () => err(k, ""));
    if (f[k].tagName === "SELECT") f[k].addEventListener("change", () => err(k, ""));
  });

  /* username suggestion: first initial + last name (Juan Dela Cruz -> jdelacruz), until staff types their own */
  let userTouched = false;
  if (f.username) {
    f.username.addEventListener("input", () => { userTouched = f.username.value.trim() !== ""; });
    const suggest = () => {
      if (userTouched) return;
      const first = (f.first.value || "").toLowerCase().replace(/[^a-z]/g, ""), last = (f.last.value || "").toLowerCase().replace(/[^a-z]/g, "");
      f.username.value = first && last ? first[0] + last : "";
    };
    f.first.addEventListener("input", suggest);
    f.last.addEventListener("input", suggest);
  }

  /* show / hide the temporary password */
  const eye = $("pw-eye");
  if (eye && f.password) {
    const svg = eye.querySelector("svg"), open = svg ? svg.innerHTML : "";
    eye.addEventListener("click", () => {
      const show = f.password.type === "password";
      f.password.type = show ? "text" : "password";
      if (svg) svg.innerHTML = show ? open + '<path d="M4 4l16 16" stroke-width="2.4"/>' : open;
      eye.setAttribute("aria-pressed", String(show));
      eye.setAttribute("aria-label", (show ? "Hide" : "Show") + " temporary password");
    });
  }

  const backend = window.PawApi.isBackendSession();
  const clean = (s) => String(s || "").trim().replace(/\s+/g, " ");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    /* a walk-in always needs an account; if the username / password boxes are missing the page is an old cached copy */
    if (!f.username || !f.password) {
      if (S && S.toast) S.toast("This page is out of date. Press Ctrl+F5 to reload it, then try again.");
      return;
    }
    const v = {
      first: clean(f.first.value), middle: clean(f.middle.value), last: clean(f.last.value),
      phone: f.phone.value.replace(/[\s-]/g, ""), email: f.email.value.trim(),
      username: f.username ? f.username.value.trim().toLowerCase() : "", password: f.password ? f.password.value : ""
    };
    const errors = {};
    if (!v.first) errors.first = "Enter the first name.";
    if (!v.last) errors.last = "Enter the last name.";
    if (!v.phone) errors.phone = "Enter the contact number.";
    else if (!O.validPhone(v.phone)) errors.phone = "Use a mobile number like 09XXXXXXXXX.";
    if (v.email && !O.validEmail(v.email)) errors.email = "Enter a valid email address.";
    else if (v.email && !backend && O.emailTaken(v.email)) errors.email = "That email address is already registered.";

    /* owner account */
    if (f.username) {
      if (!v.username) errors.username = "Enter a username for the owner.";
      else if (!O.validUsername(v.username)) errors.username = "Use 3-50 letters, numbers, dots, dashes or underscores.";
      else if (!backend && O.usernameTaken(v.username)) errors.username = "That username is already taken.";
      if (!v.password) errors.password = "Enter a temporary password.";
      else if (O.tempPasswordProblem(v.password)) errors.password = O.TEMP_PASSWORD_RULE;
    }

    KEYS.forEach((k) => err(k, errors[k]));
    const bad = KEYS.find((k) => errors[k]);
    if (bad) { f[bad].focus(); return; }

    const fullName = [v.first, v.middle, v.last].filter(Boolean).join(" ");
    let id;
    const submit = document.querySelector('[type="submit"][form="walkin-form"]') || form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      if (backend) {
        const body = {
          name: fullName, firstName: v.first, middleName: v.middle, lastName: v.last,
          phone: v.phone, email: v.email || null
        };
        body.username = v.username; body.password = v.password;
        const created = await window.PawApi.request("/api/owners", { method: "POST", body });
        id = String(created.id);
        await window.PawApi.loadOwners();
      } else {
        id = O.createWalkin({
          first: v.first, middle: v.middle, last: v.last, phone: v.phone, email: v.email,
          username: f.username ? v.username : "", pet: null
        });
      }
    } catch (error) {
      const msg = error.message || "Walk-in owner could not be registered.";
      /* email is checked first: the server's generic duplicate message mentions both "username" and "email" */
      if (/email/i.test(msg) && !/^that username/i.test(msg)) { err("email", /username/i.test(msg) ? "That email address is already registered." : msg); f.email.focus(); }
      else if (/username/i.test(msg) && f.username) { err("username", msg); f.username.focus(); }
      else if (/temporary password/i.test(msg) && f.password) { err("password", msg); f.password.focus(); }
      else if (S && S.toast) S.toast(msg);
      if (submit) submit.disabled = false;
      return;
    }
    O.setFlash("Walk-in owner registered" + (f.username ? " with account " + v.username : "") + ".");
    location.href = "owners-pets.html";
  });
})();