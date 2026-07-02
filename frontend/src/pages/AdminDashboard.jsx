import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { adminAPI, moduleAPI } from '../api';
import Navbar from '../components/Navbar';

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // State Management
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [modules, setModules] = useState([]);
  const [requests, setRequests] = useState([]);

  // Loading & Action states
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Modal states
  const [requestActionModal, setRequestActionModal] = useState(null); // { request, action: 'approve'|'reject' }
  const [adminNotes, setAdminNotes] = useState('');
  const [moduleModal, setModuleModal] = useState(null); // { mode: 'create'|'edit', module?: m }

  // Module Form state
  const [moduleForm, setModuleForm] = useState({ title: '', description: '', icon: 'school', color: '#b76dff', isPublished: false });

  // Fetch dashboard data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [s, u, m, r] = await Promise.all([
        adminAPI.getStats(),
        adminAPI.getUsers(),
        adminAPI.getModules(),
        adminAPI.getAllQuizRequests()
      ]);
      setStats(s);
      setUsers(u);
      setModules(m);
      setRequests(r);
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

  // Actions: Module/Unit Management
  const handleOpenModuleModal = (mode, mod = null) => {
    if (mode === 'edit' && mod) {
      setModuleForm({
        title: mod.title,
        description: mod.description || '',
        icon: mod.icon || 'school',
        color: mod.color || '#b76dff',
        isPublished: mod.is_published === 1
      });
      setModuleModal({ mode: 'edit', id: mod.id });
    } else {
      setModuleForm({ title: '', description: '', icon: 'school', color: '#b76dff', isPublished: true });
      setModuleModal({ mode: 'create' });
    }
  };

  const handleSaveModule = async (e) => {
    e.preventDefault();
    try {
      if (moduleModal.mode === 'create') {
        await moduleAPI.create(moduleForm);
      } else {
        await moduleAPI.update(moduleModal.id, moduleForm);
      }
      setModuleModal(null);
      // Refresh modules list
      const m = await adminAPI.getModules();
      setModules(m);
      const s = await adminAPI.getStats();
      setStats(s);
    } catch (err) {
      alert(err.message || 'Failed to save module');
    }
  };

  const handleDeleteModule = async (moduleId, moduleTitle) => {
    if (!window.confirm(`Are you sure you want to delete the Unit: "${moduleTitle}"? Any quizzes associated with this module will become standalone.`)) return;
    try {
      await moduleAPI.delete(moduleId);
      const m = await adminAPI.getModules();
      setModules(m);
      const s = await adminAPI.getStats();
      setStats(s);
    } catch (err) {
      alert(err.message || 'Failed to delete module');
    }
  };

  // Actions: Request Processing
  const handleProcessRequest = async () => {
    if (!requestActionModal) return;
    const { request, action } = requestActionModal;
    try {
      await adminAPI.processQuizRequest(request.id, action, adminNotes);
      setRequestActionModal(null);
      setAdminNotes('');
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
    if (!window.confirm('⚠️ CRITICAL WARNING: You are about to wipe out ALL student quiz attempts, history scores, and answers. User accounts, modules, and quizzes themselves will remain intact. This is irreversible. Proceed?')) return;
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
            <button
              className="px-6 py-3.5 bg-secondary text-white rounded-xl font-headline font-bold uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2 active:scale-95 shadow-[0_4px_20px_rgba(183,109,255,0.3)]"
              onClick={() => handleOpenModuleModal('create')}
            >
              <span className="material-symbols-outlined text-lg">add_box</span>
              Create Unit
            </button>
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
            { id: 'modules', label: 'Unit Management', icon: 'folder_open' },
            { id: 'requests', label: `Quiz Requests (${requests.filter(r => r.status === 'pending').length})`, icon: 'task' },
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
                    <p className="text-sm font-semibold text-text-muted">Total Accounts</p>
                    <p className="text-3xl font-bold font-headline mt-2">
                      {stats.users.student + stats.users.teacher + stats.users.admin}
                    </p>
                  </div>
                  <div className="p-3 bg-primary/10 rounded-lg text-primary">
                    <span className="material-symbols-outlined">group</span>
                  </div>
                </div>
                <div className="mt-4 flex gap-4 text-xs font-semibold text-text-secondary">
                  <span>🎓 {stats.users.student} Students</span>
                  <span>👩‍🏫 {stats.users.teacher} Teachers</span>
                </div>
              </div>

              <div className="bg-surface-container-high/40 rounded-xl p-5 border border-white/5 relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-text-muted">Total Units (Modules)</p>
                    <p className="text-3xl font-bold font-headline mt-2">{stats.modulesCount}</p>
                  </div>
                  <div className="p-3 bg-secondary/10 rounded-lg text-secondary">
                    <span className="material-symbols-outlined">menu_book</span>
                  </div>
                </div>
                <p className="text-xs font-medium text-text-muted mt-4">Structural educational modules</p>
              </div>

              <div className="bg-surface-container-high/40 rounded-xl p-5 border border-white/5 relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-text-muted">Quizzes Published</p>
                    <p className="text-3xl font-bold font-headline mt-2">{stats.quizzes.total}</p>
                  </div>
                  <div className="p-3 bg-accent-orange/10 rounded-lg text-accent-orange">
                    <span className="material-symbols-outlined">quiz</span>
                  </div>
                </div>
                <div className="mt-4 flex gap-4 text-xs font-semibold text-text-secondary">
                  <span>📖 {stats.quizzes.unitLinked} Linked to Units</span>
                  <span>🌐 {stats.quizzes.standalone} Standalone</span>
                </div>
              </div>

              <div className="bg-surface-container-high/40 rounded-xl p-5 border border-white/5 relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-text-muted">Average Score</p>
                    <p className="text-3xl font-bold font-headline mt-2 text-success">
                      {Math.round(stats.attempts.avgScore)}%
                    </p>
                  </div>
                  <div className="p-3 bg-success-light rounded-lg text-success">
                    <span className="material-symbols-outlined">analytics</span>
                  </div>
                </div>
                <div className="mt-4 text-xs font-semibold text-text-secondary">
                  📝 {stats.attempts.count} attempts | ⏱️ {stats.attempts.totalTimeMinutes} mins logged
                </div>
              </div>
            </div>

            {/* Quiz Requests Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="bg-surface-container-high/30 border border-white/5 rounded-xl p-6 lg:col-span-2 space-y-6">
                <h3 className="text-xl font-bold font-headline">Pending Posting Requests</h3>

                {requests.filter(r => r.status === 'pending').length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-text-muted">
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
                            <span className="text-xs text-text-muted font-medium">
                              {new Date(req.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <h4 className="text-base font-bold font-headline mt-1.5">{req.quiz_title}</h4>
                          <p className="text-xs text-text-secondary mt-1">
                            Request by: <span className="font-bold text-on-surface">{req.teacher_name}</span> | Target Unit: <span className="font-bold text-on-surface">{req.module_title}</span>
                          </p>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                          <button
                            className="flex-1 sm:flex-none px-4 py-2 bg-success-light hover:bg-success/20 border border-success/30 text-success text-xs font-bold rounded-lg transition-all"
                            onClick={() => setRequestActionModal({ request: req, action: 'approve' })}
                          >
                            Approve
                          </button>
                          <button
                            className="flex-1 sm:flex-none px-4 py-2 bg-danger-light hover:bg-danger/20 border border-danger/30 text-danger text-xs font-bold rounded-lg transition-all"
                            onClick={() => setRequestActionModal({ request: req, action: 'reject' })}
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
                <div className="space-y-4 text-sm text-text-secondary leading-relaxed">
                  <p>
                    Teachers are authorized to create and publish standalone quizzes independently.
                  </p>
                  <p>
                    However, to safeguard curriculum standards, linking a quiz to a formal <strong>Unit (Module)</strong> requires administrator review.
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
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-text-muted">search</span>
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
                    <tr className="border-b border-white/5 bg-surface-container-high/40 font-headline font-bold text-xs uppercase tracking-wider text-text-muted">
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
                        <td colSpan="6" className="p-10 text-center text-text-muted font-semibold">
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
                                <p className="text-xs text-text-muted mt-0.5">{u.email}</p>
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
                          <td className="p-4 md:p-5 text-center font-mono text-xs text-text-secondary">
                            {u.role === 'student' ? `${u.xp} XP (Lvl ${u.level})` : 'N/A'}
                          </td>
                          <td className="p-4 md:p-5 text-center font-bold font-mono">
                            {u.role === 'student' ? u.quizzes_taken : 'N/A'}
                          </td>
                          <td className="p-4 md:p-5 text-center font-bold font-mono">
                            {u.role === 'teacher' ? u.quizzes_created : 'N/A'}
                          </td>
                          <td className="p-4 md:p-5 text-right">
                            <button
                              className="p-2 rounded-lg bg-danger-light hover:bg-danger/20 border border-danger/30 text-danger hover:scale-105 active:scale-95 transition-all"
                              onClick={() => handleDeleteUser(u.id, u.name)}
                              title="Delete User"
                              disabled={u.id === user?.id}
                            >
                              <span className="material-symbols-outlined text-lg">delete</span>
                            </button>
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

        {/* Unit Management Tab */}
        {activeTab === 'modules' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold font-headline">Educational Modules (Units)</h3>
              <button
                className="px-5 py-2.5 bg-secondary text-white rounded-xl font-headline font-bold text-xs uppercase hover:scale-105 active:scale-95 transition-all shadow-[0_4px_15px_rgba(183,109,255,0.3)] flex items-center gap-2"
                onClick={() => handleOpenModuleModal('create')}
              >
                <span className="material-symbols-outlined text-base">add</span>
                New Module
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {modules.map(mod => (
                <div key={mod.id} className="bg-surface-container-high/30 border border-white/5 rounded-2xl p-6 space-y-4 hover:border-white/10 transition-all flex flex-col justify-between shadow-lg">
                  <div>
                    <div className="flex justify-between items-start">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-inner" style={{ backgroundColor: `${mod.color}15`, border: `1px solid ${mod.color}30` }}>
                        <span className="material-symbols-outlined text-2xl" style={{ color: mod.color }}>{mod.icon || 'school'}</span>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${mod.is_published === 1 ? 'bg-success-light text-success' : 'bg-white/10 text-text-muted'}`}>
                        {mod.is_published === 1 ? 'Published' : 'Draft'}
                      </span>
                    </div>

                    <h4 className="text-lg font-bold font-headline mt-4">{mod.title}</h4>
                    <p className="text-sm text-text-secondary mt-2 line-clamp-2">{mod.description || 'No description provided.'}</p>

                    <div className="mt-4 flex gap-4 text-xs font-semibold text-text-muted">
                      <span>📝 {mod.quiz_count} Quizzes Linked</span>
                      <span>👨‍🏫 By {mod.creator_name || 'System'}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4 border-t border-white/5">
                    <button
                      className="flex-1 px-4 py-2 bg-surface-variant/40 hover:bg-surface-variant border border-outline-variant/30 text-on-surface-variant text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5"
                      onClick={() => handleOpenModuleModal('edit', mod)}
                    >
                      <span className="material-symbols-outlined text-base">edit</span>
                      Edit
                    </button>
                    <button
                      className="px-3 py-2 bg-danger-light hover:bg-danger/20 border border-danger/30 text-danger text-xs font-bold rounded-lg transition-all"
                      onClick={() => handleDeleteModule(mod.id, mod.title)}
                    >
                      <span className="material-symbols-outlined text-base">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
                    <tr className="border-b border-white/5 bg-surface-container-high/40 font-headline font-bold text-xs uppercase tracking-wider text-text-muted">
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
                        <td colSpan="6" className="p-10 text-center text-text-muted font-semibold">
                          No requests submitted yet.
                        </td>
                      </tr>
                    ) : (
                      requests.map(req => (
                        <tr key={req.id} className="hover:bg-white/[0.01] transition-all">
                          <td className="p-4 md:p-5 font-bold text-on-surface">{req.quiz_title}</td>
                          <td className="p-4 md:p-5 text-text-secondary">{req.module_title}</td>
                          <td className="p-4 md:p-5">
                            <p className="font-semibold">{req.teacher_name}</p>
                            <p className="text-xs text-text-muted">{req.teacher_email}</p>
                          </td>
                          <td className="p-4 md:p-5 text-text-muted font-mono text-xs">
                            {new Date(req.created_at).toLocaleString()}
                          </td>
                          <td className="p-4 md:p-5 text-center">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${req.status === 'approved'
                                ? 'bg-success-light text-success'
                                : req.status === 'rejected'
                                  ? 'bg-danger-light text-danger'
                                  : 'bg-warning-light text-warning'
                              }`}>
                              {req.status}
                            </span>
                          </td>
                          <td className="p-4 md:p-5 text-right">
                            {req.status === 'pending' ? (
                              <div className="flex gap-1.5 justify-end">
                                <button
                                  className="px-3 py-1.5 bg-success-light hover:bg-success/20 border border-success/30 text-success text-xs font-bold rounded-lg transition-all"
                                  onClick={() => setRequestActionModal({ request: req, action: 'approve' })}
                                >
                                  Approve
                                </button>
                                <button
                                  className="px-3 py-1.5 bg-danger-light hover:bg-danger/20 border border-danger/30 text-danger text-xs font-bold rounded-lg transition-all"
                                  onClick={() => setRequestActionModal({ request: req, action: 'reject' })}
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <p className="text-xs text-text-muted italic max-w-[150px] truncate" title={req.admin_notes || ''}>
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
                  <p className="text-sm text-text-muted mt-1">Real-time table rows count verified directly from database instances</p>
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
                  <p className="text-sm text-text-muted mt-1">Direct system hooks and administrative cleanup scripts</p>
                </div>

                <div className="space-y-4">
                  <div className="border border-danger/25 bg-danger-light/10 p-5 rounded-xl space-y-4">
                    <div className="flex gap-3">
                      <span className="material-symbols-outlined text-danger text-2xl">warning</span>
                      <div>
                        <h4 className="text-sm font-bold text-on-surface">Reset Attempts & Scores Statistics</h4>
                        <p className="text-xs text-text-secondary mt-1">
                          This operation clears all quiz attempts and answer logs, resetting user XP and student dashboards to clean slates. Accounts, quizzes, and modules are kept intact.
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
                    <div className="space-y-2 text-xs font-semibold text-text-secondary">
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
                        <span className="font-mono text-success bg-success-light px-2 py-0.5 rounded">Production (Live)</span>
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
          <div className="bg-surface-container-low border border-white/10 p-6 rounded-2xl w-full max-w-md relative z-10 space-y-6 shadow-2xl animate-scaleUp">
            <h3 className="text-xl font-bold font-headline capitalize">
              {requestActionModal.action} Request
            </h3>

            <div className="space-y-1.5 text-sm text-text-secondary">
              <p>Quiz: <strong>{requestActionModal.request.quiz_title}</strong></p>
              <p>Target Unit: <strong>{requestActionModal.request.module_title}</strong></p>
              <p>Teacher: <strong>{requestActionModal.request.teacher_name}</strong></p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-text-muted uppercase tracking-wider">
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

      {/* Module/Unit Form Modal */}
      {moduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModuleModal(null)}></div>
          <form onSubmit={handleSaveModule} className="bg-surface-container-low border border-white/10 p-6 rounded-2xl w-full max-w-lg relative z-10 space-y-6 shadow-2xl animate-scaleUp">
            <h3 className="text-xl font-bold font-headline">
              {moduleModal.mode === 'create' ? 'Create New Educational Unit' : 'Edit Unit Details'}
            </h3>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Unit Title</label>
                <input
                  type="text"
                  required
                  value={moduleForm.title}
                  onChange={(e) => setModuleForm({ ...moduleForm, title: e.target.value })}
                  placeholder="e.g. Pediatric Nursing Care"
                  className="w-full p-3 bg-surface-container-high border border-white/5 rounded-xl text-sm focus:border-secondary focus:outline-none transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Description</label>
                <textarea
                  value={moduleForm.description}
                  onChange={(e) => setModuleForm({ ...moduleForm, description: e.target.value })}
                  placeholder="Summarize the core topics covered in this unit..."
                  rows="3"
                  className="w-full p-3 bg-surface-container-high border border-white/5 rounded-xl text-sm focus:border-secondary focus:outline-none resize-none transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Material Symbol Icon</label>
                  <select
                    value={moduleForm.icon}
                    onChange={(e) => setModuleForm({ ...moduleForm, icon: e.target.value })}
                    className="w-full p-3 bg-surface-container-high border border-white/5 rounded-xl text-sm focus:border-secondary focus:outline-none transition-all"
                  >
                    <option value="school">School / Book</option>
                    <option value="health_and_safety">Health & Safety</option>
                    <option value="biotech">Biotech / Science</option>
                    <option value="medication">Medication / Rx</option>
                    <option value="clinical_notes">Clinical Notes</option>
                    <option value="cardiology">Cardiology / Heart</option>
                    <option value="psychology">Psychology / Brain</option>
                    <option value="emergency">Emergency / Cross</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Theme Color</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={moduleForm.color}
                      onChange={(e) => setModuleForm({ ...moduleForm, color: e.target.value })}
                      className="w-12 h-11 bg-surface-container-high border border-white/5 rounded-xl cursor-pointer p-1"
                    />
                    <input
                      type="text"
                      value={moduleForm.color}
                      onChange={(e) => setModuleForm({ ...moduleForm, color: e.target.value })}
                      className="w-full p-3 bg-surface-container-high border border-white/5 rounded-xl text-sm font-mono focus:border-secondary focus:outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-surface-container-high/40 p-4 border border-white/5 rounded-xl">
                <input
                  type="checkbox"
                  id="isPublished"
                  checked={moduleForm.isPublished}
                  onChange={(e) => setModuleForm({ ...moduleForm, isPublished: e.target.checked })}
                  className="w-4 h-4 rounded text-secondary focus:ring-secondary cursor-pointer"
                />
                <label htmlFor="isPublished" className="text-sm font-bold text-on-surface cursor-pointer select-none">
                  Publish Immediately (Visible to students)
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                className="flex-1 py-3 bg-surface-variant/40 hover:bg-surface-variant text-on-surface font-headline font-bold text-xs uppercase rounded-xl transition-all"
                onClick={() => setModuleModal(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-3 bg-secondary hover:bg-secondary/80 text-white font-headline font-bold text-xs uppercase rounded-xl transition-all shadow-[0_4px_15px_rgba(183,109,255,0.3)]"
              >
                Save Unit
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
