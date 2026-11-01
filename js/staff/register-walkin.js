/* js/staff/register-walkin.js - Register Walk-Ins form */
(() => {
  const O = window.PawOwners, S = window.PawStaff, $ = (id) => document.getElementById(id);
  const f = { first: $("first"), middle: $("middle"), last: $("last"), phone: $("phone"), email: $("email") };
  const err = (k, m) => {
    const el = $("err-" + k);
    if (el) { el.textContent = m || ""; el.hidden = !m; }
    f[k].setAttribute("aria-invalid", m ? "true" : "false");
  };
  Object.keys(f).forEach((k) => f[k].addEventListener("input", () => err(k, "")));

  const backend = window.PawApi.isBackendSession();
  $("walkin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = {
      first: f.first.value.trim().replace(/\s+/g, " "), middle: f.middle.value.trim().replace(/\s+/g, " "),
      last: f.last.value.trim().replace(/\s+/g, " "), phone: f.phone.value.replace(/[\s-]/g, ""), email: f.email.value.trim()
    };
    const errors = {};
    if (!v.first) errors.first = "Enter the first name.";
    if (!v.last) errors.last = "Enter the last name.";
    if (!v.phone) errors.phone = "Enter the contact number.";
    else if (!O.validPhone(v.phone)) errors.phone = "Use a mobile number like 09XXXXXXXXX.";
    if (v.email && !O.validEmail(v.email)) errors.email = "Enter a valid email address.";

    Object.keys(f).forEach((k) => err(k, errors[k]));
    const bad = Object.keys(errors)[0];
    if (bad) { f[bad].focus(); return; }

    let id;
    const submit = $("walkin-form").querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      if (backend) {
        const created = await window.PawApi.request("/api/owners", {
          method: "POST",
          body: { name: [v.first, v.middle, v.last].filter(Boolean).join(" "), phone: v.phone, email: v.email || null }
        });
        id = String(created.id);
        await window.PawApi.loadOwners();
      } else {
        id = O.createWalkin(v);
      }
    } catch (error) {
      S.toast(error.message || "Walk-in owner could not be registered.");
      submit.disabled = false;
      return;
    }
    O.setFlash("Walk-in owner registered.");
    location.href = "owner-details.html?id=" + encodeURIComponent(id);
  });
})();
