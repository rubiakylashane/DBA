const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncRoute, notFound, requiredString } = require('../utils/http');
const { addStream } = require('../utils/notification-hub');

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
const { sendSms } = require('../utils/sms');

const router = express.Router();

function validId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validDate(value, label) {
  const date = requiredString(value, label, 10);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    const error = new Error(`${label} must be a valid YYYY-MM-DD date.`);
    error.status = 400;
    throw error;
  }
  return date;
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}

async function writeAudit(client, userId, action, table, recordId, description) {
  await client.query(
    `INSERT INTO audit_log (user_id, action_type, table_name, record_id, action_description)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId || null, action, table, recordId || null, description]
  );
}

async function createNotification(client, userId, type, title, message) {
  if (!userId) return;
  await client.query(
    `INSERT INTO notification (user_id, notification_type, title, message)
     VALUES ($1, $2, $3, $4)`,
    [userId, type, title, message]
  );
}

const VISIT_SELECT = `
  SELECT r.record_id AS id, r.record_id, r.appointment_id AS "appointmentId",
         p.owner_id AS owner, o.name AS "ownerName", p.pet_id AS "petId",
         p.name AS pet, r.record_date::text AS date, r.diagnosis, r.treatment, r.notes,
         v.name AS vet,
         COALESCE((SELECT json_agg(json_build_object('name', sv.service_name, 'quantity', aps.quantity) ORDER BY sv.service_name)
                     FROM appointment_service aps JOIN service sv ON sv.service_id = aps.service_id
                    WHERE aps.appointment_id = r.appointment_id), '[]'::json) AS services,
         COALESCE((SELECT json_agg(json_build_object('vaccine', vx.vaccine_type, 'dateAdministered', vx.date_administered::text,
                                                     'nextDue', vx.next_due_date::text) ORDER BY vx.vaccination_id)
                     FROM vaccination vx WHERE vx.appointment_id = r.appointment_id), '[]'::json) AS vaccinations
    FROM medical_record r
    JOIN appointment a ON a.appointment_id = r.appointment_id
    JOIN pet p ON p.pet_id = a.pet_id
    JOIN owner o ON o.owner_id = p.owner_id
    LEFT JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id`;

const PRESCRIPTION_SELECT = `
  SELECT rx.prescription_id AS id, rx.record_id AS "recordId",
         p.owner_id AS owner, o.name AS "ownerName", p.pet_id AS "petId",
         p.name AS pet, rx.date_prescribed::text AS date,
         rx.medication_name AS medication, rx.dosage AS dose,
         rx.instructions, rx.quantity
    FROM prescription rx
    JOIN medical_record r ON r.record_id = rx.record_id
    JOIN appointment a ON a.appointment_id = r.appointment_id
    JOIN pet p ON p.pet_id = a.pet_id
    JOIN owner o ON o.owner_id = p.owner_id`;

/* Live stream: the page keeps this request open and re-fetches its list whenever it receives "refresh". */
router.get('/notifications/stream', authenticate, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  res.write('retry: 3000\n\nevent: refresh\ndata: {}\n\n');
  addStream(req.user.userId, res);
});

router.get('/notifications', authenticate, asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const result = await db.query(
    `SELECT notification_id AS id, notification_type AS type, title, message AS text,
            created_at AS "createdAt", read_at AS "readAt"
       FROM notification
      WHERE user_id = $1
      ORDER BY created_at DESC, notification_id DESC
      LIMIT 100`,
    [req.user.userId]
  );
  return res.json(result.rows);
}));

router.patch('/notifications/:id/read', authenticate, asyncRoute(async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid notification ID.' });
  const result = await db.query(
    `UPDATE notification SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
      WHERE notification_id = $1 AND user_id = $2
      RETURNING notification_id AS id, notification_type AS type, title, message AS text,
                created_at AS "createdAt", read_at AS "readAt"`,
    [id, req.user.userId]
  );
  if (!result.rows[0]) return notFound(res, 'Notification not found.');
  return res.json(result.rows[0]);
}));

router.post('/notifications/read-all', authenticate, asyncRoute(async (req, res) => {
  const result = await db.query(
    `UPDATE notification SET read_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND read_at IS NULL`,
    [req.user.userId]
  );
  return res.json({ updated: result.rowCount });
}));

router.get('/medical-records', authenticate, authorize('Pet Owner'), asyncRoute(async (req, res) => {
  const visits = await db.query(
    `${VISIT_SELECT}
      WHERE o.user_id = $1
      ORDER BY r.record_date DESC, r.record_id DESC`,
    [req.user.userId]
  );
  return res.json(visits.rows);
}));

router.get('/prescriptions', authenticate, authorize('Pet Owner'), asyncRoute(async (req, res) => {
  const result = await db.query(
    `${PRESCRIPTION_SELECT}
      WHERE o.user_id = $1
      ORDER BY rx.date_prescribed DESC, rx.prescription_id DESC`,
    [req.user.userId]
  );
  return res.json(result.rows);
}));

router.get('/staff/records', authenticate, authorize('Admin', 'Staff', 'Veterinarian'), asyncRoute(async (req, res) => {
  const values = [];
  const scope = req.user.role === 'Veterinarian' ? 'WHERE v.user_id = $1' : '';
  if (scope) values.push(req.user.userId);
  const visits = await db.query(
    `${VISIT_SELECT} ${scope} ORDER BY r.record_date DESC, r.record_id DESC`,
    values
  );
  const prescriptions = await db.query(
    `${PRESCRIPTION_SELECT}
      ${scope ? 'WHERE EXISTS (SELECT 1 FROM appointment va JOIN veterinarian vv ON vv.veterinarian_id = va.veterinarian_id WHERE va.appointment_id = r.appointment_id AND vv.user_id = $1)' : ''}
      ORDER BY rx.date_prescribed DESC, rx.prescription_id DESC`,
    values
  );
  return res.json({ visits: visits.rows, prescriptions: prescriptions.rows });
}));

router.post('/staff/records/visits', authenticate, authorize('Admin', 'Staff', 'Veterinarian'), asyncRoute(async (req, res) => {
  const ownerId = validId(req.body.owner);
  const petId = validId(req.body.petId);
  if (!ownerId || !petId) return res.status(400).json({ error: 'Choose a valid owner and pet.' });
  const date = validDate(req.body.date, 'Record date');
  const diagnosis = requiredString(req.body.diagnosis, 'Diagnosis', 10000);
  const pet = await db.query(
    `SELECT p.pet_id, p.owner_id
       FROM pet p JOIN owner o ON o.owner_id = p.owner_id
      WHERE p.pet_id = $1 AND p.owner_id = $2 AND p.pet_status = 'Active'`,
    [petId, ownerId]
  );
  if (!pet.rows[0]) return notFound(res, 'Active pet not found for this owner.');

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    let appointmentId = req.body.appointmentId == null || req.body.appointmentId === ''
      ? null
      : validId(req.body.appointmentId);
    if (req.body.appointmentId != null && req.body.appointmentId !== '' && !appointmentId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid appointment ID.' });
    }
    if (appointmentId) {
      const appointment = await client.query(
        `SELECT a.appointment_id, v.user_id AS veterinarian_user_id
           FROM appointment a
           LEFT JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
          WHERE a.appointment_id = $1 AND a.pet_id = $2
          FOR UPDATE OF a`,
        [appointmentId, petId]
      );
      if (!appointment.rowCount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Appointment does not belong to this pet.' });
      }
      if (req.user.role === 'Veterinarian' && Number(appointment.rows[0].veterinarian_user_id) !== Number(req.user.userId)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'You may only record a visit for an appointment assigned to you.' });
      }
    } else {
      let vetId = null;
      if (req.user.role === 'Veterinarian') {
        const vet = await client.query(
          `SELECT v.veterinarian_id
             FROM veterinarian v
             JOIN user_account u ON u.user_id = v.user_id
            WHERE v.user_id = $1 AND u.account_status = 'Active'`,
          [req.user.userId]
        );
        if (!vet.rows[0]) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'Veterinarian account not found.' });
        }
        vetId = vet.rows[0].veterinarian_id;
        const assigned = await client.query(
          `SELECT 1 FROM appointment
            WHERE pet_id = $1 AND veterinarian_id = $2
            LIMIT 1`,
          [petId, vetId]
        );
        if (!assigned.rowCount) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'You may only record a visit for a patient assigned to you.' });
        }
      }
      const created = await client.query(
        `INSERT INTO appointment
           (pet_id, veterinarian_id, appointment_date, appointment_time, reason, status)
         VALUES ($1, $2, $3, '00:00', 'Visit record', 'Completed')
         RETURNING appointment_id`,
        [petId, vetId, date]
      );
      appointmentId = created.rows[0].appointment_id;
    }

    const record = await client.query(
      `INSERT INTO medical_record (appointment_id, diagnosis, treatment, notes, record_date)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (appointment_id)
       DO UPDATE SET diagnosis = EXCLUDED.diagnosis, treatment = EXCLUDED.treatment,
                     notes = EXCLUDED.notes, record_date = EXCLUDED.record_date
       RETURNING record_id`,
      [appointmentId, diagnosis, req.body.treatment || null, req.body.notes || null, date]
    );
    await writeAudit(client, req.user.userId, 'INSERT', 'medical_record', record.rows[0].record_id, 'Created or updated a medical visit record.');
    await client.query('COMMIT');
    const saved = await db.query(`${VISIT_SELECT} WHERE r.record_id = $1`, [record.rows[0].record_id]);
    return res.status(201).json(saved.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/staff/records/prescriptions', authenticate, authorize('Admin', 'Staff', 'Veterinarian'), asyncRoute(async (req, res) => {
  const ownerId = validId(req.body.owner);
  const petId = validId(req.body.petId);
  if (!ownerId || !petId) return res.status(400).json({ error: 'Choose a valid owner and pet.' });
  const medication = requiredString(req.body.medication, 'Medication', 100);
  const dosage = requiredString(req.body.dose, 'Dosage', 50);
  const instructions = requiredString(req.body.instructions, 'Instructions', 10000);
  const quantity = Number(req.body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ error: 'Quantity must be a positive whole number.' });
  const recordId = req.body.recordId == null || req.body.recordId === ''
    ? null
    : validId(req.body.recordId);
  if (req.body.recordId != null && req.body.recordId !== '' && !recordId) return res.status(400).json({ error: 'Invalid medical record ID.' });
  const values = [petId, ownerId];
  const recordWhere = recordId ? 'AND r.record_id = $3' : '';
  if (recordId) values.push(recordId);
  if (req.user.role === 'Veterinarian') {
    values.push(req.user.userId);
  }
  const vetWhere = req.user.role === 'Veterinarian'
    ? `AND EXISTS (SELECT 1 FROM veterinarian v WHERE v.veterinarian_id = a.veterinarian_id AND v.user_id = $${values.length})`
    : '';
  const related = await db.query(
    `SELECT r.record_id
       FROM medical_record r
       JOIN appointment a ON a.appointment_id = r.appointment_id
       JOIN pet p ON p.pet_id = a.pet_id
      WHERE p.pet_id = $1 AND p.owner_id = $2 ${recordWhere} ${vetWhere}
      ORDER BY r.record_date DESC, r.record_id DESC LIMIT 1`,
    values
  );
  if (!related.rows[0]) return res.status(409).json({ error: 'Record a visit for this pet before adding a prescription.' });
  const date = req.body.date ? validDate(req.body.date, 'Prescription date') : null;
  const result = await db.query(
    `INSERT INTO prescription (record_id, medication_name, dosage, instructions, quantity, date_prescribed)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE))
     RETURNING prescription_id AS id, record_id AS "recordId", medication_name AS medication,
               dosage AS dose, instructions, quantity, date_prescribed AS date`,
    [related.rows[0].record_id, medication, dosage, instructions, quantity, date]
  );
  await db.query(
    `INSERT INTO audit_log (user_id, action_type, table_name, record_id, action_description)
     VALUES ($1, 'INSERT', 'prescription', $2, $3)`,
    [req.user.userId, result.rows[0].id, `Added prescription for ${medication}.`]
  );
  const full = await db.query(`${PRESCRIPTION_SELECT} WHERE rx.prescription_id = $1`, [result.rows[0].id]);
  return res.status(201).json(full.rows[0]);
}));

router.get(['/vaccinations', '/vet/vaccinations'], authenticate, asyncRoute(async (req, res) => {
  const isVetPage = req.path === '/vet/vaccinations';
  if (isVetPage && req.user.role !== 'Veterinarian') return res.status(403).json({ error: 'You do not have permission to view this list.' });
  if (!isVetPage && req.user.role !== 'Pet Owner') return res.status(403).json({ error: 'You do not have permission to view this list.' });
  const conditions = isVetPage
    ? `WHERE (v.veterinarian_id = (SELECT veterinarian_id FROM veterinarian WHERE user_id = $1)
              OR EXISTS (SELECT 1 FROM appointment a JOIN veterinarian av ON av.veterinarian_id = a.veterinarian_id
                          WHERE a.appointment_id = v.appointment_id AND av.user_id = $1))`
    : 'WHERE o.user_id = $1';
  const scheduledOwner = isVetPage ? 'vt.user_id = $1' : 'o.user_id = $1';
  const result = await db.query(
    `SELECT * FROM (
       SELECT v.vaccination_id AS id, v.vaccination_id AS "vaccinationId",
              p.owner_id AS owner, o.name AS "ownerName", p.pet_id AS "petId", p.name AS pet,
              v.vaccine_type AS vaccine, v.date_administered::text AS "dateAdministered",
              v.next_due_date::text AS "nextDue", v.administered_by AS "administeredBy",
              v.notes, v.last_reminded_at AS "lastRemindedAt", v.appointment_id AS "appointmentId", false AS scheduled
         FROM vaccination v
         JOIN pet p ON p.pet_id = v.pet_id
         JOIN owner o ON o.owner_id = p.owner_id
        ${conditions}
       UNION ALL
       SELECT -(a.appointment_id * 1000 + sv.service_id), -(a.appointment_id * 1000 + sv.service_id),
              p.owner_id, o.name, p.pet_id, p.name,
              regexp_replace(sv.service_name, '^Vaccin(e|ation):\\s*', ''), NULL::text,
              a.appointment_date::text, COALESCE(vt.name, 'To be assigned'),
              'Upcoming appointment', NULL::timestamp, a.appointment_id, true
         FROM appointment a
         JOIN pet p ON p.pet_id = a.pet_id
         JOIN owner o ON o.owner_id = p.owner_id
         JOIN appointment_service aps ON aps.appointment_id = a.appointment_id
         JOIN service sv ON sv.service_id = aps.service_id
         LEFT JOIN veterinarian vt ON vt.veterinarian_id = a.veterinarian_id
        WHERE sv.service_name ILIKE '%vaccin%'
          AND a.status IN ('Pending', 'Approved', 'Scheduled', 'Checked-in', 'In Progress')
          AND a.appointment_date >= CURRENT_DATE
          AND ${scheduledOwner}
          AND NOT EXISTS (SELECT 1 FROM vaccination x WHERE x.appointment_id = a.appointment_id)
     ) t
     ORDER BY "dateAdministered" DESC NULLS FIRST, id DESC`,
    [req.user.userId]
  );
  return res.json(result.rows);
}));

router.post('/vaccinations', authenticate, authorize('Admin', 'Staff', 'Veterinarian'), asyncRoute(async (req, res) => {
  const petId = validId(req.body.petId);
  if (!petId) return res.status(400).json({ error: 'Choose a valid pet.' });
  const vaccine = requiredString(req.body.vaccine, 'Vaccine', 100);
  const dateAdministered = validDate(req.body.dateAdministered, 'Date administered');
  const nextDue = req.body.nextDue ? validDate(req.body.nextDue, 'Next due date') : null;
  if (nextDue && nextDue < dateAdministered) return res.status(400).json({ error: 'Next due date cannot be before the date administered.' });
  const appointmentId = req.body.appointmentId == null || req.body.appointmentId === '' ? null : validId(req.body.appointmentId);
  if (req.body.appointmentId && !appointmentId) return res.status(400).json({ error: 'Invalid appointment ID.' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const pet = await client.query(
      `SELECT p.pet_id, o.owner_id, o.user_id, o.name AS owner_name, p.name AS pet_name
         FROM pet p JOIN owner o ON o.owner_id = p.owner_id
        WHERE p.pet_id = $1 AND p.pet_status = 'Active'
        FOR UPDATE OF p`,
      [petId]
    );
    if (!pet.rows[0]) {
      await client.query('ROLLBACK');
      return notFound(res, 'Active pet not found.');
    }
    let vetId = null;
    let administrator = req.user.role;
    if (req.user.role === 'Veterinarian') {
      const vet = await client.query('SELECT veterinarian_id, name FROM veterinarian WHERE user_id = $1', [req.user.userId]);
      if (!vet.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Veterinarian account not found.' });
      }
      vetId = vet.rows[0].veterinarian_id;
      administrator = vet.rows[0].name;
    }
    if (appointmentId) {
      const appointment = await client.query(
        `SELECT appointment_id, veterinarian_id FROM appointment
          WHERE appointment_id = $1 AND pet_id = $2 FOR UPDATE`,
        [appointmentId, petId]
      );
      if (!appointment.rows[0] || (vetId && appointment.rows[0].veterinarian_id !== vetId)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Appointment does not belong to this pet or veterinarian.' });
      }
    } else if (vetId) {
      const assigned = await client.query(
        `SELECT 1 FROM appointment
          WHERE pet_id = $1 AND veterinarian_id = $2
          LIMIT 1`,
        [petId, vetId]
      );
      if (!assigned.rowCount) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'You may only record vaccinations for pets assigned to you.' });
      }
    }
    const result = await client.query(
      `INSERT INTO vaccination
         (pet_id, veterinarian_id, vaccine_type, date_administered, next_due_date, notes, administered_by, appointment_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING vaccination_id AS id, vaccination_id AS "vaccinationId", pet_id AS "petId",
                 vaccine_type AS vaccine, date_administered::text AS "dateAdministered",
                 next_due_date::text AS "nextDue", administered_by AS "administeredBy",
                 notes, last_reminded_at AS "lastRemindedAt"`,
      [petId, vetId, vaccine, dateAdministered, nextDue, req.body.notes || null, administrator, appointmentId]
    );
    await writeAudit(client, req.user.userId, 'INSERT', 'vaccination', result.rows[0].id, `Recorded ${vaccine} vaccination for ${pet.rows[0].pet_name}.`);
    await createNotification(client, pet.rows[0].user_id, 'reminder', 'Vaccination recorded',
      `${vaccine} was recorded for ${pet.rows[0].pet_name}${nextDue ? ` and is next due on ${nextDue}` : ''}.`);
    await client.query('COMMIT');
    return res.status(201).json({ ...result.rows[0], owner: pet.rows[0].owner_id, ownerName: pet.rows[0].owner_name, pet: pet.rows[0].pet_name });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.get('/staff/vaccination-reminders', authenticate, authorize('Admin', 'Staff'), asyncRoute(async (_req, res) => {
  const result = await db.query(
    `SELECT v.vaccination_id AS id, p.owner_id AS owner, p.pet_id AS "petId",
            p.name AS pet, o.name AS "ownerName", COALESCE(o.phone, u.phone) AS phone,
            v.vaccine_type AS vaccine, v.date_administered::text AS "dateAdministered",
            v.next_due_date::text AS "nextDue", v.administered_by AS "administeredBy",
            v.last_reminded_at AS "lastRemindedAt"
       FROM (SELECT DISTINCT ON (pet_id, lower(vaccine_type)) *
               FROM vaccination
              ORDER BY pet_id, lower(vaccine_type), date_administered DESC, vaccination_id DESC) v
       JOIN pet p ON p.pet_id = v.pet_id
       JOIN owner o ON o.owner_id = p.owner_id
       LEFT JOIN user_account u ON u.user_id = o.user_id
      WHERE v.next_due_date IS NOT NULL AND p.pet_status = 'Active'
      ORDER BY v.next_due_date, o.name, p.name`
  );
  return res.json(result.rows);
}));

router.post('/vaccination-reminders/:id/notify', authenticate, authorize('Admin', 'Staff'), asyncRoute(async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid vaccination ID.' });
  const selected = await db.query(
    `SELECT v.vaccination_id, v.vaccine_type, v.next_due_date::text AS next_due_date, v.pet_id,
            p.name AS pet_name, o.name AS owner_name, o.user_id,
            COALESCE(o.phone, u.phone) AS phone
       FROM vaccination v
       JOIN pet p ON p.pet_id = v.pet_id
       JOIN owner o ON o.owner_id = p.owner_id
       LEFT JOIN user_account u ON u.user_id = o.user_id
      WHERE v.vaccination_id = $1 AND v.next_due_date IS NOT NULL`,
    [id]
  );
  if (!selected.rows[0]) return notFound(res, 'Vaccination reminder not found.');
  const row = selected.rows[0];
  const phone = normalizePhone(row.phone);
  if (!phone) return res.status(409).json({ error: 'The owner does not have a valid mobile number for SMS reminders.' });
  await sendSms(phone, `Pawpaw Clinic reminder: ${row.vaccine_type} for ${row.pet_name} is due on ${row.next_due_date}. Please book a visit.`);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE vaccination SET last_reminded_at = CURRENT_TIMESTAMP
        WHERE vaccination_id = $1
        RETURNING last_reminded_at AS "sentAt"`,
      [id]
    );
    await createNotification(client, row.user_id, 'reminder', `Vaccine reminder: ${row.pet_name}`,
      `${row.vaccine_type} is due on ${row.next_due_date}. Book an appointment to keep your pet protected.`);
    await writeAudit(client, req.user.userId, 'UPDATE', 'vaccination', id, `Sent a vaccination reminder for ${row.pet_name}.`);
    await client.query('COMMIT');
    return res.json({ sentAt: updated.rows[0].sentAt });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/vet/appointments/:id/complete', authenticate, authorize('Veterinarian'), asyncRoute(async (req, res) => {
  const appointmentId = validId(req.params.id);
  if (!appointmentId) return res.status(400).json({ error: 'Invalid appointment ID.' });
  const diagnosis = await resolveDiagnosis(db, appointmentId, req.body.diagnosis);
  const prescriptions = req.body.prescription ? [req.body.prescription] : [];
  if (!Array.isArray(req.body.vaccines || [])) return res.status(400).json({ error: 'Vaccines must be an array.' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const appointment = await client.query(
      `SELECT a.appointment_id, a.pet_id, a.status, a.appointment_date,
              v.veterinarian_id, v.user_id, v.name AS veterinarian_name,
              p.name AS pet_name, o.user_id AS owner_user_id
         FROM appointment a
         JOIN pet p ON p.pet_id = a.pet_id
         JOIN owner o ON o.owner_id = p.owner_id
         LEFT JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
        WHERE a.appointment_id = $1
        FOR UPDATE OF a`,
      [appointmentId]
    );
    const appt = appointment.rows[0];
    if (!appt) {
      await client.query('ROLLBACK');
      return notFound(res, 'Appointment not found.');
    }
    if (Number(appt.user_id) !== Number(req.user.userId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only complete appointments assigned to you.' });
    }
    if (!['Checked-in', 'In Progress'].includes(appt.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Start the appointment before completing the visit.' });
    }

    const record = await client.query(
      `INSERT INTO medical_record (appointment_id, diagnosis, treatment, notes, record_date)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (appointment_id)
       DO UPDATE SET diagnosis = EXCLUDED.diagnosis, treatment = EXCLUDED.treatment,
                     notes = EXCLUDED.notes, record_date = EXCLUDED.record_date
       RETURNING record_id`,
      [appointmentId, diagnosis, req.body.treatment || null, req.body.notes || null, appt.appointment_date]
    );
    await client.query('DELETE FROM prescription WHERE record_id = $1', [record.rows[0].record_id]);
    for (const prescription of prescriptions) {
      const medication = requiredString(prescription.medication, 'Medication', 100);
      const dosage = requiredString(prescription.dose, 'Dosage', 50);
      const instructions = requiredString(prescription.instructions, 'Instructions', 10000);
      const quantity = Number(prescription.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        const error = new Error('Prescription quantity must be a positive whole number.');
        error.status = 400;
        throw error;
      }
      await client.query(
        `INSERT INTO prescription (record_id, medication_name, dosage, instructions, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [record.rows[0].record_id, medication, dosage, instructions, quantity]
      );
    }
    await client.query('DELETE FROM vaccination WHERE appointment_id = $1', [appointmentId]);
    for (const vaccine of req.body.vaccines || []) {
      const name = requiredString(vaccine.name, 'Vaccine', 100);
      const due = validDate(vaccine.nextDue, 'Vaccine next due date');
      await client.query(
        `INSERT INTO vaccination
           (pet_id, veterinarian_id, vaccine_type, date_administered, next_due_date, administered_by, appointment_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [appt.pet_id, appt.veterinarian_id, name, appt.appointment_date, due, appt.veterinarian_name, appointmentId]
      );
    }
    await client.query(
      `UPDATE appointment SET status = 'Completed', updated_date = CURRENT_TIMESTAMP
        WHERE appointment_id = $1`,
      [appointmentId]
    );
    await createNotification(client, appt.owner_user_id, 'appointment', 'Visit completed',
      `${appt.pet_name} has finished the visit. See Medical Records for the details.`);
    await writeAudit(client, req.user.userId, 'UPDATE', 'appointment', appointmentId, `Completed the visit for ${appt.pet_name}.`);
    await writeAudit(client, req.user.userId, 'INSERT', 'medical_record', record.rows[0].record_id, `Saved a visit record for ${appt.pet_name}.`);
    await client.query('COMMIT');
    return res.json({ message: 'Visit completed.', appointmentId, recordId: record.rows[0].record_id });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.get('/vet/dashboard', authenticate, authorize('Veterinarian'), asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT COUNT(*) FILTER (WHERE a.appointment_date = CURRENT_DATE)::int AS "todayAppointments",
            COUNT(*) FILTER (WHERE a.status IN ('Scheduled', 'Approved', 'Pending')
                             AND a.appointment_date >= CURRENT_DATE)::int AS "upcomingAppointments",
            COUNT(DISTINCT a.pet_id)::int AS patients,
            COUNT(DISTINCT r.record_id)::int AS "medicalRecords"
       FROM veterinarian v
       LEFT JOIN appointment a ON a.veterinarian_id = v.veterinarian_id
       LEFT JOIN medical_record r ON r.appointment_id = a.appointment_id
      WHERE v.user_id = $1`,
    [req.user.userId]
  );
  return res.json(result.rows[0] || { todayAppointments: 0, upcomingAppointments: 0, patients: 0, medicalRecords: 0 });
}));

function auditFilters(query, values) {
  const where = [];
  if (query.user) {
    const userId = validId(query.user);
    if (!userId) {
      const error = new Error('User filter must be a valid user ID.');
      error.status = 400;
      throw error;
    }
    values.push(userId);
    where.push(`l.user_id = $${values.length}`);
  }
  if (query.action) {
    const action = String(query.action).toUpperCase();
    const mapped = action === 'CREATE' ? 'INSERT' : action === 'DELETE' ? 'DELETE' : action;
    if (!['INSERT', 'UPDATE', 'DEACTIVATE', 'DELETE', 'LOGIN', 'LOGOUT'].includes(mapped)) {
      const error = new Error('Invalid audit action filter.');
      error.status = 400;
      throw error;
    }
    if (mapped === 'DEACTIVATE') {
      where.push(`(l.action_type = 'DELETE' OR (l.action_type = 'UPDATE' AND l.action_description ILIKE 'Deactivated%'))`);
    } else if (mapped === 'UPDATE') {
      where.push(`(l.action_type = 'UPDATE' AND l.action_description NOT ILIKE 'Deactivated%')`);
    } else {
      values.push(mapped);
      where.push(`l.action_type = $${values.length}`);
    }
  }
  if (query.record) {
    values.push(String(query.record).slice(0, 100));
    where.push(`l.table_name = $${values.length}`);
  }
  for (const key of ['from', 'to']) {
    if (query[key]) {
      const date = validDate(query[key], `${key} date`);
      values.push(date);
      where.push(key === 'from'
        ? `l.action_date >= $${values.length}::date`
        : `l.action_date < ($${values.length}::date + INTERVAL '1 day')`);
    }
  }
  return where.length ? `WHERE ${where.join(' AND ')}` : '';
}

router.get('/audit-log/export.csv', authenticate, authorize('Admin'), asyncRoute(async (req, res) => {
  const values = [];
  const where = auditFilters(req.query, values);
  const result = await db.query(
    `SELECT l.action_date, COALESCE(u.username, 'Unknown') AS username,
            u.role, l.action_type, l.table_name, l.action_description
       FROM audit_log l
       LEFT JOIN user_account u ON u.user_id = l.user_id
       ${where}
      ORDER BY l.action_date DESC, l.audit_id DESC
      LIMIT 10000`,
    values
  );
  const csv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [
    ['at', 'user', 'role', 'action', 'record', 'details'].map(csv).join(','),
    ...result.rows.map((row) => [row.action_date, row.username, row.role, (row.action_type === 'DELETE' || (row.action_type === 'UPDATE' && /^deactivated/i.test(row.action_description || '')) ? 'DEACTIVATE' : row.action_type), row.table_name, row.action_description].map(csv).join(','))
  ];
  res.type('text/csv');
  res.set('Content-Disposition', 'attachment; filename="pawpaw-audit-log.csv"');
  return res.send(lines.join('\r\n'));
}));

module.exports = router;