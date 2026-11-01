/* js/owner/services-data.js
   The clinic's service list: ONE place for names, descriptions and prices.
   Used by the Services page and by Book Appointment, so they always agree.
   A service with "options" (vaccination) opens a vaccine list on Book Appointment; its own "price" is the
   "starting" price shown on the Services page. When the backend is ready, fill window.PawServices from the API. */
const backendSession = Boolean(window.PawApi && window.PawApi.isBackendSession());
window.PawServices = backendSession ? [] : [
  { id: "consult", name: "General Consultation", price: 500,
    desc: "A full check of your pet's health with a veterinarian, including advice on diet and care" },
  { id: "vaccination", name: "Vaccination", price: 350,
    desc: "Core and booster vaccines, recorded in your pet's history with the next due date.",
    options: [
      { id: "rabies", name: "Anti Rabies", price: 350 },
      { id: "dhppl", name: "5-in-1 DHPPL", price: 350 },
      { id: "fvrcp", name: "Feline 4-in-1", price: 350 },
      { id: "bordetella", name: "Kennel Cough", price: 350 }
    ] },
  { id: "deworming", name: "Deworming", price: 250,
    desc: "Treatment for common intestinal parasites, with a follow-up schedule when needed" },
  { id: "grooming", name: "Grooming", price: 600,
    desc: "Bath, brush, nail trim, and ear cleaning for a clean and comfortable pet." },
  { id: "dental", name: "Dental Cleaning", price: 1500,
    desc: "Scaling and polishing to keep teeth and gums healthy." },
  { id: "lab", name: "Laboratory Test", price: 900,
    desc: "Blood and other lab work ordered by your veterinarian to support a diagnosis." }
];

/* the admin Services page saves its list in "pawpaw_services": when it exists, owners and staff see that list instead.
   Backend: remove this and fill window.PawServices from GET /api/services. */
if (!backendSession) {
  try {
    const saved = JSON.parse(localStorage.getItem("pawpaw_services") || "null");
    if (Array.isArray(saved) && saved.length) window.PawServices = saved;
  } catch (_) { /* keep the local services list */ }
}