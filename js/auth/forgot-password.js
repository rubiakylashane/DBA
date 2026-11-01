/* js/auth/forgot-password.js
   Password recovery uses the configured backend email provider. */
(() => {
  const API = {
    sendOtp: "/api/forgot-password/send-otp",     // POST { email }
    verifyOtp: "/api/forgot-password/verify-otp", // POST { email, otp }
    reset: "/api/forgot-password/reset"           // POST { email, otp, password }
  };
  const RESEND_SECONDS = 60;

  const $ = (id) => document.getElementById(id);
  const stepIds = ["step-1", "step-2", "step-3", "step-done"];
  const state = { email: "", otp: "" };
  let resendTimer = null;

  function showStep(id) {
    stepIds.forEach((s) => { $(s).hidden = s !== id; });
  }

  function setError(el, message) {
    el.textContent = message || "";
    el.hidden = !message;
  }

  async function post(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || "Something went wrong. Please try again.");
    return data;
  }

  function normalizeEmail(value) {
    const email = value.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  }

  function maskEmail(email) {
    const [local, domain] = email.split("@");
    const visible = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);
    return `${visible}•••@${domain}`;
  }

  function startCooldown() {
    const btn = $("resend-btn");
    let left = RESEND_SECONDS;
    btn.disabled = true;
    btn.textContent = `Resend in ${left}s`;
    clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(resendTimer);
        btn.disabled = false;
        btn.textContent = "Resend code";
      } else {
        btn.textContent = `Resend in ${left}s`;
      }
    }, 1000);
  }

  async function sendOtp(email) {
    return post(API.sendOtp, { email });
  }

  function withLoading(btn, loadingText, fn) {
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = loadingText;
    return fn().finally(() => {
      btn.disabled = false;
      btn.textContent = original;
    });
  }

  /* Step 1: email address */
  $("contact-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("email");
    const email = normalizeEmail(input.value);
    if (!email) {
      input.classList.add("invalid");
      return setError($("email-error"), "Enter a valid email address.");
    }
    input.classList.remove("invalid");
    setError($("email-error"), "");

    await withLoading($("contact-submit"), "Sending...", async () => {
      try {
        await sendOtp(email);
        state.email = email;
        $("masked-email").textContent = maskEmail(email);
        showStep("step-2");
        $("otp").focus();
        startCooldown();
      } catch (err) {
        input.classList.add("invalid");
        setError($("email-error"), err.message);
      }
    });
  });

  /* Step 2: OTP */
  $("otp").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "");
  });

  $("otp-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("otp");
    const otp = input.value.trim();
    if (otp.length !== 6) {
      input.classList.add("invalid");
      return setError($("otp-error"), "Enter the 6-digit code.");
    }
    input.classList.remove("invalid");
    setError($("otp-error"), "");

    await withLoading($("otp-submit"), "Verifying...", async () => {
      try {
        await post(API.verifyOtp, { email: state.email, otp });
        state.otp = otp;
        showStep("step-3");
        $("new-password").focus();
      } catch (err) {
        input.classList.add("invalid");
        setError($("otp-error"), err.message);
      }
    });
  });

  $("resend-btn").addEventListener("click", async () => {
    try {
      await sendOtp(state.email);
      setError($("otp-error"), "");
      startCooldown();
    } catch (err) {
      setError($("otp-error"), err.message);
    }
  });

  /* Step 3: new password */
  document.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = $(btn.dataset.toggle);
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-pressed", String(show));
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });

  $("reset-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const p1 = $("new-password");
    const p2 = $("confirm-password");
    [p1, p2].forEach((i) => i.classList.remove("invalid"));

    let msg = "";
    if (p1.value.length < 8) {
      msg = "Password must be at least 8 characters.";
      p1.classList.add("invalid");
    } else if (!/[A-Za-z]/.test(p1.value) || !/\d/.test(p1.value)) {
      msg = "Use at least one letter and one number.";
      p1.classList.add("invalid");
    } else if (p1.value !== p2.value) {
      msg = "Passwords do not match.";
      p2.classList.add("invalid");
    }
    setError($("reset-error"), msg);
    if (msg) return;

    await withLoading($("reset-submit"), "Saving...", async () => {
      try {
        await post(API.reset, { email: state.email, otp: state.otp, password: p1.value });
        showStep("step-done");
      } catch (err) {
        setError($("reset-error"), err.message);
      }
    });
  });
})();