/* js/auth/login.js
   Handles show/hide password, validation and redirect after API authentication. */
(() => {
  const API = { login: "/api/auth/login" };

  // Where each role lands after login (paths are relative to pages/auth/)
   const HOME = {
    owner: "../owner/dashboard.html",   
    staff: "../staff/dashboard.html",
    vet: "../vet/dashboard.html",
    admin: "../admin/dashboard.html"
  };
  const CHANGE_TEMP_PASSWORD = "change-temp-password.html";

  const $ = (id) => document.getElementById(id);
  const form = $("login-form");
  const username = $("username");
  const password = $("password");
  const submit = form.querySelector(".submit");

  if (username && !username.placeholder) username.placeholder = "Username or email";

  /* ----- Show / hide password ----- */
  const toggle = $("toggle-password");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const show = password.type === "password";
      password.type = show ? "text" : "password";
      toggle.setAttribute("aria-pressed", String(show));
      toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  }

  /* ----- Error message (created here, no HTML change needed) ----- */
  const error = document.createElement("p");
  error.setAttribute("role", "alert");
  error.hidden = true;
  error.style.cssText = "color:#c62828;font-size:12px;margin:0 0 12px;";
  form.insertBefore(error, submit);

  function showError(msg) {
    error.textContent = msg;
    error.hidden = !msg;
  }

  async function login(user, pass) {
    return window.PawApi.request(API.login, {
      method: "POST",
      body: { username: user, identifier: user, password: pass }
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = username.value.trim();
    const pass = password.value;

    username.classList.remove("invalid");
    password.classList.remove("invalid");

    if (!user || !pass) {
      if (!user) username.classList.add("invalid");
      if (!pass) password.classList.add("invalid");
      return showError("Enter your username or email and password.");
    }
    showError("");

    const original = submit.textContent;
    submit.disabled = true;
    submit.textContent = "Logging in...";

    try {
      const data = await login(user, pass);

      try {
        const savedUser = data.user || { name: data.name || user, role: data.role };
        savedUser.name = savedUser.name || data.name || user;
        savedUser.role = savedUser.role || data.role;
        sessionStorage.setItem("pawpaw_user", JSON.stringify(savedUser));
        if (data.token) sessionStorage.setItem("token", data.token);
      } catch (_) { /* storage blocked, ignore */ }

      if (data.mustChangePassword || (data.user && data.user.mustChangePassword)) {
        window.location.href = CHANGE_TEMP_PASSWORD;
        return;
      }
      window.location.href = HOME[data.role] || HOME.owner;
    } catch (err) {
      showError(err.message);
      submit.disabled = false;
      submit.textContent = original;
    }
  });
})();