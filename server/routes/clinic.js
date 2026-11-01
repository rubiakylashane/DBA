const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncRoute, notFound, requiredString } = require('../utils/http');
const { requireStrongPassword, requireTemporaryPassword } = require('../utils/password');

/* Diagnosis is only required for clinical visits (consultation, laboratory, dental). Vaccination, deworming and grooming visits may leave it blank. */
async function resolveDiagnosis(queryable, appointmentId, value) {
  const found = await queryable.query(
    `SELECT COALESCE(bool_or(sv.service_name ~* '(consult|laborator|dental)'), true) AS required
       FROM appointment a
       LEFT JOIN appointment_service aps ON aps.appointment_id = a.appointment_id
       LEFT JOIN service sv ON sv.service_id = aps.service_id
      WHERE a.appointment_id = $1`,
    [appointmentId]
  );
  if (found.rows[0] && found.rows[0].required === false) {
    const text = String(value || '').trim();
    if (text.length > 10000) throw Object.assign(new Error('Diagnosis is too long.'), { status: 400 });
    return text || null;
  }
  return requiredString(value, 'Diagnosis', 10000);
}

const router = express.Router();
const UI_ROLES = {
  'Pet Owner': 'owner',
  Veterinarian: 'vet',
  Staff: 'staff',
  Admin: 'admin'
};
const DB_ROLES = Object.fromEntries(Object.entries(UI_ROLES).map(([dbRole, uiRole]) => [uiRole, dbRole]));
const APPOINTMENT_STATUS = {
  pending: 'Pending',
  confirmed: 'Approved',
  scheduled: 'Scheduled',
  checked_in: 'Checked-in',
  with_vet: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show'
};
// The schema has no service status column; keep the original description after this private prefix.
const INACTIVE_SERVICE_MARKER = '[PAWPAW-SERVICE-INACTIVE]\n';
const UI_APPOINTMENT_STATUS = {
  ...Object.fromEntries(Object.entries(APPOINTMENT_STATUS).map(([ui, dbStatus]) => [dbStatus, ui])),
  Scheduled: 'confirmed',
  Approved: 'confirmed'
};

router.use(authenticate);

function mapAppointment(row) {
  return {
    id: row.appointment_id,
    appointmentId: row.appointment_id,
    owner: row.owner_id,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    petId: row.pet_id,
    petName: row.pet_name,
    date: row.appointment_date,
    time: row.appointment_time,
    reason: row.reason || '',
    declineReason: row.cancellation_reason || '',
    rescheduleReason: row.reschedule_reason || '',
    rescheduledFrom: row.rescheduled_from_date ? { date: row.rescheduled_from_date, time: row.rescheduled_from_time } : null,
    status: UI_APPOINTMENT_STATUS[row.status] || row.status,
    vet: row.veterinarian_name || 'To be assigned',
    veterinarianId: row.veterinarian_id,
    services: row.services || [],
    total: Number(row.total || 0),
    createdAt: row.created_date,
    updatedAt: row.updated_date
  };
}

const APPOINTMENT_SELECT = `
  SELECT a.appointment_id, a.pet_id, p.owner_id, p.name AS pet_name,
         o.name AS owner_name, a.veterinarian_id, v.name AS veterinarian_name,
         a.appointment_date::text, to_char(a.appointment_time, 'HH24:MI') AS appointment_time,
         a.reason, a.status, a.created_date, a.updated_date,
         a.cancellation_reason, a.reschedule_reason,
         a.rescheduled_from_date::text, to_char(a.rescheduled_from_time, 'HH24:MI') AS rescheduled_from_time,
         COALESCE(s.services, '[]'::json) AS services,
         COALESCE(s.total, 0) AS total
    FROM appointment a
    JOIN pet p ON p.pet_id = a.pet_id
    JOIN owner o ON o.owner_id = p.owner_id
    LEFT JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
               'id', sv.service_id,
               'name', sv.service_name,
               'price', COALESCE(aps.unit_price, sv.price),
               'quantity', aps.quantity
             ) ORDER BY sv.service_name) AS services,
             SUM(COALESCE(aps.unit_price, sv.price) * aps.quantity) AS total
        FROM appointment_service aps
        JOIN service sv ON sv.service_id = aps.service_id
       WHERE aps.appointment_id = a.appointment_id
    ) s ON TRUE`;

async function audit(client, userId, action, table, recordId, description) {
  await client.query(
    `INSERT INTO audit_log
       (user_id, action_type, table_name, record_id, action_description)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId || null, action, table, recordId || null, description]
  );
}

async function notify(client, userId, type, title, message) {
  if (!userId) return;
  await client.query(
    `INSERT INTO notification (user_id, notification_type, title, message)
     VALUES ($1, $2, $3, $4)`,
    [userId, type, title, message]
  );
}

/* Staff and admin accounts had no notifications at all: tell every active Staff / Admin user (except the person who did it). */
async function notifyStaff(client, type, title, message, exceptUserId = null) {
  await client.query(
    `INSERT INTO notification (user_id, notification_type, title, message)
     SELECT user_id, $1, $2, $3 FROM user_account
      WHERE role IN ('Staff', 'Admin') AND account_status = 'Active'
        AND ($4::int IS NULL OR user_id <> $4::int)`,
    [type, title, message, exceptUserId]
  );
}

function validAppointmentDate(value) {
  const date = String(value || '');
  const parsed = new Date(`${date}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date)
    && !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === date;
}

async function getAppointments({ userId, role, ownerId, status } = {}) {
  const clauses = [];
  const values = [];
  if (role === 'vet') {
    values.push(userId);
    clauses.push(`v.user_id = $${values.length}`);
  }
  if (role === 'owner') {
    values.push(ownerId);
    clauses.push(`p.owner_id = $${values.length}`);
  }
  if (status) {
    values.push(status);
    clauses.push(`a.status = $${values.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await db.query(
    `${APPOINTMENT_SELECT}
      ${where}
     ORDER BY a.appointment_date, a.appointment_time, a.appointment_id`,
    values
  );
  return result.rows.map(mapAppointment);
}

router.get('/me', asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT user_id, role FROM user_account
      WHERE user_id = $1 AND account_status = 'Active'`,
    [req.user.userId]
  );
  if (!result.rows[0]) return notFound(res, 'Account not found.');
  return res.json({ userId: result.rows[0].user_id, role: UI_ROLES[result.rows[0].role] });
}));

router.get('/admin/users', authorize('Admin'), asyncRoute(async (req, res) => {
  const role = req.query.role ? DB_ROLES[String(req.query.role).toLowerCase()] : null;
  const result = await db.query(
    `SELECT u.user_id AS id, u.user_id, u.username, u.display_name AS name, u.email, u.phone,
            u.role, u.account_status, u.created_date,
            o.owner_id, o.address, o.registration_date,
            v.veterinarian_id, v.specialization, v.license_number
       FROM user_account u
       LEFT JOIN owner o ON o.user_id = u.user_id
       LEFT JOIN veterinarian v ON v.user_id = u.user_id
      WHERE ($1::text IS NULL OR u.role = $1)
      ORDER BY u.created_date DESC, u.user_id DESC`,
    [role]
  );
  return res.json(result.rows.map((row) => ({
    ...row,
    role: UI_ROLES[row.role],
    status: row.account_status.toLowerCase(),
    createdAt: row.created_date,
    mustChange: false
  })));
}));

router.post('/admin/users', authorize('Admin'), asyncRoute(async (req, res) => {
  const name = requiredString(req.body.name, 'Name', 100);
  const email = requiredString(req.body.email, 'Email', 100).toLowerCase();
  const role = DB_ROLES[String(req.body.role || '').toLowerCase()];
  const password = requiredString(req.body.password || req.body.temporaryPassword, 'Temporary password', 200);
  if (!role || role === 'Veterinarian') return res.status(400).json({ error: 'Choose Owner, Staff, or Admin. Add veterinarians from the Veterinarians page.' });
  requireStrongPassword(password);
  const username = (req.body.username || name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')).slice(0, 50);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query(
      `INSERT INTO user_account
         (username, password_hash, role, email, phone, display_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING user_id, username, role, email, phone, display_name, account_status, created_date`,
      [username, await bcrypt.hash(password, 12), role, email, req.body.phone || null, name]
    );
    if (role === 'Pet Owner') {
      await client.query(
        `INSERT INTO owner (user_id, name, email, phone, address)
         VALUES ($1, $2, $3, $4, $5)`,
        [account.rows[0].user_id, name, email, req.body.phone || null, req.body.address || null]
      );
    }
    await audit(client, req.user.userId, 'INSERT', 'user_account', account.rows[0].user_id, `Created ${role} account ${username}.`);
    await client.query('COMMIT');
    return res.status(201).json({ ...account.rows[0], role: UI_ROLES[role], status: 'active', createdAt: account.rows[0].created_date });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.patch('/admin/users/:id', authorize('Admin'), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid user ID.' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT user_id, role, account_status FROM user_account
        WHERE user_id = $1 FOR UPDATE`,
      [id]
    );
    if (!current.rows[0]) {
      await client.query('ROLLBACK');
      return notFound(res, 'User not found.');
    }
    const before = current.rows[0];
    if (req.body.status !== undefined && !['active', 'inactive'].includes(String(req.body.status).toLowerCase())) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Status must be active or inactive.' });
    }
    const role = req.body.role === undefined ? before.role : DB_ROLES[String(req.body.role).toLowerCase()];
    const status = req.body.status === undefined ? before.account_status : String(req.body.status).toLowerCase() === 'active' ? 'Active' : 'Inactive';
    if (!role) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid user role.' });
    }
    if (id === req.user.userId && status !== 'Active') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'You cannot deactivate your own account.' });
    }
    if (before.role === 'Admin' && role !== 'Admin' && before.account_status === 'Active') {
      const activeAdmins = await client.query(
        `SELECT count(*)::int AS count FROM user_account
          WHERE role = 'Admin' AND account_status = 'Active' AND user_id <> $1`,
        [id]
      );
      if (activeAdmins.rows[0].count < 1) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'The only active administrator cannot be demoted.' });
      }
    }
    if (before.role === 'Admin' && status !== 'Active' && before.account_status === 'Active') {
      const activeAdmins = await client.query(
        `SELECT count(*)::int AS count FROM user_account
          WHERE role = 'Admin' AND account_status = 'Active' AND user_id <> $1`,
        [id]
      );
      if (activeAdmins.rows[0].count < 1) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'The only active administrator cannot be deactivated.' });
      }
    }
    const result = await client.query(
      `UPDATE user_account
          SET role = $2, account_status = $3,
              display_name = COALESCE($4, display_name),
              email = COALESCE($5, email),
              phone = COALESCE($6, phone)
        WHERE user_id = $1
        RETURNING user_id AS id, username, role, account_status, display_name AS name, email, phone, created_date`,
      [id, role, status, req.body.name || null, req.body.email || null, req.body.phone || null]
    );
    if (role === 'Pet Owner') {
      await client.query(
        `UPDATE owner SET name = COALESCE($2, name), email = COALESCE($3, email),
                phone = COALESCE($4, phone)
          WHERE user_id = $1`,
        [id, req.body.name || null, req.body.email || null, req.body.phone || null]
      );
      await client.query(
        `INSERT INTO owner (user_id, name, email, phone)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO NOTHING`,
        [id, req.body.name || result.rows[0].name || result.rows[0].username, req.body.email || result.rows[0].email, req.body.phone || result.rows[0].phone]
      );
    } else if (role === 'Veterinarian') {
      await client.query(
        `UPDATE veterinarian SET name = COALESCE($2, name), email = COALESCE($3, email),
                phone = COALESCE($4, phone)
          WHERE user_id = $1`,
        [id, req.body.name || null, req.body.email || null, req.body.phone || null]
      );
      await client.query(
        `INSERT INTO veterinarian (user_id, name, email, phone)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO NOTHING`,
        [id, req.body.name || result.rows[0].name || result.rows[0].username, req.body.email || result.rows[0].email, req.body.phone || result.rows[0].phone]
      );
    }
    const statusVerb = before.account_status === 'Active' && status !== 'Active' ? 'Deactivated' : before.account_status !== 'Active' && status === 'Active' ? 'Activated' : 'Updated';
    await audit(client, req.user.userId, 'UPDATE', 'user_account', id, `${statusVerb} account ${result.rows[0].username}.`);
    await client.query('COMMIT');
    return res.json({ ...result.rows[0], role: UI_ROLES[role], status: status.toLowerCase(), createdAt: result.rows[0].created_date });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/admin/users/:id/reset-password', authorize('Admin'), asyncRoute(async (req, res) => {
  const password = requiredString(req.body.temporaryPassword || req.body.password, 'Temporary password', 200);
  requireStrongPassword(password);
  const result = await db.query(
    `UPDATE user_account
        SET password_hash = $2
      WHERE user_id = $1
      RETURNING user_id, username`,
    [req.params.id, await bcrypt.hash(password, 12)]
  );
  if (!result.rows[0]) return notFound(res, 'User not found.');
  await db.query(
    `INSERT INTO audit_log (user_id, action_type, table_name, record_id, action_description)
     VALUES ($1, 'UPDATE', 'user_account', $2, $3)`,
    [req.user.userId, result.rows[0].user_id, `Reset password for ${result.rows[0].username}.`]
  );
  return res.json({ message: 'Password updated.' });
}));

router.get('/admin/veterinarians', authorize('Admin'), asyncRoute(async (_req, res) => {
  const result = await db.query(
    `SELECT v.veterinarian_id AS id, v.veterinarian_id, v.user_id AS "userId",
            v.name, v.specialization, v.license_number AS license, v.phone, v.email,
            u.username, u.account_status
       FROM veterinarian v
       LEFT JOIN user_account u ON u.user_id = v.user_id
      ORDER BY v.name`
  );
  return res.json(result.rows.map((v) => ({ ...v, status: (v.account_status || 'Active').toLowerCase() })));
}));

router.get(['/veterinarians', '/vets'], authorize('Admin', 'Staff', 'Veterinarian', 'Pet Owner'), asyncRoute(async (_req, res) => {
  const result = await db.query(
    `SELECT v.veterinarian_id AS id, v.veterinarian_id, v.user_id AS "userId",
            v.name, v.specialization, v.license_number AS license, v.phone, v.email,
            u.username, u.account_status
       FROM veterinarian v
       JOIN user_account u ON u.user_id = v.user_id
      WHERE u.role = 'Veterinarian' AND u.account_status = 'Active'
      ORDER BY v.name`
  );
  return res.json(result.rows.map((v) => ({ ...v, status: 'active' })));
}));

router.post('/admin/veterinarians', authorize('Admin'), asyncRoute(async (req, res) => {
  const name = requiredString(req.body.name, 'Name', 100);
  const email = requiredString(req.body.email, 'Email', 100).toLowerCase();
  const license = requiredString(req.body.license || req.body.license_number, 'License number', 50);
  const password = requiredString(req.body.password || req.body.temporaryPassword, 'Temporary password', 200);
  requireStrongPassword(password);
  const username = (req.body.username || name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')).slice(0, 50);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query(
      `INSERT INTO user_account
         (username, password_hash, role, email, phone, display_name)
       VALUES ($1, $2, 'Veterinarian', $3, $4, $5)
       RETURNING user_id`,
      [username, await bcrypt.hash(password, 12), email, req.body.phone || null, name]
    );
    const vet = await client.query(
      `INSERT INTO veterinarian (user_id, name, specialization, phone, email, license_number)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING veterinarian_id AS id, veterinarian_id, user_id AS "userId", name, specialization,
                 phone, email, license_number AS license`,
      [account.rows[0].user_id, name, req.body.specialization || null, req.body.phone || null, email, license]
    );
    await audit(client, req.user.userId, 'INSERT', 'veterinarian', vet.rows[0].id, `Added veterinarian ${name}.`);
    await client.query('COMMIT');
    return res.status(201).json({ ...vet.rows[0], username, status: 'active' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.patch('/admin/veterinarians/:id', authorize('Admin'), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid veterinarian ID.' });
  const result = await db.query(
    `UPDATE veterinarian
        SET name = COALESCE($2, name), specialization = COALESCE($3, specialization),
            phone = COALESCE($4, phone), email = COALESCE($5, email),
            license_number = COALESCE($6, license_number)
      WHERE veterinarian_id = $1
      RETURNING veterinarian_id AS id, veterinarian_id, user_id AS "userId", name, specialization,
                phone, email, license_number AS license`,
    [id, req.body.name || null, req.body.specialization || null, req.body.phone || null, req.body.email || null, req.body.license || null]
  );
  if (!result.rows[0]) return notFound(res, 'Veterinarian not found.');
  if (result.rows[0].userId) {
    await db.query(
      `UPDATE user_account SET display_name = $2, email = $3, phone = $4
        WHERE user_id = $1`,
      [result.rows[0].userId, result.rows[0].name, result.rows[0].email, result.rows[0].phone]
    );
  }
  await db.query(
    `INSERT INTO audit_log (user_id, action_type, table_name, record_id, action_description)
     VALUES ($1, 'UPDATE', 'veterinarian', $2, $3)`,
    [req.user.userId, id, `Updated veterinarian ${result.rows[0].name}.`]
  );
  return res.json(result.rows[0]);
}));

router.patch('/admin/veterinarians/:id/status', authorize('Admin'), asyncRoute(async (req, res) => {
  const requestedStatus = String(req.body.status || '').toLowerCase();
  if (!['active', 'inactive'].includes(requestedStatus)) return res.status(400).json({ error: 'Status must be active or inactive.' });
  const active = requestedStatus === 'active';
  const result = await db.query(
    `UPDATE user_account u
        SET account_status = $2
       FROM veterinarian v
      WHERE v.veterinarian_id = $1 AND v.user_id = u.user_id
      RETURNING v.veterinarian_id, v.name`,
    [req.params.id, active ? 'Active' : 'Inactive']
  );
  if (!result.rows[0]) return notFound(res, 'Veterinarian login account not found.');
  await db.query(
    `INSERT INTO audit_log (user_id, action_type, table_name, record_id, action_description)
     VALUES ($1, 'UPDATE', 'veterinarian', $2, $3)`,
    [req.user.userId, result.rows[0].veterinarian_id, `${active ? 'Activated' : 'Deactivated'} veterinarian ${result.rows[0].name}.`]
  );
  return res.json({ status: active ? 'active' : 'inactive' });
}));

router.get('/owners', authorize('Admin', 'Staff', 'Veterinarian', 'Pet Owner'), asyncRoute(async (req, res) => {
  const values = [];
  let where = '';
  if (req.user.role === 'Pet Owner') {
    values.push(req.user.userId);
    where = 'WHERE o.user_id = $1';
  }
  const owners = await db.query(
    `SELECT o.owner_id AS id, o.owner_id, o.user_id, o.name, o.first_name, o.middle_name, o.last_name, o.email, o.phone, o.address,
            o.registration_date, o.photo AS profile_photo,
            COALESCE(u.account_status, 'Active') AS account_status
       FROM owner o
       LEFT JOIN user_account u ON u.user_id = o.user_id
       ${where}
      ORDER BY o.name`,
    values
  );
  const pets = await db.query(
    `SELECT p.pet_id AS id, p.pet_id, p.owner_id, p.name, p.species, p.breed,
            p.date_of_birth, p.gender, p.allergies, p.notes, p.photo,
            p.pet_status = 'Active' AS is_active, lower(p.pet_status) AS status
       FROM pet p
       JOIN owner o ON o.owner_id = p.owner_id
       ${where}
      ORDER BY p.name`,
    values
  );
  const grouped = new Map();
  for (const pet of pets.rows) {
    if (!grouped.has(pet.owner_id)) grouped.set(pet.owner_id, []);
    grouped.get(pet.owner_id).push(pet);
  }
  return res.json(owners.rows.map((owner) => ({ ...owner, pets: grouped.get(owner.id) || [] })));
}));

/* Walk-in registration (staff or admin): the owner record, an optional login account with a TEMPORARY password
   (lighter rule than normal passwords: 6+ characters with letters), and an optional first pet - all in one transaction.
   Without a password only the owner record is created (old behaviour). */
router.post('/owners', authorize('Admin', 'Staff'), asyncRoute(async (req, res) => {
  const clean = (v) => String(v || '').trim().replace(/\s+/g, ' ');
  const first = clean(req.body.firstName || req.body.first);
  const middle = clean(req.body.middleName || req.body.middle);
  const last = clean(req.body.lastName || req.body.last);
  const name = requiredString(req.body.name || [first, middle, last].filter(Boolean).join(' '), 'Name', 100);
  const email = String(req.body.email || '').trim().toLowerCase() || null;
  const phone = String(req.body.phone || '').trim() || null;
  const address = String(req.body.address || '').trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (phone && !/^(09\d{9}|\+639\d{9})$/.test(phone.replace(/[\s-]/g, ''))) return res.status(400).json({ error: 'Use a mobile number like 09XXXXXXXXX.' });

  const rawPassword = req.body.password === undefined ? req.body.temporaryPassword : req.body.password;
  /* a walk-in owner always gets a login account, so the admin can see and deactivate it in Users and Staff */
  if (rawPassword === undefined || rawPassword === null || String(rawPassword) === '') {
    return res.status(400).json({ error: 'Enter a temporary password for the owner account.' });
  }
  const makeAccount = true;
  let username = null;
  if (makeAccount) {
    requireTemporaryPassword(String(rawPassword));
    username = String(req.body.username || '').trim().toLowerCase();
    if (!username) return res.status(400).json({ error: 'Enter a username for the owner account.' });
    if (!/^[a-z0-9._-]{3,50}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-50 characters: letters, numbers, dot, dash or underscore.' });
    }
  }

  /* optional first pet (same rules as POST /owners/:id/pets) */
  let pet = null;
  const petIn = req.body.pet && typeof req.body.pet === 'object' ? req.body.pet : null;
  if (petIn && String(petIn.name || '').trim()) {
    const gender = petIn.gender == null || petIn.gender === '' ? null : requiredString(petIn.gender, 'Gender', 10);
    if (gender && !['Male', 'Female', 'Unknown'].includes(gender)) {
      return res.status(400).json({ error: 'Gender must be Male, Female, or Unknown.' });
    }
    const dateOfBirth = petIn.dateOfBirth || null;
    if (dateOfBirth !== null && !validAppointmentDate(String(dateOfBirth))) {
      return res.status(400).json({ error: 'Date of birth must be a valid YYYY-MM-DD date.' });
    }
    if (dateOfBirth) {
      const currentDate = await db.query('SELECT CURRENT_DATE::text AS today');
      if (dateOfBirth > currentDate.rows[0].today) return res.status(400).json({ error: 'Date of birth cannot be in the future.' });
    }
    pet = {
      name: requiredString(petIn.name, 'Pet name', 100),
      species: requiredString(petIn.species, 'Species', 50),
      breed: petIn.breed == null || petIn.breed === '' ? null : requiredString(petIn.breed, 'Breed', 50),
      gender, dateOfBirth,
      allergies: petIn.allergies || null, notes: petIn.notes || null, photo: petIn.photo || null
    };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    if (email) {
      const taken = await client.query(
        `SELECT 1 FROM owner WHERE lower(email) = $1 UNION ALL SELECT 1 FROM user_account WHERE lower(email) = $1 LIMIT 1`,
        [email]
      );
      if (taken.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'That email address is already registered.' }); }
    }
    let userId = null;
    if (makeAccount) {
      const taken = await client.query('SELECT 1 FROM user_account WHERE lower(username) = $1', [username]);
      if (taken.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'That username is already taken.' }); }
      const account = await client.query(
        `INSERT INTO user_account (username, password_hash, role, email, phone, display_name)
         VALUES ($1, $2, 'Pet Owner', $3, $4, $5)
         RETURNING user_id`,
        [username, await bcrypt.hash(String(rawPassword), 12), email, phone, name]
      );
      userId = account.rows[0].user_id;
      await audit(client, req.user.userId, 'INSERT', 'user_account', userId, `Created Pet Owner account ${username} (walk-in).`);
    }
    const result = await client.query(
      `INSERT INTO owner (user_id, name, first_name, middle_name, last_name, email, phone, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING owner_id AS id, owner_id, user_id, name, email, phone, address, registration_date`,
      [userId, name, first || null, middle || null, last || null, email, phone, address]
    );
    const ownerId = result.rows[0].id;
    await audit(client, req.user.userId, 'INSERT', 'owner', ownerId, `Registered walk-in owner ${name}.`);
    const pets = [];
    if (pet) {
      const added = await client.query(
        `INSERT INTO pet (owner_id, name, species, breed, date_of_birth, gender, allergies, notes, photo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING pet_id AS id, pet_id, owner_id, name, species, breed, date_of_birth, gender, allergies, notes, photo,
                   pet_status = 'Active' AS is_active, lower(pet_status) AS status`,
        [ownerId, pet.name, pet.species, pet.breed, pet.dateOfBirth, pet.gender, pet.allergies, pet.notes, pet.photo]
      );
      pets.push(added.rows[0]);
      await audit(client, req.user.userId, 'INSERT', 'pet', added.rows[0].id, `Added pet ${pet.name} for ${name}.`);
    }
    await client.query('COMMIT');
    return res.status(201).json({ ...result.rows[0], username, hasAccount: Boolean(userId), pets });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      const hint = String(error.constraint || '') + ' ' + String(error.detail || '');
      if (/email/i.test(hint)) return res.status(409).json({ error: 'That email address is already registered.' });
      if (/username/i.test(hint)) return res.status(409).json({ error: 'That username is already taken.' });
    }
    throw error;
  } finally {
    client.release();
  }
}));

router.get('/owners/:id', authorize('Admin', 'Staff', 'Veterinarian', 'Pet Owner'), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (req.user.role === 'Pet Owner') {
    const own = await db.query('SELECT owner_id FROM owner WHERE user_id = $1', [req.user.userId]);
    if (!own.rows[0] || own.rows[0].owner_id !== id) return res.status(403).json({ error: 'You can only view your own profile.' });
  }
  const result = await db.query(
    `SELECT o.owner_id AS id, o.owner_id, o.user_id, o.name, o.first_name, o.middle_name, o.last_name, o.email, o.phone, o.address,
            o.registration_date, o.photo AS profile_photo,
            COALESCE(u.account_status, 'Active') AS account_status
       FROM owner o LEFT JOIN user_account u ON u.user_id = o.user_id
      WHERE o.owner_id = $1`,
    [id]
  );
  if (!result.rows[0]) return notFound(res, 'Owner not found.');
  const pets = await db.query(
    `SELECT pet_id AS id, pet_id, owner_id, name, species, breed, date_of_birth,
            gender, allergies, notes, photo, pet_status = 'Active' AS is_active,
            lower(pet_status) AS status
       FROM pet WHERE owner_id = $1 ORDER BY name`,
    [id]
  );
  return res.json({ ...result.rows[0], pets: pets.rows });
}));

router.patch('/owners/:id', authorize('Admin', 'Staff', 'Pet Owner'), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid owner ID.' });

  const fields = ['name', 'email', 'phone', 'address', 'photo'];
  const provided = Object.fromEntries(fields.map((field) => [field, Object.prototype.hasOwnProperty.call(req.body, field)]));
  const values = {
    name: provided.name ? requiredString(req.body.name, 'Name', 100) : null,
    email: provided.email ? (String(req.body.email || '').trim().toLowerCase() || null) : null,
    phone: provided.phone ? (String(req.body.phone || '').trim() || null) : null,
    address: provided.address ? (String(req.body.address || '').trim() || null) : null,
    photo: provided.photo ? (String(req.body.photo || '').trim() || null) : null
  };
  /* an owner changing their own password must give the current one; admin / staff editing an owner do not need it */
  const needsCurrent = req.user.role === 'Pet Owner';
  const currentPassword = req.body.currentPassword === undefined ? null : requiredString(req.body.currentPassword, 'Current password', 200);
  const newPassword = req.body.newPassword === undefined ? null : requiredString(req.body.newPassword, 'New password', 200);
  if (needsCurrent && (currentPassword === null) !== (newPassword === null)) {
    return res.status(400).json({ error: 'Current and new passwords are both required.' });
  }
  if (newPassword !== null) requireStrongPassword(newPassword);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const owner = await client.query(
      `SELECT owner_id, user_id FROM owner WHERE owner_id = $1 FOR UPDATE`,
      [id]
    );
    if (!owner.rows[0]) {
      await client.query('ROLLBACK');
      return notFound(res, 'Owner not found.');
    }
    if (req.user.role === 'Pet Owner' && owner.rows[0].user_id !== req.user.userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only update your own profile.' });
    }
    if (newPassword !== null) {
      const actor = await client.query(
        `SELECT password_hash FROM user_account
          WHERE user_id = $1 AND account_status = 'Active'`,
        [req.user.userId]
      );
      if (!actor.rows[0] || (needsCurrent && !(await bcrypt.compare(currentPassword, actor.rows[0].password_hash)))) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
      if (!owner.rows[0].user_id) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This owner has no login account.' });
      }
      const target = await client.query(
        `SELECT role FROM user_account WHERE user_id = $1 FOR UPDATE`,
        [owner.rows[0].user_id]
      );
      if (!target.rows[0] || target.rows[0].role !== 'Pet Owner') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This owner has no owner login account.' });
      }
      await client.query(
        `UPDATE user_account SET password_hash = $2 WHERE user_id = $1`,
        [owner.rows[0].user_id, await bcrypt.hash(newPassword, 12)]
      );
      await audit(client, req.user.userId, 'UPDATE', 'user_account', owner.rows[0].user_id, `Changed password for owner ${id}.`);
    }

    const result = await client.query(
      `UPDATE owner
          SET name = CASE WHEN $2::boolean THEN $3 ELSE name END,
              email = CASE WHEN $4::boolean THEN $5 ELSE email END,
              phone = CASE WHEN $6::boolean THEN $7 ELSE phone END,
              address = CASE WHEN $8::boolean THEN $9 ELSE address END,
              photo = CASE WHEN $10::boolean THEN $11 ELSE photo END
        WHERE owner_id = $1
        RETURNING owner_id AS id, owner_id, user_id, name, email, phone, address,
                  registration_date, photo AS profile_photo`,
      [
        id,
        provided.name, values.name,
        provided.email, values.email,
        provided.phone, values.phone,
        provided.address, values.address,
        provided.photo, values.photo
      ]
    );
    if (result.rows[0].user_id) {
      await client.query(
        `UPDATE user_account
            SET display_name = $2,
                email = CASE WHEN $3::boolean THEN $4 ELSE email END,
                phone = CASE WHEN $5::boolean THEN $6 ELSE phone END
          WHERE user_id = $1`,
        [result.rows[0].user_id, result.rows[0].name, provided.email, values.email, provided.phone, values.phone]
      );
    }
    await audit(client, req.user.userId, 'UPDATE', 'owner', id, `Updated owner ${result.rows[0].name}.`);
    await client.query('COMMIT');
    return res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.patch('/owners/:id/status', authorize('Admin'), asyncRoute(async (req, res) => {
  const requestedStatus = String(req.body.status || '').toLowerCase();
  if (!['active', 'inactive'].includes(requestedStatus)) return res.status(400).json({ error: 'Status must be active or inactive.' });
  const active = requestedStatus === 'active';
  const owner = await db.query('SELECT owner_id, user_id FROM owner WHERE owner_id = $1', [req.params.id]);
  if (!owner.rows[0]) return notFound(res, 'Owner not found.');
  if (!owner.rows[0].user_id) return res.status(409).json({ error: 'This owner has no login account; the schema has no owner status field.' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE user_account SET account_status = $2 WHERE user_id = $1',
      [owner.rows[0].user_id, active ? 'Active' : 'Inactive']
    );
    await audit(client, req.user.userId, 'UPDATE', 'owner', owner.rows[0].owner_id, `${active ? 'Activated' : 'Deactivated'} owner account.`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return res.json({ status: active ? 'active' : 'inactive' });
}));

router.post('/owners/:id/pets', authorize('Admin', 'Staff', 'Pet Owner'), asyncRoute(async (req, res) => {
  const ownerId = Number(req.params.id);
  if (!Number.isInteger(ownerId) || ownerId < 1) return res.status(400).json({ error: 'Invalid owner ID.' });
  if (req.user.role === 'Pet Owner') {
    const owner = await db.query('SELECT owner_id FROM owner WHERE user_id = $1', [req.user.userId]);
    if (!owner.rows[0] || owner.rows[0].owner_id !== ownerId) return res.status(403).json({ error: 'You can only add pets to your own account.' });
  }
  const name = requiredString(req.body.name, 'Pet name', 100);
  const species = requiredString(req.body.species, 'Species', 50);
  const breed = req.body.breed == null || req.body.breed === '' ? null : requiredString(req.body.breed, 'Breed', 50);
  const gender = req.body.gender == null || req.body.gender === '' ? null : requiredString(req.body.gender, 'Gender', 10);
  if (gender && !['Male', 'Female', 'Unknown'].includes(gender)) {
    return res.status(400).json({ error: 'Gender must be Male, Female, or Unknown.' });
  }
  const dateOfBirth = req.body.dateOfBirth || null;
  if (dateOfBirth !== null && !validAppointmentDate(String(dateOfBirth))) {
    return res.status(400).json({ error: 'Date of birth must be a valid YYYY-MM-DD date.' });
  }
  if (dateOfBirth) {
    const currentDate = await db.query('SELECT CURRENT_DATE::text AS today');
    if (dateOfBirth > currentDate.rows[0].today) {
      return res.status(400).json({ error: 'Date of birth cannot be in the future.' });
    }
  }
  const result = await db.query(
    `INSERT INTO pet
       (owner_id, name, species, breed, date_of_birth, gender, allergies, notes, photo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING pet_id AS id, pet_id, owner_id, name, species, breed, date_of_birth, gender, allergies, notes, photo, pet_status = 'Active' AS is_active, lower(pet_status) AS status`,
    [ownerId, name, species, breed, dateOfBirth, gender, req.body.allergies || null, req.body.notes || null, req.body.photo || null]
  );
  await db.query(
    `INSERT INTO audit_log (user_id, action_type, table_name, record_id, action_description)
     VALUES ($1, 'INSERT', 'pet', $2, $3)`,
    [req.user.userId, result.rows[0].id, `Added pet ${name}.`]
  );
  return res.status(201).json(result.rows[0]);
}));

router.patch('/owners/:ownerId/pets/:petId', authorize('Admin', 'Staff', 'Pet Owner'), asyncRoute(async (req, res) => {
  const ownerId = Number(req.params.ownerId);
  const petId = Number(req.params.petId);
  if (!Number.isInteger(ownerId) || ownerId < 1 || !Number.isInteger(petId) || petId < 1) {
    return res.status(400).json({ error: 'Invalid owner or pet ID.' });
  }
  if (req.user.role === 'Pet Owner') {
    const owner = await db.query('SELECT owner_id FROM owner WHERE user_id = $1', [req.user.userId]);
    if (!owner.rows[0] || owner.rows[0].owner_id !== ownerId) return res.status(403).json({ error: 'You can only update your own pets.' });
  }
  if (req.body.status !== undefined && !['active', 'inactive'].includes(String(req.body.status).toLowerCase())) {
    return res.status(400).json({ error: 'Status must be active or inactive.' });
  }
  if (req.body.gender !== undefined && req.body.gender !== null
      && !['Male', 'Female', 'Unknown'].includes(String(req.body.gender))) {
    return res.status(400).json({ error: 'Gender must be Male, Female, or Unknown.' });
  }
  const hasDateOfBirth = Object.prototype.hasOwnProperty.call(req.body, 'dateOfBirth');
  const dateOfBirth = req.body.dateOfBirth || null;
  if (dateOfBirth && !validAppointmentDate(String(dateOfBirth))) {
    return res.status(400).json({ error: 'Date of birth must be a valid YYYY-MM-DD date.' });
  }
  if (dateOfBirth) {
    const currentDate = await db.query('SELECT CURRENT_DATE::text AS today');
    if (dateOfBirth > currentDate.rows[0].today) {
      return res.status(400).json({ error: 'Date of birth cannot be in the future.' });
    }
  }
  const result = await db.query(
    `UPDATE pet
        SET name = COALESCE($3, name), species = COALESCE($4, species),
            breed = COALESCE($5, breed),
            date_of_birth = CASE WHEN $12::boolean THEN $6::date ELSE date_of_birth END,
            gender = COALESCE($7, gender), allergies = COALESCE($8, allergies),
            notes = COALESCE($9, notes), photo = COALESCE($10, photo),
            pet_status = CASE WHEN $11::text IS NULL THEN pet_status
                              WHEN lower($11) = 'inactive' THEN 'Inactive' ELSE 'Active' END
      WHERE owner_id = $1 AND pet_id = $2
      RETURNING pet_id AS id, pet_id, owner_id, name, species, breed, date_of_birth, gender, allergies, notes, photo, pet_status = 'Active' AS is_active, lower(pet_status) AS status`,
    [
      ownerId, petId,
      req.body.name || null, req.body.species || null, req.body.breed || null,
      dateOfBirth, req.body.gender || null, req.body.allergies || null,
      req.body.notes || null, req.body.photo || null,
      req.body.status === undefined ? null : String(req.body.status), hasDateOfBirth
    ]
  );
  if (!result.rows[0]) return notFound(res, 'Pet not found.');
  await db.query(
    `INSERT INTO audit_log (user_id, action_type, table_name, record_id, action_description)
     VALUES ($1, 'UPDATE', 'pet', $2, $3)`,
    [req.user.userId, petId, `Updated pet ${result.rows[0].name}.`]
  );
  return res.json(result.rows[0]);
}));

router.get('/services', asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT service_id AS id, service_name AS name, price,
            CASE WHEN description LIKE $1 THEN substring(description FROM $2) ELSE description END AS "desc",
            CASE WHEN description LIKE $1 THEN FALSE ELSE TRUE END AS is_active,
            CASE WHEN description LIKE $1 THEN 'inactive' ELSE 'active' END AS status
       FROM service
      WHERE $3::boolean OR description IS NULL OR description NOT LIKE $1
      ORDER BY service_name`,
    [INACTIVE_SERVICE_MARKER + '%', INACTIVE_SERVICE_MARKER.length + 1, req.user.role === 'Admin']
  );
  const services = result.rows.map((service) => ({
    ...service,
    price: Number(service.price)
  }));
  if (req.user.role !== 'Pet Owner') return res.json(services);

  const vaccineServices = services.filter((service) => service.name.startsWith('Vaccine: '));
  const visibleServices = services.filter((service) => !service.name.startsWith('Vaccine: '));
  if (vaccineServices.length) {
    visibleServices.push({
      id: 'vaccination',
      name: 'Vaccination',
      price: Math.min(...vaccineServices.map((service) => service.price)),
      desc: "Core and booster vaccines, recorded in your pet's history with the next due date.",
      options: vaccineServices.map((service) => ({
        id: service.id,
        name: service.name.slice('Vaccine: '.length),
        price: service.price
      }))
    });
  }
  return res.json(visibleServices);
}));

router.post(['/services', '/admin/services'], authorize('Admin'), asyncRoute(async (req, res) => {
  const name = requiredString(req.body.name, 'Service name', 100);
  const price = Number(req.body.price);
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Price must be a non-negative number.' });
  const result = await db.query(
    `INSERT INTO service (service_name, price, description)
     VALUES ($1, $2, $3)
     RETURNING service_id AS id, service_name AS name, price, description AS "desc"`,
    [name, price, req.body.desc || req.body.description || null]
  );
  await db.query(
    `INSERT INTO audit_log (user_id, action_type, table_name, record_id, action_description)
     VALUES ($1, 'INSERT', 'service', $2, $3)`,
    [req.user.userId, result.rows[0].id, `Added service ${name}.`]
  );
  return res.status(201).json({ ...result.rows[0], is_active: true, status: 'active' });
}));

router.patch(['/services/:id', '/admin/services/:id'], authorize('Admin'), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid service ID.' });
  if (req.body.status !== undefined && !['active', 'inactive'].includes(String(req.body.status).toLowerCase())) {
    return res.status(400).json({ error: 'Status must be active or inactive.' });
  }
  const price = req.body.price === undefined ? null : Number(req.body.price);
  if (price !== null && (!Number.isFinite(price) || price < 0)) return res.status(400).json({ error: 'Price must be a non-negative number.' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT service_name, description, price FROM service WHERE service_id = $1 FOR UPDATE',
      [id]
    );
    if (!current.rows[0]) {
      await client.query('ROLLBACK');
      return notFound(res, 'Service not found.');
    }
    const before = current.rows[0];
    const wasInactive = String(before.description || '').startsWith(INACTIVE_SERVICE_MARKER);
    const description = req.body.desc !== undefined || req.body.description !== undefined
      ? String(req.body.desc ?? req.body.description ?? '')
      : wasInactive ? before.description.slice(INACTIVE_SERVICE_MARKER.length) : before.description;
    const inactive = req.body.status === undefined ? wasInactive : String(req.body.status).toLowerCase() === 'inactive';
    const storedDescription = inactive ? INACTIVE_SERVICE_MARKER + (description || '') : description || null;
    const result = await client.query(
      `UPDATE service
          SET service_name = COALESCE($2, service_name), price = COALESCE($3, price),
              description = $4
        WHERE service_id = $1
        RETURNING service_id AS id, service_name AS name, price, description`,
      [id, req.body.name || null, price, storedDescription]
    );
    /* A new price applies to current and upcoming appointments only. Completed, cancelled, no-show and past-dated appointments keep the price they were booked at. */
    if (price !== null && Number(before.price) !== price) {
      await client.query(
        `UPDATE appointment_service aps SET unit_price = $2
           FROM appointment a
          WHERE aps.appointment_id = a.appointment_id AND aps.service_id = $1
            AND a.appointment_date >= CURRENT_DATE
            AND a.status IN ('Pending', 'Scheduled', 'Approved', 'Checked-in', 'In Progress')`,
        [id, price]
      );
    }
    await audit(client, req.user.userId, 'UPDATE', 'service', id,
      `${inactive && !wasInactive ? 'Deactivated' : !inactive && wasInactive ? 'Activated' : 'Updated'} service ${result.rows[0].name}.`);
    await client.query('COMMIT');
    const row = result.rows[0];
    return res.json({
      id: row.id, name: row.name, price: row.price,
      desc: inactive ? String(row.description || '').slice(INACTIVE_SERVICE_MARKER.length) : row.description,
      is_active: !inactive, status: inactive ? 'inactive' : 'active'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.get('/admin/appointments', authorize('Admin', 'Staff'), asyncRoute(async (req, res) => {
  const status = req.query.status ? APPOINTMENT_STATUS[String(req.query.status).toLowerCase()] || String(req.query.status) : null;
  if (status && !Object.values(APPOINTMENT_STATUS).includes(status)) return res.status(400).json({ error: 'Invalid appointment status filter.' });
  return res.json(await getAppointments({ status }));
}));

router.get('/staff/appointments', authorize('Admin', 'Staff'), asyncRoute(async (_req, res) => {
  return res.json(await getAppointments());
}));

router.get('/vet/appointments', authorize('Veterinarian'), asyncRoute(async (req, res) => {
  return res.json(await getAppointments({ role: 'vet', userId: req.user.userId }));
}));

router.get('/appointments', authorize('Admin', 'Staff', 'Veterinarian', 'Pet Owner'), asyncRoute(async (req, res) => {
  if (req.user.role === 'Veterinarian') return res.json(await getAppointments({ role: 'vet', userId: req.user.userId }));
  if (req.user.role === 'Pet Owner') {
    const owner = await db.query('SELECT owner_id FROM owner WHERE user_id = $1', [req.user.userId]);
    return res.json(await getAppointments({ role: 'owner', ownerId: owner.rows[0]?.owner_id }));
  }
  return res.json(await getAppointments());
}));

router.get('/owner/vaccinations/overdue', authorize('Pet Owner'), asyncRoute(async (req, res) => {
  const result = await db.query(
    `WITH latest_vaccinations AS (
       SELECT DISTINCT ON (v.pet_id, v.vaccine_type)
              p.name AS pet, p.photo, v.vaccine_type, v.next_due_date
         FROM vaccination v
         JOIN pet p ON p.pet_id = v.pet_id
         JOIN owner o ON o.owner_id = p.owner_id
        WHERE o.user_id = $1
        ORDER BY v.pet_id, v.vaccine_type, v.date_administered DESC, v.vaccination_id DESC
     )
     SELECT pet, photo, vaccine_type, next_due_date
       FROM latest_vaccinations
      WHERE next_due_date < CURRENT_DATE
      ORDER BY next_due_date, pet, vaccine_type`,
    [req.user.userId]
  );
  return res.json(result.rows.map((row) => ({
    pet: row.pet,
    photo: row.photo || '',
    vaccine: row.vaccine_type,
    nextDue: row.next_due_date
  })));
}));

router.post('/appointments', authorize('Admin', 'Staff', 'Pet Owner'), asyncRoute(async (req, res) => {
  const petId = Number(req.body.petId);
  const vetInput = req.body.veterinarianId ?? req.body.vetId ?? req.body.vet ?? null;
  const date = requiredString(req.body.date, 'Appointment date', 10);
  const time = requiredString(req.body.time, 'Appointment time', 8);
  if (!validAppointmentDate(date)) return res.status(400).json({ error: 'Appointment date must be a valid YYYY-MM-DD date.' });
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) return res.status(400).json({ error: 'Appointment time must be a valid 24-hour time.' });
  if (!Number.isInteger(petId) || petId < 1) return res.status(400).json({ error: 'Choose a valid pet.' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    let vetId = vetInput == null || String(vetInput).toLowerCase().includes('assign') ? null : Number(vetInput);
    if (vetId !== null && (!Number.isInteger(vetId) || vetId < 1)) {
      const byName = await client.query(
        `SELECT veterinarian_id FROM veterinarian
          WHERE lower(name) = lower($1)`,
        [String(vetInput)]
      );
      vetId = byName.rows[0]?.veterinarian_id;
    }
    if (vetId !== null && (!Number.isInteger(vetId) || vetId < 1)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Choose a valid veterinarian.' });
    }
    const pet = await client.query(
      `SELECT p.owner_id, o.user_id, p.name AS pet_name
         FROM pet p JOIN owner o ON o.owner_id = p.owner_id
        WHERE p.pet_id = $1 AND p.pet_status = 'Active' AND (o.user_id IS NULL OR EXISTS (
          SELECT 1 FROM user_account u WHERE u.user_id = o.user_id AND u.account_status = 'Active'
        ))`,
      [petId]
    );
    if (!pet.rows[0]) {
      await client.query('ROLLBACK');
      return notFound(res, 'Pet not found or owner account is inactive.');
    }
    if (req.user.role === 'Pet Owner' && pet.rows[0].user_id !== req.user.userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only book appointments for your own pets.' });
    }
    if (vetId !== null) {
      const vet = await client.query(
        `SELECT v.veterinarian_id FROM veterinarian v
          LEFT JOIN user_account u ON u.user_id = v.user_id
         WHERE v.veterinarian_id = $1 AND (v.user_id IS NULL OR u.account_status = 'Active')`,
        [vetId]
      );
      if (!vet.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Choose an active veterinarian.' });
      }
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
        [`${vetId}:${date}`, time]
      );
      const conflict = await client.query(
        `SELECT 1 FROM appointment
          WHERE veterinarian_id = $1 AND appointment_date = $2::date
            AND appointment_time = $3::time
            AND status NOT IN ('Completed', 'Cancelled', 'No-show')
          FOR UPDATE`,
        [vetId, date, time]
      );
      if (conflict.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'That veterinarian already has an appointment at this time.' });
      }
    }
    const status = req.user.role === 'Pet Owner' ? 'Pending' : 'Scheduled';
    const created = await client.query(
      `INSERT INTO appointment
         (pet_id, veterinarian_id, appointment_date, appointment_time, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING appointment_id`,
      [petId, vetId, date, time, req.body.reason || null, status]
    );
    const appointmentId = created.rows[0].appointment_id;
    await notify(client, pet.rows[0].user_id, 'appointment', 'Appointment requested',
      `${pet.rows[0].pet_name}'s appointment request for ${date} at ${time} was received.`);
    await notifyStaff(client, 'appointment', req.user.role === 'Pet Owner' ? 'New appointment request' : 'New appointment booked',
      `${pet.rows[0].pet_name} - ${date} at ${time}.${req.user.role === 'Pet Owner' ? ' Waiting for approval.' : ''}`);
    if (vetId !== null) {
      const vetAccount = await client.query('SELECT user_id FROM veterinarian WHERE veterinarian_id = $1', [vetId]);
      await notify(client, vetAccount.rows[0]?.user_id, 'appointment', 'New appointment',
        `${pet.rows[0].pet_name} has an appointment on ${date} at ${time}.`);
    }
    const requestedServices = Array.isArray(req.body.services) ? req.body.services : [];
    for (const service of requestedServices) {
      let serviceId = Number(typeof service === 'object' ? service.id || service.serviceId : service);
      const quantity = Number(typeof service === 'object' ? service.quantity || 1 : 1);
      if ((!Number.isInteger(serviceId) || serviceId < 1) && typeof service === 'object' && service.name) {
        const byName = await client.query(
          `SELECT service_id FROM service
            WHERE lower(service_name) = lower($1)
              AND (description IS NULL OR description NOT LIKE $2)`,
          [String(service.name).split(' (')[0], INACTIVE_SERVICE_MARKER + '%']
        );
        serviceId = byName.rows[0]?.service_id;
      }
      if (!Number.isInteger(serviceId) || serviceId < 1 || !Number.isInteger(quantity) || quantity < 1) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid appointment service or quantity.' });
      }
      const serviceExists = await client.query(
        `SELECT service_id FROM service
          WHERE service_id = $1
            AND (description IS NULL OR description NOT LIKE $2)`,
        [serviceId, INACTIVE_SERVICE_MARKER + '%']
      );
      if (!serviceExists.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'An appointment service is unavailable.' });
      }
      await client.query(
        `INSERT INTO appointment_service (appointment_id, service_id, quantity, unit_price)
         SELECT $1::int, service_id, $3::int, price FROM service WHERE service_id = $2::int`,
        [appointmentId, serviceId, quantity]
      );
    }
    await audit(client, req.user.userId, 'INSERT', 'appointment', appointmentId, 'Booked an appointment.');
    await client.query('COMMIT');
    const result = await db.query(`${APPOINTMENT_SELECT} WHERE a.appointment_id = $1`, [appointmentId]);
    return res.status(201).json(mapAppointment(result.rows[0]));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.patch('/appointments/:id', authorize('Admin', 'Staff', 'Veterinarian', 'Pet Owner'), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid appointment ID.' });
  const requestedStatus = req.body.status;
  const status = requestedStatus === undefined ? undefined : APPOINTMENT_STATUS[requestedStatus] || requestedStatus;
  if (status !== undefined && !Object.values(APPOINTMENT_STATUS).includes(status)) {
    return res.status(400).json({ error: 'Invalid appointment status.' });
  }
  if (req.body.date !== undefined) {
    const date = String(req.body.date);
    const parsedDate = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
      return res.status(400).json({ error: 'Appointment date must be a valid YYYY-MM-DD date.' });
    }
  }
  if (req.body.time !== undefined && !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(String(req.body.time))) {
    return res.status(400).json({ error: 'Appointment time must be a valid 24-hour time.' });
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const ownVet = req.user.role === 'Veterinarian';
    const ownOwner = req.user.role === 'Pet Owner';
    const query = await client.query(
      `SELECT a.appointment_id, a.status, p.owner_id, p.name AS pet_name,
              o.user_id AS owner_user_id, a.veterinarian_id, v.user_id,
              a.appointment_date::text AS appointment_date,
              to_char(a.appointment_time, 'HH24:MI') AS appointment_time
         FROM appointment a
         JOIN pet p ON p.pet_id = a.pet_id
         JOIN owner o ON o.owner_id = p.owner_id
         LEFT JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
        WHERE a.appointment_id = $1
        FOR UPDATE OF a`,
      [id]
    );
    const before = query.rows[0];
    if (!before) {
      await client.query('ROLLBACK');
      return notFound(res, 'Appointment not found.');
    }
    if (ownVet && before.user_id !== req.user.userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only update appointments assigned to you.' });
    }
    if (ownOwner) {
      const owner = await client.query('SELECT owner_id FROM owner WHERE user_id = $1', [req.user.userId]);
      if (!owner.rows[0] || owner.rows[0].owner_id !== before.owner_id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'You can only update your own appointments.' });
      }
      if (!['Pending', 'Scheduled', 'Approved'].includes(before.status)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Only upcoming appointments can be changed.' });
      }
      if (requestedStatus !== 'cancelled' && requestedStatus !== 'pending') {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Owners may only cancel or request a reschedule.' });
      }
      if (requestedStatus === 'pending' && (!req.body.date || !req.body.time)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'A new date and time are required to reschedule.' });
      }
      if (req.body.veterinarianId !== undefined || req.body.vet !== undefined) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Owners cannot reassign appointments.' });
      }
    }
    const hasVetUpdate = req.body.veterinarianId !== undefined || req.body.vet !== undefined;
    const vetInput = req.body.veterinarianId ?? req.body.vet;
    let nextVetId = !hasVetUpdate || vetInput == null || String(vetInput).toLowerCase().includes('assign')
      ? (!hasVetUpdate ? before.veterinarian_id : null)
      : Number(vetInput);
    if (nextVetId !== null && (!Number.isInteger(nextVetId) || nextVetId < 1) && req.body.vet) {
      const byName = await client.query(
        `SELECT veterinarian_id FROM veterinarian WHERE lower(name) = lower($1)`,
        [String(req.body.vet)]
      );
      nextVetId = byName.rows[0]?.veterinarian_id;
    }
    if (nextVetId !== null && (!Number.isInteger(nextVetId) || nextVetId < 1)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Choose a valid veterinarian.' });
    }
    if (ownVet && nextVetId !== before.veterinarian_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Veterinarians cannot reassign appointments.' });
    }
    if (nextVetId !== null && nextVetId !== before.veterinarian_id) {
      const activeVet = await client.query(
        `SELECT v.veterinarian_id FROM veterinarian v
          LEFT JOIN user_account u ON u.user_id = v.user_id
         WHERE v.veterinarian_id = $1 AND (v.user_id IS NULL OR u.account_status = 'Active')`,
        [nextVetId]
      );
      if (!activeVet.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Choose an active veterinarian.' });
      }
    }
    const nextDate = req.body.date || before.appointment_date;
    const nextTime = req.body.time || before.appointment_time;
    if (nextVetId !== null && (nextVetId !== before.veterinarian_id || nextDate !== before.appointment_date || nextTime !== before.appointment_time)) {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
        [`${nextVetId}:${nextDate}`, nextTime]
      );
      const conflict = await client.query(
        `SELECT 1 FROM appointment
          WHERE veterinarian_id = $1 AND appointment_date = $2::date
            AND appointment_time = $3::time AND appointment_id <> $4
            AND status NOT IN ('Completed', 'Cancelled', 'No-show')
          FOR UPDATE`,
        [nextVetId, nextDate, nextTime, id]
      );
      if (conflict.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'That veterinarian already has an appointment at this time.' });
      }
    }
    const dbStatus = status === undefined ? before.status : status;
    if (ownVet && status !== undefined && !['In Progress', 'Completed'].includes(dbStatus)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Veterinarians may only start or complete their assigned appointments.' });
    }
    const update = await client.query(
      `UPDATE appointment
          SET status = $2, veterinarian_id = $3,
              appointment_date = COALESCE($4, appointment_date),
              appointment_time = COALESCE($5, appointment_time),
              reason = COALESCE($6, reason),
              cancellation_reason = COALESCE($7, cancellation_reason),
              reschedule_reason = COALESCE($8, reschedule_reason),
              rescheduled_from_date = COALESCE($9::date, rescheduled_from_date),
              rescheduled_from_time = COALESCE($10::time, rescheduled_from_time),
              updated_date = CURRENT_TIMESTAMP
        WHERE appointment_id = $1
        RETURNING appointment_id`,
      [id, dbStatus, nextVetId, req.body.date || null, req.body.time || null, req.body.reason || null,
        req.body.declineReason || req.body.cancellationReason || null,
        req.body.rescheduleReason || null,
        req.body.rescheduledFrom?.date || null,
        req.body.rescheduledFrom?.time || null]
    );
    if (dbStatus === 'Completed' && before.status !== 'Completed') {
      /* vaccine services of a completed visit go into the vaccination history with a next due date (the vet can edit them in the medical record) */
      const autoVaccines = await client.query(
        `INSERT INTO vaccination
           (pet_id, veterinarian_id, vaccine_type, date_administered, next_due_date, administered_by, appointment_id)
         SELECT a.pet_id, a.veterinarian_id, regexp_replace(sv.service_name, '^Vaccin(e|ation):\\s*', ''),
                LEAST(a.appointment_date, CURRENT_DATE),
                (LEAST(a.appointment_date, CURRENT_DATE) + INTERVAL '1 year')::date,
                vt.name, a.appointment_id
           FROM appointment a
           JOIN appointment_service aps ON aps.appointment_id = a.appointment_id
           JOIN service sv ON sv.service_id = aps.service_id
           LEFT JOIN veterinarian vt ON vt.veterinarian_id = a.veterinarian_id
          WHERE a.appointment_id = $1 AND sv.service_name ILIKE '%vaccin%'
            AND NOT EXISTS (SELECT 1 FROM vaccination x WHERE x.appointment_id = a.appointment_id)
         RETURNING vaccination_id, vaccine_type`,
        [id]
      );
      for (const vx of autoVaccines.rows) {
        await audit(client, req.user.userId, 'INSERT', 'vaccination', vx.vaccination_id, `Recorded ${vx.vaccine_type} vaccination for ${before.pet_name}.`);
      }
    }
    const statusChanged = status !== undefined && dbStatus !== before.status;
    const overrideReason = String(req.body.overrideReason || '').trim().slice(0, 200);
    await audit(client, req.user.userId, 'UPDATE', 'appointment', id,
      statusChanged
        ? `${overrideReason ? 'Overrode' : 'Changed'} status of appointment ${id} (${before.pet_name}) from ${before.status} to ${dbStatus}.${overrideReason ? ` Reason: ${overrideReason}` : ''}`
        : `Updated appointment ${id}.`);
    if (status !== undefined || req.body.date !== undefined || req.body.time !== undefined || nextVetId !== before.veterinarian_id) {
      const message = `Appointment for ${before.pet_name} was updated to ${UI_APPOINTMENT_STATUS[dbStatus] || dbStatus} on ${nextDate} at ${nextTime}.`;
      await notify(client, before.owner_user_id, 'appointment', 'Appointment updated', message);
      if (ownOwner || ownVet) {
        const title = ownOwner
          ? (requestedStatus === 'cancelled' ? 'Appointment cancelled by owner' : 'Reschedule requested')
          : (dbStatus === 'Completed' ? 'Visit completed' : 'Appointment updated by vet');
        await notifyStaff(client, 'appointment', title, message, req.user.userId);
      }
      if (before.veterinarian_id && before.veterinarian_id !== nextVetId) {
        const oldVet = await client.query('SELECT user_id FROM veterinarian WHERE veterinarian_id = $1', [before.veterinarian_id]);
        await notify(client, oldVet.rows[0]?.user_id, 'appointment', 'Appointment updated', message);
      }
      if (nextVetId) {
        const nextVet = await client.query('SELECT user_id FROM veterinarian WHERE veterinarian_id = $1', [nextVetId]);
        await notify(client, nextVet.rows[0]?.user_id, 'appointment', 'Appointment updated', message);
      }
    }
    await client.query('COMMIT');
    const result = await db.query(`${APPOINTMENT_SELECT} WHERE a.appointment_id = $1`, [update.rows[0].appointment_id]);
    return res.json(mapAppointment(result.rows[0]));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.get('/vet/patients', authorize('Veterinarian'), asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT DISTINCT p.owner_id AS owner, p.pet_id AS "petId", p.name,
            p.species, p.breed, p.gender AS sex, p.date_of_birth AS dob,
            p.allergies, o.name AS "ownerName"
       FROM appointment a
       JOIN pet p ON p.pet_id = a.pet_id
       JOIN owner o ON o.owner_id = p.owner_id
       JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
      WHERE v.user_id = $1
      ORDER BY p.name`,
    [req.user.userId]
  );
  return res.json(result.rows);
}));

router.get('/vet/patients/:petId', authorize('Veterinarian', 'Admin', 'Staff'), asyncRoute(async (req, res) => {
  const petId = Number(req.params.petId);
  const pet = await db.query(
    `SELECT p.pet_id AS id, p.pet_id, p.owner_id AS owner, p.name, p.species, p.breed,
            p.gender AS sex, p.date_of_birth AS dob, p.allergies, p.notes, p.photo,
            o.name AS "ownerName", o.email AS "ownerEmail", o.phone AS "ownerPhone"
       FROM pet p JOIN owner o ON o.owner_id = p.owner_id
      WHERE p.pet_id = $1`,
    [petId]
  );
  if (!pet.rows[0]) return notFound(res, 'Patient not found.');
  if (req.user.role === 'Veterinarian') {
    const assigned = await db.query(
      `SELECT 1 FROM appointment a
        LEFT JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
       WHERE a.pet_id = $1 AND v.user_id = $2 LIMIT 1`,
      [petId, req.user.userId]
    );
    if (!assigned.rowCount) return res.status(403).json({ error: 'This patient is not assigned to you.' });
  }
  const records = await db.query(
    `SELECT r.record_id AS id, r.record_id, r.appointment_id, r.diagnosis, r.treatment, r.notes,
            r.record_date AS date, a.veterinarian_id, v.name AS vet
       FROM medical_record r
       JOIN appointment a ON a.appointment_id = r.appointment_id
       LEFT JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
      WHERE a.pet_id = $1 ORDER BY r.record_date DESC, r.record_id DESC`,
    [petId]
  );
  const prescriptions = await db.query(
    `SELECT rx.prescription_id AS id, rx.record_id, rx.medication_name AS medication,
            rx.dosage AS dose, rx.instructions, rx.quantity, rx.date_prescribed AS date
       FROM prescription rx
       JOIN medical_record r ON r.record_id = rx.record_id
       JOIN appointment a ON a.appointment_id = r.appointment_id
      WHERE a.pet_id = $1 ORDER BY rx.date_prescribed DESC, rx.prescription_id DESC`,
    [petId]
  );
  return res.json({ pet: pet.rows[0], visits: records.rows, prescriptions: prescriptions.rows });
}));

router.get('/pets/:id', authorize('Veterinarian', 'Admin', 'Staff'), asyncRoute(async (req, res) => {
  const petId = Number(req.params.id);
  const result = await db.query(
    `SELECT p.pet_id AS id, p.pet_id, p.owner_id AS owner, p.name, p.species,
            p.breed, p.gender AS sex, p.date_of_birth AS dob, p.allergies,
            p.notes, p.photo, o.name AS "ownerName", o.email AS "ownerEmail",
            o.phone AS "ownerPhone"
       FROM pet p JOIN owner o ON o.owner_id = p.owner_id
      WHERE p.pet_id = $1`,
    [petId]
  );
  if (!result.rows[0]) return notFound(res, 'Patient not found.');
  if (req.user.role === 'Veterinarian') {
    const assigned = await db.query(
      `SELECT 1 FROM appointment a
        LEFT JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
       WHERE a.pet_id = $1 AND v.user_id = $2 LIMIT 1`,
      [petId, req.user.userId]
    );
    if (!assigned.rowCount) return res.status(403).json({ error: 'This patient is not assigned to you.' });
  }
  const visits = await db.query(
    `SELECT r.record_id AS id, r.appointment_id, r.diagnosis, r.treatment, r.notes,
            r.record_date AS date, v.name AS vet
       FROM medical_record r
       JOIN appointment a ON a.appointment_id = r.appointment_id
       JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
      WHERE a.pet_id = $1 ORDER BY r.record_date DESC`,
    [petId]
  );
  const prescriptions = await db.query(
    `SELECT rx.prescription_id AS id, rx.record_id, rx.medication_name AS medication,
            rx.dosage AS dose, rx.instructions, rx.quantity, rx.date_prescribed AS date
       FROM prescription rx
       JOIN medical_record r ON r.record_id = rx.record_id
       JOIN appointment a ON a.appointment_id = r.appointment_id
      WHERE a.pet_id = $1 ORDER BY rx.date_prescribed DESC`,
    [petId]
  );
  return res.json({ pet: result.rows[0], owner: result.rows[0], visits: visits.rows, prescriptions: prescriptions.rows });
}));

router.get('/vet/medical-records', authorize('Veterinarian'), asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT r.record_id AS id, r.appointment_id, r.diagnosis, r.treatment, r.notes,
            r.record_date AS date, a.pet_id, p.owner_id AS owner, p.name AS pet_name,
            v.name AS veterinarian
       FROM medical_record r
       JOIN appointment a ON a.appointment_id = r.appointment_id
       JOIN pet p ON p.pet_id = a.pet_id
       JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
      WHERE v.user_id = $1 ORDER BY r.record_date DESC, r.record_id DESC`,
    [req.user.userId]
  );
  return res.json(result.rows);
}));

router.put('/appointments/:id/record', authorize('Veterinarian'), asyncRoute(async (req, res) => {
  const appointmentId = Number(req.params.id);
  if (!Number.isInteger(appointmentId) || appointmentId < 1) return res.status(400).json({ error: 'Invalid appointment ID.' });
  const diagnosis = await resolveDiagnosis(db, appointmentId, req.body.diagnosis);
  const date = requiredString(req.body.date, 'Record date', 10);
  const assigned = await db.query(
    `SELECT a.appointment_id, a.pet_id, v.veterinarian_id, v.name AS veterinarian_name, v.user_id,
            p.name AS pet_name, o.user_id AS owner_user_id
       FROM appointment a
       JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
       JOIN pet p ON p.pet_id = a.pet_id
       JOIN owner o ON o.owner_id = p.owner_id
      WHERE a.appointment_id = $1`,
    [appointmentId]
  );
  if (!assigned.rows[0]) return notFound(res, 'Appointment not found.');
  if (Number(assigned.rows[0].user_id) !== Number(req.user.userId)) return res.status(403).json({ error: 'You can only update records for your assigned appointments.' });
  if (!Array.isArray(req.body.prescriptions)) return res.status(400).json({ error: 'Prescriptions must be an array.' });
  const vaccines = req.body.vaccines === undefined ? null : req.body.vaccines;
  if (vaccines !== null && !Array.isArray(vaccines)) return res.status(400).json({ error: 'Vaccines must be an array.' });
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  for (const vaccine of vaccines || []) {
    const name = String(vaccine.name || '').trim();
    if (!name || name.length > 100) return res.status(400).json({ error: 'Enter the vaccine name for each vaccination.' });
    if (!datePattern.test(String(vaccine.dateAdministered || ''))) return res.status(400).json({ error: `Check the date administered of ${name}.` });
    if (vaccine.nextDue && (!datePattern.test(String(vaccine.nextDue)) || String(vaccine.nextDue) < String(vaccine.dateAdministered))) {
      return res.status(400).json({ error: `The next due date of ${name} cannot be before the date administered.` });
    }
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const record = await client.query(
      `INSERT INTO medical_record (appointment_id, diagnosis, treatment, notes, record_date)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (appointment_id)
       DO UPDATE SET diagnosis = EXCLUDED.diagnosis, treatment = EXCLUDED.treatment,
                     notes = EXCLUDED.notes, record_date = EXCLUDED.record_date
       RETURNING record_id, appointment_id, diagnosis, treatment, notes, record_date`,
      [appointmentId, diagnosis, req.body.treatment || null, req.body.notes || null, date]
    );
    const recordId = record.rows[0].record_id;
    const hadPrescriptions = (await client.query('SELECT 1 FROM prescription WHERE record_id = $1 LIMIT 1', [recordId])).rowCount > 0;
    await client.query('DELETE FROM prescription WHERE record_id = $1', [recordId]);
    const prescriptions = [];
    for (const prescription of req.body.prescriptions) {
      const medication = requiredString(prescription.medication, 'Medication', 100);
      const dosage = String(prescription.dose || '').trim();
      const instructions = String(prescription.instructions || '').trim();
      const quantity = Number(prescription.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) throw Object.assign(new Error('Prescription quantity must be a positive whole number.'), { status: 400 });
      const saved = await client.query(
        `INSERT INTO prescription (record_id, medication_name, dosage, instructions, quantity)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING prescription_id AS id, record_id, medication_name AS medication,
                   dosage AS dose, instructions, quantity, date_prescribed AS date`,
        [recordId, medication, dosage, instructions, quantity]
      );
      prescriptions.push(saved.rows[0]);
      await audit(client, req.user.userId, hadPrescriptions ? 'UPDATE' : 'INSERT', 'prescription', saved.rows[0].id,
        `${hadPrescriptions ? 'Updated' : 'Added'} prescription for ${medication} for ${assigned.rows[0].pet_name}.`);
    }
    if (vaccines !== null) {
      const hadVaccinations = (await client.query('SELECT 1 FROM vaccination WHERE appointment_id = $1 LIMIT 1', [appointmentId])).rowCount > 0;
      await client.query('DELETE FROM vaccination WHERE appointment_id = $1', [appointmentId]);
      for (const vaccine of vaccines) {
        const savedVaccine = await client.query(
          `INSERT INTO vaccination
             (pet_id, veterinarian_id, vaccine_type, date_administered, next_due_date, administered_by, appointment_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING vaccination_id`,
          [assigned.rows[0].pet_id, assigned.rows[0].veterinarian_id, String(vaccine.name).trim(),
           vaccine.dateAdministered, vaccine.nextDue || null, assigned.rows[0].veterinarian_name, appointmentId]
        );
        await audit(client, req.user.userId, hadVaccinations ? 'UPDATE' : 'INSERT', 'vaccination', savedVaccine.rows[0].vaccination_id,
          `${hadVaccinations ? 'Updated' : 'Recorded'} ${String(vaccine.name).trim()} vaccination for ${assigned.rows[0].pet_name}.`);
      }
      if (vaccines.length) {
        await client.query(
          `INSERT INTO notification (user_id, notification_type, title, message)
           VALUES ($1, 'reminder', 'Vaccination recorded', $2)`,
          [assigned.rows[0].owner_user_id, `${vaccines.map((v) => String(v.name).trim()).join(', ')} recorded for ${assigned.rows[0].pet_name}. See Vaccination History for the next due date.`]
        );
      }
    }
    await audit(client, req.user.userId, 'UPDATE', 'medical_record', recordId, 'Saved a medical record and its prescriptions.');
    await client.query('COMMIT');
    return res.json({ record: record.rows[0], prescriptions });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/appointments/:id/medical-record', authorize('Veterinarian'), asyncRoute(async (req, res) => {
  const appointmentId = Number(req.params.id);
  const diagnosis = await resolveDiagnosis(db, appointmentId, req.body.diagnosis);
  const assigned = await db.query(
    `SELECT a.appointment_id, v.user_id
       FROM appointment a JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
      WHERE a.appointment_id = $1`,
    [appointmentId]
  );
  if (!assigned.rows[0]) return notFound(res, 'Appointment not found.');
  if (assigned.rows[0].user_id !== req.user.userId) return res.status(403).json({ error: 'You can only record visits for your assigned appointments.' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const record = await client.query(
      `INSERT INTO medical_record (appointment_id, diagnosis, treatment, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (appointment_id)
       DO UPDATE SET diagnosis = EXCLUDED.diagnosis, treatment = EXCLUDED.treatment, notes = EXCLUDED.notes
       RETURNING record_id, appointment_id, diagnosis, treatment, notes, record_date`,
      [appointmentId, diagnosis, req.body.treatment || null, req.body.notes || null]
    );
    await audit(client, req.user.userId, 'INSERT', 'medical_record', record.rows[0].record_id, 'Created or updated a medical record.');
    await client.query('COMMIT');
    return res.status(201).json(record.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/medical-records/:recordId/prescriptions', authorize('Veterinarian'), asyncRoute(async (req, res) => {
  const medication = requiredString(req.body.medication || req.body.medication_name, 'Medication', 100);
  const dosage = requiredString(req.body.dose || req.body.dosage, 'Dosage', 50);
  const instructions = requiredString(req.body.instructions, 'Instructions', 10000);
  const quantity = Number(req.body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ error: 'Quantity must be a positive whole number.' });
  const assigned = await db.query(
    `SELECT 1 FROM medical_record r
       JOIN appointment a ON a.appointment_id = r.appointment_id
       JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
      WHERE r.record_id = $1 AND v.user_id = $2`,
    [req.params.recordId, req.user.userId]
  );
  if (!assigned.rowCount) return notFound(res, 'Medical record not found or not assigned to you.');
  const result = await db.query(
    `INSERT INTO prescription (record_id, medication_name, dosage, instructions, quantity)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING prescription_id AS id, record_id, medication_name AS medication,
               dosage AS dose, instructions, quantity, date_prescribed AS date`,
    [req.params.recordId, medication, dosage, instructions, quantity]
  );
  await db.query(
    `INSERT INTO audit_log (user_id, action_type, table_name, record_id, action_description)
     VALUES ($1, 'INSERT', 'prescription', $2, $3)`,
    [req.user.userId, result.rows[0].id, `Added prescription for ${medication}.`]
  );
  return res.status(201).json(result.rows[0]);
}));

router.get(['/audit', '/audit-log'], authorize('Admin'), asyncRoute(async (req, res) => {
  const values = [];
  const where = [];
  if (req.query.user) {
    const userId = Number(req.query.user);
    if (!Number.isInteger(userId) || userId < 1) return res.status(400).json({ error: 'User filter must be a valid user ID.' });
    values.push(userId);
    where.push(`l.user_id = $${values.length}`);
  }
  if (req.query.action) {
    const action = String(req.query.action).toUpperCase();
    const mappedAction = action === 'CREATE' ? 'INSERT' : action;
    if (!['INSERT', 'UPDATE', 'DEACTIVATE', 'DELETE', 'LOGIN', 'LOGOUT'].includes(mappedAction)) {
      return res.status(400).json({ error: 'Invalid audit action filter.' });
    }
    // Nothing is deleted in the clinic: a deactivation is stored as UPDATE with a "Deactivated ..." description.
    if (mappedAction === 'DEACTIVATE') {
      where.push(`(l.action_type = 'DELETE' OR (l.action_type = 'UPDATE' AND l.action_description ILIKE 'Deactivated%'))`);
    } else if (mappedAction === 'UPDATE') {
      where.push(`(l.action_type = 'UPDATE' AND l.action_description NOT ILIKE 'Deactivated%')`);
    } else {
      values.push(mappedAction);
      where.push(`l.action_type = $${values.length}`);
    }
  }
  if (req.query.record) {
    values.push(String(req.query.record));
    where.push(`l.table_name = $${values.length}`);
  }
  if (req.query.from) {
    if (!validAppointmentDate(req.query.from)) return res.status(400).json({ error: 'From date must be a valid YYYY-MM-DD date.' });
    values.push(req.query.from);
    where.push(`l.action_date >= $${values.length}::date`);
  }
  if (req.query.to) {
    if (!validAppointmentDate(req.query.to)) return res.status(400).json({ error: 'To date must be a valid YYYY-MM-DD date.' });
    values.push(req.query.to);
    where.push(`l.action_date < ($${values.length}::date + INTERVAL '1 day')`);
  }
  const result = await db.query(
    `SELECT l.audit_id AS id, l.user_id, u.username, COALESCE(u.display_name, u.username, 'Unknown') AS user,
            u.role, l.action_type, l.table_name, l.record_id, l.action_description,
            l.action_date AS at
       FROM audit_log l
       LEFT JOIN user_account u ON u.user_id = l.user_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY l.action_date DESC, l.audit_id DESC
      LIMIT 1000`,
    values
  );
  return res.json(result.rows.map((row) => ({
    ...row,
    role: UI_ROLES[row.role] || null,
    action: row.action_type === 'DELETE' || (row.action_type === 'UPDATE' && /^deactivated/i.test(row.action_description || ''))
      ? 'deactivate' : row.action_type.toLowerCase(),
    record: row.table_name,
    details: row.action_description,
    createdAt: row.at
  })));
}));

module.exports = router;