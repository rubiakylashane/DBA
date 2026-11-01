function configuration() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    const error = new Error('SMS delivery is not configured. Set the Twilio account SID, auth token, and from number.');
    error.status = 503;
    throw error;
  }
  return { accountSid: TWILIO_ACCOUNT_SID, authToken: TWILIO_AUTH_TOKEN, from: TWILIO_FROM_NUMBER };
}

async function sendSms(to, message) {
  const { accountSid, authToken, from } = configuration();
  const body = new URLSearchParams({ To: to, From: from, Body: message });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  await response.arrayBuffer();
  if (!response.ok) {
    const error = new Error('SMS delivery failed. Check the Twilio configuration and recipient number.');
    error.status = 502;
    throw error;
  }
}

module.exports = { sendSms, ensureSmsConfigured: configuration };
