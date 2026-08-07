import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../supabaseClient';
import { Button, Input } from '../components/ui';
import VerificationSentModal from '../components/VerificationSentModal';

import logo from '../assets/skillquest-logo.png';

const t = (val) => val;

export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login, register, googleLogin, syncOAuthProfile, user } = useAuth();
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
  const [showSentModal, setShowSentModal] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationSuccess, setVerificationSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('verified') === 'true') {
      setVerificationSuccess(true);
      navigate('/auth', { replace: true });
    }
  }, [location, navigate]);

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
        if (registeredUser?.emailVerificationPending) {
          setPendingEmail(formData.email);
          setShowSentModal(true);
          setIsVerificationPending(true);
          setLoading(false);
          return;
        }
        if (registeredUser?.needProfileSetup) {
          return;
        }
        navigate(getDashboardRoute(registeredUser.role));
      }
    } catch (err) {
      setError(err.message || t('Authentication failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthProfileSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const updatedUser = await syncOAuthProfile(profileFormData.name, profileFormData.role);
      navigate(getDashboardRoute(updatedUser.role));
    } catch (err) {
      setError(err.message || t('Failed to update profile'));
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
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/auth#type=recovery`,
      });
      if (resetErr) throw resetErr;
      setResetSent(true);
    } catch (err) {
      setError(err.message || t('Failed to send password reset email'));
    } finally {
      setLoading(false);
    }
  };

  // Handle saving new password after clicking email recovery link
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError(t('Passwords do not match'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updateErr) throw updateErr;
      alert(t('Password updated successfully! Please sign in with your new password.'));
      window.location.hash = '';
      setIsResettingPassword(false);
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

  // Google Identity Services — real backend-owned OAuth flow.
  // The backend's POST /api/auth/google verifies the ID token, upserts the user,
  // and mints the same skillquest_token JWT/cookie as password login.
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  // Load GIS script once on mount
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, [GOOGLE_CLIENT_ID]);

  // Keep the credential handler in a ref so GIS can be initialized EXACTLY once while
  // still calling the latest googleLogin/navigate. Re-initializing on every render (the
  // /api/auth/me check resolving, a theme toggle, etc.) triggers GIS's "initialize() is
  // called multiple times" warning.
  const handleGoogleCredentialRef = useRef(null);
  useEffect(() => {
    handleGoogleCredentialRef.current = async (response) => {
      setError('');
      try {
        const userObj = await googleLogin(response.credential);
        if (!userObj.needProfileSetup) {
          navigate(getDashboardRoute(userObj.role));
        }
      } catch (err) {
        // The backend returns a user-safe message (never internal details).
        setError(err.message || 'Google sign-in failed. Please try again.');
      }
    };
  });

  // Initialize GIS and render Google's official sign-in button once the script has loaded.
  // renderButton is the reliable, officially-supported flow (One Tap / prompt() can be silently
  // suppressed by browser FedCM settings or dismissal cooldowns, so it's unfit as the primary path).
  // We poll briefly for window.google because the GIS script loads async. Depends only on
  // GOOGLE_CLIENT_ID so it runs once — the credential handler comes from the ref above.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    let cancelled = false;
    let attempts = 0;

    const tryInit = () => {
      if (cancelled) return;
      if (!window.google?.accounts?.id) {
        // GIS not ready yet — retry for ~5s (50 × 100ms) then give up silently.
        if (attempts++ < 50) setTimeout(tryInit, 100);
        return;
      }

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => handleGoogleCredentialRef.current?.(response),
      });

      const target = document.getElementById('google-signin-button');
      if (target) {
        window.google.accounts.id.renderButton(target, {
          // Google's button sits at opacity:0 behind our themed overlay, so its own
          // theme is never seen — hardcode it (and keep `theme` out of this effect's
          // deps) so a light/dark toggle no longer re-initializes GIS.
          theme: 'outline',
          size: 'large',
          width: target.offsetWidth || 320,
          text: 'continue_with',
          shape: 'rectangular'
        });
      }
    };

    tryInit();

    return () => {
      cancelled = true;
      if (window.google?.accounts?.id) {
        window.google.accounts.id.cancel();
      }
    };
  }, [GOOGLE_CLIENT_ID]);

  // Playful role-selector tile: chunky outlined block that presses into its shadow when active.
  const roleTile = (active, accentVar) => ({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '14px 8px',
    borderRadius: 'var(--radius-md)',
    border: '2px solid var(--border-ink-color)',
    background: active ? `var(${accentVar})` : 'var(--bg-surface)',
    color: active ? '#fff' : 'var(--text-secondary)',
    fontWeight: 800,
    boxShadow: active ? 'var(--shadow-hard-sm)' : 'var(--shadow-hard)',
    transform: active ? 'translate(2px, 2px)' : 'none',
    transition: 'transform .12s, box-shadow .12s, background .15s, color .15s',
    cursor: 'pointer',
  });

  const eyebrowLabel = {
    fontFamily: 'var(--font-heading)',
    fontSize: '0.7rem',
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    paddingLeft: '4px',
  };

  const errorBox = error && (
    <div
      className="animate-shake"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 16px',
        borderRadius: 'var(--radius-md)',
        border: '2px solid var(--border-ink-color)',
        background: 'var(--danger)',
        color: '#fff',
        fontWeight: 700,
        fontSize: '0.875rem',
        boxShadow: 'var(--shadow-hard-sm)',
      }}
    >
      <span className="material-symbols-outlined text-[20px]">{t('error')}</span>
      <span>{error}</span>
    </div>
  );

  const spinner = (
    <div className="w-6 h-6 border-[3px] border-white/40 border-t-white rounded-full animate-spin" />
  );

  return (
    <div
      className="min-h-screen flex items-center justify-center font-body relative overflow-hidden px-4 transition-colors duration-300"
      style={{ background: 'var(--bg-base)' }}
    >
      {/* "Verification email sent" popup with animated tick (shown after sign-up) */}
      <VerificationSentModal
        isOpen={showSentModal}
        email={pendingEmail}
        onClose={() => setShowSentModal(false)}
      />

      {/* Theme Toggle in Top Right */}
      <div className="absolute top-6 right-6 z-50">
        <button
          onClick={toggleTheme}
          className="btn btn-ghost btn-icon"
          title={theme === 'dark' ? t('Switch to Light Mode') : t('Switch to Dark Mode')}
        >
          <span className="material-symbols-outlined">
            {theme === 'dark' ? 'light_mode' : 'dark_mode'}
          </span>
        </button>
      </div>

      {/* Playful decorative blocks (no blur — flat color shapes) */}
      <div
        className="absolute -top-10 -left-10 w-40 h-40 rounded-[28px] pointer-events-none hidden md:block"
        style={{ background: 'var(--accent-gold)', border: '2px solid var(--border-ink-color)', transform: 'rotate(-12deg)', opacity: 0.9 }}
      />
      <div
        className="absolute bottom-8 right-10 w-28 h-28 rounded-full pointer-events-none hidden md:block"
        style={{ background: 'var(--accent-sky)', border: '2px solid var(--border-ink-color)', opacity: 0.9 }}
      />
      <div
        className="absolute top-1/3 right-16 w-16 h-16 rounded-2xl pointer-events-none hidden lg:block"
        style={{ background: 'var(--accent-coral)', border: '2px solid var(--border-ink-color)', transform: 'rotate(8deg)', opacity: 0.85 }}
      />

      <div
        className="w-full max-w-md relative z-10 animate-fadeInUp p-8 md:p-10"
        style={{
          background: 'var(--bg-surface)',
          border: '2px solid var(--border-ink-color)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-hard-lg)',
        }}
      >
        <div className="text-center mb-8">
          <div
            className="w-20 h-20 mx-auto flex items-center justify-center mb-4 p-2.5"
            style={{
              background: 'var(--bg-elevated)',
              border: '2px solid var(--border-ink-color)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-hard-sm)',
            }}
          >
            <img src={logo} alt="SkillQuest" className="w-14 h-14 object-contain" />
          </div>
          <h1 className="text-4xl font-headline font-black tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>
            {t('Skill')}<span style={{ color: 'var(--primary)' }}>{t('Quest')}</span>
          </h1>
          <p style={{ ...eyebrowLabel, paddingLeft: 0 }}>{t('Learn · Practice · Excel')}</p>
        </div>

        {/* EMAIL VERIFICATION PENDING SCREEN */}
        {isVerificationPending ? (
          <div
            className="animate-fadeIn text-center p-6 flex flex-col items-center"
            style={{
              background: 'var(--accent-green)',
              color: '#fff',
              border: '2px solid var(--border-ink-color)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-hard)',
            }}
          >
            <div
              className="w-16 h-16 flex items-center justify-center mb-5"
              style={{ background: 'rgba(255,255,255,0.25)', border: '2px solid rgba(255,255,255,0.5)', borderRadius: 'var(--radius-full)' }}
            >
              <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}>{t('check_circle')}</span>
            </div>
            <h2 className="text-xl font-headline font-black mb-2">{t('Check Your Email')}</h2>
            <p className="text-sm leading-relaxed font-semibold mb-6 px-1">
              {t("Registration successful! We've sent a verification link to")} <strong className="underline">{pendingEmail}</strong>.
              {t(" Please check your inbox and click the link to activate your account.")}
            </p>
            <button
              onClick={() => { setIsVerificationPending(false); setIsLogin(true); }}
              className="px-6 py-2.5 font-headline font-bold text-xs uppercase tracking-widest transition-transform active:translate-y-0.5"
              style={{ background: 'var(--ink)', color: 'var(--accent-green)', border: '2px solid var(--border-ink-color)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-hard-sm)' }}
            >
              {t('Back to Sign In')}
            </button>
          </div>
        ) : user?.needProfileSetup ? (
          <div className="animate-fadeIn">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-headline font-black mb-1" style={{ color: 'var(--text-primary)' }}>{t('Complete Your Profile')}</h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('Just a couple quick details to finalize your account setup!')}</p>
            </div>
            <form onSubmit={handleProfileComplete} className="space-y-5">
              <Input
                id="profile-name"
                type="text"
                label={t('Full Name')}
                placeholder={t('Enter your full name')}
                value={profileFormData.name}
                onChange={(e) => setProfileFormData({ ...profileFormData, name: e.target.value })}
                required
              />

              <div className="space-y-2 pt-1">
                <label style={eyebrowLabel}>{t('I am a...')}</label>
                <div className="flex gap-3">
                  <button type="button" style={roleTile(profileFormData.role === 'student', '--primary')} onClick={() => setProfileFormData({ ...profileFormData, role: 'student' })}>
                    <span className="text-2xl">🎓</span>
                    <span className="text-sm">{t('Student')}</span>
                  </button>
                </div>
              </div>

              {errorBox}

              <Button type="submit" variant="primary" size="lg" className="w-full mt-6 font-headline uppercase tracking-widest" disabled={loading}>
                {loading ? spinner : t('Complete Setup')}
              </Button>
            </form>
          </div>
        ) : isResettingPassword ? (
          /* PASSWORD RESET FORM (FROM EMAIL LINK) */
          <div className="animate-fadeIn">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-headline font-black mb-1" style={{ color: 'var(--text-primary)' }}>{t('Update Password')}</h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('Enter a new secure password for your SkillQuest account.')}</p>
            </div>
            <form onSubmit={handleUpdatePassword} className="space-y-5">
              <Input
                id="new-password"
                type="password"
                label={t('New Password')}
                className="tracking-widest"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <Input
                id="confirm-password"
                type="password"
                label={t('Confirm Password')}
                className="tracking-widest"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />

              {errorBox}

              <Button type="submit" variant="primary" size="lg" className="w-full mt-6 font-headline uppercase tracking-widest" disabled={loading}>
                {loading ? spinner : t('Update Password')}
              </Button>
            </form>
          </div>
        ) : isForgotPassword ? (
          /* FORGOT PASSWORD REQUEST FORM */
          <div className="animate-fadeIn">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-headline font-black mb-1" style={{ color: 'var(--text-primary)' }}>{t('Reset Password')}</h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('We will send a password reset link to your email address.')}</p>
            </div>

            {resetSent ? (
              <div className="space-y-6 text-center py-4">
                <span className="material-symbols-outlined text-5xl animate-bounce" style={{ color: 'var(--accent-sky)' }}>{t('mail')}</span>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {t("We've sent a password reset link to")} <strong style={{ color: 'var(--text-primary)' }}>{resetEmail}</strong>. {t("Please check your inbox.")}
                </p>
                <button
                  onClick={() => { setIsForgotPassword(false); setResetSent(false); setResetEmail(''); }}
                  className="text-sm font-bold transition-all uppercase tracking-wider"
                  style={{ color: 'var(--primary)' }}
                >
                  {t('Back to Sign In')}
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <Input
                  id="reset-email"
                  type="email"
                  label={t('Email Address')}
                  placeholder="you@example.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                />

                {errorBox}

                <Button type="submit" variant="primary" size="lg" className="w-full mt-6 font-headline uppercase tracking-widest" disabled={loading}>
                  {loading ? spinner : t('Send Reset Link')}
                </Button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => { setIsForgotPassword(false); setError(''); }}
                    className="text-xs font-bold transition-all uppercase tracking-widest"
                    style={{ color: 'var(--text-muted)' }}
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
            {verificationSuccess && (
              <div
                className="px-4 py-3.5 text-sm font-semibold mb-6 flex items-center gap-2.5 animate-fadeIn"
                style={{ background: 'var(--accent-green)', color: '#fff', border: '2px solid var(--border-ink-color)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-hard-sm)' }}
              >
                <span className="material-symbols-outlined text-[20px]">{t('check_circle')}</span>
                <span>{t('Email verified successfully! You can now sign in.')}</span>
              </div>
            )}

            <div
              className="p-1 flex relative mb-8"
              style={{ background: 'var(--bg-elevated)', border: '2px solid var(--border-ink-color)', borderRadius: 'var(--radius-full)' }}
            >
              <div
                className="absolute top-1 bottom-1 w-[calc(50%-4px)] transition-transform duration-300 ease-out"
                style={{
                  background: 'var(--primary)',
                  border: '2px solid var(--border-ink-color)',
                  borderRadius: 'var(--radius-full)',
                  boxShadow: 'var(--shadow-hard-sm)',
                  transform: isLogin ? 'translateX(0)' : 'translateX(100%)',
                }}
              />
              <button
                className="flex-grow py-2.5 text-sm font-bold uppercase tracking-widest z-10 transition-colors"
                style={{ color: isLogin ? '#fff' : 'var(--text-muted)', fontFamily: 'var(--font-heading)' }}
                onClick={() => { setIsLogin(true); setError(''); }}
                type="button"
              >
                {t('Sign In')}
              </button>
              <button
                className="flex-grow py-2.5 text-sm font-bold uppercase tracking-widest z-10 transition-colors"
                style={{ color: !isLogin ? '#fff' : 'var(--text-muted)', fontFamily: 'var(--font-heading)' }}
                onClick={() => { setIsLogin(false); setError(''); }}
                type="button"
              >
                {t('Sign Up')}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {!isLogin && (
                <div className="animate-fadeIn">
                  <Input
                    id="name"
                    type="text"
                    label={t('Full Name')}
                    placeholder={t('Enter your full name')}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required={!isLogin}
                  />
                </div>
              )}

              <Input
                id="email"
                type="email"
                label={t('Email Address')}
                placeholder="you@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />

              <div className="input-group">
                <div className="flex justify-between items-center">
                  <label htmlFor="password" style={{ margin: 0 }}>{t('Password')}</label>
                  {isLogin && (
                    <button
                      type="button"
                      onClick={() => { setIsForgotPassword(true); setError(''); }}
                      className="text-xs font-bold transition-all"
                      style={{ color: 'var(--primary)' }}
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
                <div className="space-y-2 animate-fadeIn pt-1">
                  <label style={eyebrowLabel}>{t('I am a...')}</label>
                  <div className="flex gap-3">
                    <button type="button" style={roleTile(formData.role === 'student', '--primary')} onClick={() => setFormData({ ...formData, role: 'student' })}>
                      <span className="text-2xl">🎓</span>
                      <span className="text-sm">{t('Student')}</span>
                    </button>
                  </div>
                </div>
              )}

              {errorBox}

              <Button type="submit" variant="primary" size="lg" className="w-full mt-6 font-headline uppercase tracking-widest" disabled={loading}>
                {loading ? spinner : isLogin ? t('Sign In') : t('Create Account')}
              </Button>
            </form>

            <div className="mt-6">
              <div className="flex items-center my-4">
                <div className="flex-grow border-t-2" style={{ borderColor: 'var(--border-ink-color)', opacity: 0.4 }} />
                <span style={{ ...eyebrowLabel, padding: '0 12px' }}>{t('Or Continue With')}</span>
                <div className="flex-grow border-t-2" style={{ borderColor: 'var(--border-ink-color)', opacity: 0.4 }} />
              </div>

              <div className="grid grid-cols-1">
                {/* Google sign-in — themed to match the app.
                    GIS can only render its own button inside a cross-origin iframe (we can't style
                    its interior), so we keep that official button as the REAL, clickable control:
                    it stays in normal flow (defining the height) but is hidden with opacity:0.
                    Our own ink-border / hard-shadow / Fredoka button is overlaid on top with
                    pointer-events:none, so every click falls THROUGH to Google's button and the
                    secure ID-token flow is unchanged. Requires VITE_GOOGLE_CLIENT_ID at build time;
                    without it #google-signin-button stays empty and the overlay has nothing behind
                    it (so it renders but does nothing — matches the pre-existing no-op behavior). */}
                <div className="group relative w-full">
                  <div id="google-signin-button" className="w-full flex justify-center" style={{ opacity: 0 }} />
                  <div
                    aria-hidden="true"
                    className="clay-button absolute inset-0 w-full pointer-events-none flex items-center justify-center gap-3 font-headline font-bold text-sm md:text-[15px] uppercase tracking-wide transition-transform group-hover:-translate-x-px group-hover:-translate-y-px group-active:translate-x-0.5 group-active:translate-y-0.5"
                  >
                    <span className="flex items-center justify-center bg-white rounded-md shrink-0" style={{ width: 26, height: 26 }}>
                      <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                      </svg>
                    </span>
                    <span>{t('Continue with Google')}</span>
                  </div>
                </div>
              </div>
            </div>

          </>
        )}




      </div>
    </div>
  );
}
