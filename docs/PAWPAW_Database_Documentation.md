# PAWPAW – Database Documentation

## 1. Overview

Pawpaw Clinic is a web-based Veterinary Clinic Management System. Its PostgreSQL database stores user accounts, pet owners, veterinarians, pets, clinic services, appointments, medical records, prescriptions, vaccinations, audit logs, notifications, authentication sessions, and password reset codes.

This documentation is based on the project's `server/schema.sql` and `server/migrate.js` files.

## 2. Database Information

| Item | Details |
|---|---|
| Database management system | PostgreSQL |
| Database name documented in README | `group3_Pawpaw` |
| Schema definition / migration SQL | `server/schema.sql` |
| Migration runner | `server/migrate.js` |
| Migration command | `npm run migrate` |
| Tables defined | 14 |

**Configuration note:** The README specifies `group3_Pawpaw` as the database to create, while its example `DATABASE_URL` ends in `pawpaw_clinic`. The actual target database depends on the configured connection string. These names are reproduced without changing the project files.

## 3. Database Tables

| Table | Primary Key | Purpose |
|---|---|---|
| `USER_ACCOUNT` | `user_id` | Stores application login accounts, roles, status, and profile details. |
| `OWNER` | `owner_id` | Stores pet owner contact and registration information. |
| `VETERINARIAN` | `veterinarian_id` | Stores veterinarian details and license numbers. |
| `SERVICE` | `service_id` | Stores veterinary services, prices, and descriptions. |
| `PET` | `pet_id` | Stores pets and their associated owners. |
| `APPOINTMENT` | `appointment_id` | Stores veterinary appointments, scheduling, status, and rescheduling/cancellation details. |
| `APPOINTMENT_SERVICE` | (`appointment_id`, `service_id`) | Associates appointments with services and quantities. |
| `MEDICAL_RECORD` | `record_id` | Stores diagnoses, treatments, notes, and service information for appointments. |
| `PRESCRIPTION` | `prescription_id` | Stores prescribed medication and dosage details. |
| `VACCINATION` | `vaccination_id` | Stores vaccination history, dates, and related personnel/appointments. |
| `AUDIT_LOG` | `audit_id` | Stores recorded actions and related account references. |
| `NOTIFICATION` | `notification_id` | Stores user notifications and read timestamps. |
| `AUTH_SESSION` | `token_hash` | Stores authentication session information and expiration. |
| `PASSWORD_RESET_CODE` | `reset_id` | Stores hashed password reset codes, attempts, and expiration details. |

## 4. Database Relationships and Foreign Keys

| Parent Table | Related Table | Foreign Key | Relationship / Rule |
|---|---|---|---|
| `USER_ACCOUNT` | `OWNER` | `OWNER.user_id` | One account can be linked to at most one owner record; the link is optional. `ON DELETE SET NULL`. |
| `USER_ACCOUNT` | `VETERINARIAN` | `VETERINARIAN.user_id` | One account can be linked to at most one veterinarian record; the link is optional. `ON DELETE SET NULL`. |
| `OWNER` | `PET` | `PET.owner_id` | One owner can have many pets; each pet requires one owner. `ON DELETE RESTRICT`. |
| `PET` | `APPOINTMENT` | `APPOINTMENT.pet_id` | One pet can have many appointments; each appointment requires a pet. `ON DELETE RESTRICT`. |
| `VETERINARIAN` | `APPOINTMENT` | `APPOINTMENT.veterinarian_id` | One veterinarian can be assigned many appointments; assignment is optional. `ON DELETE RESTRICT`. |
| `APPOINTMENT` | `APPOINTMENT_SERVICE` | `APPOINTMENT_SERVICE.appointment_id` | One appointment can have many associated service rows. `ON DELETE CASCADE`. |
| `SERVICE` | `APPOINTMENT_SERVICE` | `APPOINTMENT_SERVICE.service_id` | One service can appear in many appointment-service rows. `ON DELETE RESTRICT`. |
| `APPOINTMENT` | `MEDICAL_RECORD` | `MEDICAL_RECORD.appointment_id` | One appointment can have zero or one medical record; each medical record requires one appointment. `ON DELETE RESTRICT`. |
| `MEDICAL_RECORD` | `PRESCRIPTION` | `PRESCRIPTION.record_id` | One medical record can have many prescriptions. `ON DELETE CASCADE`. |
| `PET` | `VACCINATION` | `VACCINATION.pet_id` | One pet can have many vaccination records. `ON DELETE RESTRICT`. |
| `VETERINARIAN` | `VACCINATION` | `VACCINATION.veterinarian_id` | One veterinarian can be linked to many vaccination records; the link is optional. `ON DELETE RESTRICT`. |
| `APPOINTMENT` | `VACCINATION` | `VACCINATION.appointment_id` | One appointment can be linked to many vaccinations; the link is optional. `ON DELETE SET NULL`. |
| `USER_ACCOUNT` | `AUDIT_LOG` | `AUDIT_LOG.user_id` | One account can be referenced by many audit entries; the link is optional. `ON DELETE SET NULL`. |
| `USER_ACCOUNT` | `NOTIFICATION` | `NOTIFICATION.user_id` | One account can have many notifications. `ON DELETE CASCADE`. |
| `USER_ACCOUNT` | `AUTH_SESSION` | `AUTH_SESSION.user_id` | One account can have many authentication sessions. `ON DELETE CASCADE`. |
| `USER_ACCOUNT` | `PASSWORD_RESET_CODE` | `PASSWORD_RESET_CODE.user_id` | One account can have many password reset code records. `ON DELETE CASCADE`. |

`APPOINTMENT` and `SERVICE` have a many-to-many relationship implemented through `APPOINTMENT_SERVICE`, whose composite primary key prevents duplicate appointment/service pairs.

## 5. Keys and Unique Constraints

- **Primary keys:** Every table has a primary key. `APPOINTMENT_SERVICE` uses the composite primary key (`appointment_id`, `service_id`); `AUTH_SESSION` uses `token_hash` as its primary key.
- **Identity-generated keys:** Most tables use integer identity primary keys; `NOTIFICATION` and `PASSWORD_RESET_CODE` use `BIGINT GENERATED BY DEFAULT AS IDENTITY`.
- **Unique fields:** `USER_ACCOUNT.username`, `USER_ACCOUNT.email`, `OWNER.user_id`, `OWNER.email`, `VETERINARIAN.user_id`, `VETERINARIAN.license_number`, `SERVICE.service_name`, and `MEDICAL_RECORD.appointment_id`.
- **Foreign keys:** Relationships listed in Section 4 enforce references between related records.

## 6. Validation and Integrity Constraints

| Table | Constraint / Validation |
|---|---|
| `USER_ACCOUNT` | Role must be `Owner`, `Veterinarian`, `Staff`, or `Admin`; account status must be `Active` or `Inactive`. Username and password hash are required. |
| `OWNER` | Name is required; linked account and email are unique when supplied. |
| `VETERINARIAN` | Name is required; linked account and license number are unique when supplied. |
| `SERVICE` | Service name is required and unique; price must be zero or greater. |
| `PET` | Owner, name, and species are required; gender, if present, must be `Male`, `Female`, or `Unknown`; pet status must be `Active` or `Inactive`; birth date cannot be later than the current date. |
| `APPOINTMENT` | Pet, appointment date, time, and status are required; status must be `Pending`, `Scheduled`, `Approved`, `Checked-in`, `In Progress`, `Completed`, `Cancelled`, or `No-show`. |
| `APPOINTMENT_SERVICE` | Quantity must be greater than zero; each appointment/service combination is unique through its composite primary key. |
| `MEDICAL_RECORD` | Appointment and diagnosis are required; appointment reference must be unique; `services` is required JSONB defaulting to an empty JSON array. |
| `PRESCRIPTION` | Medical record, medication name, dosage, and instructions are required; quantity must be greater than zero. |
| `VACCINATION` | Pet, vaccine type, and administration date are required; next due date, if supplied, cannot precede the administration date. |
| `AUDIT_LOG` | Action type must be `INSERT`, `UPDATE`, `DELETE`, `LOGIN`, or `LOGOUT`; action type and table name are required. |
| `NOTIFICATION` | User, notification type, title, and message are required. |
| `AUTH_SESSION` | Token hash, user, role, and expiry are required; expiry must be later than creation. |
| `PASSWORD_RESET_CODE` | User, code hash, creation time, and expiry are required; attempts cannot be negative. |

## 7. Relevant Database Objects and Defaults

| Object / Feature | Description |
|---|---|
| Primary and foreign key constraints | Enforce record identity and referential integrity. |
| Check constraints | Validate roles, statuses, dates, quantities, and prices. |
| Unique constraints | Prevent duplicates in designated columns. |
| Identity columns | Generate identifiers for most tables. |
| Default timestamps and dates | Populate specified creation, registration, record, and prescription dates automatically. |
| `MEDICAL_RECORD.services` | JSONB column with an empty-array default. |
| `idx_password_reset_code_user_created` | Index on `PASSWORD_RESET_CODE(user_id, created_at DESC)`. |
| Initial `SERVICE` rows | Nine predefined clinic services are inserted with `ON CONFLICT (service_name) DO NOTHING`. |
| `ALTER TABLE` statements | Ensure `PET.pet_status` and `USER_ACCOUNT.profile_photo` exist. |
| Conditional constraint block | Adds `chk_pet_status` to `PET` if absent. |

The supplied `schema.sql` does **not** define views, triggers, stored procedures, or user-defined functions. Its `DO` block performs a conditional schema change; it is not a stored function.

## 8. Migration Process

The project's `server/migrate.js` loads environment variables, reads `server/schema.sql`, executes its SQL using the configured database connection, and closes the connection afterward.

| Component | File / Command | Function |
|---|---|---|
| Migration SQL | `server/schema.sql` | Defines tables, relationships, constraints, an index, and initial service rows. |
| Migration runner | `server/migrate.js` | Reads and executes the SQL file. |
| Migration command | `npm run migrate` | Runs the database initialization process. |

The script reports successful application of `schema.sql` and indicates that existing tables and data are preserved. `CREATE TABLE IF NOT EXISTS`, conditional alterations, and conflict handling for service records support repeated execution. However, the supplied migration runner does not show a migration version-history table or rollback mechanism.

## 9. Summary

The PAWPAW PostgreSQL database is defined by `server/schema.sql` and contains 14 related tables supporting clinic operations, pet and owner records, veterinary appointments, medical information, application access, and auditing. Its primary keys, foreign keys, unique constraints, check constraints, defaults, and index support database integrity and organization. The project's `server/migrate.js` executes this schema as the database initialization process.
