import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Avatar from './Avatar';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  const isStudent = user?.role === 'student';
  const dashPath = isStudent ? '/student' : '/teacher';

  const navLinkClass = ({ isActive }) =>
    isActive
      ? "text-primary font-bold bg-primary/10 px-4 py-1.5 rounded-full transition-all duration-200"
      : "text-on-surface-variant hover:text-primary px-4 py-1.5 rounded-full transition-all duration-200 hover:bg-surface-container";

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-8 py-3 max-w-7xl mx-auto navbar-glass rounded-full mt-4">
      <div className="flex items-center gap-8">
        <NavLink to={dashPath} className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center ring-1 ring-primary/30 shadow-[0_0_12px_rgba(108,92,231,0.2)] group-hover:shadow-[0_0_20px_rgba(108,92,231,0.4)] transition-all">
            <span className="material-symbols-outlined text-xl text-primary" style={{fontVariationSettings: "'FILL' 1"}}>medical_services</span>
          </div>
          <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-br from-[#b76dff] to-[#ddb7ff] font-['Manrope'] tracking-tight">
            NurseQuest
          </span>
        </NavLink>
        <div className="hidden md:flex gap-1 font-['Manrope'] tracking-tight font-semibold text-sm">
          <NavLink to={dashPath} className={navLinkClass}>
            Dashboard
          </NavLink>
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
      <div className="flex items-center gap-3">
        {isStudent && (
          <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm bg-gradient-to-r from-primary/25 to-primary/15 text-primary border border-primary/40 shadow-[0_0_15px_rgba(108,92,231,0.35)] hover:shadow-[0_0_25px_rgba(108,92,231,0.6)] hover:border-primary/60 transition-all duration-300">
            <span className="material-symbols-outlined text-sm animate-pulse" style={{fontVariationSettings: "'FILL' 1"}}>bolt</span>
            <span>{user?.xp || 0} XP</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button 
            className="p-2.5 rounded-full hover:bg-surface-container transition-all duration-200 text-on-surface-variant hover:text-primary"
            onClick={toggleTheme} 
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            <span className="material-symbols-outlined text-lg">
              {theme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
          </button>

          <button 
            className="p-2.5 rounded-full hover:bg-error/10 transition-all duration-200 text-on-surface-variant hover:text-error"
            onClick={handleLogout} 
            title="Logout"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
          </button>
          
          <div className="relative w-10 h-10 rounded-full border-2 border-primary/50 overflow-hidden cursor-pointer group shadow-[0_0_12px_rgba(108,92,231,0.2)] hover:shadow-[0_0_20px_rgba(108,92,231,0.4)] hover:border-primary transition-all duration-300"
            onClick={() => { if (isStudent) navigate('/avatar-setup'); else navigate('/quiz-builder'); }}
            title={isStudent ? 'Customize Avatar' : 'Create New Quiz'}>
            {isStudent ? (
              <Avatar config={user?.avatar_config} size={40} showBg={false} />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-primary-container text-white transition-transform group-hover:scale-110">
                <span className="material-symbols-outlined">edit_square</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
