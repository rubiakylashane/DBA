/* js/staff/profile.js - the signed-in staff member (or admin) edits their own profile (name, email, phone, picture) and can change the password.
   Data: PawAdmin.myProfile() / saveMyProfile() ("pawpaw_admin_profile:<name>", name / email / phone also go to the admin's login account).
   Backend: GET /api/me, PUT /api/me { name, email, phone, photo }, POST /api/me/password { current, new }. */
(() => {
  const A = window.PawAdmin, S = window.PawStaff, $ = (id) => document.getElementById(id);
  const backend = window.PawApi.isBackendSession();
  let me = A.myProfile();
  const f = { name: $("name"), email: $("email"), phone: $("phone"), username: $("username") };
  const fill = () => { f.name.value = me.name; f.email.value = me.email || ""; f.phone.value = me.phone || ""; f.username.value = me.username; };
  fill();
  let profileError = null;
  const profileReady = backend ? window.PawApi.request("/api/auth/me").then(({ user }) => {
    me = { ...me, ...user, accountId: user.userId };
    fill();
  }).catch((error) => { profileError = error; S.toast(error.message); }) : Promise.resolve();
  if (!me.accountId) {                              // demo "staff" sign-in: saving a new username creates a saved account
    const hint = document.querySelector(".oe-user .pf-hint");
    if (hint) hint.textContent = "You signed in with the demo \"staff\" login. Type a username and save to create your staff account - you can log in with it next time.";
  }

  /* picture */
  let photo = me.photo || "";
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

  const KEYS = ["name", "email", "username", "phone", "cur", "new", "conf"];
  KEYS.forEach((k) => $(k).addEventListener("input", () => S.setError(k, "")));

  $("profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await profileReady;
    if (profileError) return;
    const v = { name: f.name.value.trim().replace(/\s+/g, " "), email: f.email.value.trim(), phone: f.phone.value.replace(/[\s-]/g, ""), username: f.username.value.trim().toLowerCase() };
    const cur = $("cur").value, nw = $("new").value, conf = $("conf").value;
    const errors = {};

    if (!v.name) errors.name = "Enter your name.";
    else if (!A.validName(v.name)) errors.name = "Use letters only.";
    if (!v.email) errors.email = "Enter your email address.";
    else if (!A.validEmail(v.email)) errors.email = "Enter a valid email address.";
    else if (!backend && A.emailTaken(v.email, me.accountId)) errors.email = "This email is already used by another account.";
    if (me.accountId || v.username !== me.username.toLowerCase()) {   // the username is what you type to log in
      if (!v.username) errors.username = "Enter a username.";
      else if (!/^[a-z][a-z0-9._]{2,19}$/.test(v.username)) errors.username = "Use 3-20 letters, numbers, dots or underscores, starting with a letter.";
      else if (!backend && A.usernameTaken(v.username, me.accountId || null)) errors.username = "This username is already taken.";
    }
    if (!v.phone) errors.phone = "Enter your phone number.";
    else if (!A.validPhone(v.phone)) errors.phone = "Use a mobile number like 09XXXXXXXXX.";
    if (cur || nw || conf) {            // only checked when you are changing the password
      if (!cur) errors.cur = "Enter your current password.";
      if (nw.length < 8) errors.new = "Use at least 8 characters.";
      if (conf !== nw) errors.conf = "The passwords do not match.";
    }
    KEYS.forEach((k) => S.setError(k, errors[k]));
    const bad = KEYS.find((k) => errors[k]);
    if (bad) { $(bad).focus(); return; }

    if (backend) {
      try {
        if (cur || nw) await window.PawApi.request("/api/auth/me/password", { method: "POST", body: { current: cur, new: nw } });
        await window.PawApi.request("/api/auth/me", { method: "PUT", body: { name: v.name, email: v.email, phone: v.phone, photo, username: v.username } });
      } catch (error) {
        S.setError(cur || nw ? "cur" : "email", error.message);
        S.toast(error.message);
        return;
      }
    }
    A.saveMyProfile({ name: v.name, email: v.email, phone: v.phone, photo, username: v.username }, !!(cur || nw));
    // when the backend is ready: PUT /api/me, and POST /api/me/password if cur / nw were given (the password is never saved here)
    A.setFlash(cur || nw ? "Profile saved. Password updated." : "Profile saved.");
    location.reload();
  });

  S.toast(A.takeFlash());
})();