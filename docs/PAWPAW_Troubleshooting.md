# Troubleshooting

This section lists common setup and database-related problems and their possible solutions for the PAWPAW Clinic Veterinary Clinic Management System. The first six entries are taken from the project's `README.md`; the remaining four are recommended additions for database setup and maintenance.

## Troubleshooting Guide

| Problem | Possible Solution |
|---|---|
| Database connection failed | Check PostgreSQL status and database credentials. |
| Port already in use | Change the `PORT` value in `.env`. |
| Missing environment variables | Check your `.env` configuration. |
| Email delivery error | Configure the required email credentials. |
| Dependencies missing | Run `npm install` inside the server directory. |
| Administrator creation failed | Verify the administrator environment variables and password requirements. |
| PostgreSQL command not recognized | Verify that PostgreSQL is installed and its `bin` directory is included in the system PATH. |
| Database migration failed | Check the database connection, SQL syntax, and existing database objects before rerunning the migration. |
| Foreign key constraint violation | Ensure that referenced records exist before inserting dependent records. |
| Sample data insertion failed | Verify that the required tables exist and that the seed data satisfies database constraints. |