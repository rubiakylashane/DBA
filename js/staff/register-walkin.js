/* js/staff/register-walkin.js - Register Walk-Ins form (shared by the staff and admin pages).
   Registers a walk-in OWNER, gives them an ACCOUNT (username + temporary password) and can add their first PET.
   Temporary password rule (lighter than the normal password rule): at least 6 characters, must contain letters, no spaces.
   Backend: POST /api/owners { name, firstName, middleName, lastName, phone, email, username, password, pet? }
   The new owner then shows up in the staff Owners and Pets list, the admin Owners and Pets list, the admin Users and Staff
   list and the admin Audit Log. */
(() => {
  const O = window.PawOwners, S = window.PawStaff, $ = (id) => document.getElementById(id);
  const isAdminPage = document.body.classList.contains("adm");
  const SPECIES = ["Dog", "Cat", "Rabbit", "Bird", "Hamster", "Guinea Pig", "Chinchilla", "Ferret", "Hedgehog", "Turtle", "Lizard", "Snake", "Fish", "Other"];
  const KEYS = ["first", "middle", "last", "phone", "email", "username", "password", "petName", "petSpecies", "petBreed", "petGender", "petDob"];
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

  /* species list + the pet's date of birth cannot be in the future */
  if (f.petSpecies && f.petSpecies.options.length <= 1) SPECIES.forEach((s) => f.petSpecies.add(new Option(s, s)));
  if (f.petDob) {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    f.petDob.max = d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

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
    const v = {
      first: clean(f.first.value), middle: clean(f.middle.value), last: clean(f.last.value),
      phone: f.phone.value.replace(/[\s-]/g, ""), email: f.email.value.trim(),
      username: f.username ? f.username.value.trim().toLowerCase() : "", password: f.password ? f.password.value : "",
      petName: f.petName ? clean(f.petName.value) : "", petSpecies: f.petSpecies ? f.petSpecies.value : "",
      petBreed: f.petBreed ? clean(f.petBreed.value) : "", petGender: f.petGender ? f.petGender.value : "", petDob: f.petDob ? f.petDob.value : ""
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

    /* the pet is optional, but once any pet detail is filled in the name and species are needed */
    const petTouched = Boolean(v.petName || v.petSpecies || v.petBreed || v.petGender || v.petDob);
    if (petTouched) {
      if (!v.petName) errors.petName = "Enter the pet's name.";
      if (!v.petSpecies) errors.petSpecies = "Choose the species.";
      if (v.petDob && f.petDob.max && v.petDob > f.petDob.max) errors.petDob = "Date of birth cannot be in the future.";
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
        if (f.username) { body.username = v.username; body.password = v.password; }
        if (petTouched) {
          body.pet = { name: v.petName, species: v.petSpecies, breed: v.petBreed || null, gender: v.petGender || null, dateOfBirth: v.petDob || null };
        }
        const created = await window.PawApi.request("/api/owners", { method: "POST", body });
        id = String(created.id);
        await window.PawApi.loadOwners();
      } else {
        id = O.createWalkin({
          first: v.first, middle: v.middle, last: v.last, phone: v.phone, email: v.email,
          username: f.username ? v.username : "",
          pet: petTouched ? { name: v.petName, species: v.petSpecies, breed: v.petBreed, sex: v.petGender, dob: v.petDob, allergies: "", notes: "", photo: "" } : null
        });
      }
    } catch (error) {
      const msg = error.message || "Walk-in owner could not be registered.";
      if (/username/i.test(msg) && f.username) { err("username", msg); f.username.focus(); }
      else if (/email/i.test(msg)) { err("email", msg); f.email.focus(); }
      else if (/temporary password/i.test(msg) && f.password) { err("password", msg); f.password.focus(); }
      else if (S && S.toast) S.toast(msg);
      if (submit) submit.disabled = false;
      return;
    }
    O.setFlash("Walk-in owner registered" + (f.username ? " with account " + v.username : "") + (petTouched ? " and pet " + v.petName : "") + ".");
    location.href = isAdminPage
      ? "owners-pets.html?owner=" + encodeURIComponent(id)
      : "owner-details.html?id=" + encodeURIComponent(id);
  });
})();
