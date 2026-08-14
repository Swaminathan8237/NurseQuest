import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { adminAPI, quizAPI } from '../api';
import Navbar from '../components/Navbar';
import Avatar from '../components/Avatar';
import StreakFire from '../components/StreakFire';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, Tooltip, Legend
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

// Register only the chart.js pieces these two charts need, to keep the bundle lean.
ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Legend);

// Lightweight i18n seam: wrap user-facing copy so it can be routed through a real
// translator later without touching call sites. Identity for now (no visible change).
const t = (val) => val;

// Persist the admin's expected-time override locally rather than in the database.
const EXPECTED_MINUTES_KEY = 'skillquest.admin.expectedMinutes';

// Shared chart styling for the dark admin surface.
const CHART_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
    y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } }
  }
};

// Format seconds as "1m 05s" / "45s"
const formatDuration = (sec) => {
  const s = Math.round(Number(sec) || 0);
  if (s <= 0) return '—';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
};

// Render a metric or an em-dash when it has no meaningful value.
const orDash = (value, suffix = '') =>
  value === null || value === undefined || Number.isNaN(value) ? '—' : `${value}${suffix}`;

// Per-question outcome badge for the student-attempt drill-down. Five states:
//   correct / incorrect            — a submitted answer, graded right or wrong
//   selected_correct / _incorrect  — a selection staged when the timer expired but never
//                                     submitted; labelled by what it WOULD have graded (Selected,C/NC)
//   not_answered                   — the timer expired with nothing staged
// Historical rows (status = NULL) are mapped to correct/incorrect upstream via is_correct.
const STATUS_BADGE = {
  correct:            { label: 'Correct',      icon: 'check',     cls: 'bg-success/15 text-success' },
  incorrect:          { label: 'Incorrect',    icon: 'close',     cls: 'bg-danger/15 text-danger' },
  selected_correct:   { label: 'Selected,C',   icon: 'timer_off', cls: 'bg-amber-500/15 text-amber-500' },
  selected_incorrect: { label: 'Selected,NC',  icon: 'timer_off', cls: 'bg-amber-500/15 text-amber-500' },
  not_answered:       { label: 'Not Answered', icon: 'remove',    cls: 'bg-white/10 text-[var(--text-muted)]' },
};

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
  const [unitQuizzes, setUnitQuizzes] = useState([]);

  // Loading & Action states
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Modal states
  const [requestActionModal, setRequestActionModal] = useState(null); // { request, action: 'approve'|'reject' }
  const [adminNotes, setAdminNotes] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('none');

  // Unit Access Control state
  const [unitAccessList, setUnitAccessList] = useState([]);
  const [accessModal, setAccessModal] = useState(null); // { unit, mode, students }
  const [modalMode, setModalMode] = useState('default'); // 'default' | 'all' | 'selective'
  const [modalStudentIds, setModalStudentIds] = useState(new Set());
  const [studentSearch, setStudentSearch] = useState('');
  const [savingAccess, setSavingAccess] = useState(false);

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

  // Performance report (accuracy, knowledge score, badges, charts)
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [expectedMinutes, setExpectedMinutes] = useState(() => {
    // Ignore anything a previous session left behind that isn't a valid minute count,
    // otherwise the report request would 400 on every load.
    const stored = localStorage.getItem(EXPECTED_MINUTES_KEY);
    const n = parseInt(stored, 10);
    return Number.isInteger(n) && n >= 1 && n <= 1440 ? String(n) : '';
  });

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
    setReport(null);
    setUnitsLoading(true);
    setReportLoading(true);

    // allSettled so a failing report can't blank the unit list, and vice versa.
    const [unitsRes, reportRes] = await Promise.allSettled([
      adminAPI.getStudentUnits(student.id),
      adminAPI.getStudentReport(student.id, expectedMinutes || undefined)
    ]);

    if (unitsRes.status === 'fulfilled') {
      const data = unitsRes.value;
      setSelectedStudent(data.student || student);
      setStudentUnits(data.units || []);
      setOverallAvg(data.overallAvg || 0);
      setTotalAttempts(data.totalAttempts || 0);
    } else {
      console.error('Failed to load student units:', unitsRes.reason);
    }
    setUnitsLoading(false);

    if (reportRes.status === 'fulfilled') {
      setReport(reportRes.value);
    } else {
      console.error('Failed to load student report:', reportRes.reason);
    }
    setReportLoading(false);
  };

  // Recompute the report with a different expected-time budget
  const applyExpectedMinutes = async () => {
    if (!selectedStudent) return;
    if (expectedMinutes) localStorage.setItem(EXPECTED_MINUTES_KEY, expectedMinutes);
    else localStorage.removeItem(EXPECTED_MINUTES_KEY);
    setReportLoading(true);
    try {
      const data = await adminAPI.getStudentReport(selectedStudent.id, expectedMinutes || undefined);
      setReport(data);
    } catch (err) {
      console.error('Failed to recalculate report:', err);
      alert(err.message || t('Failed to recalculate report'));
    } finally {
      setReportLoading(false);
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
    setReport(null);
  };

  // Fetch dashboard data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [s, u, r, uq, ua] = await Promise.allSettled([
        adminAPI.getStats(),
        adminAPI.getUsers(),
        adminAPI.getAllQuizRequests(),
        adminAPI.getUnitQuizzes(),
        adminAPI.getUnitAccess()
      ]);
      if (s.status === 'fulfilled') setStats(s.value);
      else console.error('Failed to load stats:', s.reason);
      if (u.status === 'fulfilled') setUsers(u.value);
      else console.error('Failed to load users:', u.reason);
      if (r.status === 'fulfilled') setRequests(r.value);
      else console.error('Failed to load requests:', r.reason);
      if (uq.status === 'fulfilled') setUnitQuizzes(uq.value);
      else console.error('Failed to load unit quizzes:', uq.reason);
      if (ua.status === 'fulfilled') setUnitAccessList(ua.value || []);
      else console.error('Failed to load unit access:', ua.reason);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Actions: Unit Access & Locking
  const handleOpenAccessModal = (unit) => {
    const existing = (unitAccessList || []).find(a => a.unit === unit) || { unit, mode: 'default', students: [] };
    setAccessModal(existing);
    setModalMode(existing.mode || 'default');
    setModalStudentIds(new Set((existing.students || []).map(s => s.id)));
    setStudentSearch('');
  };

  const handleToggleStudentSelection = (studentId) => {
    setModalStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const handleSelectAllStudents = (filteredStudents) => {
    setModalStudentIds(prev => {
      const allSelected = filteredStudents.every(s => prev.has(s.id));
      const next = new Set(prev);
      if (allSelected) {
        filteredStudents.forEach(s => next.delete(s.id));
      } else {
        filteredStudents.forEach(s => next.add(s.id));
      }
      return next;
    });
  };

  const handleSaveAccess = async () => {
    if (!accessModal) return;
    try {
      setSavingAccess(true);
      const studentIds = Array.from(modalStudentIds);
      if (modalMode === 'selective' && studentIds.length === 0) {
        alert(t('Please select at least one student for selective unlock.'));
        setSavingAccess(false);
        return;
      }
      await adminAPI.updateUnitAccess(accessModal.unit, {
        mode: modalMode,
        studentIds: modalMode === 'selective' ? studentIds : []
      });
      const updated = await adminAPI.getUnitAccess();
      setUnitAccessList(updated || []);
      setAccessModal(null);
    } catch (err) {
      alert(err.message || t('Failed to update unit access'));
    } finally {
      setSavingAccess(false);
    }
  };

  // Actions: User Management
  const handleUpdateRole = async (userId, newRole) => {
    if (!window.confirm(t(`Are you sure you want to change this user's role to ${newRole}?`))) return;
    try {
      await adminAPI.updateUserRole(userId, newRole);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      // Refresh stats
      const s = await adminAPI.getStats();
      setStats(s);
    } catch (err) {
      alert(err.message || t('Failed to update user role'));
    }
  };

  const handleDeleteUser = async (userId, userName) => {
    if (!window.confirm(t(`⚠️ WARNING: Deleting ${userName} will permanently delete their account and ALL associated quizzes, quiz attempts, and scores. This cannot be undone. Proceed?`))) return;
    try {
      await adminAPI.deleteUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
      // Refresh stats
      const s = await adminAPI.getStats();
      setStats(s);
    } catch (err) {
      alert(err.message || t('Failed to delete user'));
    }
  };

  // Actions: Unit Quiz Management (mirrors teacher quiz actions; admin bypasses ownership)
  const handleToggleQuizPublish = async (quiz) => {
    try {
      await quizAPI.update(quiz.id, { ...quiz, isPublished: !quiz.is_published });
      setUnitQuizzes(prev => prev.map(q =>
        q.id === quiz.id ? { ...q, is_published: quiz.is_published ? 0 : 1 } : q
      ));
    } catch (err) {
      alert(err.message || t('Failed to update publish status'));
    }
  };

  const handleDeleteQuiz = async (quiz) => {
    if (!window.confirm(t(`⚠️ Delete "${quiz.title}"? This permanently removes the quiz, its questions, and all attempts. This cannot be undone. Proceed?`))) return;
    try {
      await quizAPI.delete(quiz.id);
      setUnitQuizzes(prev => prev.filter(q => q.id !== quiz.id));
      // Refresh stats
      const s = await adminAPI.getStats();
      setStats(s);
    } catch (err) {
      alert(err.message || t('Failed to delete quiz'));
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
      alert(err.message || t('Failed to process request'));
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
                {t('Admin')} <span className="text-transparent bg-clip-text bg-gradient-to-r from-secondary to-primary">{t('Control Center')}</span>
              </h1>
              <p className="text-on-surface-variant font-medium mt-1">{t('Platform management, unit assignments, and developer diagnostics')}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 relative z-10">
            {pendingCount > 0 && (
              <button
                className="px-6 py-3.5 bg-secondary text-white rounded-xl font-headline font-bold uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2 active:scale-95 shadow-[0_4px_20px_rgba(183,109,255,0.3)]"
                onClick={() => setActiveTab('requests')}
              >
                <span className="material-symbols-outlined text-lg">{t('task')}</span>
                {pendingCount} {t('Pending')}
              </button>
            )}
            <button
              className="px-6 py-3.5 bg-surface-variant/40 border border-outline-variant/30 text-on-surface-variant rounded-xl font-headline font-bold uppercase tracking-widest hover:bg-surface-variant transition-all flex items-center gap-2 active:scale-95"
              onClick={fetchData}
            >
              <span className="material-symbols-outlined text-lg">{t('refresh')}</span>
              {t('Sync')}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/5 gap-2 overflow-x-auto pb-1">
          {[
            { id: 'overview', label: t('Overview & Stats'), icon: 'grid_view' },
            { id: 'users', label: t('Students & Teachers'), icon: 'group' },
            { id: 'analytics', label: t('Student Analytics'), icon: 'monitoring' },
            { id: 'requests', label: `${t('Quiz Requests')} (${pendingCount})`, icon: 'task' },
            { id: 'units', label: t('Units'), icon: 'menu_book' }
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
                    <p className="text-sm font-semibold text-[var(--text-muted)]">{t('Total Accounts')}</p>
                    <p className="text-3xl font-bold font-headline mt-2">
                      {stats.users.student + stats.users.teacher + stats.users.admin}
                    </p>
                  </div>
                  <div className="p-3 bg-primary/10 rounded-lg text-primary">
                    <span className="material-symbols-outlined">{t('group')}</span>
                  </div>
                </div>
                <div className="mt-4 flex gap-4 text-xs font-semibold text-[var(--text-secondary)]">
                  <span>🎓 {stats.users.student} {t('Students')}</span>
                  <span>👩‍🏫 {stats.users.teacher} {t('Teachers')}</span>
                </div>
              </div>

              <div className="bg-surface-container-high/40 rounded-xl p-5 border border-white/5 relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-muted)]">{t('Pending Requests')}</p>
                    <p className="text-3xl font-bold font-headline mt-2 text-warning">{stats.requests.pending}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--warning-light)] text-warning">
                    <span className="material-symbols-outlined">{t('pending_actions')}</span>
                  </div>
                </div>
                <div className="mt-4 flex gap-4 text-xs font-semibold text-[var(--text-secondary)]">
                  <span>✅ {stats.requests.approved} {t('Approved')}</span>
                  <span>⛔ {stats.requests.rejected} {t('Rejected')}</span>
                </div>
              </div>

              <div className="bg-surface-container-high/40 rounded-xl p-5 border border-white/5 relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-muted)]">{t('Total Quizzes')}</p>
                    <p className="text-3xl font-bold font-headline mt-2">{stats.quizzes.total}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--warning-light)] text-[var(--secondary)]">
                    <span className="material-symbols-outlined">{t('quiz')}</span>
                  </div>
                </div>
                <div className="mt-4 flex gap-4 text-xs font-semibold text-[var(--text-secondary)]">
                  <span>📖 {stats.quizzes.unitLinked} {t('Linked to Units')}</span>
                  <span>🌐 {stats.quizzes.standalone} {t('Standalone')}</span>
                </div>
              </div>

              <div className="bg-surface-container-high/40 rounded-xl p-5 border border-white/5 relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-muted)]">{t('Average Score')}</p>
                    <p className="text-3xl font-bold font-headline mt-2 text-success">
                      {Math.round(stats.attempts.avgScore)}%
                    </p>
                  </div>
                  <div className="p-3 bg-[var(--success-light)] rounded-lg text-success">
                    <span className="material-symbols-outlined">{t('analytics')}</span>
                  </div>
                </div>
                <div className="mt-4 text-xs font-semibold text-[var(--text-secondary)]">
                  📝 {stats.attempts.count} {t('attempts')} | ⏱️ {stats.attempts.totalTimeMinutes} {t('mins logged')}
                </div>
              </div>
            </div>

            {/* Quiz Requests Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="bg-surface-container-high/30 border border-white/5 rounded-xl p-6 lg:col-span-2 space-y-6">
                <h3 className="text-xl font-bold font-headline">{t('Pending Posting Requests')}</h3>

                {requests.filter(r => r.status === 'pending').length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
                    <span className="material-symbols-outlined text-4xl mb-2 text-secondary/40">{t('done_all')}</span>
                    <p className="font-semibold text-sm">{t('All teacher posting requests have been processed!')}</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                    {requests.filter(r => r.status === 'pending').map(req => (
                      <div key={req.id} className="bg-surface-container-high/60 border border-white/5 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-secondary/20 transition-all">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full bg-secondary/15 text-secondary text-xs font-bold font-mono">
                              {t('QUIZ SUBMISSION')}
                            </span>
                            <span className="text-xs text-[var(--text-muted)] font-medium">
                              {new Date(req.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <h4 className="text-base font-bold font-headline mt-1.5">{req.quiz_title}</h4>
                          <p className="text-xs text-[var(--text-secondary)] mt-1">
                            {t('Request by')}: <span className="font-bold text-on-surface">{req.teacher_name}</span> | {t('Target Unit')}: <span className="font-bold text-on-surface">{t('Unit')} {req.unit}</span>
                          </p>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                          <button
                            className="flex-1 sm:flex-none px-4 py-2 bg-[var(--success-light)] hover:bg-success/20 border border-success/30 text-success text-xs font-bold rounded-lg transition-all"
                            onClick={() => { setSelectedUnit('none'); setRequestActionModal({ request: req, action: 'approve' }); }}
                          >
                            {t('Approve')}
                          </button>
                          <button
                            className="flex-1 sm:flex-none px-4 py-2 bg-[var(--danger-light)] hover:bg-danger/20 border border-danger/30 text-danger text-xs font-bold rounded-lg transition-all"
                            onClick={() => { setSelectedUnit('none'); setRequestActionModal({ request: req, action: 'reject' }); }}
                          >
                            {t('Reject')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Platforms Health */}
              <div className="bg-surface-container-high/30 border border-white/5 rounded-xl p-6 space-y-6">
                <h3 className="text-xl font-bold font-headline">{t('Quiz Posting Workflow')}</h3>
                <div className="space-y-4 text-sm text-[var(--text-secondary)] leading-relaxed">
                  <p>
                    {t('Teachers are authorized to create and publish standalone quizzes independently.')}
                  </p>
                  <p>
                    {t('However, to safeguard curriculum standards, linking a quiz to a formal')} <strong>{t('Unit')}</strong> {t('requires administrator review.')}
                  </p>
                  <div className="bg-surface-container-highest/40 p-4 border border-white/5 rounded-xl space-y-3 font-semibold text-xs text-on-surface">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-warning"></span>
                      <span>{t('Pending')}: {stats.requests.pending} {t('requests')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-success"></span>
                      <span>{t('Approved')}: {stats.requests.approved} {t('linked')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-danger"></span>
                      <span>{t('Rejected')}: {stats.requests.rejected} {t('denied')}</span>
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
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[var(--text-muted)]">{t('search')}</span>
                <input
                  type="text"
                  placeholder={t('Search by name or email...')}
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
                    {t(r)}
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
                      <th className="p-4 md:p-5">{t('Name / Email')}</th>
                      <th className="p-4 md:p-5">{t('Role')}</th>
                      <th className="p-4 md:p-5 text-center">{t('XP Progress')}</th>
                      <th className="p-4 md:p-5 text-center">{t('Attempts')}</th>
                      <th className="p-4 md:p-5 text-center">{t('Quizzes Created')}</th>
                      <th className="p-4 md:p-5 text-right">{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-sm font-medium">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="p-10 text-center text-[var(--text-muted)] font-semibold">
                          {t('No users found matching filters.')}
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
                              <option value="student">{t('Student')}</option>
                              <option value="teacher">{t('Teacher')}</option>
                              <option value="admin">{t('Administrator')}</option>
                            </select>
                          </td>
                          <td className="p-4 md:p-5 text-center font-mono text-xs text-[var(--text-secondary)]">
                            {u.role === 'student' ? `${u.xp} XP (${t('Lvl')} ${u.level})` : t('N/A')}
                          </td>
                          <td className="p-4 md:p-5 text-center font-bold font-mono">
                            {u.role === 'student' ? u.quizzes_taken : t('N/A')}
                          </td>
                          <td className="p-4 md:p-5 text-center font-bold font-mono">
                            {u.role === 'teacher' ? u.quizzes_created : t('N/A')}
                          </td>
                          <td className="p-4 md:p-5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {u.role === 'student' && (
                                <button
                                  className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary hover:scale-105 active:scale-95 transition-all"
                                  onClick={() => openStudentAnalytics(u)}
                                  title={t('View Analytics')}
                                >
                                  <span className="material-symbols-outlined text-lg">{t('monitoring')}</span>
                                </button>
                              )}
                              <button
                                className="p-2 rounded-lg bg-[var(--danger-light)] hover:bg-danger/20 border border-danger/30 text-danger hover:scale-105 active:scale-95 transition-all"
                                onClick={() => handleDeleteUser(u.id, u.name)}
                                title={t('Delete User')}
                                disabled={u.id === user?.id}
                              >
                                <span className="material-symbols-outlined text-lg">{t('delete')}</span>
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
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[var(--text-muted)]">{t('search')}</span>
                  <input
                    type="text"
                    placeholder={t('Search students by name or email...')}
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
                            <span>{t('Lvl')} {s.level || 1}</span>
                            <span>{(s.xp || 0).toLocaleString()} XP</span>
                          </div>
                        </div>
                        <span className="material-symbols-outlined text-[var(--text-muted)] group-hover:text-primary transition-colors">{t('chevron_right')}</span>
                      </button>
                    ))}
                  {users.filter(u => u.role === 'student').length === 0 && (
                    <div className="col-span-full text-center py-12 text-[var(--text-muted)]">
                      <span className="material-symbols-outlined text-4xl mb-2 block">{t('school')}</span>
                      {t('No students found.')}
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
                  <span className="material-symbols-outlined text-lg">{t('arrow_back')}</span>
                  {t('All students')}
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
                      <span className="px-3 py-1 rounded-lg bg-white/5 text-xs font-mono font-bold">{t('Level')} {selectedStudent.level || 1}</span>
                      <span className="px-3 py-1 rounded-lg bg-white/5 text-xs font-mono font-bold">{(selectedStudent.xp || 0).toLocaleString()} XP</span>
                      {selectedStudent.streak > 0 && (
                        <span className="inline-flex items-center gap-1"><StreakFire streak={selectedStudent.streak} /></span>
                      )}
                      <span className="px-3 py-1 rounded-lg bg-white/5 text-xs font-mono font-bold">{totalAttempts} {t('attempts')}</span>
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
                      <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{t('Avg Score')}</span>
                    </div>
                  </div>
                </div>

                {/* ── Performance report ─────────────────────────────────────────── */}
                {reportLoading ? (
                  <div className="flex justify-center py-16">
                    <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                  </div>
                ) : report?.overall?.knowledgeLevel ? (
                  <div className="space-y-6">
                    {/* Knowledge Score card */}
                    <div className="bg-surface-container-high/40 rounded-2xl p-6 border border-white/5 flex flex-col md:flex-row items-center gap-8">
                      <div className="relative w-32 h-32 flex-shrink-0">
                        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                          <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
                          <circle
                            cx="60" cy="60" r="52" fill="none"
                            stroke={report.overall.knowledgeLevel.color} strokeWidth="12" strokeLinecap="round"
                            strokeDasharray={2 * Math.PI * 52}
                            strokeDashoffset={2 * Math.PI * 52 * (1 - report.overall.knowledgeScore / 100)}
                            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-3xl font-bold" style={{ color: report.overall.knowledgeLevel.color }}>
                            {report.overall.knowledgeScore}
                          </span>
                          <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">/ 100</span>
                        </div>
                      </div>

                      <div className="flex-1 text-center md:text-left w-full">
                        <p className="text-sm font-bold uppercase tracking-widest" style={{ color: report.overall.knowledgeLevel.color }}>
                          {report.overall.knowledgeLevel.label}
                        </p>
                        <p className="text-lg font-headline font-bold text-on-surface mt-1">{t('Knowledge Score')}</p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                          {t('0.5·Accuracy + 0.2·First-try + 0.15·Speed + 0.15·Retention')}
                          {!report.overall.retentionApplied && ` ${t('— retention excluded (fewer than 2 attempts)')}`}
                        </p>

                        {/* Stacked contribution bar */}
                        <div className="flex w-full h-3 rounded-full overflow-hidden mt-4 bg-white/5">
                          <div className="h-full" style={{ width: `${report.overall.accuracy * 0.5}%`, background: '#10B981' }} />
                          <div className="h-full" style={{ width: `${report.overall.firstAttemptAccuracy * 0.2}%`, background: '#22C55E' }} />
                          <div className="h-full" style={{ width: `${report.overall.speedScore * 0.15}%`, background: '#F59E0B' }} />
                          <div className="h-full" style={{ width: `${(report.overall.retention ?? 0) * 0.15}%`, background: '#7C3AED' }} />
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] font-mono text-[var(--text-muted)]">
                          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#10B981] inline-block"></span>{t('Acc')} {report.overall.accuracy}%</span>
                          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#22C55E] inline-block"></span>{t('1st')} {report.overall.firstAttemptAccuracy}%</span>
                          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#F59E0B] inline-block"></span>{t('Speed')} {report.overall.speedScore}</span>
                          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#7C3AED] inline-block"></span>{t('Ret')} {report.overall.retention ?? t('N/A')}</span>
                        </div>
                      </div>

                      <div className="flex-shrink-0 text-center px-4 py-3 rounded-xl bg-white/5 border border-white/5">
                        <p className="text-2xl font-bold text-on-surface">{report.overall.leaderboardScore}</p>
                        <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{t('Leaderboard Score')}</p>
                        <p className="text-[9px] text-[var(--text-muted)] mt-1">{t('0.5 Acc + 0.3 Spd + 0.2 Comp')}</p>
                      </div>
                    </div>

                    {/* Stat tiles */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      {[
                        { label: t('Accuracy'), value: `${report.overall.accuracy}%`, icon: 'check_circle', color: '#10B981' },
                        { label: t('1st-Try Accuracy'), value: `${report.overall.firstAttemptAccuracy}%`, icon: 'flag', color: '#22C55E' },
                        { label: t('Avg Response'), value: `${report.overall.avgResponseTime}s`, icon: 'timer', color: '#F59E0B' },
                        { label: t('Efficiency'), value: orDash(report.overall.efficiency), icon: 'speed', color: '#38BDF8' },
                        { label: t('Completion'), value: `${report.overall.completion}%`, icon: 'fact_check', color: '#7C3AED' },
                        { label: t('Points'), value: (report.overall.totalPoints || 0).toLocaleString(), icon: 'trophy', color: '#F472B6' }
                      ].map(tile => (
                        <div key={tile.label} className="bg-surface-container-high/40 rounded-2xl p-4 border border-white/5 flex flex-col items-center text-center">
                          <span className="material-symbols-outlined mb-1" style={{ color: tile.color }}>{tile.icon}</span>
                          <p className="text-xl font-bold text-on-surface">{tile.value}</p>
                          <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{tile.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Badges */}
                    <div className="bg-surface-container-high/40 rounded-2xl p-5 border border-white/5">
                      <p className="text-sm font-bold uppercase tracking-widest text-[var(--text-muted)] mb-4">{t('Badges')}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {(report.badges || []).map(b => (
                          <div
                            key={b.id}
                            title={b.detail}
                            className={`rounded-2xl p-4 border flex flex-col items-center text-center transition-all ${
                              b.earned
                                ? 'bg-primary/10 border-primary/30'
                                : 'bg-white/[0.02] border-white/5 opacity-50 grayscale'
                            }`}
                          >
                            <span className={`material-symbols-outlined text-3xl mb-2 ${b.earned ? 'text-primary' : 'text-[var(--text-muted)]'}`}>
                              {b.icon}
                            </span>
                            <p className="text-xs font-bold text-on-surface">{b.name}</p>
                            <p className="text-[9px] text-[var(--text-muted)] mt-1">{b.earned ? t('Earned') : t('Locked')}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Charts */}
                    {(report.units?.length || 0) > 0 && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="bg-surface-container-high/40 rounded-2xl p-5 border border-white/5">
                          <p className="text-sm font-bold uppercase tracking-widest text-[var(--text-muted)] mb-4">{t('Accuracy by Unit')}</p>
                          <div className="h-56">
                            <Bar
                              data={{
                                labels: report.units.map(u => `U${u.unit}`),
                                datasets: [{
                                  label: t('Accuracy %'),
                                  data: report.units.map(u => u.accuracy),
                                  backgroundColor: report.units.map(u => u.knowledgeLevel?.color || '#7C3AED'),
                                  borderRadius: 6
                                }]
                              }}
                              options={CHART_OPTS}
                            />
                          </div>
                        </div>
                        <div className="bg-surface-container-high/40 rounded-2xl p-5 border border-white/5">
                          <p className="text-sm font-bold uppercase tracking-widest text-[var(--text-muted)] mb-4">{t('Avg Response Time by Unit (s)')}</p>
                          <div className="h-56">
                            <Line
                              data={{
                                labels: report.units.map(u => `U${u.unit}`),
                                datasets: [{
                                  label: t('Avg Response (s)'),
                                  data: report.units.map(u => u.avgResponseTime),
                                  borderColor: '#38BDF8',
                                  backgroundColor: 'rgba(56,189,248,0.15)',
                                  tension: 0.35,
                                  pointBackgroundColor: '#38BDF8'
                                }]
                              }}
                              options={CHART_OPTS}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Expected-time override + disclaimer */}
                    <div className="bg-surface-container-high/40 rounded-2xl p-5 border border-white/5 flex flex-col sm:flex-row items-center gap-4">
                      <div className="flex-1 flex flex-col sm:flex-row items-center gap-3">
                        <label htmlFor="expected-minutes" className="text-sm font-bold text-[var(--text-muted)] whitespace-nowrap">
                          {t('Expected time per unit')}
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            id="expected-minutes"
                            type="number" min="1" max="1440"
                            placeholder={t('auto')}
                            value={expectedMinutes}
                            onChange={e => setExpectedMinutes(e.target.value)}
                            className="w-24 px-3 py-2 bg-surface-container-high border border-white/10 rounded-lg text-sm font-mono text-on-surface focus:border-primary focus:outline-none"
                          />
                          <span className="text-xs text-[var(--text-muted)]">{t('min')}</span>
                          <button
                            onClick={applyExpectedMinutes}
                            className="ml-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/80 transition-colors"
                          >
                            {t('Recalculate')}
                          </button>
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)]">{t('blank = use quiz time_per_question')}</p>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] text-center sm:text-right flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">{t('info')}</span>
                        {t('Live-game sessions are not included.')}
                      </p>
                    </div>
                  </div>
                ) : null}

                {/* Units */}
                {unitsLoading ? (
                  <div className="flex justify-center py-16">
                    <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                  </div>
                ) : studentUnits.length === 0 ? (
                  <div className="text-center py-16 text-[var(--text-muted)]">
                    <span className="material-symbols-outlined text-4xl mb-2 block">{t('quiz')}</span>
                    {t("This student hasn't attempted any units yet.")}
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
                                <p className="font-bold text-on-surface">{t('Unit')} {u.unit}</p>
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
                              {(() => {
                                const m = report?.units?.find(r => r.unit === u.unit);
                                if (!m) return null;
                                return (
                                  <>
                                    <div>
                                      <p className="text-lg font-bold" style={{ color: m.knowledgeLevel?.color }}>{m.accuracy}%</p>
                                      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{t('Accuracy')}</p>
                                    </div>
                                    <div>
                                      <p className="text-lg font-bold text-on-surface">{m.firstAttemptAccuracy}%</p>
                                      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{t('1st Try')}</p>
                                    </div>
                                    <div>
                                      <p className="text-lg font-bold text-on-surface">{m.avgResponseTime}s</p>
                                      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{t('Avg Time')}</p>
                                    </div>
                                  </>
                                );
                              })()}
                              <div>
                                <p className="text-lg font-bold" style={{ color }}>{u.avg_score}%</p>
                                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{t('Avg Score')}</p>
                              </div>
                              <div>
                                <p className="text-lg font-bold text-on-surface">{u.best_score}%</p>
                                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{t('Best')}</p>
                              </div>
                              <div>
                                <p className="text-lg font-bold text-on-surface">{u.attempts}</p>
                                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{t('Tries')}</p>
                              </div>
                            </div>
                            <span className={`material-symbols-outlined text-[var(--text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}>{t('expand_more')}</span>
                          </button>

                          {/* Attempts + question breakdown */}
                          {isOpen && (
                            <div className="border-t border-white/5 p-5 space-y-4 bg-black/10">
                              {/* Per-unit metric strip */}
                              {(() => {
                                const m = report?.units?.find(r => r.unit === u.unit);
                                if (!m) return null;
                                const cells = [
                                  { label: t('Questions'), value: m.totalQuestions },
                                  { label: t('Correct'), value: m.correct },
                                  { label: t('Incorrect'), value: m.incorrect },
                                  { label: t('Accuracy'), value: `${m.accuracy}%` },
                                  { label: t('1st-Try'), value: `${m.firstAttemptAccuracy}%` },
                                  { label: t('Fastest'), value: m.fastestResponse ? `${m.fastestResponse}s` : '—' },
                                  { label: t('Slowest'), value: m.slowestResponse ? `${m.slowestResponse}s` : '—' },
                                  { label: t('Unit Time'), value: formatDuration(m.completionTime) },
                                  { label: t('Time Util'), value: m.timeUtilization ? `${m.timeUtilization}x` : '—' },
                                  { label: t('Efficiency'), value: orDash(m.efficiency) },
                                  { label: t('Retention'), value: m.retention === null ? t('N/A') : `${m.retention}%` },
                                  { label: t('Knowledge'), value: m.knowledgeScore, color: m.knowledgeLevel?.color }
                                ];
                                return (
                                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 pb-2">
                                    {cells.map(c => (
                                      <div key={c.label} className="bg-white/[0.03] rounded-xl px-3 py-2 text-center border border-white/5">
                                        <p className="text-sm font-bold font-mono" style={c.color ? { color: c.color } : undefined}>{c.value}</p>
                                        <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{c.label}</p>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                              {attemptsLoading ? (
                                <div className="flex justify-center py-8">
                                  <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                                </div>
                              ) : unitAttempts.length === 0 ? (
                                <p className="text-center text-[var(--text-muted)] py-4 text-sm">{t('No attempts recorded.')}</p>
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
                                                <th className="p-3">{t('Question')}</th>
                                                <th className="p-3 text-center">{t('Result')}</th>
                                                <th className="p-3 text-center">{t('Marks')}</th>
                                                <th className="p-3 text-center">{t('Accuracy')}</th>
                                                <th className="p-3 text-center">{t('Time')}</th>
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
                                                    {(() => {
                                                      const badge = STATUS_BADGE[q.status]
                                                        || (q.is_correct ? STATUS_BADGE.correct : STATUS_BADGE.incorrect);
                                                      return (
                                                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold ${badge.cls}`}>
                                                          <span className="material-symbols-outlined text-sm">{t(badge.icon)}</span>{t(badge.label)}
                                                        </span>
                                                      );
                                                    })()}
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
                                                <tr><td colSpan={6} className="p-6 text-center text-[var(--text-muted)]">{t('No question data.')}</td></tr>
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
            <h3 className="text-xl font-bold font-headline">{t('Quiz Posting Request Logs')}</h3>

            <div className="bg-surface-container-high/30 border border-white/5 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-white/5 bg-surface-container-high/40 font-headline font-bold text-xs uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="p-4 md:p-5">{t('Quiz Title')}</th>
                      <th className="p-4 md:p-5">{t('Requested Unit')}</th>
                      <th className="p-4 md:p-5">{t('Teacher')}</th>
                      <th className="p-4 md:p-5">{t('Date Submitted')}</th>
                      <th className="p-4 md:p-5 text-center">{t('Status')}</th>
                      <th className="p-4 md:p-5 text-right">{t('Action')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-sm font-medium">
                    {requests.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="p-10 text-center text-[var(--text-muted)] font-semibold">
                          {t('No requests submitted yet.')}
                        </td>
                      </tr>
                    ) : (
                      requests.map(req => (
                        <tr key={req.id} className="hover:bg-white/[0.01] transition-all">
                          <td className="p-4 md:p-5 font-bold text-on-surface">{req.quiz_title}</td>
                          <td className="p-4 md:p-5 text-[var(--text-secondary)]">{t('Unit')} {req.unit}</td>
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
                                  {t('Approve')}
                                </button>
                                <button
                                  className="px-3 py-1.5 bg-[var(--danger-light)] hover:bg-danger/20 border border-danger/30 text-danger text-xs font-bold rounded-lg transition-all"
                                  onClick={() => {
                                    setSelectedUnit('none');
                                    setRequestActionModal({ request: req, action: 'reject' });
                                  }}
                                >
                                  {t('Reject')}
                                </button>
                              </div>
                            ) : (
                              <p className="text-xs text-[var(--text-muted)] italic max-w-[150px] truncate" title={req.admin_notes || ''}>
                                {req.admin_notes ? `"${req.admin_notes}"` : t('No notes')}
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

        {/* Units Tab — manage unit-linked quizzes (edit / publish / live / delete) */}
        {activeTab === 'units' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-xl font-bold font-headline">{t('Unit Quiz Management')}</h3>
              <span className="text-sm text-[var(--text-muted)] font-semibold">
                {unitQuizzes.length} {t('unit')} {unitQuizzes.length === 1 ? t('quiz') : t('quizzes')}
              </span>
            </div>

            {unitQuizzes.length === 0 ? (
              <div className="bg-surface-container-high/30 border border-white/5 rounded-2xl p-10 text-center text-[var(--text-muted)] font-semibold">
                {t('No unit-linked quizzes yet. Quizzes appear here once assigned to a unit (1–15).')}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {unitQuizzes.map(quiz => {
                  const color = UNIT_COLORS[quiz.unit] || '#94a3b8';
                  const icon = UNIT_ICONS[quiz.unit] || 'menu_book';
                  const published = !!quiz.is_published;
                  const accessRule = (unitAccessList || []).find(a => a.unit === quiz.unit) || { mode: 'default', students: [] };
                  return (
                    <div
                      key={quiz.id}
                      className="bg-surface-container-high/40 rounded-xl p-5 border border-white/5 flex flex-col gap-4 hover:border-white/10 transition-all shadow-md relative overflow-hidden"
                    >
                      {/* Header: unit badge + status pill & access badge */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${color}22`, color }}
                          >
                            <span className="material-symbols-outlined">{icon}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-on-surface truncate" title={quiz.title}>{quiz.title}</p>
                            <p className="text-xs text-[var(--text-muted)] truncate">
                              {t('Unit')} {quiz.unit} · {quiz.author_name}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${published
                              ? 'bg-[var(--success-light)] text-success'
                              : 'bg-[var(--warning-light)] text-warning'
                            }`}>
                            {published ? t('Published') : t('Draft')}
                          </span>
                          {accessRule.mode === 'all' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">lock_open</span> {t('Unlocked (All)')}
                            </span>
                          ) : accessRule.mode === 'selective' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">group</span> {accessRule.students?.length || 0} {t('Students')}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-500/20 text-slate-400 border border-slate-500/30 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">lock</span> {t('Default Gated')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Meta counts */}
                      <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)] font-semibold">
                        <span className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm">{t('quiz')}</span>
                          {quiz.question_count} {t('Qs')}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm">{t('groups')}</span>
                          {quiz.attempt_count} {t('attempts')}
                        </span>
                      </div>

                      {/* Action: Manage Access & Lock Button */}
                      <button
                        className="w-full py-2.5 px-3 bg-gradient-to-r from-primary/20 to-secondary/20 hover:from-primary/30 hover:to-secondary/30 border border-primary/40 text-on-surface text-xs font-bold font-headline rounded-xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                        onClick={() => handleOpenAccessModal(quiz.unit)}
                      >
                        <span className="material-symbols-outlined text-sm text-secondary">
                          {accessRule.mode === 'all' ? 'lock_open' : accessRule.mode === 'selective' ? 'how_to_reg' : 'vpn_key'}
                        </span>
                        {t('Manage Unit Unlock / Lock')}
                      </button>

                      {/* Actions Grid */}
                      <div className="grid grid-cols-2 gap-2 mt-auto pt-1">
                        <button
                          className="px-3 py-2 bg-secondary/10 hover:bg-secondary/20 border border-secondary/30 text-secondary text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5"
                          onClick={() => navigate(`/quiz-builder/${quiz.id}`)}
                        >
                          <span className="material-symbols-outlined text-sm">{t('edit')}</span>
                          {t('Edit')}
                        </button>
                        <button
                          className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-on-surface text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5"
                          onClick={() => handleToggleQuizPublish(quiz)}
                        >
                          <span className="material-symbols-outlined text-sm">{published ? 'visibility_off' : 'publish'}</span>
                          {published ? t('Unpublish') : t('Publish')}
                        </button>
                        <button
                          className="px-3 py-2 bg-[var(--success-light)] hover:bg-success/20 border border-success/30 text-success text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5"
                          onClick={() => navigate('/live', { state: { quizId: quiz.id } })}
                        >
                          <span className="material-symbols-outlined text-sm">{t('sports_esports')}</span>
                          {t('Live')}
                        </button>
                        <button
                          className="px-3 py-2 bg-[var(--danger-light)] hover:bg-danger/20 border border-danger/30 text-danger text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5"
                          onClick={() => handleDeleteQuiz(quiz)}
                        >
                          <span className="material-symbols-outlined text-sm">{t('delete')}</span>
                          {t('Delete')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </main>

      {/* Unit Access & Lock Management Modal */}
      {accessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setAccessModal(null)}></div>
          <div className="bg-surface-container-low border border-white/10 p-6 md:p-7 rounded-2xl w-full max-w-lg relative z-10 space-y-6 shadow-2xl animate-fadeInScale max-h-[90vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: `${UNIT_COLORS[accessModal.unit] || '#7C3AED'}22`,
                    color: UNIT_COLORS[accessModal.unit] || '#7C3AED'
                  }}
                >
                  <span className="material-symbols-outlined text-2xl">
                    {UNIT_ICONS[accessModal.unit] || 'menu_book'}
                  </span>
                </div>
                <div>
                  <h3 className="text-xl font-bold font-headline">
                    {t('Unit')} {accessModal.unit} {t('Access & Unlock Control')}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] font-medium">
                    {t('Control whether this level is gated by previous scores or open to students.')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAccessModal(null)}
                className="p-1 rounded-lg text-[var(--text-muted)] hover:text-on-surface hover:bg-white/5 transition-all"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Mode Selection Radios */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                {t('Choose Unlock Rule')}
              </label>

              {/* Mode 1: Default Progression */}
              <label
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  modalMode === 'default'
                    ? 'bg-secondary/10 border-secondary ring-1 ring-secondary/50'
                    : 'bg-surface-container-high/40 border-white/5 hover:border-white/10'
                }`}
              >
                <input
                  type="radio"
                  name="accessMode"
                  value="default"
                  checked={modalMode === 'default'}
                  onChange={() => setModalMode('default')}
                  className="mt-1 accent-secondary"
                />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-slate-400">lock</span>
                    <p className="text-sm font-bold text-on-surface">{t('Standard Progression (Default)')}</p>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    {t('Locked until the student scores ≥60% on the preceding level.')}
                  </p>
                </div>
              </label>

              {/* Mode 2: Unlock for All */}
              <label
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  modalMode === 'all'
                    ? 'bg-emerald-500/10 border-emerald-500 ring-1 ring-emerald-500/50'
                    : 'bg-surface-container-high/40 border-white/5 hover:border-white/10'
                }`}
              >
                <input
                  type="radio"
                  name="accessMode"
                  value="all"
                  checked={modalMode === 'all'}
                  onChange={() => setModalMode('all')}
                  className="mt-1 accent-emerald-500"
                />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-emerald-400">lock_open</span>
                    <p className="text-sm font-bold text-on-surface">{t('Unlock for All Students')}</p>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    {t('Every student can play this unit directly, bypassing all previous level requirements.')}
                  </p>
                </div>
              </label>

              {/* Mode 3: Selective Students */}
              <label
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  modalMode === 'selective'
                    ? 'bg-sky-500/10 border-sky-500 ring-1 ring-sky-500/50'
                    : 'bg-surface-container-high/40 border-white/5 hover:border-white/10'
                }`}
              >
                <input
                  type="radio"
                  name="accessMode"
                  value="selective"
                  checked={modalMode === 'selective'}
                  onChange={() => setModalMode('selective')}
                  className="mt-1 accent-sky-500"
                />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-sky-400">group</span>
                    <p className="text-sm font-bold text-on-surface">{t('Unlock for Selective Students')}</p>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    {t('Unlock only for specific chosen students; remain locked for everyone else.')}
                  </p>
                </div>
              </label>
            </div>

            {/* Student Picker (Visible only when Mode === 'selective') */}
            {modalMode === 'selective' && (
              <div className="space-y-3 flex-1 min-h-0 flex flex-col pt-2 border-t border-white/5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                    {t('Select Students')} ({modalStudentIds.size} {t('selected')})
                  </span>
                  {users.filter(u => u.role === 'student').length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleSelectAllStudents(
                        users.filter(u => u.role === 'student').filter(s =>
                          (s.name || '').toLowerCase().includes(studentSearch.toLowerCase()) ||
                          (s.email || '').toLowerCase().includes(studentSearch.toLowerCase())
                        )
                      )}
                      className="text-xs font-bold text-secondary hover:underline"
                    >
                      {users.filter(u => u.role === 'student').filter(s =>
                        (s.name || '').toLowerCase().includes(studentSearch.toLowerCase()) ||
                        (s.email || '').toLowerCase().includes(studentSearch.toLowerCase())
                      ).every(s => modalStudentIds.has(s.id))
                        ? t('Deselect All')
                        : t('Select All')}
                    </button>
                  )}
                </div>

                {/* Search box */}
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-2.5 text-sm text-[var(--text-muted)]">search</span>
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder={t('Search student by name or email...')}
                    className="w-full pl-9 pr-3 py-2 bg-surface-container-high border border-white/10 rounded-xl text-xs text-on-surface placeholder:text-[var(--text-muted)] focus:outline-none focus:border-secondary"
                  />
                </div>

                {/* Scrollable list */}
                <div className="overflow-y-auto max-h-48 border border-white/5 rounded-xl divide-y divide-white/5 bg-surface-container-high/20 pr-1">
                  {users.filter(u => u.role === 'student').filter(s =>
                    (s.name || '').toLowerCase().includes(studentSearch.toLowerCase()) ||
                    (s.email || '').toLowerCase().includes(studentSearch.toLowerCase())
                  ).length === 0 ? (
                    <div className="p-4 text-center text-xs text-[var(--text-muted)]">
                      {t('No matching students found.')}
                    </div>
                  ) : (
                    users.filter(u => u.role === 'student').filter(s =>
                      (s.name || '').toLowerCase().includes(studentSearch.toLowerCase()) ||
                      (s.email || '').toLowerCase().includes(studentSearch.toLowerCase())
                    ).map(student => {
                      const isChecked = modalStudentIds.has(student.id);
                      return (
                        <label
                          key={student.id}
                          className={`flex items-center justify-between p-2.5 hover:bg-white/5 cursor-pointer transition-all ${
                            isChecked ? 'bg-secondary/10' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar config={student.avatar_config} size={28} showBg={false} />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-on-surface truncate">{student.name}</p>
                              <p className="text-[10px] text-[var(--text-muted)] truncate">{student.email}</p>
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleStudentSelection(student.id)}
                            className="accent-secondary w-4 h-4 rounded cursor-pointer"
                          />
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex gap-3 pt-2 border-t border-white/5">
              <button
                type="button"
                className="flex-1 py-3 bg-surface-variant/40 hover:bg-surface-variant text-on-surface font-headline font-bold text-xs uppercase rounded-xl transition-all"
                onClick={() => setAccessModal(null)}
                disabled={savingAccess}
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                className="flex-1 py-3 font-headline font-bold text-xs uppercase rounded-xl text-white bg-gradient-to-r from-secondary to-primary hover:from-secondary/90 hover:to-primary/90 transition-all flex items-center justify-center gap-2 shadow-[0_4px_15px_rgba(183,109,255,0.3)] disabled:opacity-50"
                onClick={handleSaveAccess}
                disabled={savingAccess}
              >
                {savingAccess && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                {t('Save Access Rules')}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Action Dialog Modal (Quiz Request Approve/Reject) */}
      {requestActionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setRequestActionModal(null)}></div>
          <div className="bg-surface-container-low border border-white/10 p-6 rounded-2xl w-full max-w-md relative z-10 space-y-6 shadow-2xl animate-fadeInScale">
            <h3 className="text-xl font-bold font-headline capitalize">
              {t(requestActionModal.action)} {t('Request')}
            </h3>

            <div className="space-y-1.5 text-sm text-[var(--text-secondary)]">
              <p>{t('Quiz')}: <strong>{requestActionModal.request.quiz_title}</strong></p>
              <p>{t('Target Unit')}: <strong>{t('Unit')} {requestActionModal.request.unit}</strong></p>
              <p>{t('Teacher')}: <strong>{requestActionModal.request.teacher_name}</strong></p>
            </div>

            {requestActionModal.action === 'approve' && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                  {t('Assign to Student Learning Path Unit (Optional)')}
                </label>
                <select
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value)}
                  className="w-full p-3 bg-surface-container-high border border-white/5 rounded-xl text-sm focus:border-secondary focus:outline-none cursor-pointer text-on-surface"
                >
                  <option value="none">{t('None (Standalone / Practice Only)')}</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(u => (
                    <option key={u} value={u}>{t('Unit')} {u}</option>
                  ))}
                </select>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">
                  {t('Assigning a unit (1-15) places the quiz sequentially on the Student Unit dashboard.')}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                {t('Admin Notes / Feedback (Optional)')}
              </label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder={t('Provide notes or feedback to the teacher here...')}
                rows="3"
                className="w-full p-3 bg-surface-container-high border border-white/5 rounded-xl text-sm focus:border-secondary focus:outline-none resize-none transition-all"
              />
            </div>

            <div className="flex gap-2">
              <button
                className="flex-1 py-3 bg-surface-variant/40 hover:bg-surface-variant text-on-surface font-headline font-bold text-xs uppercase rounded-xl transition-all"
                onClick={() => { setRequestActionModal(null); setAdminNotes(''); }}
              >
                {t('Cancel')}
              </button>
              <button
                className={`flex-1 py-3 font-headline font-bold text-xs uppercase rounded-xl text-white transition-all ${requestActionModal.action === 'approve'
                    ? 'bg-success hover:bg-success/80 shadow-[0_4px_15px_rgba(57,255,20,0.3)]'
                    : 'bg-danger hover:bg-danger/80 shadow-[0_4px_15px_rgba(255,49,49,0.3)]'
                  }`}
                onClick={handleProcessRequest}
              >
                {t('Confirm')} {t(requestActionModal.action)}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
