# Pawpaw Clinic
### Veterinary Clinic Management System

## 1. Project Overview

Pawpaw Clinic is a web-based Veterinary Clinic Management System designed to streamline and organize veterinary clinic operations. It provides a centralized platform for managing pet owners, pets, appointments, veterinary services, medical records, and vaccinations.

The system has four user roles:

- **Administrator** – Manages system users, staff, veterinarians, services, and clinic records.
- **Staff** – Handles appointments, pet owner information, walk-in registrations, and clinic records.
- **Veterinarian** – Manages appointments, patients, medical records, and vaccinations.
- **Pet Owner** – Manages pet profiles, books and reschedules appointments, and views medical records and vaccination history.

## 2. Technology Stack

| Technology | Purpose |
|---|---|
| HTML5 | Frontend structure |
| CSS3 | Interface styling |
| JavaScript | Frontend functionality |
| Node.js | Backend runtime |
| Express.js | Backend framework and API |
| PostgreSQL | Relational database |
| node-postgres (pg) | Database connectivity |
| bcryptjs | Password hashing |
| dotenv | Environment configuration |
| Nodemailer | Email integration |
| Twilio | SMS integration |

## 3. Project Structure

```text
DBA-main/
├── assets/                 # Images and visual assets
├── css/                    # Stylesheets
│   └── pages/              # Role-specific styles
├── js/                     # Frontend JavaScript
│   ├── admin/
│   ├── auth/
│   ├── core/
│   ├── owner/
│   ├── staff/
│   └── vet/
├── pages/                  # HTML pages
│   ├── admin/
│   ├── auth/
│   ├── owner/
│   ├── staff/
│   └── vet/
├── server/
│   ├── config/             # Database configuration
│   ├── middleware/         # Authentication middleware
│   ├── routes/             # API endpoints
│   ├── scripts/            # Admin and seed scripts
│   ├── utils/              # Backend utilities
│   ├── .env.example        # Environment template
│   ├── app.js              # Express application
│   ├── index.js            # Server entry point
│   ├── migrate.js          # Database initialization
│   ├── schema.sql          # Database schema
│   └── package.json        # Backend dependencies
├── .gitignore
└── README.md
```

## 4. Database Information

**Database Management System:** PostgreSQL

**Database Name:** `group3_Pawpaw`

The database stores and manages the following main records:

- User accounts
- Pet owners
- Veterinarians
- Pets
- Clinic services
- Appointments
- Appointment services
- Medical records
- Prescriptions
- Vaccinations
- Audit logs
- Notifications
- Authentication sessions
- Password reset codes

The database schema is provided in `server/schema.sql` and uses primary keys, foreign keys, and constraints to maintain data integrity.

## 5. Application User Roles

| Application Role | Responsibilities |
|---|---|
| Administrator | Manages users, staff, veterinarians, services, and clinic records. |
| Staff | Manages appointments, owner and pet information, walk-in registrations, and clinic records. |
| Veterinarian | Handles appointments, patients, medical records, and vaccinations. |
| Pet Owner | Manages pet profiles, appointments, medical records, and vaccination history. |

## 6. Prerequisites

Before installing the application, ensure that the following are installed:

- Node.js and npm
- PostgreSQL
- Git

## 7. Installation and Setup

### Step 1: Clone the Repository

```bash
git clone https://github.com/rubiakylashane/GRP03_PAWPAW.git
cd GRP03_PAWPAW-main
```

### Step 2: Create the Database

Create a PostgreSQL database named:

```sql
CREATE DATABASE group3_Pawpaw;
```

### Step 3: Configure Environment Variables

Navigate to the server directory:

```bash
cd server
```

Copy the `.env.example` file and rename the copy to `.env`.

Configure the database connection and required application settings:

```env
PORT=5000
DATABASE_URL=postgresql://USERNAME:PASSWORD@localhost:5432/pawpaw_clinic
AUTH_SECRET=your-random-secret-at-least-32-characters-long

ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@example.com
ADMIN_NAME=System Administrator
ADMIN_PASSWORD=YourStrongPassword123!
```

Configure the email and SMS credentials if you intend to use these integrations.

### Step 4: Install Dependencies

Run inside the `server` directory:

```bash
npm install
```

### Step 5: Initialize the Database

```bash
npm run migrate
```

This executes the database schema and creates the required database objects.

### Step 6: Create an Administrator Account

```bash
npm run create-admin
```

This creates the initial administrator account using the credentials configured in `.env`.

### Step 7: Start the Application

```bash
npm start
```

### Step 8: Access the Application

Open your browser and visit:

http://localhost:5000

The Pawpaw Clinic login page should appear.

## 8. Available Commands

Run these commands inside the `server` directory.

| Command | Description |
|---|---|
| `npm install` | Installs project dependencies. |
| `npm run migrate` | Initializes the database schema. |
| `npm run create-admin` | Creates an administrator account. |
| `npm run seed` | Loads sample application accounts and data. |
| `npm start` | Starts the application server. |
| `npm run dev` | Starts the server in development mode. |
| `npm run check` | Checks selected backend files for syntax errors. |

## 9. Troubleshooting

| Problem | Possible Solution |
|---|---|
| Database connection failed | Check PostgreSQL status and database credentials. |
| Port already in use | Change the `PORT` value in `.env`. |
| Missing environment variables | Check your `.env` configuration. |
| Email delivery error | Configure the required email credentials. |
| Dependencies missing | Run `npm install` inside the server directory. |
| Administrator creation failed | Verify the administrator environment variables and password requirements. |


