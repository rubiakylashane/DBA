/* js/admin/register-vet.js - full "Register veterinarian" form (profile + login account with a temporary password). */
(() => {
  const S = window.PawStaff;
  const A = window.PawAdmin, $ = (id) => document.getElementById(id);
  const K = ["name", "phone", "email", "license", "spec", "password"];
  $("spec").innerHTML = `<option value="" selected disabled></option>` + A.SPECS.map((s) => `<option>${A.esc(s)}</option>`).join("");
  const err = (k, m) => { const e = $("err-" + k); e.textContent = m || ""; e.hidden = !m; $(k).setAttribute("aria-invalid", m ? "true" : "false"); };

  $("vet-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const v = { name: $("name").value.trim().replace(/\s+/g, " "), phone: $("phone").value.replace(/[\s-]/g, ""), email: $("email").value.trim(), license: A.normLicense($("license").value), specialization: $("spec").value, password: $("password").value }, e = {};
    if (!v.name) e.name = "Enter the veterinarian's name."; else if (!A.validName(v.name)) e.name = "Use letters only.";
    if (!v.phone) e.phone = "Enter the phone number."; else if (!A.validPhone(v.phone)) e.phone = "Use a mobile number like 09XXXXXXXXX.";
    if (!v.email) e.email = "Enter the email address."; else if (!A.validEmail(v.email)) e.email = "Enter a valid email address."; else if (!window.PawApi.isBackendSession() && (A.emailTaken(v.email) || A.vetEmailTaken(v.email))) e.email = "This email is already used by another account.";
    if (!$("license").value.trim()) e.license = "Enter the license number."; else if (!v.license) e.license = "Use the format PRC 0012345."; else if (!window.PawApi.isBackendSession() && A.licenseTaken(v.license)) e.license = "This license number is already registered.";
    if (!v.specialization) e.spec = "Choose a specialization.";
    if (!v.password) e.password = "Enter a temporary password."; else if (v.password.length < 8) e.password = "Use at least 8 characters.";
    K.forEach((k) => err(k, e[k]));
    const first = K.find((k) => e[k]); if (first) { $(first).focus(); return; }
    let remote = null;
    if (window.PawApi.isBackendSession()) {
      try {
        remote = await window.PawApi.request("/api/admin/veterinarians", {
          method: "POST",
          body: { ...v, username: A.makeUsername(v.name.replace(/^Dr\.?\s*/i, "")), password: v.password }
        });
      } catch (error) {
        S.toast(error.message);
        return;
      }
    }
    const added = A.addVet({
      ...v,
      account: remote ? String(remote.userId) : "new",
      id: remote && String(remote.id),
      username: remote && remote.username
    });
    A.setFlash(added.name + " registered (username: " + (A.list().find((u) => u.id === added.userId) || {}).username + ").");
    location.href = "veterinarians.html";
  });
  K.forEach((k) => $(k).addEventListener("input", () => err(k, "")));
})();