/* js/staff/owner-edit.js - Edit an owner's profile + change password (owner-edit.html?id=<owner>) */
(() => {
  const O = window.PawOwners, S = window.PawStaff, $ = (id) => document.getElementById(id);
  const id = S.ownerId();
  const back = "owner-details.html?id=" + encodeURIComponent(id);
  const backend = window.PawApi.isBackendSession();

  function initialize() {
  if (!id || !O.exists(id)) { $("owner-form").hidden = true; $("missing").hidden = false; return; }
  $("owner-form").hidden = false;
  $("go-back").href = back; $("cancel").href = back;

  const o = O.owner(id);
  const f = { name: $("name"), email: $("email"), address: $("address"), phone: $("phone") };
  f.name.value = o.name; f.email.value = o.email; f.address.value = o.address; f.phone.value = o.phone;

  /* picture */
  let photo = o.photo || "";
  const preview = $("photo-preview"), hint = $("photo-hint"), removeBtn = $("photo-remove");
  function setPhoto(url) {
    photo = url || "";
    preview.hidden = !photo; hint.hidden = !!photo; removeBtn.hidden = !photo;
    if (photo) preview.src = photo; else preview.removeAttribute("src");
  }
  setPhoto(photo);
  $("photo").addEventListener("change", async () => {
    const file = $("photo").files[0];
    S.setError("photo", "");
    if (!file) return;
    if (!file.type.startsWith("image/")) { $("photo").value = ""; return S.setError("photo", "Please choose an image file."); }
    if (file.size > 5 * 1024 * 1024) { $("photo").value = ""; return S.setError("photo", "Image must be 5 MB or smaller."); }
    try { setPhoto(await S.resize(file)); } catch (e) { S.setError("photo", e.message); }
  });
  removeBtn.addEventListener("click", () => { $("photo").value = ""; setPhoto(""); });

  /* show / hide password: the icon is an eye while the password is hidden, and an eye with a slash while it is showing */
  document.querySelectorAll("[data-eye]").forEach((b) => {
    const input = $(b.dataset.eye), svg = b.querySelector("svg");
    const eye = svg ? svg.innerHTML : "", what = (b.getAttribute("aria-label") || "password").replace(/^(show|hide)\s+/i, "");
    b.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      if (svg) svg.innerHTML = show ? eye + '<path d="M4 4l16 16" stroke-width="2.4"/>' : eye;
      b.setAttribute("aria-pressed", String(show));
      b.setAttribute("aria-label", (show ? "Hide " : "Show ") + what);
    });
  });

  ["name", "email", "phone", "cur", "new", "conf"].forEach((k) => $(k).addEventListener("input", () => S.setError(k, "")));

  $("owner-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = { name: f.name.value.trim().replace(/\s+/g, " "), email: f.email.value.trim(), address: f.address.value.trim(), phone: f.phone.value.replace(/[\s-]/g, "") };
    const cur = $("cur").value, nw = $("new").value, conf = $("conf").value;
    const errors = {};

    if (!v.name) errors.name = "Enter the owner's name.";
    if (v.email && !O.validEmail(v.email)) errors.email = "Enter a valid email address.";
    if (v.phone && !O.validPhone(v.phone)) errors.phone = "Use a mobile number like 09XXXXXXXXX.";
    if (cur || nw || conf) {            // only checked when staff is changing the password
      if (!cur) errors.cur = "Enter the current password.";
      if (nw.length < 8) errors.new = "Use at least 8 characters.";
      if (conf !== nw) errors.conf = "The passwords do not match.";
    }
    ["name", "email", "phone", "cur", "new", "conf"].forEach((k) => S.setError(k, errors[k]));
    const bad = ["name", "email", "phone", "cur", "new", "conf"].find((k) => errors[k]);
    if (bad) { $(bad).focus(); return; }

    const patch = { email: v.email, phone: v.phone, address: v.address, photo };
    if (v.name !== o.name) Object.assign(patch, { name: v.name, firstName: "", middleName: "", lastName: "" });
    else if (!O.owner(id).first) patch.name = v.name;
    const payload = { ...patch };
    if (cur || nw) Object.assign(payload, { currentPassword: cur, newPassword: nw });
    const submit = $("owner-form").querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      if (backend) {
        await window.PawApi.request("/api/owners/" + encodeURIComponent(id), { method: "PATCH", body: payload });
      } else {
        O.saveProfile(id, patch);
      }
    } catch (error) {
      S.toast(error.message || "Owner changes could not be saved.");
      submit.disabled = false;
      return;
    }
    O.saveProfile(id, patch, true);
    O.setFlash(cur || nw ? "Changes saved. Password updated." : "Changes saved.");
    location.href = back;
  });
  }

  if (backend && id) {
    $("owner-form").hidden = true;
    window.PawApi.loadOwners().then(initialize).catch((error) => {
      $("owner-form").hidden = true;
      $("missing").hidden = false;
      S.toast(error.message || "Owner data could not be loaded.");
    });
  } else {
    initialize();
  }
})();