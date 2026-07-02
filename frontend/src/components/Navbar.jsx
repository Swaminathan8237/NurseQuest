import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Avatar from './Avatar';

const mobileNavLinkClass = ({ isActive }) =>
  isActive
    ? "flex items-center gap-4 px-4 py-3 rounded-xl bg-primary/15 text-primary font-bold"
    : "flex items-center gap-4 px-4 py-3 rounded-xl text-on-surface-variant hover:bg-surface-container hover:text-primary transition-all";

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
  const dashPath = isAdmin ? '/admin' : (isStudent ? '/student' : '/teacher');

  const navLinkClass = ({ isActive }) =>
    isActive
      ? "text-primary font-bold bg-brand-surface px-4 py-1.5 rounded-full shadow-[inset_2px_2px_4px_rgba(10,10,25,0.4),_inset_-2px_-2px_4px_rgba(70,75,120,0.15)] transition-all duration-200"
      : "text-on-surface-variant hover:text-primary px-4 py-1.5 rounded-full transition-all duration-200 hover:scale-105";

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-4 md:px-8 py-3 max-w-7xl mx-auto navbar-glass rounded-full mt-2 md:mt-4">
        <div className="flex items-center gap-4 md:gap-8">
          <NavLink to={dashPath} className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shadow-clay-outer">
              <span className="material-symbols-outlined text-xl text-primary" style={{fontVariationSettings: "'FILL' 1"}}>medical_services</span>
            </div>
            <span className="text-xl md:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-br from-[#b76dff] to-[#ddb7ff] font-['Manrope'] tracking-tight">
              NurseQuest
            </span>
          </NavLink>
          <div className="hidden md:flex gap-1 font-['Manrope'] tracking-tight font-semibold text-sm">
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
            {isStudent && (
              <NavLink to="/mini-game" className={navLinkClass}>
                Mini-Game
              </NavLink>
            )}
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
            <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm bg-brand-elevated text-brand-textPrimary shadow-[inset_-2px_-2px_4px_rgba(70,75,120,0.15),_inset_2px_2px_4px_rgba(10,10,25,0.3)]">
              <span className="material-symbols-outlined text-sm animate-pulse" style={{fontVariationSettings: "'FILL' 1"}}>bolt</span>
              <span>{user?.xp || 0} XP</span>
            </div>
          )}
          <div className="flex items-center gap-1 md:gap-2">
            <button 
              className="p-2.5 rounded-full hover:bg-brand-elevated transition-all duration-200 text-on-surface-variant hover:text-primary"
              onClick={toggleTheme} 
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              <span className="material-symbols-outlined text-lg">
                {theme === 'dark' ? 'light_mode' : 'dark_mode'}
              </span>
            </button>

            <button 
              className="hidden md:inline-flex p-2.5 rounded-full hover:bg-error/10 transition-all duration-200 text-on-surface-variant hover:text-error"
              onClick={handleLogout} 
              title="Logout"
            >
              <span className="material-symbols-outlined text-lg">logout</span>
            </button>
            
            <div className="relative w-9 h-9 md:w-10 md:h-10 rounded-full border-2 border-primary/50 overflow-hidden cursor-pointer group shadow-clay-outer hover:border-primary transition-all duration-300"
              onClick={() => { if (isStudent) navigate('/avatar-setup'); else if (isAdmin) navigate('/admin'); else navigate('/quiz-builder'); }}
              title={isStudent ? 'Customize Avatar' : (isAdmin ? 'Admin Dashboard' : 'Create New Quiz')}>
              {isStudent ? (
                <Avatar config={user?.avatar_config} size={36} showBg={false} />
              ) : isAdmin ? (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-secondary-light text-white transition-transform group-hover:scale-110">
                  <span className="material-symbols-outlined text-sm md:text-base">admin_panel_settings</span>
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-primary-container text-white transition-transform group-hover:scale-110">
                  <span className="material-symbols-outlined text-sm md:text-base">edit_square</span>
                </div>
              )}
            </div>

            <button
              className="md:hidden p-2.5 rounded-full hover:bg-surface-container transition-all duration-200 text-on-surface-variant hover:text-primary"
              onClick={() => setMobileMenuOpen(true)}
              title="Open Menu"
            >
              <span className="material-symbols-outlined text-lg">menu</span>
            </button>
          </div>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
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
              {isStudent && (
                <NavLink
                  to="/mini-game"
                  className={mobileNavLinkClass}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="material-symbols-outlined text-xl">stadia_controller</span>
                  Mini-Game
                </NavLink>
              )}
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
