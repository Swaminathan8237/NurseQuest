import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import ProfileDropdown from './ProfileDropdown';

import logo from '../assets/skillquest-logo.png';

/* Desktop nav link: active = solid primary block with ink outline + hard shadow */
const navLinkClass = ({ isActive }) =>
  isActive ? 'nav-pill nav-pill--active' : 'nav-pill';

const mobileNavLinkClass = ({ isActive }) =>
  isActive
    ? 'flex items-center gap-4 px-4 py-3 rounded-xl bg-primary text-white font-black'
    : 'flex items-center gap-4 px-4 py-3 rounded-xl text-on-surface-variant hover:bg-brand-elevated hover:text-primary font-bold transition-colors';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    setMobileMenuOpen(false);
    logout();
    navigate('/auth');
  };

  const isAdmin = user?.role === 'admin';
  const isStudent = user?.role === 'student';
  const dashPath = isAdmin ? '/admin' : isStudent ? '/student' : '/teacher';

  return (
    <>
      <style>{`
        .nav-pill {
          padding: 6px 16px;
          border-radius: 9999px;
          font-family: var(--font-heading);
          font-weight: 800;
          font-size: 0.9rem;
          color: var(--text-secondary);
          border: 2px solid transparent;
          transition: color .15s, background .15s, transform .15s;
        }
        .nav-pill:hover { color: var(--primary); background: var(--bg-hover); }
        .nav-pill--active {
          color: #fff;
          background: var(--primary);
          border-color: var(--border-ink-color);
          box-shadow: var(--shadow-hard-sm);
        }
        .nav-pill--active:hover { color: #fff; background: var(--primary); }
      `}</style>

      <nav
        className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-4 md:px-6 py-2.5 max-w-7xl mx-auto mt-2 md:mt-4 rounded-full"
        style={{
          background: 'var(--bg-surface)',
          border: '2px solid var(--border-ink-color)',
          boxShadow: 'var(--shadow-hard)',
          color: 'var(--text-primary)',
        }}
      >
        <div className="flex items-center gap-4 md:gap-6">
          <NavLink to={dashPath} className="flex items-center gap-2.5 group">
            <img
              src={logo}
              alt="SkillQuest Logo"
              className="w-9 h-9 object-contain rounded-xl transition-transform group-hover:scale-105"
              style={{ border: '2px solid var(--border-ink-color)' }}
            />
            <span
              className="text-xl md:text-2xl font-headline tracking-tight"
              style={{ fontWeight: 900, color: 'var(--text-primary)' }}
            >
              Skill<span style={{ color: 'var(--primary)' }}>Quest</span>
            </span>
          </NavLink>
          <div className="hidden lg:flex gap-1 items-center">
            <NavLink to={dashPath} className={navLinkClass}>Dashboard</NavLink>
            {isStudent && <NavLink to="/units" className={navLinkClass}>Levels</NavLink>}
            <NavLink to="/leaderboard" className={navLinkClass}>Leaderboard</NavLink>
            {!isStudent && <NavLink to="/quiz-builder" className={navLinkClass}>Create Quiz</NavLink>}
            <NavLink to="/live" className={navLinkClass}>Live Game</NavLink>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          {isStudent && (
            <div
              className="hidden lg:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-headline text-sm"
              style={{
                background: 'var(--accent-gold)',
                color: 'var(--ink)',
                fontWeight: 900,
                border: '2px solid var(--border-ink-color)',
                boxShadow: 'var(--shadow-hard-sm)',
              }}
            >
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
              <span>{user?.xp || 0} XP</span>
            </div>
          )}

          <button
            className="p-2.5 rounded-full transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            <span className="material-symbols-outlined text-lg">
              {theme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
          </button>

          <ProfileDropdown />

          <button
            className="lg:hidden p-2.5 rounded-full transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onClick={() => setMobileMenuOpen(true)}
            title="Open Menu"
          >
            <span className="material-symbols-outlined text-lg">menu</span>
          </button>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div
            className="absolute right-0 top-0 bottom-0 w-72 max-w-[85vw] flex flex-col animate-slideInRight"
            style={{ background: 'var(--bg-surface)', borderLeft: '2px solid var(--border-ink-color)' }}
          >
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '2px solid var(--border-ink-color)' }}
            >
              <span className="font-headline font-black" style={{ color: 'var(--text-primary)' }}>Navigation</span>
              <button
                className="p-2 rounded-full transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 font-headline">
              <NavLink to={dashPath} className={mobileNavLinkClass} onClick={() => setMobileMenuOpen(false)}>
                <span className="material-symbols-outlined text-xl">dashboard</span>
                Dashboard
              </NavLink>
              {isStudent && (
                <NavLink to="/units" className={mobileNavLinkClass} onClick={() => setMobileMenuOpen(false)}>
                  <span className="material-symbols-outlined text-xl">school</span>
                  Levels
                </NavLink>
              )}
              <NavLink to="/leaderboard" className={mobileNavLinkClass} onClick={() => setMobileMenuOpen(false)}>
                <span className="material-symbols-outlined text-xl">leaderboard</span>
                Leaderboard
              </NavLink>
              {!isStudent && (
                <NavLink to="/quiz-builder" className={mobileNavLinkClass} onClick={() => setMobileMenuOpen(false)}>
                  <span className="material-symbols-outlined text-xl">edit_note</span>
                  Create Quiz
                </NavLink>
              )}
              <NavLink to="/live" className={mobileNavLinkClass} onClick={() => setMobileMenuOpen(false)}>
                <span className="material-symbols-outlined text-xl">sensors</span>
                Live Game
              </NavLink>
            </div>

            <div className="px-4 py-4 space-y-3" style={{ borderTop: '2px solid var(--border-ink-color)' }}>
              {isStudent && (
                <div
                  className="flex items-center gap-3 px-4 py-3 rounded-xl"
                  style={{ background: 'var(--accent-gold)', color: 'var(--ink)', border: '2px solid var(--border-ink-color)' }}
                >
                  <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
                  <div>
                    <p className="text-xs font-bold opacity-80">XP Points</p>
                    <p className="text-lg font-black">{user?.xp || 0}</p>
                  </div>
                </div>
              )}
              <button
                className="flex items-center gap-4 w-full px-4 py-3 rounded-xl transition-colors"
                style={{ color: 'var(--danger)' }}
                onClick={handleLogout}
              >
                <span className="material-symbols-outlined text-xl">logout</span>
                <span className="font-bold text-sm">Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
