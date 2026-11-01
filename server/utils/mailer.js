const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

function ensureEmailConfigured() {
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_PORT
      || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    const error = new Error('Email delivery is not configured. Set EMAIL_HOST, EMAIL_PORT, EMAIL_USER, and EMAIL_PASS.');
    error.status = 503;
    throw error;
  }
}

async function sendPasswordResetCode(toEmail, code) {
  ensureEmailConfigured();
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || '"Pawpaw Clinic Support" <support@pawpaw.clinic>',
    to: toEmail,
    subject: 'Your Pawpaw Clinic password reset code',
    text: `Your Pawpaw Clinic password reset code is ${code}. It expires in 15 minutes. If you did not request this, you can ignore this email.`,
    html: `<p>Your Pawpaw Clinic password reset code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>It expires in 15 minutes. If you did not request this, you can ignore this email.</p>`
  });
}

const sendResetEmail = async (toEmail, resetToken) => {
  const resetLink = `${process.env.CLIENT_URL}/pages/auth/set-new-password.html?token=${resetToken}`;
  
  await transporter.sendMail({
    from: '"Pawpaw Clinic Support" <support@pawpaw.clinic>',
    to: toEmail,
    subject: 'Password Reset Request - Pawpaw Clinic',
    html: `
      <h3>Password Reset Request</h3>
      <p>You requested a password reset for your Pawpaw Clinic account.</p>
      <p>Click the link below to set a new password (expires in 15 minutes):</p>
      <a href="${resetLink}">${resetLink}</a>
      <p>If you didn't request this, please ignore this email.</p>
    `
  });
};

module.exports = { sendResetEmail, sendPasswordResetCode, ensureEmailConfigured };