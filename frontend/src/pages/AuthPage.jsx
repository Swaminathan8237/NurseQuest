import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

export default function AuthPage() {
  const location = useLocation();
  const [isLogin, setIsLogin] = useState(() => {
    return location.state?.tab !== 'signup';
  });
  const [formData, setFormData] = useState({ email: '', password: '', name: '', role: 'student' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        const user = await login(formData.email, formData.password);
        navigate(user.role === 'teacher' ? '/teacher' : '/student');
      } else {
        const user = await register(formData);
        if (user.role === 'student') {
          navigate('/avatar-setup');
        } else {
          navigate('/teacher');
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center font-body relative overflow-hidden px-4 transition-colors duration-500">
      {/* Theme Toggle in Top Right */}
      <div className="absolute top-8 right-8 z-50">
        <button 
          onClick={toggleTheme}
          className="p-3 rounded-full backdrop-blur-xl border border-outline-variant/30 text-on-surface hover:bg-surface-container-high transition-all"
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

      <div className="w-full max-w-md bg-surface-container-low/60 backdrop-blur-2xl rounded-[2.5rem] border border-outline-variant/30 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] p-8 md:p-10 relative z-10 animate-fadeInUp">
        
        <div className="text-center mb-10">
          <div className="w-20 h-20 mx-auto bg-surface-container-highest rounded-full flex items-center justify-center ring-2 ring-primary shadow-[0_0_30px_rgba(221,183,255,0.4)] mb-6">
            <span className="material-symbols-outlined text-4xl text-transparent bg-clip-text bg-gradient-to-br from-primary-container to-primary" style={{fontVariationSettings: "'FILL' 1"}}>medical_services</span>
          </div>
          <h1 className="text-4xl font-headline font-black tracking-tighter mb-2">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-container to-tertiary">NurseQuest</span>
          </h1>
          <p className="text-on-surface-variant font-medium text-sm">Gamified Interactive Learning for Nursing Excellence</p>
        </div>

        <div className="bg-surface-container-highest/50 p-1.5 rounded-full flex relative mb-8 backdrop-blur-md">
          <div 
            className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-primary/20 border border-primary/30 rounded-full shadow-sm transition-transform duration-300 ease-out`}
            style={{ transform: isLogin ? 'translateX(0)' : 'translateX(100%)' }}
          ></div>
          <button
            className={`flex-1 py-2.5 text-sm font-bold uppercase tracking-widest z-10 transition-colors ${isLogin ? 'text-primary' : 'text-slate-500 hover:text-on-surface'}`}
            onClick={() => { setIsLogin(true); setError(''); }}
            type="button"
          >
            Sign In
          </button>
          <button
            className={`flex-1 py-2.5 text-sm font-bold uppercase tracking-widest z-10 transition-colors ${!isLogin ? 'text-primary' : 'text-slate-500 hover:text-on-surface'}`}
            onClick={() => { setIsLogin(false); setError(''); }}
            type="button"
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {!isLogin && (
            <div className="space-y-1.5 animate-fadeIn">
              <label className="text-xs font-label font-bold text-slate-500 uppercase tracking-widest pl-1" htmlFor="name">Full Name</label>
              <input
                id="name"
                type="text"
                className="w-full bg-surface-container-high border border-outline-variant/30 rounded-xl px-4 py-3.5 text-on-surface font-body placeholder:text-slate-500 focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none"
                placeholder="Enter your full name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required={!isLogin}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-label font-bold text-slate-500 uppercase tracking-widest pl-1" htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              className="w-full bg-surface-container-high border border-outline-variant/30 rounded-xl px-4 py-3.5 text-on-surface font-body placeholder:text-slate-500 focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none"
              placeholder="you@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-label font-bold text-slate-500 uppercase tracking-widest pl-1" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="w-full bg-surface-container-high border border-outline-variant/30 rounded-xl px-4 py-3.5 text-on-surface font-body placeholder:text-slate-500 focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none tracking-widest"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
            />
          </div>

          {!isLogin && (
            <div className="space-y-2 animate-fadeIn pt-2">
              <label className="text-xs font-label font-bold text-slate-500 uppercase tracking-widest pl-1">I am a...</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  className={`flex-1 p-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${formData.role === 'student' ? 'bg-primary/10 border-primary shadow-[0_0_15px_rgba(221,183,255,0.2)]' : 'bg-surface-container-high border-outline-variant/30 hover:bg-surface-container-highest'}`}
                  onClick={() => setFormData({ ...formData, role: 'student' })}
                >
                  <span className="text-2xl mb-1">🎓</span>
                  <span className={`text-sm font-bold ${formData.role === 'student' ? 'text-primary' : 'text-on-surface'}`}>Student</span>
                </button>
                <button
                  type="button"
                  className={`flex-1 p-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${formData.role === 'teacher' ? 'bg-tertiary/10 border-tertiary shadow-[0_0_15px_rgba(113,215,205,0.2)]' : 'bg-surface-container-high border-outline-variant/30 hover:bg-surface-container-highest'}`}
                  onClick={() => setFormData({ ...formData, role: 'teacher' })}
                >
                  <span className="text-2xl mb-1">👩‍⚕️</span>
                  <span className={`text-sm font-bold ${formData.role === 'teacher' ? 'text-tertiary' : 'text-on-surface'}`}>Teacher</span>
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-error/10 border border-error/30 text-error px-4 py-3 rounded-xl text-sm font-medium animate-shake flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span>
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
            ) : isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {isLogin && (
          <div className="mt-8 pt-6 border-t border-white/5">
            <p className="text-xs font-label font-bold text-slate-500 uppercase tracking-widest text-center mb-4">Demo Accounts</p>
            <div className="grid grid-cols-2 gap-3">
              <button 
                className="py-2.5 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/30 text-on-surface-variant hover:text-primary rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2" 
                onClick={() => setFormData({ ...formData, email: 'teacher@nursequest.com', password: 'teacher123' })}
                type="button"
              >
                <span>👩‍⚕️</span> Teacher
              </button>
              <button 
                className="py-2.5 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/30 text-on-surface-variant hover:text-tertiary rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2" 
                onClick={() => setFormData({ ...formData, email: 'student1@nursequest.com', password: 'student123' })}
                type="button"
              >
                <span>🎓</span> Student
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
