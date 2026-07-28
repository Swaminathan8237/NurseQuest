import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Avatar from './Avatar';
import AccountSettingsModal from './AccountSettingsModal';

export default function ProfileDropdown() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [isOpen, setIsOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState('profile');
  const dropdownRef = useRef(null);

  const isUnitsPage = location.pathname === '/units';
  const isLightPage = isUnitsPage || theme === 'light';

  const isStudent = user?.role === 'student';
  const isAdmin = user?.role === 'admin';
  const dashPath = isAdmin ? '/admin' : (isStudent ? '/student' : '/teacher');

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close dropdown on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleOpenModal = (tab) => {
    setModalInitialTab(tab);
    setModalOpen(true);
    setIsOpen(false);
  };

  const handleLogout = () => {
    setIsOpen(false);
    logout();
    navigate('/auth');
  };

  const level = Math.floor((user?.xp || 0) / 250) + 1;

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Avatar Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group relative flex items-center justify-center rounded-full p-0.5 transition-all duration-300 focus:outline-none"
        title="Account & Profile Options"
        aria-expanded={isOpen}
      >
        <div className={`w-10 h-10 rounded-full border-2 transition-all duration-300 overflow-hidden shadow-md ${
          isOpen
            ? 'border-primary ring-4 ring-primary/20 scale-105'
            : 'border-primary/60 hover:border-primary group-hover:scale-105'
        }`}>
          {isStudent ? (
            <Avatar config={user?.avatar_config} size={36} showBg={false} />
          ) : isAdmin ? (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-secondary-light text-white">
              <span className="material-symbols-outlined text-base">admin_panel_settings</span>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-primary-container text-white">
              <span className="material-symbols-outlined text-base">edit_square</span>
            </div>
          )}
        </div>

        {/* Online Status Dot */}
        <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full shadow-sm"></span>
      </button>

      {/* Profile Dropdown Popover Container */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xl shadow-purple-900/10 dark:shadow-black/60 overflow-hidden z-50 animate-scaleUp origin-top-right transition-all">
          
          {/* Header User Card */}
          <div className="p-5 bg-gradient-to-br from-purple-500/10 via-primary/5 to-cyan-500/10 dark:from-purple-950/30 dark:to-slate-900 border-b border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full border-2 border-white dark:border-slate-800 shadow-md overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <Avatar config={user?.avatar_config} size={44} showBg={false} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-headline font-black text-base text-slate-900 dark:text-white truncate">
                    {user?.name || user?.email?.split('@')[0] || 'Nurse Scholar'}
                  </h4>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
                  {user?.email || 'student@nursing-platform.edu'}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-headline font-black uppercase tracking-wider bg-primary/15 text-primary dark:bg-primary/30 dark:text-primary-light border border-primary/20">
                    {user?.role || 'Student'}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    Level {level}
                  </span>
                </div>
              </div>
            </div>

            {/* XP Progress Bar Summary */}
            {isStudent && (
              <div className="mt-4 p-3 rounded-2xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 shadow-inner">
                <div className="flex justify-between items-center text-xs font-headline font-bold mb-1.5">
                  <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-amber-500" style={{fontVariationSettings: "'FILL' 1"}}>bolt</span>
                    <span>Clinical XP</span>
                  </span>
                  <span className="text-primary font-black">{user?.xp || 0} XP</span>
                </div>
                <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-primary via-indigo-500 to-emerald-400 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, ((user?.xp || 0) % 250) / 2.5)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Menu Sections */}
          <div className="p-2 space-y-1 font-headline">
            
            {/* Account & Profile */}
            <button
              onClick={() => handleOpenModal('profile')}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-all group"
            >
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center transition-transform group-hover:scale-110">
                <span className="material-symbols-outlined text-base">person</span>
              </div>
              <div className="text-left">
                <div className="font-extrabold text-slate-900 dark:text-white">Account Details</div>
                <div className="text-[10px] text-slate-500 font-medium">View clinical rank & stats</div>
              </div>
            </button>

            {/* Avatar Customizer (for Students) */}
            {isStudent && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/avatar-setup');
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-all group"
              >
                <div className="w-8 h-8 rounded-xl bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center transition-transform group-hover:scale-110">
                  <span className="material-symbols-outlined text-base">palette</span>
                </div>
                <div className="text-left">
                  <div className="font-extrabold text-slate-900 dark:text-white">Customize Avatar</div>
                  <div className="text-[10px] text-slate-500 font-medium">Change hair, scrubs & style</div>
                </div>
              </button>
            )}

            {/* Platform Settings */}
            <button
              onClick={() => handleOpenModal('preferences')}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-all group"
            >
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center transition-transform group-hover:scale-110">
                <span className="material-symbols-outlined text-base">settings</span>
              </div>
              <div className="text-left">
                <div className="font-extrabold text-slate-900 dark:text-white">Settings & Audio</div>
                <div className="text-[10px] text-slate-500 font-medium">Sound FX, timers & theme</div>
              </div>
            </button>

            {/* Quick Navigation to Dashboard */}
            <button
              onClick={() => {
                setIsOpen(false);
                navigate(dashPath);
              }}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-all group"
            >
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center transition-transform group-hover:scale-110">
                <span className="material-symbols-outlined text-base">dashboard</span>
              </div>
              <div className="text-left">
                <div className="font-extrabold text-slate-900 dark:text-white">Dashboard Portal</div>
                <div className="text-[10px] text-slate-500 font-medium">Return to overview</div>
              </div>
            </button>

            {/* Inline Theme Switcher */}
            <div className="pt-1 pb-1 px-3.5">
              <div className="flex items-center justify-between p-2 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60">
                <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-primary">
                    {theme === 'dark' ? 'dark_mode' : 'light_mode'}
                  </span>
                  <span>Dark Theme</span>
                </span>
                <button
                  onClick={toggleTheme}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-300 ${
                    theme === 'dark' ? 'bg-primary justify-end' : 'bg-slate-300 justify-start'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-white shadow-md transform transition-transform" />
                </button>
              </div>
            </div>

            <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-extrabold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all group"
            >
              <div className="w-8 h-8 rounded-xl bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center transition-transform group-hover:scale-110">
                <span className="material-symbols-outlined text-base">logout</span>
              </div>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}

      {/* Account & Settings Modal */}
      <AccountSettingsModal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        initialTab={modalInitialTab} 
      />
    </div>
  );
}
