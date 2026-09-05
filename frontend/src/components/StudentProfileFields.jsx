import { UNIVERSITIES } from '../constants';
import { Input } from './ui';

/**
 * StudentProfileFields — the one rendering of the student identity fields.
 *
 * The same six fields are collected in three different places: the sign-up form, the
 * post-Google "Complete Your Profile" step, and ProfileCompletionGate for students who
 * registered before these fields existed. Keeping one component means the label wording, the
 * university options and the required-ness can never drift between them — which matters here
 * because the server validates all three through one shared validator
 * (backend/utils/profile.js), so a form that asks for something different would produce
 * confusing 400s rather than a friendly hint.
 *
 * Fully controlled and presentational: it holds no state, does no normalization and does no
 * network work. Trimming, whitespace collapsing and upper-casing all happen server-side, so
 * what the student typed is exactly what they keep seeing while they type it.
 *
 * Props:
 *   value       — { firstName, lastName, mobileNumber, university, universityRegNumber, classSection }
 *   onChange    — called with a PATCH object, e.g. { classSection: 'CSE A' }
 *   fieldErrors — optional { <fieldName>: 'message' }; used to hang the 409 duplicate-registration
 *                 message directly off the field that caused it
 *   required    — whether university / reg number / class are mandatory. False for an admin edit,
 *                 where a partial record is a legitimate save.
 *   showIdentifiers — set false for a non-student account: a university, its registration number
 *                 and a class are all student identifiers, and the server ignores them for
 *                 teachers, so asking would be asking for nothing.
 *   disabled    — set while a submit is in flight
 */
export default function StudentProfileFields({
  value,
  onChange,
  fieldErrors = {},
  required = true,
  showIdentifiers = true,
  disabled = false,
  idPrefix = 'profile',
}) {
  const v = value || {};
  const set = (key) => (e) => onChange({ [key]: e.target.value });

  return (
    <>
      {/* Two-up on anything wider than a phone; the pair reads as one name, so they stay adjacent. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          id={`${idPrefix}-first-name`}
          type="text"
          label="First Name"
          placeholder="Priya"
          value={v.firstName || ''}
          onChange={set('firstName')}
          error={fieldErrors.firstName}
          autoComplete="given-name"
          maxLength={100}
          disabled={disabled}
          required
        />
        <Input
          id={`${idPrefix}-last-name`}
          type="text"
          label="Last Name"
          placeholder="Sharma"
          value={v.lastName || ''}
          onChange={set('lastName')}
          error={fieldErrors.lastName}
          autoComplete="family-name"
          maxLength={100}
          disabled={disabled}
        />
      </div>

      {/* University comes before the registration number on purpose: a number is issued BY an
          institution and is only unique within it, so the pair is meaningless without this. The
          server rejects a registration number submitted with no university for the same reason. */}
      {showIdentifiers && (
        <>
          <Input
            as="select"
            id={`${idPrefix}-university`}
            label="University"
            value={v.university || ''}
            onChange={set('university')}
            error={fieldErrors.university}
            disabled={disabled}
            required={required}
          >
            <option value="">Select your university…</option>
            {UNIVERSITIES.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </Input>

          <Input
            id={`${idPrefix}-reg-number`}
            type="text"
            label="University Registration Number"
            placeholder="e.g. 21BCS1042"
            value={v.universityRegNumber || ''}
            onChange={set('universityRegNumber')}
            error={fieldErrors.universityRegNumber}
            help={fieldErrors.universityRegNumber ? undefined : 'As printed on your university records.'}
            autoComplete="off"
            maxLength={64}
            disabled={disabled}
            required={required}
          />

          <Input
            id={`${idPrefix}-class-section`}
            type="text"
            label="Class or Section"
            placeholder="e.g. CSE A"
            value={v.classSection || ''}
            onChange={set('classSection')}
            error={fieldErrors.classSection}
            help={fieldErrors.classSection ? undefined : 'Saved in a tidied-up form, so spacing and case do not matter.'}
            autoComplete="off"
            maxLength={64}
            disabled={disabled}
            required={required}
          />
        </>
      )}
      {/* The only optional field, and labelled as such so nobody hunts for what is wrong. */}
      <Input
        id={`${idPrefix}-mobile`}
        type="tel"
        label="Mobile Number (optional)"
        placeholder="+91 90000 00000"
        value={v.mobileNumber || ''}
        onChange={set('mobileNumber')}
        error={fieldErrors.mobileNumber}
        autoComplete="tel"
        maxLength={32}
        disabled={disabled}
      />
    </>
  );
}
