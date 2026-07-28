import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import AuthPage from './pages/AuthPage';
import LandingPage from './pages/LandingPage';
import AvatarSetup from './pages/AvatarSetup';
import StudentDashboard from './pages/StudentDashboard';
import TeacherDashboard from './pages/TeacherDashboard';
import QuizPlayer from './pages/QuizPlayer';
import QuizBuilder from './pages/QuizBuilder';
import Leaderboard from './pages/Leaderboard';
import LiveGame from './pages/LiveGame';
import Units from './pages/Units';
import AdminDashboard from './pages/AdminDashboard';
import logo from './assets/skillquest-logo.png';
import './App.css';

function ProtectedRoute({ children, allowedRoles, role }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner" /><p>Loading SkillQuest...</p></div>;
  if (!user) return <Navigate to="/auth" />;
  if (user.needProfileSetup) return <Navigate to="/auth" />;

  const roles = allowedRoles || (role ? [role] : []);
  if (roles.length > 0 && !roles.includes(user.role)) {
    if (user.role === 'admin') return <Navigate to="/admin" />;
    return <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} />;
  }
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="loading-screen">
        <img src={logo} alt="SkillQuest Logo" className="w-16 h-16 animate-pulse mb-2 object-contain" />
        <div className="spinner" />
        <p style={{ color: 'var(--text-secondary)' }}>Loading SkillQuest...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Navigate to={`/auth${location.search}`} replace />} />
      <Route path="/auth" element={user && !user.needProfileSetup ? <Navigate to={user.role === 'admin' ? '/admin' : (user.role === 'teacher' ? '/teacher' : '/student')} /> : <AuthPage />} />
      <Route path="/avatar-setup" element={<ProtectedRoute role="student"><AvatarSetup /></ProtectedRoute>} />
      <Route path="/student" element={<ProtectedRoute role="student"><StudentDashboard /></ProtectedRoute>} />
      <Route path="/teacher" element={<ProtectedRoute role="teacher"><TeacherDashboard /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
      <Route path="/quiz/:id" element={<ProtectedRoute><QuizPlayer /></ProtectedRoute>} />
      <Route path="/quiz-builder" element={<ProtectedRoute allowedRoles={['teacher', 'admin']}><QuizBuilder /></ProtectedRoute>} />
      <Route path="/quiz-builder/:id" element={<ProtectedRoute allowedRoles={['teacher', 'admin']}><QuizBuilder /></ProtectedRoute>} />
      <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
      <Route path="/live" element={<ProtectedRoute><LiveGame /></ProtectedRoute>} />
      <Route path="/live/:code" element={<ProtectedRoute><LiveGame /></ProtectedRoute>} />
      <Route path="/units" element={<ProtectedRoute><Units /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <AppRoutes />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
