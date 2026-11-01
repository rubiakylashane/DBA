<<<<<<< HEAD
# Pawpaw Veterinary Clinic

## Run the PostgreSQL-backed application

1. Create the database and apply the clinic's existing PostgreSQL schema.
2. In `server`, copy `.env.example` to `.env` and set `DATABASE_URL` (or the `PG*` connection settings), `PORT`, and an `AUTH_SECRET` of at least 32 characters.
3. Install and initialize the server:

   ```powershell
   cd server
   npm install
   npm run migrate
   npm run create-admin
   npm start
   ```

4. Open `http://localhost:5000`. The server serves the login page and the frontend assets.

The migration is additive and expects the existing clinic schemas and tables to be present. The administrator bootstrap reads its credentials from environment variables; do not commit real credentials. Set `window.PAWPAW_DEMO_MODE = true` before loading the login script only when intentionally using the local demo data.
=======
# DBA_PAWPAW
>>>>>>> 95c601c8ca5ed05af18cea1ca8158a77c7495209
