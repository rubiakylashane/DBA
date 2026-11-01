require('dotenv').config();

const express = require('express');
const path = require('path');
const authRoutes = require('./routes/auth');
const clinicRoutes = require('./routes/clinic');
const passwordResetRoutes = require('./routes/password-reset');
const integrationRoutes = require('./routes/integrations');

const app = express();
const webRoot = path.resolve(__dirname, '..');

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', authRoutes);
app.use('/api/forgot-password', passwordResetRoutes);
app.use('/api', integrationRoutes);
app.use('/api', clinicRoutes);

// The first page is the login page.
app.get('/', (_req, res) => res.redirect('/pages/auth/login.html'));
app.use('/assets', express.static(path.join(webRoot, 'assets')));
app.use('/css', express.static(path.join(webRoot, 'css')));
app.use('/js', express.static(path.join(webRoot, 'js')));
app.use('/pages', express.static(path.join(webRoot, 'pages')));

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((error, _req, res, _next) => {
  console.error('Request failed:', error);
  if (error.code === '23505') return res.status(409).json({ error: 'A record with that username, email, license, or name already exists.' });
  if (error.code === '23503' || error.code === '23514') return res.status(400).json({ error: 'The requested change conflicts with related clinic records.' });
  return res.status(error.status || 500).json({ error: error.status ? error.message : 'The request could not be completed.' });
});

module.exports = app;