/* Sidebar menu per role + icons. Loaded with a normal <script> (no modules). */

const ICONS = {
  home: '<path fill="currentColor" stroke="none" d="M12 3 2 11.5h2.5V21h6v-6h3v6h6v-9.5H22L12 3Z"/>',
  paw: '<g fill="currentColor" stroke="none"><ellipse cx="5" cy="11" rx="2.2" ry="3"/><ellipse cx="9.5" cy="6" rx="2.2" ry="3"/><ellipse cx="14.5" cy="6" rx="2.2" ry="3"/><ellipse cx="19" cy="11" rx="2.2" ry="3"/><path d="M12 11c-3 0-6 3.5-6 6 0 2 1.7 3 3.3 3 1 0 1.8-.5 2.7-.5s1.7.5 2.7.5c1.6 0 3.3-1 3.3-3 0-2.5-3-6-6-6Z"/></g>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  list: '<path stroke-width="2.5" d="M4 7h16M4 12h16M4 17h16"/>',
  file: '<path d="M6 3h8l5 5v13H6V3Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.5 3 8 7.5 9.5 4.5-1.5 7.5-5 7.5-9.5V6L12 3Z"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="8.5" r="1.2" fill="currentColor"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.5 3.5-7 8-7s8 2.5 8 7"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-4 3-6 6.5-6s6.5 2 6.5 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.5.7 3.5 2.7 3.5 6"/>',
  bell: '<path d="M6 17v-6a6 6 0 0 1 12 0v6l2 2H4l2-2ZM10 21h4"/>',
  heart: '<path d="M12 20S3.5 14.5 3.5 8.8A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8.5 1.8C20.5 14.5 12 20 12 20Z"/>',
  chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
};

const LOGOUT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/></svg>';

function icon(name) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || "") + "</svg>";
}

const NAV = {
  owner: [
    { label: "Dashboard", href: "dashboard.html", icon: "home" },
    { label: "My Pets", href: "my-pets.html", icon: "paw" },
    { label: "Book Appointments", href: "book-appointment.html", icon: "calendar" },
    { label: "My Appointments", href: "my-appointments.html", icon: "list" },
    { label: "Medical Records", href: "medical-records.html", icon: "file" },
    { label: "Vaccination History", href: "vaccination-history.html", icon: "shield" },
    { label: "Services", href: "services.html", icon: "tag" },
    { label: "My Profile", href: "profile.html", icon: "user" },
  ],
  staff: [
    { label: "Dashboard", href: "dashboard.html", icon: "home" },
    { label: "Owners and Pets", href: "owners-pets.html", icon: "users" },
    { label: "Appointments", href: "appointments.html", icon: "calendar" },
    { label: "Vaccine Reminders", href: "vaccine-reminders.html", icon: "bell" },
    { label: "Records", href: "records.html", icon: "file" },
    { label: "Services", href: "services.html", icon: "tag" },
  ],
  vet: [
    { label: "Dashboard", href: "dashboard.html", icon: "home" },
    { label: "My Appointments", href: "my-appointments.html", icon: "calendar" },
    { label: "Patient Profiles", href: "patient-profile.html", icon: "paw" },
    { label: "Medical Records", href: "medical-record.html", icon: "file" },
    { label: "Vaccinations", href: "vaccinations.html", icon: "shield" },
    { label: "My Profile", href: "profile.html", icon: "user" },
  ],
  admin: [
    { label: "Dashboard", href: "dashboard.html", icon: "home" },
    { label: "Users and Staff", href: "users-staff.html", icon: "users" },
    { label: "Veterinarians", href: "veterinarians.html", icon: "heart" },
    { label: "Services", href: "services.html", icon: "tag" },
    { label: "Owners and Pets", href: "owners-pets.html", icon: "paw" },
    { label: "Appointments", href: "appointments.html", icon: "calendar" },
    { label: "Audit Log", href: "audit-log.html", icon: "list" },
    { label: "Reports", href: "reports.html", icon: "chart" },
  ],
};