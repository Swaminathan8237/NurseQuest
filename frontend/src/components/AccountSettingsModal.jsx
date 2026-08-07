import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { userAPI } from '../api';
import Avatar from './Avatar';

export default function AccountSettingsModal({ isOpen, onClose, initialTab = 'profile' }) {
  const { user, updatePreferences } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState(initialTab);

  // Real per-request profile stats (unitsPassed, dailyStreak, avgScore) from
  // GET /users/dashboard-stats. Loaded lazily when the Profile tab is shown so the modal
  // reflects true progress instead of xp-derived fabrications.
  const [stats, setStats] = useState(null);

  // Preference toggles — hydrated from the persisted user.preferences (server source of truth).
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [timerAlerts, setTimerAlerts] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  // Hydrate the toggles from the persisted preferences whenever the modal opens (or the
  // stored preferences change after a save / profile refetch).
  useEffect(() => {
    if (!isOpen) return;
    const prefs = user?.preferences || {};
    // Hydrate the editable toggles from the persisted prefs each time the modal opens.
    // Intentional derived-state sync (not a cascading render): runs only on open or when
    // the saved preferences change after a successful save / profile refetch.
    /* eslint-disable react-hooks/set-state-in-effect */
    setSoundEnabled(prefs.soundEnabled !== false);
    setTimerAlerts(prefs.timerAlerts !== false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [isOpen, user?.preferences]);

  // Load real profile stats when the Profile tab is active (students only — the endpoint
  // returns a different shape for teachers).
  useEffect(() => {
    if (!isOpen || activeTab !== 'profile' || user?.role !== 'student') return;
    let cancelled = false;
    userAPI.getDashboardStats()
      .then((data) => { if (!cancelled) setStats(data); })
      .catch((err) => { if (!cancelled) console.error('Failed to load profile stats:', err); });
    return () => { cancelled = true; };
  }, [isOpen, activeTab, user?.role]);

  if (!isOpen) return null;

  const handleSavePreferences = async () => {
    setSaving(true);
    try {
      await updatePreferences({ soundEnabled, timerAlerts });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      console.error('Failed to save preferences:', err);
    } finally {
      setSaving(false);
    }
  };

  // Honest, navigator-derived device label (no hardcoded "Windows 11").
  const deviceLabel = typeof navigator !== 'undefined' && navigator.platform
    ? `Web Browser (${navigator.platform})`
    : 'Web Browser';

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-md transition-opacity z-[9999]" 
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] my-auto z-[10000] animate-scaleUp">
        
        {/* Header */}
        <div className="px-6 py-5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 dark:bg-primary/20 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">manage_accounts</span>
            </div>
            <div>
              <h2 className="font-headline font-black text-xl text-slate-900 dark:text-white leading-tight">
                Account & Preferences
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Manage your clinical profile, sound, and platform preferences
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-200/70 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center justify-center transition-all"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 bg-slate-50/50 dark:bg-slate-900">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 py-3.5 px-4 font-headline text-xs font-bold border-b-2 transition-all ${
              activeTab === 'profile'
                ? 'border-primary text-primary dark:text-primary-light'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <span className="material-symbols-outlined text-base">person</span>
            <span>Profile & Rank</span>
          </button>
          <button
            onClick={() => setActiveTab('preferences')}
            className={`flex items-center gap-2 py-3.5 px-4 font-headline text-xs font-bold border-b-2 transition-all ${
              activeTab === 'preferences'
                ? 'border-primary text-primary dark:text-primary-light'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <span className="material-symbols-outlined text-base">settings</span>
            <span>Preferences</span>
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-2 py-3.5 px-4 font-headline text-xs font-bold border-b-2 transition-all ${
              activeTab === 'security'
                ? 'border-primary text-primary dark:text-primary-light'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <span className="material-symbols-outlined text-base">security</span>
            <span>Security & Data</span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              {/* User Identity Card */}
              <div className="flex flex-col sm:flex-row items-center gap-5 p-5 rounded-2xl bg-gradient-to-br from-purple-500/10 via-primary/5 to-cyan-500/10 border border-purple-500/20">
                <div className="w-16 h-16 rounded-full border-4 border-white dark:border-slate-800 shadow-xl overflow-hidden bg-slate-100 flex items-center justify-center shrink-0">
                  <Avatar config={user?.avatar_config} size={64} showBg={false} />
                </div>
                <div className="text-center sm:text-left flex-1">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1">
                    <h3 className="font-headline font-black text-xl text-slate-900 dark:text-white">
                      {user?.name || user?.email?.split('@')[0] || 'Clinical Trainee'}
                    </h3>
                    <span className="px-3 py-0.5 rounded-full text-[10px] font-headline font-black uppercase tracking-wider bg-primary text-white">
                      {user?.role || 'Student'}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {user?.email || 'student@nursing-platform.edu'}
                  </p>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 mt-3 text-xs font-bold text-slate-600 dark:text-slate-300">
                    <span className="flex items-center gap-1 text-primary">
                      <span className="material-symbols-outlined text-base font-black">bolt</span>
                      <span>{user?.xp || 0} XP Earned</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <span className="material-symbols-outlined text-base">verified</span>
                      <span>Level {user?.level ?? 1} Nurse</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Stats Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
                  <span className="material-symbols-outlined text-2xl text-primary mb-1">workspace_premium</span>
                  <div className="font-headline font-black text-xl text-slate-900 dark:text-white">
                    {stats ? stats.unitsPassed : '—'}
                  </div>
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Units Passed
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
                  <span className="material-symbols-outlined text-2xl text-emerald-500 mb-1">local_fire_department</span>
                  <div className="font-headline font-black text-xl text-slate-900 dark:text-white">
                    {stats ? `${stats.dailyStreak} ${stats.dailyStreak === 1 ? 'Day' : 'Days'}` : '—'}
                  </div>
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Current Streak
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-1 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
                  <span className="material-symbols-outlined text-2xl text-cyan-500 mb-1">timer</span>
                  <div className="font-headline font-black text-xl text-slate-900 dark:text-white">
                    {stats && stats.avgScore != null ? `${stats.avgScore.toFixed(1)}%` : '—'}
                  </div>
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Avg Quiz Score
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'preferences' && (
            <div className="space-y-5">
              {/* Theme Preference */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                    <span className="material-symbols-outlined text-xl">
                      {theme === 'dark' ? 'dark_mode' : 'light_mode'}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-headline font-bold text-sm text-slate-900 dark:text-white">
                      Platform Appearance
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Currently using <span className="font-bold uppercase">{theme} Mode</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={toggleTheme}
                  className="px-4 py-2 rounded-xl bg-primary text-white font-headline text-xs font-black hover:bg-primary-dark transition-all"
                >
                  Switch Theme
                </button>
              </div>

              {/* Sound Effects */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                    <span className="material-symbols-outlined text-xl">volume_up</span>
                  </div>
                  <div>
                    <h4 className="font-headline font-bold text-sm text-slate-900 dark:text-white">
                      Quiz Audio & SFX
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Play feedback chime on correct clinical answers
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => setSoundEnabled(e.target.checked)}
                  className="w-5 h-5 accent-primary cursor-pointer"
                />
              </div>

              {/* Timer & Alerts */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <span className="material-symbols-outlined text-xl">notifications_active</span>
                  </div>
                  <div>
                    <h4 className="font-headline font-bold text-sm text-slate-900 dark:text-white">
                      Live Quiz Countdown Alerts
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Show visual warning when question timer is below 5s
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={timerAlerts}
                  onChange={(e) => setTimerAlerts(e.target.checked)}
                  className="w-5 h-5 accent-primary cursor-pointer"
                />
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-5">
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-4">
                <h4 className="font-headline font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-base">lock</span>
                  <span>Session & Account Status</span>
                </h4>
                <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2">
                  <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-slate-500">Account Security</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">verified_user</span>
                      <span>Secured & Encrypted</span>
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-slate-500">Role Authority</span>
                    <span className="font-bold uppercase text-primary">{user?.role || 'Student'}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Active Device</span>
                    <span className="font-mono">{deviceLabel}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          {savedSuccess ? (
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 animate-fadeIn">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              <span>Preferences Updated Successfully!</span>
            </span>
          ) : (
            <span className="text-xs text-slate-500">SkillQuest Education Platform v2.4</span>
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-headline font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
            >
              Close
            </button>
            <button
              onClick={handleSavePreferences}
              disabled={saving}
              className="px-5 py-2 rounded-xl text-xs font-headline font-black bg-primary text-white hover:bg-primary-dark shadow-md hover:shadow-lg hover:scale-105 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
