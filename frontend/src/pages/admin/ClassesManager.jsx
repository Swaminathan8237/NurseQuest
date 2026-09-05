import { useState, useEffect } from 'react';
import { adminAPI } from '../../api';

// Lightweight i18n seam, matching AdminDashboard's.
const t = (val) => val;

/**
 * ClassesManager — Admin → Classes.
 *
 * Its own file rather than another branch inside AdminDashboard.jsx, which is already ~2300 lines.
 *
 * Two things live here:
 *
 *   1. **What has been collected so far.** Classes are grouped by (university, class_section), never
 *      by the label alone: 'CSE A' at SRIHER and 'CSE A' at ACS are different cohorts, and showing
 *      them as one row would imply the analytics can be filtered as one. The counts double as a
 *      progress bar for the backfill — right after this ships every student is unassigned, and the
 *      number falls as students meet the completion gate and as the admin fills rows in on the
 *      Users tab.
 *
 *   2. **Merging labels normalization cannot catch.** The server already collapses 'cse  a',
 *      ' CSE A ' and 'Cse A' into one 'CSE A'. What it cannot know is that 'CSE-A' means the same
 *      class, because a hyphen could just as easily be meaningful. So merging is a human decision,
 *      confirmed with the exact number of students it will move — it writes to the live users table.
 *      The merge is scoped to one university by the server's WHERE clause, so merging SRIHER's
 *      labels can never touch an ACS student.
 */
export default function ClassesManager() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // { university, from, studentCount } — the class the admin chose to merge away
  const [mergeSource, setMergeSource] = useState(null);
  const [mergeTarget, setMergeTarget] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      setData(await adminAPI.getClasses());
    } catch (err) {
      setError(err.message || t('Could not load classes.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const classes = data?.classes || [];
  const stats = data?.stats || {};
  const universities = data?.universities || [];

  // Only universities that actually have classes get a section; an empty one would be noise.
  const grouped = universities
    .map((u) => ({ university: u, rows: classes.filter((c) => c.university === u) }))
    .filter((g) => g.rows.length > 0);

  const openMerge = (row) => {
    setMergeSource(row);
    setMergeTarget('');
    setNewLabel('');
    setMergeError('');
  };

  // '__new__' is the "type a label that does not exist yet" escape hatch — renaming 'CSE-A' when
  // there is no 'CSE A' to merge into is the same UPDATE, and it is the more common first move.
  const resolvedTarget = mergeTarget === '__new__' ? newLabel.trim() : mergeTarget;

  const handleMerge = async () => {
    if (!resolvedTarget) return;
    setMerging(true);
    setMergeError('');
    try {
      const res = await adminAPI.mergeClasses({
        university: mergeSource.university,
        from: mergeSource.classSection,
        to: resolvedTarget,
      });
      setMergeSource(null);
      setNotice(res.message || t('Classes merged.'));
      await load();
    } catch (err) {
      setMergeError(err.message || t('Could not merge these classes.'));
    } finally {
      setMerging(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const tiles = [
    { label: t('Students'), value: stats.total_students ?? 0, icon: 'group', tone: 'text-primary bg-primary/10' },
    { label: t('Profile Incomplete'), value: stats.incomplete_profiles ?? 0, icon: 'pending_actions', tone: 'text-warning bg-warning/10' },
    { label: t('No University'), value: stats.missing_university ?? 0, icon: 'account_balance', tone: 'text-secondary bg-secondary/10' },
    { label: t('No Class'), value: stats.missing_class ?? 0, icon: 'school', tone: 'text-secondary bg-secondary/10' },
    { label: t('No Reg. Number'), value: stats.missing_reg_number ?? 0, icon: 'badge', tone: 'text-secondary bg-secondary/10' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-headline font-black tracking-tight">{t('Classes & Sections')}</h2>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">
            {t('Grouped per university, because the same class name at two institutions is two different cohorts.')}
          </p>
        </div>
        <button
          onClick={load}
          className="px-5 py-2.5 bg-surface-container-high border border-white/5 text-on-surface-variant rounded-xl font-headline font-bold text-xs uppercase tracking-widest hover:bg-surface-container-highest transition-all flex items-center gap-2 self-start"
        >
          <span className="material-symbols-outlined text-lg">{t('refresh')}</span>
          {t('Reload')}
        </button>
      </div>

      {notice && (
        <div className="px-4 py-3 rounded-xl bg-success/10 border border-success/30 text-success text-sm font-bold flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">{t('check_circle')}</span>
            {notice}
          </span>
          <button onClick={() => setNotice('')} className="material-symbols-outlined text-[18px] opacity-70 hover:opacity-100">
            {t('close')}
          </button>
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-sm font-bold">
          {error}
        </div>
      )}

      {/* Backfill progress. These are the numbers that decide whether a class filter is worth
          trusting yet, so they sit above the classes rather than in a footnote. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="bg-surface-container-high/40 rounded-xl p-4 border border-white/5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">{tile.label}</p>
              <span className={`material-symbols-outlined text-lg p-1.5 rounded-lg ${tile.tone}`}>{tile.icon}</span>
            </div>
            <p className="text-2xl font-bold font-headline mt-2 font-mono">{tile.value}</p>
          </div>
        ))}
      </div>

      {classes.length === 0 ? (
        <div className="bg-surface-container-high/30 border border-white/5 rounded-2xl p-10 text-center space-y-3">
          <span className="material-symbols-outlined text-5xl text-[var(--text-muted)]">{t('school')}</span>
          <p className="font-headline font-bold text-lg">{t('No classes recorded yet')}</p>
          <p className="text-sm text-[var(--text-muted)] font-medium max-w-lg mx-auto leading-relaxed">
            {t('A class appears here once a student has both a university and a class saved. Students are asked for both the next time they sign in, and you can fill them in yourself from the Students & Teachers tab.')}
          </p>
          {(data?.unassignedCount ?? 0) > 0 && (
            <p className="text-xs font-bold text-warning">
              {data.unassignedCount} {t('student(s) still unassigned.')}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={group.university} className="bg-surface-container-high/30 border border-white/5 rounded-2xl overflow-hidden shadow-xl">
              <div className="px-5 py-4 border-b border-white/5 bg-surface-container-high/40 flex items-center justify-between gap-3">
                <h3 className="font-headline font-black text-sm uppercase tracking-widest flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg text-secondary">{t('account_balance')}</span>
                  {group.university}
                </h3>
                <span className="text-xs font-bold text-[var(--text-muted)] font-mono">
                  {group.rows.length} {t('class(es)')} ·{' '}
                  {group.rows.reduce((sum, r) => sum + r.studentCount, 0)} {t('students')}
                </span>
              </div>

              <div className="divide-y divide-white/5">
                {group.rows.map((row) => (
                  <div key={`${row.university}-${row.classSection}`} className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-white/[0.01] transition-all">
                    <div className="min-w-0">
                      <p className="font-bold text-on-surface truncate">{row.classSection}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5 font-medium">
                        {row.studentCount} {row.studentCount === 1 ? t('student') : t('students')}
                      </p>
                    </div>
                    <button
                      onClick={() => openMerge(row)}
                      className="px-4 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0"
                    >
                      <span className="material-symbols-outlined text-base">{t('merge')}</span>
                      {t('Merge / Rename')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {(data?.unassignedCount ?? 0) > 0 && (
            <div className="bg-surface-container-high/30 border border-warning/20 rounded-2xl px-5 py-4 flex items-center gap-3">
              <span className="material-symbols-outlined text-warning">{t('help')}</span>
              <div>
                <p className="font-bold text-sm">
                  {data.unassignedCount} {t('student(s) not in any class')}
                </p>
                <p className="text-xs text-[var(--text-muted)] font-medium mt-0.5">
                  {t('Missing a university, a class, or both. They are excluded from every class-scoped figure until both are set.')}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Merge confirmation. The student count is stated before the button, because this is an
          UPDATE against the live users table with no automatic undo. */}
      {mergeSource && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fadeIn" onClick={() => !merging && setMergeSource(null)} />
          <div className="bg-surface-container-low border border-white/10 p-6 md:p-7 rounded-2xl w-full max-w-md relative z-10 space-y-5 shadow-2xl animate-fadeInScale">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 text-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">{t('merge')}</span>
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-bold font-headline">{t('Move students to another class')}</h3>
                <p className="text-xs text-[var(--text-muted)] font-medium mt-0.5">
                  {mergeSource.university} · {mergeSource.classSection} ·{' '}
                  {mergeSource.studentCount} {mergeSource.studentCount === 1 ? t('student') : t('students')}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                {t('Move them into')}
              </label>
              <select
                value={mergeTarget}
                onChange={(e) => setMergeTarget(e.target.value)}
                disabled={merging}
                className="w-full px-4 py-3 bg-surface-container-high border border-white/10 rounded-xl text-sm font-bold focus:outline-none focus:border-secondary transition-all"
              >
                <option value="">{t('Select a class…')}</option>
                {classes
                  .filter((c) => c.university === mergeSource.university && c.classSection !== mergeSource.classSection)
                  .map((c) => (
                    <option key={c.classSection} value={c.classSection}>
                      {c.classSection} ({c.studentCount})
                    </option>
                  ))}
                <option value="__new__">{t('A new class name…')}</option>
              </select>

              {mergeTarget === '__new__' && (
                <input
                  type="text"
                  autoFocus
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder={t('e.g. CSE A')}
                  maxLength={64}
                  disabled={merging}
                  className="w-full px-4 py-3 bg-surface-container-high border border-white/10 rounded-xl text-sm font-bold focus:outline-none focus:border-secondary transition-all"
                />
              )}
            </div>

            {resolvedTarget && (
              <div className="px-4 py-3 rounded-xl bg-warning/10 border border-warning/30 text-xs font-bold leading-relaxed">
                {mergeSource.studentCount}{' '}
                {mergeSource.studentCount === 1 ? t('student moves from') : t('students move from')}{' '}
                <span className="font-mono">{mergeSource.classSection}</span> {t('to')}{' '}
                <span className="font-mono">{resolvedTarget.toUpperCase()}</span> {t('at')} {mergeSource.university}.{' '}
                {t('Only this university is affected. There is no automatic undo.')}
              </div>
            )}

            {mergeError && (
              <div className="px-4 py-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold">
                {mergeError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setMergeSource(null)}
                disabled={merging}
                className="flex-1 py-3 px-4 bg-surface-container-high border border-white/5 hover:bg-surface-container-highest text-on-surface-variant font-headline font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                onClick={handleMerge}
                disabled={merging || !resolvedTarget}
                className="flex-1 py-3 px-4 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-headline font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {merging && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {merging ? t('Moving…') : t('Move Students')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
