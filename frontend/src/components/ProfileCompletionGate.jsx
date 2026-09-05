import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui';
import StudentProfileFields from './StudentProfileFields';

/**
 * ProfileCompletionGate — the interstitial an existing student meets BEFORE the dashboard, once,
 * when their account predates the university / registration-number / class fields.
 *
 * Follows StreakBreakGate: a plain full-height page rather than a floating overlay, so "before
 * they enter the dashboard" stays literally true and there is no z-index or scroll-behind to lose.
 * The differences from that one are deliberate:
 *
 *   - It cannot be dismissed. StreakBreakGate is an acknowledgement, so Escape closes it and
 *     localStorage remembers. This one collects data the class-wide analytics depend on, so it
 *     returns every visit until the fields are filled. Nothing is written client-side to remember
 *     it — completeness is a property of the row, read back from the server.
 *   - Students only. isProfileComplete() on the server returns true for teachers and admins, so
 *     `profileComplete` is never false for them and they never see this.
 *   - A duplicate registration number leaves the form OPEN with the message against the field, so
 *     the student retypes instead of hitting a wall they cannot pass. That is the whole reason the
 *     server answers a collision with a 409 naming the field rather than a 500.
 *
 * Props:
 *   onComplete — called after a successful save, to let the dashboard through
 */
export default function ProfileCompletionGate({ onComplete }) {
  const { user, completeProfile } = useAuth();

  // Pre-split the existing users.name on the first space, as a suggestion the student can correct.
  // Anything the account already holds wins over the guess.
  const [form, setForm] = useState(() => {
    const joined = String(user?.name || '').trim();
    const space = joined.indexOf(' ');
    return {
      firstName: user?.first_name || (space === -1 ? joined : joined.slice(0, space)),
      lastName: user?.last_name || (space === -1 ? '' : joined.slice(space + 1).trim()),
      mobileNumber: user?.mobile_number || '',
      university: user?.university || '',
      universityRegNumber: user?.university_reg_number || '',
      classSection: user?.class_section || '',
    };
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setSaving(true);
    try {
      await completeProfile(form);
      onComplete?.();
    } catch (err) {
      setError(err.message || 'Could not save your details. Please try again.');
      if (err.data?.field) setFieldErrors({ [err.data.field]: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10 font-body"
      style={{ background: 'var(--bg-base)' }}
      role="dialog"
      aria-labelledby="profile-gate-title"
      aria-describedby="profile-gate-body"
    >
      <div className="clay-card w-full max-w-lg p-6 sm:p-8 entrance-hero" style={{ overflow: 'hidden' }}>
        <div className="text-center">
          <div
            className="mx-auto mb-5 w-16 h-16 rounded-full flex items-center justify-center animate-elasticPop"
            style={{
              background: 'var(--accent-sky)',
              border: '2px solid var(--border-ink-color)',
              boxShadow: '4px 4px 0 var(--border-ink-color)',
            }}
            aria-hidden="true"
          >
            <span style={{ fontSize: '1.75rem', lineHeight: 1 }}>🎓</span>
          </div>

          <h1
            id="profile-gate-title"
            className="entrance-hero entrance-hero-d2"
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 900,
              fontSize: 'clamp(1.5rem, 5vw, 2rem)',
              lineHeight: 1.15,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            One-time setup
          </h1>

          <p
            id="profile-gate-body"
            className="mt-2 mb-6 entrance-hero entrance-hero-d3"
            style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}
          >
            We have added your university, class and registration number to SkillQuest accounts.
            Fill these in once and your results will be counted with the rest of your class.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 text-left">
          <StudentProfileFields
            idPrefix="gate"
            value={form}
            onChange={(patch) => setForm({ ...form, ...patch })}
            fieldErrors={fieldErrors}
            disabled={saving}
          />

          {error && (
            <div
              className="animate-shake flex items-center gap-2 px-4 py-3"
              style={{
                borderRadius: 'var(--radius-md)',
                border: '2px solid var(--border-ink-color)',
                background: 'var(--danger)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.85rem',
                boxShadow: 'var(--shadow-hard-sm)',
              }}
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">error</span>
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" variant="primary" size="lg" className="w-full font-headline uppercase tracking-widest" disabled={saving}>
            {saving ? 'Saving…' : 'Save and continue'}
          </Button>
        </form>

        <p
          className="mt-4 text-center"
          style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}
        >
          Your quizzes, XP, level and streak are untouched — nothing here changes your progress.
        </p>
      </div>
    </div>
  );
}
