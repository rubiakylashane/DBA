function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function requiredString(value, field, maxLength = 255) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    const error = new Error(`${field} is required and must be at most ${maxLength} characters.`);
    error.status = 400;
    throw error;
  }
  return value.trim();
}

function notFound(res, message = 'Record not found.') {
  return res.status(404).json({ error: message });
}

module.exports = { asyncRoute, requiredString, notFound };
