import { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Avatar from './Avatar';
import ProfileDropdown from './ProfileDropdown';

import logo from '../assets/skillquest-logo.png';

const mobileNavLinkClass = ({ isActive }) =>
  isActive
    ? "flex items-center gap-4 px-4 py-3 rounded-xl bg-primary/15 text-primary font-bold"
    : "flex items-center gap-4 px-4 py-3 rounded-xl text-on-surface-variant hover:bg-surface-container hover:text-primary transition-all";

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isUnitsPage = location.pathname === '/units';
  const isLightPage = isUnitsPage || theme === 'light';

  const handleLogout = () => {
    setMobileMenuOpen(false);
    logout();
    navigate('/auth');
  };

  const isAdmin = user?.role === 'admin';
  const isStudent = user?.role === 'student';
  const dashPath = isAdmin ? '/admin' : (isStudent ? '/student' : '/teacher');

  const navLinkClass = ({ isActive }) => {
    if (isActive) {
      return isLightPage
        ? "text-white font-black bg-primary px-4 py-1.5 rounded-full shadow-md shadow-purple-500/20 transition-all duration-200"
        : "text-white font-black bg-primary px-4 py-1.5 rounded-full shadow-[0_0_15px_rgba(124,58,237,0.5)] transition-all duration-200";
    }
    return isLightPage
      ? "text-slate-600 hover:text-primary font-bold hover:bg-slate-100/80 px-4 py-1.5 rounded-full transition-all duration-200"
      : "text-slate-300 hover:text-primary px-4 py-1.5 rounded-full transition-all duration-200 hover:scale-105";
  };

  return (
    <>
      <nav className={`fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-4 md:px-8 py-3 max-w-7xl mx-auto rounded-full mt-2 md:mt-4 transition-all duration-300 ${
        isLightPage
          ? 'bg-white/90 backdrop-blur-xl border border-slate-200/90 shadow-[0_8px_30px_rgba(0,0,0,0.08)] text-slate-900'
          : 'bg-[#0F0E1A]/85 backdrop-blur-xl border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.4)] text-white'
      }`}>
        <div className="flex items-center gap-4 md:gap-8">
          <NavLink to={dashPath} className="flex items-center gap-2.5 group">
            <img src={logo} alt="SkillQuest Logo" className="w-9 h-9 object-contain rounded-xl shadow-md transition-transform group-hover:scale-105" />
            <span className="text-xl md:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary via-purple-600 to-tertiary font-headline tracking-tight">
              SkillQuest
            </span>
          </NavLink>
          <div className="hidden lg:flex gap-1 font-headline tracking-tight font-bold text-sm">
            <NavLink to={dashPath} className={navLinkClass}>
              Dashboard
            </NavLink>
            {isStudent && (
              <NavLink to="/units" className={navLinkClass}>
                Units
              </NavLink>
            )}
            <NavLink to="/leaderboard" className={navLinkClass}>
              Leaderboard
            </NavLink>
            {!isStudent && (
              <NavLink to="/quiz-builder" className={navLinkClass}>
                Create Quiz
              </NavLink>
            )}
            <NavLink to="/live" className={navLinkClass}>
              Live Game
            </NavLink>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          {isStudent && (
            <div className={`hidden lg:flex items-center gap-2 px-4 py-2 rounded-full font-headline font-black text-sm transition-colors ${
              isLightPage 
                ? 'bg-slate-100 border border-slate-200/90 text-primary shadow-sm' 
                : 'bg-brand-elevated text-brand-textPrimary shadow-[inset_-2px_-2px_4px_rgba(70,75,120,0.15),_inset_2px_2px_4px_rgba(10,10,25,0.3)]'
            }`}>
              <span className="material-symbols-outlined text-sm animate-pulse" style={{fontVariationSettings: "'FILL' 1"}}>bolt</span>
              <span>{user?.xp || 0} XP</span>
            </div>
          )}
          <div className="flex items-center gap-1 md:gap-2">
            {!isUnitsPage && (
              <button 
                className={`p-2.5 rounded-full transition-all duration-200 ${
                  isLightPage ? 'text-slate-600 hover:text-primary hover:bg-slate-100' : 'text-slate-300 hover:text-primary hover:bg-white/10'
                }`}
                onClick={toggleTheme} 
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                <span className="material-symbols-outlined text-lg">
                  {theme === 'dark' ? 'light_mode' : 'dark_mode'}
                </span>
              </button>
            )}

            <ProfileDropdown />

            <button
              className={`lg:hidden p-2.5 rounded-full transition-all duration-200 ${
                isLightPage ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-300 hover:bg-white/10'
              }`}
              onClick={() => setMobileMenuOpen(true)}
              title="Open Menu"
            >
              <span className="material-symbols-outlined text-lg">menu</span>
            </button>
          </div>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="absolute right-0 top-0 bottom-0 w-72 max-w-[85vw] bg-surface-container-lowest border-l border-white/10 shadow-2xl flex flex-col animate-slideInRight">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <span className="font-bold text-on-surface font-['Manrope']">Navigation</span>
              <button
                className="p-2 rounded-full hover:bg-surface-container transition-all text-on-surface-variant"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 font-['Manrope'] tracking-tight font-semibold text-sm">
              <NavLink
                to={dashPath}
                className={mobileNavLinkClass}
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="material-symbols-outlined text-xl">dashboard</span>
                Dashboard
              </NavLink>
              {isStudent && (
                <NavLink
                  to="/units"
                  className={mobileNavLinkClass}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="material-symbols-outlined text-xl">school</span>
                  Units
                </NavLink>
              )}
              <NavLink
                to="/leaderboard"
                className={mobileNavLinkClass}
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="material-symbols-outlined text-xl">leaderboard</span>
                Leaderboard
              </NavLink>
              {!isStudent && (
                <NavLink
                  to="/quiz-builder"
                  className={mobileNavLinkClass}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="material-symbols-outlined text-xl">edit_note</span>
                  Create Quiz
                </NavLink>
              )}
              <NavLink
                to="/live"
                className={mobileNavLinkClass}
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="material-symbols-outlined text-xl">sensors</span>
                Live Game
              </NavLink>
            </div>

            <div className="px-4 py-4 border-t border-white/5 space-y-3">
              {isStudent && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-primary/20 to-primary/5 border border-primary/20">
                  <span className="material-symbols-outlined text-primary text-xl animate-pulse" style={{fontVariationSettings: "'FILL' 1"}}>bolt</span>
                  <div>
                    <p className="text-xs text-on-surface-variant">XP Points</p>
                    <p className="text-lg font-black text-primary">{user?.xp || 0}</p>
                  </div>
                </div>
              )}
              <button
                className="flex items-center gap-4 w-full px-4 py-3 rounded-xl text-on-surface-variant hover:bg-error/10 hover:text-error transition-all"
                onClick={handleLogout}
              >
                <span className="material-symbols-outlined text-xl">logout</span>
                <span className="font-semibold text-sm">Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
