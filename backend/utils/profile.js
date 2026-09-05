// Student profile fields: the allow-list, the normalizers, and the validator.
//
// Every write path shares this module — POST /register, POST /complete-profile and the admin's
// PATCH /admin/users/:id/profile — so a value can only ever enter the database in one canonical
// form. That matters for two reasons:
//
//  1. `class_section` is free text. Without a single normalizer, "cse a", "CSE  A" and " CSE A "
//     become three separate classes in the analytics filters and the admin has to merge them by
//     hand forever.
//  2. `university_reg_number` is covered by a UNIQUE index. Uniqueness is only as strong as the
//     normalization in front of it — if one route upper-cases and another does not, 'abc123' and
//     'ABC123' occupy two rows and the constraint is trivially bypassed.
//
// Pure and DB-free, like utils/analytics.js, so it is directly unit-testable.

// The fixed institution list. Mirrored by the users_university_check CHECK constraint in
// db/schema.sql — adding a university means editing BOTH. Guarding at the app layer as well as
// the database is the same belt-and-braces treatment `role` already gets (a CHECK in the CREATE
// TABLE body plus the allowedRoles list in routes/auth.js).
const UNIVERSITIES = ['SRIHER', 'ACS'];

// The profile columns every authenticated response carries, so the frontend can decide whether to
// show the completion gate and pre-fill it. One list because /auth/login, /auth/me and
// /auth/google each run their own SELECT and they must not drift apart. Interpolated as a dynamic
// column list — postgres.js escapes an array of strings in an identifier position: sql(COLUMNS).
const PROFILE_COLUMNS = [
  'first_name',
  'last_name',
  'mobile_number',
  'university',
  'university_reg_number',
  'class_section',
];


// Trim, collapse runs of internal whitespace, upper-case. Applied to class sections so that
// "cse  a" and " CSE A " both land as the single value "CSE A".
function normalizeClassSection(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim().replace(/\s+/g, ' ').toUpperCase();
  return cleaned === '' ? null : cleaned;
}

// Registration numbers get the same treatment minus the internal spaces, which are never
// meaningful in an ID. Upper-casing is what makes the UNIQUE index actually unique.
function normalizeRegNumber(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/\s+/g, '').toUpperCase();
  return cleaned === '' ? null : cleaned;
}

// Mobile is optional and may be international, so this only strips presentation characters and
// checks the result is plausibly a phone number. Deliberately permissive: rejecting a real number
// is worse than storing an odd one, since nothing downstream dials it.
function normalizeMobile(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/[\s()\-.]/g, '');
  return cleaned === '' ? null : cleaned;
}

function isValidMobile(value) {
  return /^\+?\d{7,15}$/.test(value);
}

function normalizeUniversity(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim().toUpperCase();
  return cleaned === '' ? null : cleaned;
}

// Trim a name part and collapse internal whitespace. Returns null for empty so the caller can
// tell "not supplied" from "supplied as blank".
function normalizeNamePart(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim().replace(/\s+/g, ' ');
  return cleaned === '' ? null : cleaned;
}

// users.name stays the authoritative display value (it is NOT NULL and read by the leaderboard,
// every report, avatars and the verification email), so it is always written as the joined pair.
function joinName(firstName, lastName) {
  return [firstName, lastName].filter(Boolean).join(' ');
}

// Best-effort split of an existing users.name for pre-filling the completion form. First token is
// the first name, everything after it is the last name — the user can correct it before saving.
function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

// A profile is only ever "incomplete" for students — teachers and admins have no university,
// class or registration number, so they must never be shown the completion gate.
function isProfileComplete(user) {
  if (!user) return false;
  if (user.role !== 'student') return true;
  return Boolean(user.university && user.university_reg_number && user.class_section);
}

/**
 * Validate and normalize the student profile fields from a request body.
 *
 * @param {object} body  raw request body
 * @param {object} opts
 * @param {boolean} opts.requireIdentifiers  demand university + reg number + class (true for
 *   student registration and profile completion; false for the admin's partial edit, where any
 *   supplied field is still validated but a missing one is left alone)
 * @param {boolean} opts.requireName  demand first + last name
 * @returns {{ errors: string[], values: object }}  `values` contains only the keys present in
 *   `body`, so a PATCH can apply exactly what was sent.
 */
function validateStudentProfile(body, { requireIdentifiers = true, requireName = true } = {}) {
  const errors = [];
  const values = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  if (has('firstName') || requireName) {
    const firstName = normalizeNamePart(body.firstName);
    if (!firstName && requireName) errors.push('First name is required');
    if (firstName && firstName.length > 100) errors.push('First name is too long');
    values.first_name = firstName;
  }

  if (has('lastName') || requireName) {
    const lastName = normalizeNamePart(body.lastName);
    if (!lastName && requireName) errors.push('Last name is required');
    if (lastName && lastName.length > 100) errors.push('Last name is too long');
    values.last_name = lastName;
  }

  if (has('university') || requireIdentifiers) {
    const university = normalizeUniversity(body.university);
    if (!university) {
      if (requireIdentifiers) errors.push('University is required');
      else values.university = null;
    } else if (!UNIVERSITIES.includes(university)) {
      errors.push(`University must be one of: ${UNIVERSITIES.join(', ')}`);
    } else {
      values.university = university;
    }
  }

  if (has('universityRegNumber') || requireIdentifiers) {
    const reg = normalizeRegNumber(body.universityRegNumber);
    if (!reg && requireIdentifiers) errors.push('University registration number is required');
    if (reg && reg.length > 64) errors.push('University registration number is too long');
    values.university_reg_number = reg;
  }

  if (has('classSection') || requireIdentifiers) {
    const cls = normalizeClassSection(body.classSection);
    if (!cls && requireIdentifiers) errors.push('Class or section is required');
    if (cls && cls.length > 64) errors.push('Class or section is too long');
    values.class_section = cls;
  }

  // Optional, but a supplied value still has to look like a phone number.
  if (has('mobileNumber')) {
    const mobile = normalizeMobile(body.mobileNumber);
    if (mobile && !isValidMobile(mobile)) {
      errors.push('Mobile number must be 7-15 digits, optionally starting with +');
    }
    values.mobile_number = mobile;
  }

  // The composite UNIQUE index is on (university, university_reg_number) and skips rows where
  // either is NULL — NULLs compare as distinct in a multi-column index, so (NULL, 'ABC123')
  // could otherwise be inserted twice. Refusing the pairing here is what keeps the constraint
  // meaningful rather than silently unenforced.
  if (values.university_reg_number && !values.university) {
    errors.push('A university must be selected before a registration number can be saved');
  }

  return { errors, values };
}

module.exports = {
  UNIVERSITIES,
  PROFILE_COLUMNS,
  normalizeClassSection,
  normalizeRegNumber,
  normalizeMobile,
  normalizeUniversity,
  normalizeNamePart,
  isValidMobile,
  joinName,
  splitName,
  isProfileComplete,
  validateStudentProfile,
};
