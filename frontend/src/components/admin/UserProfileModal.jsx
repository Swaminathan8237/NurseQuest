import { useState } from 'react';
import { adminAPI } from '../../api';
import StudentProfileFields from '../StudentProfileFields';

// Lightweight i18n seam, matching AdminDashboard's.
const t = (val) => val;

/**
 * UserProfileModal — the admin's editor for one account's identity fields.
 *
 * Two jobs, both from the plan:
 *   1. Backfill accounts that predate the university / class / registration-number columns,
 *      without waiting for the student to log in and meet the completion gate.
 *   2. Act as the escape hatch for a registration-number collision — clear or correct the value
 *      that is squatting on a number and the blocked student can finish registering.
 *
 * Nothing here is mandatory. `required={false}` is passed to the shared fieldset because a partial
 * record is a legitimate save for an admin: knowing a student's class but not yet their
 * registration number is normal, and refusing that would push the admin into inventing values.
 * The server agrees — PATCH /admin/users/:id/profile validates with requireIdentifiers: false.
 *
 * The one rule the server does enforce is cross-field: a registration number cannot be saved
 * without a university, because the UNIQUE index is on the pair. That arrives as a 400 and is
 * shown above the buttons rather than pre-empted here, so there is one source of truth for it.
 *
 * Props:
 *   user    — the roster row being edited (snake_case, as /admin/users returns it)
 *   onClose — dismiss without saving
 *   onSaved — called with the updated user row after a successful save
 */
export default function UserProfileModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    mobileNumber: user.mobile_number || '',
    university: user.university || '',
    universityRegNumber: user.university_reg_number || '',
    classSection: user.class_section || '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // A university, its registration number and a class are student identifiers, so a plain teacher
  // or admin is not asked for them. The `||` matters though: an account promoted out of the
  // student role keeps whatever it had, and hiding the fields would leave the admin unable to
  // clear values they can see in the table.
  const showIdentifiers =
    user.role === 'student' ||
    Boolean(user.university || user.university_reg_number || user.class_section);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setSaving(true);
    try {
      const res = await adminAPI.updateUserProfile(user.id, form);
      onSaved(res.user || res);
    } catch (err) {
      setError(err.message || t('Could not save this profile.'));
      if (err.data?.field) setFieldErrors({ [err.data.field]: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fadeIn"
        onClick={() => !saving && onClose()}
      />
      <div className="bg-surface-container-low border border-white/10 p-6 md:p-7 rounded-2xl w-full max-w-lg relative z-10 shadow-2xl animate-fadeInScale max-h-[90vh] flex flex-col">

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-2xl">{t('badge')}</span>
            </div>
            <div className="min-w-0">
              <h3 className="text-xl font-bold font-headline truncate">{t('Edit Profile Details')}</h3>
              {/* Email and role are the read-only anchors: they say WHO is being edited, and both
                  are changed elsewhere (email never, role by the dropdown in the table). */}
              <p className="text-xs text-[var(--text-muted)] font-medium truncate">
                {user.email} · {t(user.role)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-on-surface hover:bg-white/5 transition-all shrink-0"
          >
            <span className="material-symbols-outlined">{t('close')}</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto py-5 space-y-4 pr-1">
            <StudentProfileFields
              idPrefix={`admin-${user.id}`}
              value={form}
              onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
              fieldErrors={fieldErrors}
              required={false}
              showIdentifiers={showIdentifiers}
              disabled={saving}
            />

            <p className="text-xs text-[var(--text-muted)] font-medium leading-relaxed">
              {t('Blank fields are cleared. Class names are tidied up on save, so spacing and case do not matter. The display name is rebuilt from the first and last name; clearing both keeps the current one.')}
            </p>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">{t('error')}</span>
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-3 px-4 bg-surface-container-high border border-white/5 hover:bg-surface-container-highest text-on-surface-variant font-headline font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
            >
              {t('Cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 px-4 bg-secondary hover:bg-secondary/90 text-white font-headline font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_4px_15px_rgba(183,109,255,0.3)]"
            >
              {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {saving ? t('Saving…') : t('Save Details')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
