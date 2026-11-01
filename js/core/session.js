/* Who is signed in?  Works with YOUR existing login/register.
   The dashboard only calls getCurrentUser(), loadUserData(), and clearSession().
   If your login saves the user somewhere else, edit readSignedInUser() / SESSION_KEYS only. */

// Storage keys that your login might use (checked in sessionStorage first, then localStorage)
const SESSION_KEYS = ["currentUser", "user", "loggedInUser", "loggedUser", "authUser", "userData", "pawpaw_user"];

function pick(obj, names) {
  for (const n of names) if (obj && obj[n]) return String(obj[n]).trim();
  return "";
}

// Returns the raw saved user (an object), or null.
function readSignedInUser() {
  for (const store of [sessionStorage, localStorage]) {
    for (const key of SESSION_KEYS) {
      const raw = store.getItem(key);
      if (!raw) continue;
      let data;
      try { data = JSON.parse(raw); } catch (e) { data = raw; }
      if (data && typeof data === "object") {
        return data.user && typeof data.user === "object" ? data.user : data; // also handles { user: {...} }
      }
      if (typeof data === "string") return { name: data }; // only a name/username was saved
    }
  }
  return null;
}

// Normalised user: { id, firstName, name, photo, role } or null.
function getCurrentUser() {
  const raw = readSignedInUser();
  if (!raw) return null;

  const first = pick(raw, ["firstName", "first_name", "firstname", "fname", "first"]);
  const last = pick(raw, ["lastName", "last_name", "lastname", "lname", "last"]);
  const username = pick(raw, ["username", "userName", "user_name"]);
  const name =
    [first, last].filter(Boolean).join(" ") ||
    pick(raw, ["fullName", "full_name", "name"]) ||
    username ||
    "User";

  return {
    id: pick(raw, ["id", "user_id", "userId", "owner_id"]) || username || pick(raw, ["email"]) || name,
    firstName: first || name.split(" ")[0],
    name,
    photo: pick(raw, ["photo", "profilePhoto", "profile_photo", "avatar", "image", "picture"]),
    role: pick(raw, ["role"]),
  };
}

// Pets, appointments and vaccinations of this user.
// TODO: replace with a request to your backend. Shapes:
//   pets:         { name, species, breed, photo? }
//   appointments: { when: ISO date-time, pet, vet, services, status }   status: Approved | Checked-in | Pending | ...
//   vaccinations: { pet, vaccine, nextDue: ISO date }
function loadUserData(userId) {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("pawpaw_data_" + userId)); } catch (e) {}
  return Object.assign({ pets: [], appointments: [], vaccinations: [] }, saved);
}

function clearSession() {
  for (const store of [sessionStorage, localStorage]) {
    SESSION_KEYS.forEach((k) => store.removeItem(k));
    store.removeItem("token");
    store.removeItem("pawpaw_token");
  }
}