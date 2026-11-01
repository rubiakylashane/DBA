/* js/vet/vet-common.js - shared by the vet pages: who is signed in + small helpers.
   The signed-in vet is matched to a veterinarian by name ("Dr. Reyes" -> "Dr. Jose Reyes").
   If no name matches (for example the demo login "vet"), the vet sees every assigned patient.
   Backend: the server knows the vet from the token and returns only that vet's appointments. */
window.PawVet = (() => {
  const A = window.PawStaffAppts, O = window.PawOwners;
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const today = () => iso(new Date());

  let login = "";
  for (const st of ["sessionStorage", "localStorage"]) {
    try { const u = JSON.parse(window[st].getItem("pawpaw_user") || "null"); if (u && u.name) { login = String(u.name).trim(); break; } } catch (_) { /* ignore */ }
  }
  const words = login.toLowerCase().split(/[\s_.-]+/);
  const mine = A.VETS.find((v) => words.some((w) => w.length > 2 && w !== "dr" && v.toLowerCase().includes(w))) || null;
  let profName = "";
  try { const pf = JSON.parse(localStorage.getItem("pawpaw_vet_profile:" + login.toLowerCase()) || "null"); if (pf && pf.name) profName = String(pf.name).replace(/^Dr\.?\s+/i, ""); } catch (_) { /* ignore */ }
  const display = profName ? "Dr. " + profName.split(" ").pop() : mine ? "Dr. " + mine.replace(/^Dr\.\s*/, "").split(" ").pop() : (login || "Doctor");
  const hour = new Date().getHours();
  const greeting = (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening") + ", " + display;

  const LABEL = { confirmed: "Approved", checked_in: "Checked in", with_vet: "In Progress", completed: "Completed" };
  const label = (a) => LABEL[a.status] || A.STATUS[a.status] || a.status;
  const SHOWN = ["confirmed", "checked_in", "with_vet", "completed"];
  const visible = (a) => SHOWN.indexOf(a.status) >= 0 && a.vet && a.vet !== A.TBA && (A.backend || !mine || a.vet === mine);

  const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const fmtShort = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const fmtMD = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const fmtTime = (t) => { const [h, m] = String(t || "00:00").split(":").map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }); };
  const ownerName = (a) => { try { return O.owner(a.owner || a).short; } catch (_) { return a.owner || String(a); } };
  const petName = (a) => a.petName || a.pet || "-";
  const services = (a) => (a.services || []).map((s) => s.name).join(", ") || a.service || "-";
  const stamp = (a) => (a.date || "") + " " + (a.time || "");
  const recQuery = (a) => "appt=" + encodeURIComponent(a.owner + "|" + a.id);   // opens the record editor of this appointment
  const patientQuery = (a) => "owner=" + encodeURIComponent(a.owner) + "&petid=" + encodeURIComponent(a.petId || "") + "&pet=" + encodeURIComponent(petName(a));
  const recordHref = (a) => "medical-records.html?" + recQuery(a);
  const hasRecord = (a) => ((readJson("pawpaw_records:" + a.owner, { visits: [] }) || {}).visits || []).some((r) => r.apptId === a.id);
  const readJson = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (_) { return d; } };

  return { A, O, mine, display, greeting, visible, today, iso, label, fmtDate, fmtShort, fmtMD, fmtTime, ownerName, petName, services, stamp, recQuery, recordHref, hasRecord, patientQuery, readJson };
})();