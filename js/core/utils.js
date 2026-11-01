/* Formatting helpers. Loaded with a normal <script> (no modules). */

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatLongDate(date) {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// "Checked-in" -> "badge-checkedin"
function statusClass(status) {
  return "badge-" + String(status).toLowerCase().replace(/[^a-z]/g, "");
}

function peso(amount) {
  return "₱" + Number(amount).toLocaleString("en-PH");
}