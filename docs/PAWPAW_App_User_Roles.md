# PAWPAW – Application User Roles Documentation

## 1. Overview

PAWPAW is a Veterinary Appointment and Pet Management System with four application user roles: Administrator, Staff, Veterinarian, and Pet Owner. Each role has defined responsibilities, functions, and access restrictions within the application.

## 2. Application User Roles

| Application Role | Responsibilities in the Application | Functions and Data Access | Intended Database Role |
|---|---|---|---|
| **Administrator** | Manages user accounts, system settings, and clinic operations. | Create, view, update, and delete user accounts as authorized; manage veterinary services; oversee appointments and records; view reports and audit logs. | `app_admin_grp` |
| **Staff** | Assists with appointment scheduling and daily clinic operations. | Create and view appointments; update appointment statuses; manage pet and owner information, and clinic services according to assigned permissions. Access to protected medical records is restricted. | `app_runtime_grp` |
| **Veterinarian** | Handles veterinary consultations and maintains pet medical information. | View assigned appointments and pet information; create and update medical records; record diagnoses, treatments, prescriptions, and vaccinations. | `app_runtime_grp` |
| **Pet Owner** | Manages personal information, registered pets, and veterinary appointments. | Register and manage personal pet records; book, reschedule, and cancel appointments; view appointment history and relevant medical records, prescriptions, and vaccination records for their own pets. | `app_runtime_grp` |

### Intended Database Roles

`app_runtime_grp` is the proposed PostgreSQL group role for routine backend database operations, with access limited to the permissions required by the application. `app_admin_grp` is the proposed group role for authorized elevated database operations; these database roles are distinct from application login roles and do not automatically grant PostgreSQL superuser access.

## 3. Application Role Restrictions

### Administrator
- User account creation, viewing, updating, and deletion are limited to authorized actions.
- Oversees appointments and records and can view reports and audit logs.

### Staff
- Manages appointments, pet and owner information, and clinic services according to assigned permissions.
- Access to protected medical records is restricted.

### Veterinarian
- Views assigned appointments and pet information.
- Creates and updates medical records and records diagnoses, treatments, prescriptions, and vaccinations.

### Pet Owner
- Manages their own personal information and registered pets.
- Books, reschedules, and cancels appointments.
- Views appointment history and relevant medical, prescription, and vaccination records for their own pets.

## 4. Summary

PAWPAW uses four application roles to organize access to clinic functions and information. Administrators oversee accounts and clinic operations; Staff assist with appointments and clinic records; Veterinarians manage consultations and medical information; and Pet Owners manage their pets and appointments and view their pets' relevant records. Access is subject to the permissions and limitations described above.
