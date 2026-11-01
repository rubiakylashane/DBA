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
      localStorage.setItem("pawpaw_profile:" + key, JSON.stringify({
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

  window.PawApi = {
    request,
    loadOwners,
    token,
    isBackendSession: () => Boolean(token() && token() !== "demo-token")
  };
})()
})();
