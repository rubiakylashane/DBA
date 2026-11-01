(() => {
  const API_BASE = "";
  const TOKEN_KEYS = ["token", "pawpaw_token"];

(() => {
  const TOKEN_KEYS = ["token", "pawpaw_token"];

  function token() {
    for (const store of [sessionStorage, localStorage]) {
      for (const key of TOKEN_KEYS) {
        const value = store.getItem(key);
        if (value) return value;
      }
    }
    return "";
  }

  async function request(url, options = {}) {
    const headers = new Headers(options.headers || {});
    const body = options.body;
    if (body !== undefined && !(body instanceof FormData)) headers.set("Content-Type", "application/json");
    const bearer = token();
    if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
    const fullUrl = /^https?:\/\//i.test(url) ? url : API_BASE + url;
    const response = await fetch(fullUrl, {
      ...options,
      headers,
      body: body === undefined || body instanceof FormData || typeof body === "string" ? body : JSON.stringify(body)
    });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) {
      const message = data && typeof data === "object" ? data.error || data.message : "";
      throw new Error(message || `Request failed (${response.status}).`);
    }
    return data;
  }

  async function loadOwners() {
    const data = await request("/api/owners");
    const statuses = {};
    for (const owner of data) {
      const key = String(owner.id);
      statuses[key] = owner.account_status === "Inactive" ? "inactive" : "active";
      /* use the saved first / middle / last name only while they still add up to the owner's name (so "Dela Cruz" stays one surname) */
      const joined = [owner.first_name, owner.middle_name, owner.last_name].filter(Boolean).join(" ");
      const split = joined && joined === owner.name ? { firstName: owner.first_name || "", middleName: owner.middle_name || "", lastName: owner.last_name || "" } : {};
      localStorage.setItem("pawpaw_profile:" + key, JSON.stringify({
        ...split,
        name: owner.name,
        email: owner.email || "",
        phone: owner.phone || "",
        address: owner.address || "",
        photo: owner.profile_photo || "",
        memberSince: owner.registration_date || ""
      }));
      localStorage.setItem("pawpaw_pets:" + key, JSON.stringify((owner.pets || []).map((pet) => ({
        ...pet,
        id: String(pet.id),
        dob: pet.date_of_birth,
        sex: pet.gender || "",
        status: pet.is_active ? "active" : "inactive"
      }))));
    }
    localStorage.setItem("pawpaw_owner_status", JSON.stringify(statuses));
    return data;
  }

  /* One password rule for every form: 8+ characters with an uppercase letter, a lowercase letter, a number and a symbol; no spaces. */
  window.PawPassword = {
    RULE: "Use at least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol (e.g. ! @ # $).",
    problem(value) {
      const p = String(value || "");
      return p.length >= 8 && p.length <= 200 && !/\s/.test(p) && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9\s]/.test(p) ? "" : this.RULE;
    }
  };

  window.PawApi = {
    request,
    loadOwners,
    token,
    isBackendSession: () => Boolean(token() && token() !== "demo-token")
  };
})()
})();