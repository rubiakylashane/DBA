/* One password rule for the whole system (owner sign-up, staff / vet / admin accounts, password changes and resets).
   At least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol; no spaces. */
const PASSWORD_RULE = 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number and a symbol (e.g. ! @ # $).';

function passwordProblem(value) {
  const p = String(value ?? '');
  if (p.length < 8 || p.length > 200 || /\s/.test(p)
      || !/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/\d/.test(p) || !/[^A-Za-z0-9\s]/.test(p)) return PASSWORD_RULE;
  return '';
}

/* throws a 400 the error handler understands */
function requireStrongPassword(value) {
  const problem = passwordProblem(value);
  if (problem) throw Object.assign(new Error(problem), { status: 400 });
  return value;
}

module.exports = { PASSWORD_RULE, passwordProblem, requireStrongPassword };