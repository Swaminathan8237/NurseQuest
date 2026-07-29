import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { adminAPI } from '../api';
import Navbar from '../components/Navbar';
import Avatar from '../components/Avatar';
import StreakFire from '../components/StreakFire';

// Unit icon + accent maps (mirrors Units.jsx)
const UNIT_ICONS = {
  1: 'health_and_safety', 2: 'masks', 3: 'clean_hands', 4: 'sanitizer',
  5: 'science', 6: 'delete_outline', 7: 'medication', 8: 'bar_chart',
  9: 'star', 10: 'rule', 11: 'badge',
};
const UNIT_COLORS = {
  1: '#7C3AED', 2: '#0284C7', 3: '#059669', 4: '#D97706', 5: '#DC2626',
  6: '#4F46E5', 7: '#0D9488', 8: '#C026D3', 9: '#E11D48', 10: '#2563EB',
  11: '#7C3AED',
};

// Compact date label for attempt chips, e.g. "Jul 28"
const formatDate = (d) => {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // State Management
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);

  // Loading & Action states
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Modal states
  const [requestActionModal, setRequestActionModal] = useState(null); // { request, action: 'approve'|'reject' }
  const [adminNotes, setAdminNotes] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('none');

  // Student Analytics state
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentUnits, setStudentUnits] = useState([]);
  const [overallAvg, setOverallAvg] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [expandedUnit, setExpandedUnit] = useState(null);
  const [unitAttempts, setUnitAttempts] = useState([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const [attemptQuestions, setAttemptQuestions] = useState([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);

  // Load a student's unit-by-unit summary and switch to the analytics tab
  const openStudentAnalytics = async (student) => {
    setActiveTab('analytics');
    setSelectedStudent(student);
    setStudentUnits([]);
    setOverallAvg(0);
    setTotalAttempts(0);
    setExpandedUnit(null);
    setUnitAttempts([]);
    setSelectedAttempt(null);
    setAttemptQuestions([]);
    setUnitsLoading(true);
    try {
      const data = await adminAPI.getStudentUnits(student.id);
      setSelectedStudent(data.student || student);
      setStudentUnits(data.units || []);
      setOverallAvg(data.overallAvg || 0);
      setTotalAttempts(data.totalAttempts || 0);
    } catch (err) {
      console.error('Failed to load student units:', err);
    } finally {
      setUnitsLoading(false);
    }
  };

  // Toggle a unit open and load its attempts
  const toggleUnit = async (unit) => {
    if (expandedUnit === unit) {
      setExpandedUnit(null);
      return;
    }
    setExpandedUnit(unit);
    setUnitAttempts([]);
    setSelectedAttempt(null);
    setAttemptQuestions([]);
    setAttemptsLoading(true);
    try {
      const data = await adminAPI.getStudentUnitAttempts(selectedStudent.id, unit);
      setUnitAttempts(data || []);
    } catch (err) {
      console.error('Failed to load unit attempts:', err);
    } finally {
      setAttemptsLoading(false);
    }
  };

  // Load the question-by-question breakdown for one attempt
  const selectAttempt = async (attempt) => {
    setSelectedAttempt(attempt);
    setAttemptQuestions([]);
    setQuestionsLoading(true);
    try {
      const data = await adminAPI.getAttemptQuestions(attempt.id);
      setAttemptQuestions(data || []);
    } catch (err) {
      console.error('Failed to load attempt questions:', err);
    } finally {
      setQuestionsLoading(false);
    }
  };

  // Reset analytics drill-down back to the student picker
  const backToStudentList = () => {
    setSelectedStudent(null);
    setStudentUnits([]);
    setExpandedUnit(null);
    setUnitAttempts([]);
    setSelectedAttempt(null);
    setAttemptQuestions([]);
  };

  // Fetch dashboard data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [s, u, r] = await Promise.allSettled([
        adminAPI.getStats(),
        adminAPI.getUsers(),
        adminAPI.getAllQuizRequests()
      ]);
      if (s.status === 'fulfilled') setStats(s.value);
      else console.error('Failed to load stats:', s.reason);
      if (u.status === 'fulfilled') setUsers(u.value);
      else console.error('Failed to load users:', u.reason);
      if (r.status === 'fulfilled') setRequests(r.value);
      else console.error('Failed to load requests:', r.reason);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Actions: User Management
  const handleUpdateRole = async (userId, newRole) => {
    if (!window.confirm(`Are you sure you want to change this user's role to ${newRole}?`)) return;
    try {
      await adminAPI.updateUserRole(userId, newRole);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      // Refresh stats
      const s = await adminAPI.getStats();
      setStats(s);
    } catch (err) {
      alert(err.message || 'Failed to update user role');
    }
  };

  const handleDeleteUser = async (userId, userName) => {
    if (!window.confirm(`⚠️ WARNING: Deleting ${userName} will permanently delete their account and ALL associated quizzes, quiz attempts, and scores. This cannot be undone. Proceed?`)) return;
    try {
      await adminAPI.deleteUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
      // Refresh stats
      const s = await adminAPI.getStats();
      setStats(s);
    } catch (err) {
      alert(err.message || 'Failed to delete user');
    }
  };

  // Actions: Request Processing
  const handleProcessRequest = async () => {
    if (!requestActionModal) return;
    const { request, action } = requestActionModal;
    try {
      await adminAPI.processQuizRequest(request.id, action, adminNotes, selectedUnit === 'none' ? null : selectedUnit);
      setRequestActionModal(null);
      setAdminNotes('');
      setSelectedUnit('none');
      // Refresh requests and stats
      const r = await adminAPI.getAllQuizRequests();
      setRequests(r);
      const s = await adminAPI.getStats();
      setStats(s);
    } catch (err) {
      alert(err.message || 'Failed to process request');
    }
  };

  // Actions: Developments reset
  const handleResetStatistics = async () => {
    if (!window.confirm('⚠️ CRITICAL WARNING: You are about to wipe out ALL student quiz attempts, history scores, and answers. User accounts and quizzes themselves will remain intact. This is irreversible. Proceed?')) return;
    try {
      const res = await adminAPI.resetStatistics();
      alert(res.message || 'All statistics and progress reset successfully.');
      fetchData();
    } catch (err) {
      alert(err.message || 'Failed to reset statistics');
    }
  };

  // Filtering users
  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' ? true : u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  if (loading && !stats) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-on-surface font-body flex flex-col pb-24">
      <Navbar />

      <main className="flex-1 max-w-[1920px] mx-auto w-full p-4 lg:p-8 space-y-8 animate-fadeInUp" style={{ paddingTop: '100px' }}>

        {/* Welcome Section */}
        <div className="bg-surface-container-low/60 backdrop-blur-xl rounded-2xl p-6 md:p-8 border border-outline-variant/20 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute -top-32 -left-32 w-64 h-64 bg-primary/10 rounded-full blur-[80px]"></div>
          <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-secondary/10 rounded-full blur-[80px]"></div>

          <div className="flex items-center gap-6 relative z-10">
            <div className="w-20 h-20 bg-surface-container-highest rounded-full flex items-center justify-center ring-2 ring-secondary shadow-[0_0_20px_rgba(183,109,255,0.3)]">
              <span className="text-4xl">👨‍💻</span>
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-headline font-black tracking-tighter">
                Admin <span className="text-transparent bg-clip-text bg-gradient-to-r from-secondary to-primary">Control Center</span>
              </h1>
              <p className="text-on-surface-variant font-medium mt-1">Platform management, unit assignments, and developer diagnostics</p>
            </div>
          </div>

          <div className="flex items-center gap-3 relative z-10">
            {pendingCount > 0 && (
              <button
                className="px-6 py-3.5 bg-secondary text-white rounded-xl font-headline font-bold uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2 active:scale-95 shadow-[0_4px_20px_rgba(183,109,255,0.3)]"
                onClick={() => setActiveTab('requests')}
              >
                <span className="material-symbols-outlined text-lg">task</span>
                {pendingCount} Pending
              </button>
            )}
            <button
              className="px-6 py-3.5 bg-surface-variant/40 border border-outline-variant/30 text-on-surface-variant rounded-xl font-headline font-bold uppercase tracking-widest hover:bg-surface-variant transition-all flex items-center gap-2 active:scale-95"
              onClick={fetchData}
            >
              <span className="material-symbols-outlined text-lg">refresh</span>
              Sync
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/5 gap-2 overflow-x-auto pb-1">
          {[
            { id: 'overview', label: 'Overview & Stats', icon: 'grid_view' },
            { id: 'users', label: 'Students & Teachers', icon: 'group' },
            { id: 'analytics', label: 'Student Analytics', icon: 'monitoring' },
            { id: 'requests', label: `Quiz Requests (${pendingCount})`, icon: 'task' },
            { id: 'developments', label: 'Developments & DB', icon: 'developer_mode' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 rounded-t-xl font-headline font-bold transition-all border-b-2 text-sm whitespace-nowrap ${activeTab === tab.id
                  ? 'border-secondary text-secondary bg-secondary/10'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container/50'
                }`}
            >
              <span className="material-symbols-outlined text-lg">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Contents */}
        {activeTab === 'overview' && stats && (
          <div className="space-y-8 animate-fadeIn">
            {/* Quick Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-surface-container-high/40 rounded-xl p-5 border border-white/5 relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-muted)]">Total Accounts</p>
                    <p className="text-3xl font-bold font-headline mt-2">
                      {stats.users.student + stats.users.teacher + stats.users.admin}
                    </p>
                  </div>
                  <div className="p-3 bg-primary/10 rounded-lg text-primary">
                    <span className="material-symbols-outlined">group</span>
                  </div>
                </div>
                <div className="mt-4 flex gap-4 text-xs font-semibold text-[var(--text-secondary)]">
                  <span>🎓 {stats.users.student} Students</span>
                  <span>👩‍🏫 {stats.users.teacher} Teachers</span>
                </div>
              </div>

              <div className="bg-surface-container-high/40 rounded-xl p-5 border border-white/5 relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-muted)]">Pending Requests</p>
                    <p className="text-3xl font-bold font-headline mt-2 text-warning">{stats.requests.pending}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--warning-light)] text-warning">
                    <span className="material-symbols-outlined">pending_actions</span>
                  </div>
                </div>
                <div className="mt-4 flex gap-4 text-xs font-semibold text-[var(--text-secondary)]">
                  <span>✅ {stats.requests.approved} Approved</span>
                  <span>⛔ {stats.requests.rejected} Rejected</span>
                </div>
              </div>

              <div className="bg-surface-container-high/40 rounded-xl p-5 border border-white/5 relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-muted)]">Total Quizzes</p>
                    <p className="text-3xl font-bold font-headline mt-2">{stats.quizzes.total}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--warning-light)] text-[var(--secondary)]">
                    <span className="material-symbols-outlined">quiz</span>
                  </div>
                </div>
                <div className="mt-4 flex gap-4 text-xs font-semibold text-[var(--text-secondary)]">
                  <span>📖 {stats.quizzes.unitLinked} Linked to Units</span>
                  <span>🌐 {stats.quizzes.standalone} Standalone</span>
                </div>
              </div>

              <div className="bg-surface-container-high/40 rounded-xl p-5 border border-white/5 relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-muted)]">Average Score</p>
                    <p className="text-3xl font-bold font-headline mt-2 text-success">
                      {Math.round(stats.attempts.avgScore)}%
                    </p>
                  </div>
                  <div className="p-3 bg-[var(--success-light)] rounded-lg text-success">
                    <span className="material-symbols-outlined">analytics</span>
                  </div>
                </div>
                <div className="mt-4 text-xs font-semibold text-[var(--text-secondary)]">
                  📝 {stats.attempts.count} attempts | ⏱️ {stats.attempts.totalTimeMinutes} mins logged
                </div>
              </div>
            </div>

            {/* Quiz Requests Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="bg-surface-container-high/30 border border-white/5 rounded-xl p-6 lg:col-span-2 space-y-6">
                <h3 className="text-xl font-bold font-headline">Pending Posting Requests</h3>

                {requests.filter(r => r.status === 'pending').length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
                    <span className="material-symbols-outlined text-4xl mb-2 text-secondary/40">done_all</span>
                    <p className="font-semibold text-sm">All teacher posting requests have been processed!</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                    {requests.filter(r => r.status === 'pending').map(req => (
                      <div key={req.id} className="bg-surface-container-high/60 border border-white/5 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-secondary/20 transition-all">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full bg-secondary/15 text-secondary text-xs font-bold font-mono">
                              QUIZ SUBMISSION
                            </span>
                            <span className="text-xs text-[var(--text-muted)] font-medium">
                              {new Date(req.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <h4 className="text-base font-bold font-headline mt-1.5">{req.quiz_title}</h4>
                          <p className="text-xs text-[var(--text-secondary)] mt-1">
                            Request by: <span className="font-bold text-on-surface">{req.teacher_name}</span> | Target Unit: <span className="font-bold text-on-surface">Unit {req.unit}</span>
                          </p>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                          <button
                            className="flex-1 sm:flex-none px-4 py-2 bg-[var(--success-light)] hover:bg-success/20 border border-success/30 text-success text-xs font-bold rounded-lg transition-all"
                            onClick={() => { setSelectedUnit('none'); setRequestActionModal({ request: req, action: 'approve' }); }}
                          >
                            Approve
                          </button>
                          <button
                            className="flex-1 sm:flex-none px-4 py-2 bg-[var(--danger-light)] hover:bg-danger/20 border border-danger/30 text-danger text-xs font-bold rounded-lg transition-all"
                            onClick={() => { setSelectedUnit('none'); setRequestActionModal({ request: req, action: 'reject' }); }}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Platforms Health */}
              <div className="bg-surface-container-high/30 border border-white/5 rounded-xl p-6 space-y-6">
                <h3 className="text-xl font-bold font-headline">Quiz Posting Workflow</h3>
                <div className="space-y-4 text-sm text-[var(--text-secondary)] leading-relaxed">
                  <p>
                    Teachers are authorized to create and publish standalone quizzes independently.
                  </p>
                  <p>
                    However, to safeguard curriculum standards, linking a quiz to a formal <strong>Unit</strong> requires administrator review.
                  </p>
                  <div className="bg-surface-container-highest/40 p-4 border border-white/5 rounded-xl space-y-3 font-semibold text-xs text-on-surface">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-warning"></span>
                      <span>Pending: {stats.requests.pending} requests</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-success"></span>
                      <span>Approved: {stats.requests.approved} linked</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-danger"></span>
                      <span>Rejected: {stats.requests.rejected} denied</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* User Management Tab */}
        {activeTab === 'users' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="relative w-full md:max-w-md">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[var(--text-muted)]">search</span>
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-surface-container-high border border-white/5 rounded-xl text-sm focus:border-secondary focus:outline-none transition-all"
                />
              </div>

              <div className="flex gap-2 w-full md:w-auto">
                {['all', 'student', 'teacher', 'admin'].map(r => (
                  <button
                    key={r}
                    onClick={() => setRoleFilter(r)}
                    className={`flex-1 md:flex-none px-4 py-2.5 rounded-lg border text-xs font-bold transition-all uppercase ${roleFilter === r
                        ? 'bg-secondary border-secondary text-white'
                        : 'bg-surface-container-high border-white/5 text-on-surface-variant hover:bg-surface-container-highest'
                      }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Users Table */}
            <div className="bg-surface-container-high/30 border border-white/5 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-white/5 bg-surface-container-high/40 font-headline font-bold text-xs uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="p-4 md:p-5">Name / Email</th>
                      <th className="p-4 md:p-5">Role</th>
                      <th className="p-4 md:p-5 text-center">XP Progress</th>
                      <th className="p-4 md:p-5 text-center">Attempts</th>
                      <th className="p-4 md:p-5 text-center">Quizzes Created</th>
                      <th className="p-4 md:p-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-sm font-medium">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="p-10 text-center text-[var(--text-muted)] font-semibold">
                          No users found matching filters.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map(u => (
                        <tr key={u.id} className="hover:bg-white/[0.01] transition-all">
                          <td className="p-4 md:p-5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-surface-container-highest flex items-center justify-center text-base font-bold ring-1 ring-white/10">
                                {u.role === 'admin' ? '🛡️' : u.role === 'teacher' ? '👩‍🏫' : '🎓'}
                              </div>
                              <div>
                                <p className="font-bold text-on-surface">{u.name}</p>
                                <p className="text-xs text-[var(--text-muted)] mt-0.5">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 md:p-5">
                            <select
                              value={u.role}
                              onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                              className="px-3 py-1.5 bg-surface-container-high border border-white/10 rounded-lg text-xs font-bold focus:outline-none focus:border-secondary transition-all"
                            >
                              <option value="student">Student</option>
                              <option value="teacher">Teacher</option>
                              <option value="admin">Administrator</option>
                            </select>
                          </td>
                          <td className="p-4 md:p-5 text-center font-mono text-xs text-[var(--text-secondary)]">
                            {u.role === 'student' ? `${u.xp} XP (Lvl ${u.level})` : 'N/A'}
                          </td>
                          <td className="p-4 md:p-5 text-center font-bold font-mono">
                            {u.role === 'student' ? u.quizzes_taken : 'N/A'}
                          </td>
                          <td className="p-4 md:p-5 text-center font-bold font-mono">
                            {u.role === 'teacher' ? u.quizzes_created : 'N/A'}
                          </td>
                          <td className="p-4 md:p-5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {u.role === 'student' && (
                                <button
                                  className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary hover:scale-105 active:scale-95 transition-all"
                                  onClick={() => openStudentAnalytics(u)}
                                  title="View Analytics"
                                >
                                  <span className="material-symbols-outlined text-lg">monitoring</span>
                                </button>
                              )}
                              <button
                                className="p-2 rounded-lg bg-[var(--danger-light)] hover:bg-danger/20 border border-danger/30 text-danger hover:scale-105 active:scale-95 transition-all"
                                onClick={() => handleDeleteUser(u.id, u.name)}
                                title="Delete User"
                                disabled={u.id === user?.id}
                              >
                                <span className="material-symbols-outlined text-lg">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Student Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="space-y-6 animate-fadeIn">
            {!selectedStudent ? (
              /* ---- Student picker ---- */
              <>
                <div className="relative w-full md:max-w-md">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[var(--text-muted)]">search</span>
                  <input
                    type="text"
                    placeholder="Search students by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-surface-container-high border border-white/5 rounded-xl text-sm focus:border-primary focus:outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {users
                    .filter(u => u.role === 'student')
                    .filter(u =>
                      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      u.email?.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map(s => (
                      <button
                        key={s.id}
                        onClick={() => openStudentAnalytics(s)}
                        className="group text-left bg-surface-container-high/40 hover:bg-surface-container-high/70 rounded-xl p-4 border border-white/5 hover:border-primary/40 transition-all flex items-center gap-4 hover:scale-[1.02]"
                      >
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-white/5 flex-shrink-0">
                          <Avatar config={s.avatar_config || {}} size={48} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-on-surface truncate">{s.name}</p>
                          <p className="text-xs text-[var(--text-muted)] truncate">{s.email}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs font-mono text-[var(--text-muted)]">
                            <span>Lvl {s.level || 1}</span>
                            <span>{(s.xp || 0).toLocaleString()} XP</span>
                          </div>
                        </div>
                        <span className="material-symbols-outlined text-[var(--text-muted)] group-hover:text-primary transition-colors">chevron_right</span>
                      </button>
                    ))}
                  {users.filter(u => u.role === 'student').length === 0 && (
                    <div className="col-span-full text-center py-12 text-[var(--text-muted)]">
                      <span className="material-symbols-outlined text-4xl mb-2 block">school</span>
                      No students found.
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* ---- Selected student drill-down ---- */
              <>
                <button
                  onClick={backToStudentList}
                  className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-muted)] hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">arrow_back</span>
                  All students
                </button>

                {/* Student header */}
                <div className="bg-surface-container-high/40 rounded-2xl p-6 border border-white/5 flex flex-col sm:flex-row items-center gap-6">
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-white/5 flex-shrink-0">
                    <Avatar config={selectedStudent.avatar_config || {}} size={80} />
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <h2 className="text-2xl font-headline font-bold text-on-surface">{selectedStudent.name}</h2>
                    <p className="text-sm text-[var(--text-muted)]">{selectedStudent.email}</p>
                    <div className="flex items-center justify-center sm:justify-start gap-4 mt-3 flex-wrap">
                      <span className="px-3 py-1 rounded-lg bg-white/5 text-xs font-mono font-bold">Level {selectedStudent.level || 1}</span>
                      <span className="px-3 py-1 rounded-lg bg-white/5 text-xs font-mono font-bold">{(selectedStudent.xp || 0).toLocaleString()} XP</span>
                      {selectedStudent.streak > 0 && (
                        <span className="inline-flex items-center gap-1"><StreakFire streak={selectedStudent.streak} /></span>
                      )}
                      <span className="px-3 py-1 rounded-lg bg-white/5 text-xs font-mono font-bold">{totalAttempts} attempts</span>
                    </div>
                  </div>
                  {/* Overall accuracy donut */}
                  <div className="relative w-28 h-28 flex-shrink-0">
                    <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                      <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
                      <circle
                        cx="60" cy="60" r="52" fill="none" stroke="#7C3AED" strokeWidth="12" strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 52}
                        strokeDashoffset={2 * Math.PI * 52 * (1 - overallAvg / 100)}
                        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-on-surface">{overallAvg}%</span>
                      <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Avg Score</span>
                    </div>
                  </div>
                </div>

                {/* Units */}
                {unitsLoading ? (
                  <div className="flex justify-center py-16">
                    <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                  </div>
                ) : studentUnits.length === 0 ? (
                  <div className="text-center py-16 text-[var(--text-muted)]">
                    <span className="material-symbols-outlined text-4xl mb-2 block">quiz</span>
                    This student hasn't attempted any units yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {studentUnits.map(u => {
                      const color = UNIT_COLORS[u.unit] || '#7C3AED';
                      const icon = UNIT_ICONS[u.unit] || 'school';
                      const isOpen = expandedUnit === u.unit;
                      return (
                        <div key={u.unit} className="bg-surface-container-high/40 rounded-2xl border border-white/5 overflow-hidden">
                          {/* Unit summary row */}
                          <button
                            onClick={() => toggleUnit(u.unit)}
                            className="w-full text-left p-5 flex items-center gap-4 hover:bg-white/[0.03] transition-colors"
                          >
                            <div
                              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: `${color}22`, color }}
                            >
                              <span className="material-symbols-outlined">{icon}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 flex-wrap">
                                <p className="font-bold text-on-surface">Unit {u.unit}</p>
                                {u.best_streak > 0 && <StreakFire streak={u.best_streak} />}
                              </div>
                              {/* Avg score bar */}
                              <div className="mt-2 h-2 w-full rounded-full bg-white/5 overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${u.avg_score}%`, background: `linear-gradient(90deg, ${color}, ${color}cc)`, transition: 'width 0.5s ease' }}
                                ></div>
                              </div>
                            </div>
                            <div className="hidden sm:flex items-center gap-6 text-center flex-shrink-0">
                              <div>
                                <p className="text-lg font-bold" style={{ color }}>{u.avg_score}%</p>
                                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Avg</p>
                              </div>
                              <div>
                                <p className="text-lg font-bold text-on-surface">{u.best_score}%</p>
                                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Best</p>
                              </div>
                              <div>
                                <p className="text-lg font-bold text-on-surface">{u.attempts}</p>
                                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Tries</p>
                              </div>
                            </div>
                            <span className={`material-symbols-outlined text-[var(--text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
                          </button>

                          {/* Attempts + question breakdown */}
                          {isOpen && (
                            <div className="border-t border-white/5 p-5 space-y-4 bg-black/10">
                              {attemptsLoading ? (
                                <div className="flex justify-center py-8">
                                  <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                                </div>
                              ) : unitAttempts.length === 0 ? (
                                <p className="text-center text-[var(--text-muted)] py-4 text-sm">No attempts recorded.</p>
                              ) : (
                                <>
                                  {/* Attempt picker */}
                                  <div className="flex gap-2 flex-wrap">
                                    {unitAttempts.map((a, i) => {
                                      const active = selectedAttempt?.id === a.id;
                                      return (
                                        <button
                                          key={a.id}
                                          onClick={() => selectAttempt(a)}
                                          className={`px-3 py-2 rounded-lg border text-xs font-bold transition-all ${active
                                            ? 'bg-primary border-primary text-white'
                                            : 'bg-white/5 border-white/10 text-on-surface hover:bg-white/10'}`}
                                          title={a.quiz_title || ''}
                                        >
                                          <span className="font-mono">#{unitAttempts.length - i}</span>
                                          <span className="mx-1.5 opacity-50">·</span>
                                          {a.score_percent}%
                                          <span className="ml-1.5 opacity-60">{formatDate(a.completed_at)}</span>
                                        </button>
                                      );
                                    })}
                                  </div>

                                  {/* Question table */}
                                  {selectedAttempt && (
                                    questionsLoading ? (
                                      <div className="flex justify-center py-8">
                                        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                                      </div>
                                    ) : (
                                      <div className="bg-surface-container-high/40 border border-white/5 rounded-xl overflow-hidden">
                                        <div className="overflow-x-auto">
                                          <table className="w-full border-collapse text-left text-sm">
                                            <thead>
                                              <tr className="border-b border-white/5 bg-white/[0.03] text-xs uppercase tracking-wider text-[var(--text-muted)]">
                                                <th className="p-3 w-10">#</th>
                                                <th className="p-3">Question</th>
                                                <th className="p-3 text-center">Result</th>
                                                <th className="p-3 text-center">Marks</th>
                                                <th className="p-3 text-center">Accuracy</th>
                                                <th className="p-3 text-center">Time</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {attemptQuestions.map((q, i) => (
                                                <tr key={q.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                                                  <td className="p-3 font-mono text-[var(--text-muted)]">{i + 1}</td>
                                                  <td className="p-3 max-w-md">
                                                    <p className="text-on-surface line-clamp-2">{q.question_text}</p>
                                                    <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{q.type}</span>
                                                  </td>
                                                  <td className="p-3 text-center">
                                                    {q.is_correct ? (
                                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold bg-success/15 text-success">
                                                        <span className="material-symbols-outlined text-sm">check</span>Correct
                                                      </span>
                                                    ) : (
                                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold bg-danger/15 text-danger">
                                                        <span className="material-symbols-outlined text-sm">close</span>Wrong
                                                      </span>
                                                    )}
                                                  </td>
                                                  <td className="p-3 text-center font-mono">
                                                    {q.points_earned.toLocaleString()}<span className="text-[var(--text-muted)]">/{q.points.toLocaleString()}</span>
                                                  </td>
                                                  <td className="p-3 text-center font-mono font-bold" style={{ color: q.accuracy >= 50 ? '#10B981' : '#EF4444' }}>
                                                    {q.accuracy}%
                                                  </td>
                                                  <td className="p-3 text-center font-mono text-[var(--text-muted)]">{q.time_taken}s</td>
                                                </tr>
                                              ))}
                                              {attemptQuestions.length === 0 && (
                                                <tr><td colSpan={6} className="p-6 text-center text-[var(--text-muted)]">No question data.</td></tr>
                                              )}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    )
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Requests Tab */}
        {activeTab === 'requests' && (
          <div className="space-y-6 animate-fadeIn">
            <h3 className="text-xl font-bold font-headline">Quiz Posting Request Logs</h3>

            <div className="bg-surface-container-high/30 border border-white/5 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-white/5 bg-surface-container-high/40 font-headline font-bold text-xs uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="p-4 md:p-5">Quiz Title</th>
                      <th className="p-4 md:p-5">Requested Unit</th>
                      <th className="p-4 md:p-5">Teacher</th>
                      <th className="p-4 md:p-5">Date Submitted</th>
                      <th className="p-4 md:p-5 text-center">Status</th>
                      <th className="p-4 md:p-5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-sm font-medium">
                    {requests.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="p-10 text-center text-[var(--text-muted)] font-semibold">
                          No requests submitted yet.
                        </td>
                      </tr>
                    ) : (
                      requests.map(req => (
                        <tr key={req.id} className="hover:bg-white/[0.01] transition-all">
                          <td className="p-4 md:p-5 font-bold text-on-surface">{req.quiz_title}</td>
                          <td className="p-4 md:p-5 text-[var(--text-secondary)]">Unit {req.unit}</td>
                          <td className="p-4 md:p-5">
                            <p className="font-semibold">{req.teacher_name}</p>
                            <p className="text-xs text-[var(--text-muted)]">{req.teacher_email}</p>
                          </td>
                          <td className="p-4 md:p-5 text-[var(--text-muted)] font-mono text-xs">
                            {new Date(req.created_at).toLocaleString()}
                          </td>
                          <td className="p-4 md:p-5 text-center">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${req.status === 'approved'
                                ? 'bg-[var(--success-light)] text-success'
                                : req.status === 'rejected'
                                  ? 'bg-[var(--danger-light)] text-danger'
                                  : 'bg-[var(--warning-light)] text-warning'
                              }`}>
                              {req.status}
                            </span>
                          </td>
                          <td className="p-4 md:p-5 text-right">
                            {req.status === 'pending' ? (
                              <div className="flex gap-1.5 justify-end">
                                <button
                                  className="px-3 py-1.5 bg-[var(--success-light)] hover:bg-success/20 border border-success/30 text-success text-xs font-bold rounded-lg transition-all"
                                  onClick={() => {
                                    setSelectedUnit('none');
                                    setRequestActionModal({ request: req, action: 'approve' });
                                  }}
                                >
                                  Approve
                                </button>
                                <button
                                  className="px-3 py-1.5 bg-[var(--danger-light)] hover:bg-danger/20 border border-danger/30 text-danger text-xs font-bold rounded-lg transition-all"
                                  onClick={() => {
                                    setSelectedUnit('none');
                                    setRequestActionModal({ request: req, action: 'reject' });
                                  }}
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <p className="text-xs text-[var(--text-muted)] italic max-w-[150px] truncate" title={req.admin_notes || ''}>
                                {req.admin_notes ? `"${req.admin_notes}"` : 'No notes'}
                              </p>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Developments & Database Tab */}
        {activeTab === 'developments' && stats && (
          <div className="space-y-8 animate-fadeIn">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Database Metadata Explorer */}
              <div className="bg-surface-container-high/30 border border-white/5 rounded-2xl p-6 space-y-6">
                <div>
                  <h3 className="text-xl font-bold font-headline">PostgreSQL Database Schema</h3>
                  <p className="text-sm text-[var(--text-muted)] mt-1">Real-time table rows count verified directly from database instances</p>
                </div>

                <div className="space-y-3">
                  {stats.tables.map(tbl => (
                    <div key={tbl.name} className="flex justify-between items-center p-3 rounded-xl bg-surface-container-high/60 border border-white/5 font-mono text-sm">
                      <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">{tbl.name}</span>
                      <span className="px-3 py-1 bg-surface-container-highest text-on-surface rounded-lg font-bold">
                        {tbl.rows !== -1 ? `${tbl.rows} rows` : 'Error checking'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Developer Operations */}
              <div className="bg-surface-container-high/30 border border-white/5 rounded-2xl p-6 space-y-6">
                <div>
                  <h3 className="text-xl font-bold font-headline text-danger">Administrator Systems Tools</h3>
                  <p className="text-sm text-[var(--text-muted)] mt-1">Direct system hooks and administrative cleanup scripts</p>
                </div>

                <div className="space-y-4">
                  <div className="border border-danger/25 bg-[var(--danger-light)] p-5 rounded-xl space-y-4">
                    <div className="flex gap-3">
                      <span className="material-symbols-outlined text-danger text-2xl">warning</span>
                      <div>
                        <h4 className="text-sm font-bold text-on-surface">Reset Attempts & Scores Statistics</h4>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">
                          This operation clears all quiz attempts and answer logs, resetting user XP and student dashboards to clean slates. Accounts and quizzes are kept intact.
                        </p>
                      </div>
                    </div>
                    <button
                      className="w-full py-3 bg-danger text-white hover:bg-danger/80 rounded-xl font-headline font-bold text-xs uppercase tracking-widest active:scale-95 transition-all shadow-[0_4px_15px_rgba(255,49,49,0.3)]"
                      onClick={handleResetStatistics}
                    >
                      Reset statistics logs
                    </button>
                  </div>

                  <div className="border border-white/5 bg-surface-container-highest/20 p-5 rounded-xl space-y-3">
                    <h4 className="text-sm font-bold text-on-surface">Admin System Status</h4>
                    <div className="space-y-2 text-xs font-semibold text-[var(--text-secondary)]">
                      <div className="flex justify-between">
                        <span>API Base URL</span>
                        <span className="font-mono text-on-surface">/api</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Active Session ID</span>
                        <span className="font-mono text-on-surface truncate max-w-[200px]">{user?.id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Environment Mode</span>
                        <span className="font-mono text-success bg-[var(--success-light)] px-2 py-0.5 rounded">Production (Live)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Action Dialog Modal (Quiz Request Approve/Reject) */}
      {requestActionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setRequestActionModal(null)}></div>
          <div className="bg-surface-container-low border border-white/10 p-6 rounded-2xl w-full max-w-md relative z-10 space-y-6 shadow-2xl animate-fadeInScale">
            <h3 className="text-xl font-bold font-headline capitalize">
              {requestActionModal.action} Request
            </h3>

            <div className="space-y-1.5 text-sm text-[var(--text-secondary)]">
              <p>Quiz: <strong>{requestActionModal.request.quiz_title}</strong></p>
              <p>Target Unit: <strong>Unit {requestActionModal.request.unit}</strong></p>
              <p>Teacher: <strong>{requestActionModal.request.teacher_name}</strong></p>
            </div>

            {requestActionModal.action === 'approve' && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                  Assign to Student Learning Path Unit (Optional)
                </label>
                <select
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value)}
                  className="w-full p-3 bg-surface-container-high border border-white/5 rounded-xl text-sm focus:border-secondary focus:outline-none cursor-pointer text-on-surface"
                >
                  <option value="none">None (Standalone / Practice Only)</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(u => (
                    <option key={u} value={u}>Unit {u}</option>
                  ))}
                </select>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">
                  Assigning a unit (1-15) places the quiz sequentially on the Student Unit dashboard.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                Admin Notes / Feedback (Optional)
              </label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Provide notes or feedback to the teacher here..."
                rows="3"
                className="w-full p-3 bg-surface-container-high border border-white/5 rounded-xl text-sm focus:border-secondary focus:outline-none resize-none transition-all"
              />
            </div>

            <div className="flex gap-2">
              <button
                className="flex-1 py-3 bg-surface-variant/40 hover:bg-surface-variant text-on-surface font-headline font-bold text-xs uppercase rounded-xl transition-all"
                onClick={() => { setRequestActionModal(null); setAdminNotes(''); }}
              >
                Cancel
              </button>
              <button
                className={`flex-1 py-3 font-headline font-bold text-xs uppercase rounded-xl text-white transition-all ${requestActionModal.action === 'approve'
                    ? 'bg-success hover:bg-success/80 shadow-[0_4px_15px_rgba(57,255,20,0.3)]'
                    : 'bg-danger hover:bg-danger/80 shadow-[0_4px_15px_rgba(255,49,49,0.3)]'
                  }`}
                onClick={handleProcessRequest}
              >
                Confirm {requestActionModal.action}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
