const form = document.getElementById("register-form");
const steps = [...form.querySelectorAll(".step")];
let current = 0;

/* ---------- Step navigation ---------- */
function showStep(i) {
  current = i;
  steps.forEach((s, idx) => (s.hidden = idx !== i));
  const first = steps[i].querySelector("input:not([type=file]), textarea");
  if (first) first.focus();
}

form.querySelectorAll("[data-next]").forEach((btn) =>
  btn.addEventListener("click", () => {
    if (validateStep(steps[current])) showStep(current + 1);
  })
);

form.querySelectorAll("[data-back]").forEach((btn) =>
  btn.addEventListener("click", () => showStep(current - 1))
);

/* ---------- Validation ---------- */
function setError(input, message) {
  const holder = input.closest(".field");
  let el = holder.querySelector(".error");
  if (!message) {
    if (el) el.remove();
    input.removeAttribute("aria-invalid");
    return;
  }
  if (!el) {
    el = document.createElement("p");
    el.className = "error";
    el.setAttribute("role", "alert");
    holder.appendChild(el);
  }
  el.textContent = message;
  input.setAttribute("aria-invalid", "true");
}

function validateStep(step) {
  let ok = true;
  let firstBad = null;

  step.querySelectorAll("input:not([type=file]), textarea").forEach((input) => {
    const value = input.value.trim();
    let message = "";

    if (input.required && !value) {
      message = "This field is required.";
    } else if (input.type === "email" && value && !input.checkValidity()) {
      message = "Enter a valid email address.";
    } else if (input.name === "contact_number" && value &&
               !/^(09|\+639)\d{9}$/.test(value.replace(/\s+/g, ""))) {
      message = "Enter a valid mobile number, e.g. 09XX XXX XXXX.";
    } else if (input.name === "username" && value &&
               !/^[a-zA-Z0-9_]{4,20}$/.test(value)) {
      message = "Use 4 to 20 letters, numbers, or underscores.";
    } else if (input.name === "password" && value && value.length < 8) {
      message = "Use at least 8 characters.";
    } else if (input.name === "confirm_password" && value &&
               value !== form.elements.password.value) {
      message = "Passwords do not match.";
    }

    setError(input, message);
    if (message) {
      ok = false;
      if (!firstBad) firstBad = input;
    }
  });

  if (firstBad) firstBad.focus();
  return ok;
}

form.addEventListener("input", (e) => {
  if (e.target.matches("input, textarea")) setError(e.target, "");
});

/* ---------- Show / hide password ---------- */
document.querySelectorAll("[data-toggle]").forEach((btn) =>
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.toggle);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-pressed", String(show));
    btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
  })
);

/* ---------- Photo preview ---------- */
const photo = document.getElementById("photo");
const preview = document.getElementById("photo-preview");
const hint = document.getElementById("photo-hint");
let photoData = "";

function resizePhoto(file, max = 480) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const ratio = Math.min(1, max / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * ratio);
      canvas.height = Math.round(image.height * ratio);
      const context = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (!context) return reject(new Error("Could not process that image."));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    image.src = url;
  });
}

photo.addEventListener("change", async () => {
  const file = photo.files[0];
  if (!file) {
    photoData = "";
    preview.hidden = true;
    hint.hidden = false;
    return;
  }
  if (!file.type.startsWith("image/")) {
    photo.value = "";
    setError(photo, "Choose an image file.");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    photo.value = "";
    setError(photo, "Image must be 5 MB or smaller.");
    return;
  }
  try {
    photoData = await resizePhoto(file);
    preview.src = photoData;
    preview.hidden = false;
    hint.hidden = true;
    setError(photo, "");
  } catch (error) {
    photo.value = "";
    photoData = "";
    setError(photo, error.message || "Could not read that image.");
  }
});

/* ---------- Submit ---------- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Re-check steps 1 and 2 in case something was skipped
  for (let i = 0; i < 2; i++) {
    if (!validateStep(steps[i])) {
      showStep(i);
      return;
    }
  }

  const btn = form.querySelector('button[type="submit"]');
  let error = form.querySelector('[role="alert"].submit-error');
  if (!error) {
    error = document.createElement("p");
    error.className = "error submit-error";
    error.setAttribute("role", "alert");
    btn.before(error);
  }
  error.textContent = "";
  const name = [
    form.elements.first_name.value.trim(),
    form.elements.middle_name.value.trim(),
    form.elements.last_name.value.trim()
  ].filter(Boolean).join(" ");
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = "Creating account...";
  try {
    await window.PawApi.request("/api/auth/register", {
      method: "POST",
      body: {
        name,
        email: form.elements.email.value.trim(),
        username: form.elements.username.value.trim(),
        password: form.elements.password.value,
        phone: form.elements.contact_number.value.trim(),
        address: form.elements.address.value.trim(),
        photo: photoData || null
      }
    });
    btn.textContent = "Account created!";
    setTimeout(() => (window.location.href = "login.html"), 1200);
  } catch (err) {
    error.textContent = err.message || "Unable to create your account.";
    btn.disabled = false;
    btn.textContent = originalText;
  }
});