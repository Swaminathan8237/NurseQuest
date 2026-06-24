import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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
import NursingMiniGame from './pages/NursingMiniGame';
import Units from './pages/Units';
import './App.css';

function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner" /><p>Loading NurseQuest...</p></div>;
  if (!user) return <Navigate to="/auth" />;
  if (role && user.role !== role) return <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="nq-logo animate-pulse">🏥</div>
        <div className="spinner" />
        <p style={{ color: 'var(--text-secondary)' }}>Loading NurseQuest...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={user ? <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} /> : <AuthPage />} />
      <Route path="/avatar-setup" element={<ProtectedRoute role="student"><AvatarSetup /></ProtectedRoute>} />
      <Route path="/student" element={<ProtectedRoute role="student"><StudentDashboard /></ProtectedRoute>} />
      <Route path="/teacher" element={<ProtectedRoute role="teacher"><TeacherDashboard /></ProtectedRoute>} />
      <Route path="/quiz/:id" element={<ProtectedRoute><QuizPlayer /></ProtectedRoute>} />
      <Route path="/quiz-builder" element={<ProtectedRoute role="teacher"><QuizBuilder /></ProtectedRoute>} />
      <Route path="/quiz-builder/:id" element={<ProtectedRoute role="teacher"><QuizBuilder /></ProtectedRoute>} />
      <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
      <Route path="/live/:code" element={<LiveGame />} />
      <Route path="/live" element={<LiveGame />} />
      <Route path="/units" element={<ProtectedRoute><Units /></ProtectedRoute>} />
      <Route path="/mini-game" element={<ProtectedRoute role="student"><NursingMiniGame /></ProtectedRoute>} />
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
