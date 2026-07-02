import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../supabaseClient';

const t = (val) => val;

export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login, register, syncOAuthProfile, user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // State flags for different views
  const [isLogin, setIsLogin] = useState(() => {
    return location.state?.tab !== 'signup';
  });
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(() => {
    return window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery');
  });

  // Form states
  const [formData, setFormData] = useState({ email: '', password: '', name: '', role: 'student' });
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

  // Password reset/recovery fields
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // OAuth user details completion fields
  const [profileFormData, setProfileFormData] = useState({ name: '', role: 'student' });

  // Email verification pending state
  const [isVerificationPending, setIsVerificationPending] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If user is already logged in and doesn't need profile setup, redirect away from auth page
  // Helper to get the correct dashboard route for a role
  const getDashboardRoute = (role) => {
    if (role === 'admin') return '/admin';
    if (role === 'teacher') return '/teacher';
    return '/student';
  };

  useEffect(() => {
    if (user && !user.needProfileSetup && !isResettingPassword) {
      navigate(getDashboardRoute(user.role));
    }
  }, [user, navigate, isResettingPassword]);

  // Handle normal Sign In or Sign Up
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        const loggedUser = await login(formData.email, formData.password);
        if (loggedUser.needProfileSetup) {
          // Stay on page to complete setup
          return;
        }
        navigate(getDashboardRoute(loggedUser.role));
      } else {
        const registeredUser = await register(formData);
        if (registeredUser.emailVerificationPending) {
          setIsVerificationPending(true);
          setPendingEmail(formData.email);
          return;
        }
        if (registeredUser.role === 'student') {
          navigate('/avatar-setup');
        } else {
          navigate(getDashboardRoute(registeredUser.role));
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle sending password reset email
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: window.location.origin + '/auth'
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle saving new password after clicking email recovery link
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setIsResettingPassword(false);
      // If profile is fully set up, redirect to dashboard. Otherwise profile setup handles it.
      if (user && !user.needProfileSetup) {
        navigate(getDashboardRoute(user.role));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle profile details sync (OAuth profile completion flow)
  const handleProfileComplete = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const updatedUser = await syncOAuthProfile({
        name: profileFormData.name,
        role: profileFormData.role,
        avatarConfig: {}
      });
      if (updatedUser.role === 'student') {
        navigate('/avatar-setup');
      } else {
        navigate(getDashboardRoute(updatedUser.role));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Trigger Google/GitHub OAuth logins
  const handleOAuthLogin = async (provider) => {
    setError('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin + '/auth'
        }
      });
      if (error) throw error;
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center font-body relative overflow-hidden px-4 transition-colors duration-500">
      {/* Theme Toggle in Top Right */}
      <div className="absolute top-8 right-8 z-50">
        <button
          onClick={toggleTheme}
          className="p-3 rounded-full bg-brand-surface shadow-clay-outer transition-all hover:scale-105 active:scale-95"
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          <span className="material-symbols-outlined">
            {theme === 'dark' ? 'light_mode' : 'dark_mode'}
          </span>
        </button>
      </div>

      {/* Dynamic Background Glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[100px] pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-tertiary/20 rounded-full blur-[100px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }}></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-secondary-container/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md clay-card p-8 md:p-10 relative z-10 animate-fadeInUp">

        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto bg-brand-surface shadow-clay-outer rounded-full flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-4xl text-transparent bg-clip-text bg-gradient-to-br from-primary-container to-primary" style={{ fontVariationSettings: "'FILL' 1" }}>{t('medical_services')}</span>
          </div>
          <h1 className="text-4xl font-headline font-black tracking-tighter mb-1">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-container to-tertiary">{t('NurseQuest')}</span>
          </h1>
          <p className="text-on-surface-variant font-medium text-xs">{t('Gamified Interactive Learning for Nursing Excellence')}</p>
        </div>

        {/* EMAIL VERIFICATION PENDING SCREEN */}
        {isVerificationPending ? (
          <div className="animate-fadeIn text-center py-6 flex flex-col items-center">
            {/* Tick checkmark inside a glowing circle in the middle */}
            <div className="w-20 h-20 bg-brand-surface shadow-clay-outer rounded-full flex items-center justify-center mb-6 animate-pulse border-2 border-success">
              <span className="material-symbols-outlined text-4xl text-success" style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}>{t('check_circle')}</span>
            </div>

            <h2 className="text-2xl font-headline font-bold text-on-surface mb-2">{t('Check Your Email')}</h2>
            <p className="text-sm text-on-surface-variant mb-6 px-2">
              {t("We've sent a verification email to")} <strong className="text-on-surface">{pendingEmail}</strong>.
              {t("Please click the link in that email to confirm your account, then you can log in.")}
            </p>

            <button
              onClick={() => { setIsVerificationPending(false); setIsLogin(true); }}
              className="px-6 py-3 clay-button clay-button-outline text-xs font-bold uppercase tracking-widest"
            >
              {t('Back to Sign In')}
            </button>
          </div>
        ) : user?.needProfileSetup ? (
          <div className="animate-fadeIn">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-headline font-bold text-on-surface mb-1">{t('Complete Your Profile')}</h2>
              <p className="text-xs text-on-surface-variant">{t('Just a couple quick details to finalize your account setup!')}</p>
            </div>
            <form onSubmit={handleProfileComplete} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-label font-bold text-slate-500 uppercase tracking-widest pl-1" htmlFor="profile-name">{t('Full Name')}</label>
                <input
                  id="profile-name"
                  type="text"
                  className="input"
                  placeholder="Enter your full name"
                  value={profileFormData.name}
                  onChange={(e) => setProfileFormData({ ...profileFormData, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2 pt-1">
                <label className="text-xs font-label font-bold text-slate-500 uppercase tracking-widest pl-1">{t('I am a...')}</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    className={`flex-1 p-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${profileFormData.role === 'student' ? 'bg-brand-surface shadow-clay-sunken text-primary border-2 border-primary' : 'bg-brand-surface shadow-clay-outer hover:scale-105 active:scale-95 text-on-surface'}`}
                    onClick={() => setProfileFormData({ ...profileFormData, role: 'student' })}
                  >
                    <span className="text-2xl mb-1">🎓</span>
                    <span className={`text-sm font-bold ${profileFormData.role === 'student' ? 'text-primary' : 'text-on-surface'}`}>{t('Student')}</span>
                  </button>
                  <button
                    type="button"
                    className={`flex-1 p-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${profileFormData.role === 'teacher' ? 'bg-brand-surface shadow-clay-sunken text-tertiary border-2 border-tertiary' : 'bg-brand-surface shadow-clay-outer hover:scale-105 active:scale-95 text-on-surface'}`}
                    onClick={() => setProfileFormData({ ...profileFormData, role: 'teacher' })}
                  >
                    <span className="text-2xl mb-1">👩‍⚕️</span>
                    <span className={`text-sm font-bold ${profileFormData.role === 'teacher' ? 'text-tertiary' : 'text-on-surface'}`}>{t('Teacher')}</span>
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-error/10 border border-error/30 text-error px-4 py-3 rounded-xl text-sm font-medium animate-shake flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">{t('error')}</span>
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-4 clay-button clay-button-primary font-headline font-bold uppercase tracking-widest flex items-center justify-center gap-2 mt-6"
                disabled={loading}
              >
                {loading ? (
                  <div className="w-6 h-6 border-2 border-brand-bg border-t-transparent rounded-full animate-spin" />
                ) : t('Complete Setup')}
              </button>
            </form>
          </div>
        ) : isResettingPassword ? (
          /* PASSWORD RESET FORM (FROM EMAIL LINK) */
          <div className="animate-fadeIn">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-headline font-bold text-on-surface mb-1">{t('Update Password')}</h2>
              <p className="text-xs text-on-surface-variant">{t('Enter a new secure password for your NurseQuest account.')}</p>
            </div>
            <form onSubmit={handleUpdatePassword} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-label font-bold text-slate-500 uppercase tracking-widest pl-1" htmlFor="new-password">{t('New Password')}</label>
                <input
                  id="new-password"
                  type="password"
                  className="w-full bg-surface-container-high border border-outline-variant/30 rounded-xl px-4 py-3.5 text-on-surface font-body placeholder:text-slate-500 focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none tracking-widest"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-label font-bold text-slate-500 uppercase tracking-widest pl-1" htmlFor="confirm-password">{t('Confirm Password')}</label>
                <input
                  id="confirm-password"
                  type="password"
                  className="w-full bg-surface-container-high border border-outline-variant/30 rounded-xl px-4 py-3.5 text-on-surface font-body placeholder:text-slate-500 focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none tracking-widest"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div className="bg-error/10 border border-error/30 text-error px-4 py-3 rounded-xl text-sm font-medium animate-shake flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">{t('error')}</span>
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-4 clay-button clay-button-primary font-headline font-bold uppercase tracking-widest flex items-center justify-center gap-2 mt-6"
                disabled={loading}
              >
                {loading ? (
                  <div className="w-6 h-6 border-2 border-brand-bg border-t-transparent rounded-full animate-spin" />
                ) : t('Update Password')}
              </button>
            </form>
          </div>
        ) : isForgotPassword ? (
          /* FORGOT PASSWORD REQUEST FORM */
          <div className="animate-fadeIn">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-headline font-bold text-on-surface mb-1">{t('Reset Password')}</h2>
              <p className="text-xs text-on-surface-variant">{t('We will send a password reset link to your email address.')}</p>
            </div>

            {resetSent ? (
              <div className="space-y-6 text-center py-4">
                <span className="material-symbols-outlined text-5xl text-tertiary animate-bounce">{t('mail')}</span>
                <p className="text-sm text-on-surface-variant">
                  {t("We've sent a password reset link to")} <strong className="text-on-surface">{resetEmail}</strong>. {t("Please check your inbox.")}
                </p>
                <button
                  onClick={() => { setIsForgotPassword(false); setResetSent(false); setResetEmail(''); }}
                  className="text-primary hover:text-primary-container text-sm font-bold transition-all uppercase tracking-wider"
                >
                  {t('Back to Sign In')}
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-label font-bold text-slate-500 uppercase tracking-widest pl-1" htmlFor="reset-email">{t('Email Address')}</label>
                  <input
                    id="reset-email"
                    type="email"
                    className="w-full bg-surface-container-high border border-outline-variant/30 rounded-xl px-4 py-3.5 text-on-surface font-body placeholder:text-slate-500 focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none"
                    placeholder="you@example.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                  />
                </div>

                {error && (
                  <div className="bg-error/10 border border-error/30 text-error px-4 py-3 rounded-xl text-sm font-medium animate-shake flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">{t('error')}</span>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-4 bg-gradient-to-r from-primary-container to-primary text-on-primary-container rounded-xl font-headline font-bold uppercase tracking-widest shadow-[0_4px_20px_rgba(183,109,255,0.4)] hover:shadow-[0_4px_25px_rgba(183,109,255,0.6)] hover:scale-[1.02] transition-all flex items-center justify-center gap-2 active:scale-95 mt-6"
                  disabled={loading}
                >
                  {loading ? (
                    <div className="w-6 h-6 border-2 border-on-primary-container border-t-transparent rounded-full animate-spin" />
                  ) : t('Send Reset Link')}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => { setIsForgotPassword(false); setError(''); }}
                    className="text-slate-400 hover:text-on-surface text-xs font-bold transition-all uppercase tracking-widest"
                  >
                    {t('Back to Sign In')}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          /* STANDARD SIGN IN / SIGN UP FORM */
          <>
            <div className="bg-brand-surface shadow-clay-sunken p-1 rounded-full flex relative mb-8">
              <div
                className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-brand-elevated border-2 border-primary/30 rounded-full shadow-clay-outer transition-transform duration-300 ease-out`}
                style={{ transform: isLogin ? 'translateX(0)' : 'translateX(100%)' }}
              ></div>
              <button
                className={`flex-grow py-2.5 text-sm font-bold uppercase tracking-widest z-10 transition-colors ${isLogin ? 'text-primary' : 'text-slate-500 hover:text-on-surface'}`}
                onClick={() => { setIsLogin(true); setError(''); }}
                type="button"
              >
                {t('Sign In')}
              </button>
              <button
                className={`flex-grow py-2.5 text-sm font-bold uppercase tracking-widest z-10 transition-colors ${!isLogin ? 'text-primary' : 'text-slate-500 hover:text-on-surface'}`}
                onClick={() => { setIsLogin(false); setError(''); }}
                type="button"
              >
                {t('Sign Up')}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {!isLogin && (
                <div className="space-y-1.5 animate-fadeIn">
                  <label className="text-xs font-label font-bold text-slate-500 uppercase tracking-widest pl-1" htmlFor="name">{t('Full Name')}</label>
                  <input
                    id="name"
                    type="text"
                    className="input"
                    placeholder="Enter your full name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required={!isLogin}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-label font-bold text-slate-500 uppercase tracking-widest pl-1" htmlFor="email">{t('Email Address')}</label>
                <input
                  id="email"
                  type="email"
                  className="input"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center px-1">
                  <label className="text-xs font-label font-bold text-slate-500 uppercase tracking-widest" htmlFor="password">{t('Password')}</label>
                  {isLogin && (
                    <button
                      type="button"
                      onClick={() => { setIsForgotPassword(true); setError(''); }}
                      className="text-xs font-bold text-primary hover:text-primary-container transition-all"
                    >
                      {t('Forgot Password?')}
                    </button>
                  )}
                </div>
                <input
                  id="password"
                  type="password"
                  className="input tracking-widest"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
              </div>

              {!isLogin && (
                <div className="space-y-2 animate-fadeIn pt-2">
                  <label className="text-xs font-label font-bold text-slate-500 uppercase tracking-widest pl-1">{t('I am a...')}</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className={`flex-1 p-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${formData.role === 'student' ? 'bg-brand-surface shadow-clay-sunken text-primary border-2 border-primary' : 'bg-brand-surface shadow-clay-outer hover:scale-105 active:scale-95 text-on-surface'}`}
                      onClick={() => setFormData({ ...formData, role: 'student' })}
                    >
                      <span className="text-2xl mb-1">🎓</span>
                      <span className={`text-sm font-bold ${formData.role === 'student' ? 'text-primary' : 'text-on-surface'}`}>{t('Student')}</span>
                    </button>
                    <button
                      type="button"
                      className={`flex-1 p-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${formData.role === 'teacher' ? 'bg-brand-surface shadow-clay-sunken text-tertiary border-2 border-tertiary' : 'bg-brand-surface shadow-clay-outer hover:scale-105 active:scale-95 text-on-surface'}`}
                      onClick={() => setFormData({ ...formData, role: 'teacher' })}
                    >
                      <span className="text-2xl mb-1">👩‍⚕️</span>
                      <span className={`text-sm font-bold ${formData.role === 'teacher' ? 'text-tertiary' : 'text-on-surface'}`}>{t('Teacher')}</span>
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-error/10 border border-error/30 text-error px-4 py-3 rounded-xl text-sm font-medium animate-shake flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">{t('error')}</span>
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-4 clay-button clay-button-primary font-headline font-bold uppercase tracking-widest flex items-center justify-center gap-2 mt-6"
                disabled={loading}
              >
                {loading ? (
                  <div className="w-6 h-6 border-2 border-brand-bg border-t-transparent rounded-full animate-spin" />
                ) : isLogin ? t('Sign In') : t('Create Account')}
              </button>
            </form>

            <div className="mt-6">
              <div className="flex items-center my-4">
                <div className="flex-grow border-t border-brand-elevated/40"></div>
                <span className="px-3 text-xs font-label font-bold text-slate-500 uppercase tracking-widest">{t('Or Continue With')}</span>
                <div className="flex-grow border-t border-brand-elevated/40"></div>
              </div>

              <div className="grid grid-cols-1">
                <button
                  onClick={() => handleOAuthLogin('google')}
                  className="py-3 px-4 clay-button clay-button-outline text-sm font-bold flex items-center justify-center gap-2"
                  type="button"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.68 1.54 14.98 1 12 1 7.35 1 3.37 3.67 1.39 7.56l3.85 2.99c.92-2.75 3.5-4.51 6.76-4.51z" />
                    <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.35H12v4.46h6.44c-.28 1.47-1.11 2.71-2.36 3.55l3.66 2.84c2.14-1.98 3.39-4.89 3.39-8.5z" />
                    <path fill="#FBBC05" d="M5.24 10.55c-.24-.72-.38-1.5-.38-2.3s.14-1.58.38-2.3L1.39 2.96C.5 4.77 0 6.81 0 8.97s.5 4.2 1.39 6.01l3.85-2.99c-.24-.72-.38-1.5-.38-2.3-.01-.58.05-1.15.15-1.71c.08-.43.08-.85.22-1.28z" />
                    <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.66-2.84c-1.1.74-2.51 1.18-4.3 1.18-3.26 0-5.84-1.76-6.76-4.51L1.39 16.9C3.37 20.8 7.35 23 12 23z" />
                  </svg>
                  <span>{t('Google')}</span>
                </button>
              </div>
            </div>

            {isLogin && (
              <div className="mt-8 pt-6 border-t border-brand-elevated/40 animate-fadeIn">
                <p className="text-xs font-label font-bold text-slate-500 uppercase tracking-widest text-center mb-4">{t('Demo Accounts')}</p>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    className="py-2.5 clay-button clay-button-outline text-xs font-bold flex items-center justify-center gap-2 hover:text-primary"
                    onClick={() => setFormData({ ...formData, email: 'teacher@nursequest.com', password: 'teacher123' })}
                    type="button"
                  >
                    <span>👩‍⚕️</span> {t('Teacher')}
                  </button>
                  <button
                    className="py-2.5 clay-button clay-button-outline text-xs font-bold flex items-center justify-center gap-2 hover:text-tertiary"
                    onClick={() => setFormData({ ...formData, email: 'student1@nursequest.com', password: 'student123' })}
                    type="button"
                  >
                    <span>🎓</span> {t('Student')}
                  </button>
                  <button
                    className="py-2.5 clay-button clay-button-outline text-xs font-bold flex items-center justify-center gap-2 hover:text-secondary"
                    onClick={() => setFormData({ ...formData, email: 'admin@nursequest.com', password: 'admin123' })}
                    type="button"
                  >
                    <span>👨‍💻</span> {t('Admin')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
