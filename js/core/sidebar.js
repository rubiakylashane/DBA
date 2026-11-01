/* Builds the sidebar from NAV + the role set on <body data-role="...">. */

(function () {
  const root = document.getElementById("sidebar");
  if (!root) return;

  const role = document.body.dataset.role;
  const user = getCurrentUser(role);
  const here = location.pathname.split("/").pop() || "dashboard.html";

  const links = (NAV[role] || [])
    .map((item) => {
      const active = item.href === here;
      return `<a href="${item.href}" class="nav-link${active ? " active" : ""}"${active ? ' aria-current="page"' : ""}>${icon(item.icon)}<span>${item.label}</span></a>`;
    })
    .join("");

  root.innerHTML = `
    <div class="sidebar-brand">
      <img src="../../assets/images/logo.svg" alt="" class="sidebar-logo" />
      <span>PAWPAW Clinic</span>
    </div>
    <nav class="nav">${links}</nav>
    <div class="sidebar-user">
      <div class="avatar"></div>
      <div class="user-meta">
        <strong>${escapeHtml(user.name)}</strong>
        <a href="../auth/login.html" class="logout" id="logout">LOG OUT ${LOGOUT_ICON}</a>
      </div>
    </div>`;

  document.getElementById("logout").addEventListener("click", () => sessionStorage.clear());

  // Mobile drawer
  const menuBtn = document.getElementById("menu-btn");
  const overlay = document.getElementById("overlay");

  function setOpen(open) {
    root.classList.toggle("open", open);
    overlay.classList.toggle("show", open);
    menuBtn.setAttribute("aria-expanded", String(open));
  }

  menuBtn.addEventListener("click", () => setOpen(!root.classList.contains("open")));
  overlay.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => e.key === "Escape" && setOpen(false));
})();