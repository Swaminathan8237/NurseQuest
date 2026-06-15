import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { moduleAPI, quizAPI } from '../api';
import Navbar from '../components/Navbar';

const ICONS = [
  { value: 'school', label: 'School' },
  { value: 'health_and_safety', label: 'Health' },
  { value: 'biotech', label: 'Biotech' },
  { value: 'medication', label: 'Medication' },
  { value: 'monitor_heart', label: 'Heart Monitor' },
  { value: 'psychology', label: 'Psychology' },
  { value: 'vaccines', label: 'Vaccines' },
  { value: 'science', label: 'Science' },
  { value: 'local_hospital', label: 'Hospital' },
  { value: 'medical_information', label: 'Medical Info' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'bloodtype', label: 'Blood Type' },
];

const COLORS = ['#b76dff', '#71d7cd', '#FF6B6B', '#f59e0b', '#6C5CE7', '#00B894', '#E17055', '#0984e3', '#e84393', '#00cec9'];

export default function ModuleManager() {
  const navigate = useNavigate();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', icon: 'school', color: '#b76dff', isPublished: false });
  const [saving, setSaving] = useState(false);
  const [expandedModule, setExpandedModule] = useState(null);
  const [moduleQuizzes, setModuleQuizzes] = useState({});

  useEffect(() => {
    loadModules();
  }, []);

  async function loadModules() {
    try {
      const data = await moduleAPI.getAll();
      setModules(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function loadModuleQuizzes(moduleId) {
    try {
      const data = await moduleAPI.getById(moduleId);
      setModuleQuizzes(prev => ({ ...prev, [moduleId]: data.quizzes || [] }));
    } catch (err) { console.error(err); }
  }

  function handleExpandModule(moduleId) {
    if (expandedModule === moduleId) {
      setExpandedModule(null);
    } else {
      setExpandedModule(moduleId);
      if (!moduleQuizzes[moduleId]) {
        loadModuleQuizzes(moduleId);
      }
    }
  }

  function openCreateForm() {
    setEditingId(null);
    setForm({ title: '', description: '', icon: 'school', color: '#b76dff', isPublished: false });
    setShowForm(true);
  }

  function openEditForm(mod) {
    setEditingId(mod.id);
    setForm({
      title: mod.title,
      description: mod.description || '',
      icon: mod.icon || 'school',
      color: mod.color || '#b76dff',
      isPublished: !!mod.is_published,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.title.trim()) return alert('Module title is required');
    setSaving(true);
    try {
      if (editingId) {
        await moduleAPI.update(editingId, form);
      } else {
        await moduleAPI.create(form);
      }
      setShowForm(false);
      setEditingId(null);
      await loadModules();
    } catch (err) { console.error(err); alert(err.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this module? Quizzes inside will be unlinked but not deleted.')) return;
    try {
      await moduleAPI.delete(id);
      await loadModules();
    } catch (err) { console.error(err); }
  }

  async function togglePublish(mod) {
    try {
      await moduleAPI.update(mod.id, { isPublished: !mod.is_published });
      await loadModules();
    } catch (err) { console.error(err); }
  }

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-on-surface font-body flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 lg:p-8 space-y-8 animate-fadeInUp" style={{ paddingTop: '100px' }}>

        {/* Header */}
        <div className="bg-surface-container-low/60 backdrop-blur-xl rounded-2xl p-6 md:p-8 border border-outline-variant/20 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute -top-32 -left-32 w-64 h-64 bg-primary/10 rounded-full blur-[80px]"></div>
          <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-tertiary/10 rounded-full blur-[80px]"></div>

          <div className="relative z-10">
            <nav className="flex text-sm text-slate-400 font-label items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[16px]">home</span>
              <span>/</span>
              <span onClick={() => navigate('/teacher')} className="cursor-pointer hover:text-primary transition-colors">Dashboard</span>
              <span>/</span>
              <span className="text-primary">Modules</span>
            </nav>
            <h1 className="text-3xl md:text-4xl font-headline font-black tracking-tighter flex items-center gap-3">
              <span className="material-symbols-outlined text-primary text-4xl">view_module</span>
              Module Manager
            </h1>
            <p className="text-on-surface-variant mt-1">Create and organize your quiz modules</p>
          </div>

          <button
            className="w-full md:w-auto px-8 py-4 bg-gradient-to-r from-primary-container to-primary text-on-primary-container rounded-xl font-headline font-bold uppercase tracking-widest shadow-[0_4px_20px_rgba(183,109,255,0.4)] hover:shadow-[0_4px_25px_rgba(183,109,255,0.6)] hover:scale-105 transition-all flex items-center justify-center gap-2 relative z-10 active:scale-95"
            onClick={openCreateForm}
          >
            <span className="material-symbols-outlined text-xl">add_circle</span>
            Create Module
          </button>
        </div>

        {/* Module Create/Edit Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={() => setShowForm(false)}>
            <div className="bg-surface-container-low rounded-3xl p-8 max-w-lg w-full mx-4 border border-outline-variant/30 shadow-2xl animate-fadeInScale" onClick={e => e.stopPropagation()}>
              <h2 className="text-2xl font-headline font-bold mb-6 flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">{editingId ? 'edit' : 'add_circle'}</span>
                {editingId ? 'Edit Module' : 'Create Module'}
              </h2>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-label font-semibold text-slate-400 mb-2 uppercase tracking-wider">Title *</label>
                  <input
                    className="w-full bg-surface-container-high border border-outline-variant/30 rounded-lg px-4 py-3 text-on-surface font-body focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none"
                    value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                    placeholder="e.g., Fundamentals of Nursing"
                  />
                </div>

                <div>
                  <label className="block text-sm font-label font-semibold text-slate-400 mb-2 uppercase tracking-wider">Description</label>
                  <textarea
                    className="w-full bg-surface-container-high border border-outline-variant/30 rounded-lg px-4 py-3 text-on-surface font-body focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none h-24 resize-none"
                    value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                    placeholder="What topics does this module cover?"
                  />
                </div>

                {/* Icon Picker */}
                <div>
                  <label className="block text-sm font-label font-semibold text-slate-400 mb-2 uppercase tracking-wider">Icon</label>
                  <div className="flex flex-wrap gap-2">
                    {ICONS.map(ic => (
                      <button
                        key={ic.value}
                        className={`w-11 h-11 rounded-lg flex items-center justify-center transition-all border ${form.icon === ic.value ? 'bg-primary/20 border-primary/50 text-primary shadow-[0_0_10px_rgba(183,109,255,0.3)]' : 'bg-surface-container-high border-transparent text-slate-400 hover:text-on-surface hover:bg-surface-container-highest'}`}
                        onClick={() => setForm({ ...form, icon: ic.value })}
                        title={ic.label}
                      >
                        <span className="material-symbols-outlined text-xl">{ic.value}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color Picker */}
                <div>
                  <label className="block text-sm font-label font-semibold text-slate-400 mb-2 uppercase tracking-wider">Accent Color</label>
                  <div className="flex flex-wrap gap-2">
                    {COLORS.map(c => (
                      <button
                        key={c}
                        className={`w-9 h-9 rounded-full transition-all border-2 ${form.color === c ? 'border-white scale-110 shadow-[0_0_12px_var(--glow)]' : 'border-transparent hover:scale-105'}`}
                        style={{ backgroundColor: c, '--glow': c + '80' }}
                        onClick={() => setForm({ ...form, color: c })}
                      />
                    ))}
                  </div>
                </div>

                {/* Publish toggle */}
                <label className="flex items-center gap-3 cursor-pointer bg-surface-container-high p-4 rounded-lg border border-outline-variant/20">
                  <input type="checkbox" className="sr-only peer" checked={form.isPublished} onChange={e => setForm({ ...form, isPublished: e.target.checked })} />
                  <div className="w-10 h-6 bg-surface-container-highest rounded-full relative peer-checked:bg-primary/50 transition-colors">
                    <div className={`absolute top-1 w-4 h-4 rounded-full transition-all ${form.isPublished ? 'left-5 bg-primary shadow-[0_0_8px_rgba(183,109,255,0.6)]' : 'left-1 bg-slate-400'}`}></div>
                  </div>
                  <div>
                    <span className="text-sm font-bold text-on-surface">Publish Module</span>
                    <p className="text-xs text-slate-400">Students can see this module once published</p>
                  </div>
                </label>
              </div>

              {/* Preview */}
              <div className="mt-6 p-4 rounded-xl border border-outline-variant/20 bg-surface-container/50">
                <p className="text-xs font-label text-slate-500 mb-3 uppercase tracking-wider">Preview</p>
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: form.color + '25' }}>
                    <span className="material-symbols-outlined text-2xl" style={{ color: form.color }}>{form.icon}</span>
                  </div>
                  <div>
                    <h3 className="font-headline font-bold text-lg text-on-surface">{form.title || 'Module Title'}</h3>
                    <p className="text-sm text-slate-400 line-clamp-1">{form.description || 'Module description...'}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  className="flex-1 py-3 bg-surface-container-high hover:bg-surface-container-highest text-slate-300 rounded-xl font-bold transition-colors"
                  onClick={() => setShowForm(false)}
                >Cancel</button>
                <button
                  className="flex-1 py-3 bg-gradient-to-r from-primary-container to-primary text-on-primary-container rounded-xl font-bold shadow-[0_4px_15px_rgba(183,109,255,0.3)] hover:shadow-[0_4px_20px_rgba(183,109,255,0.5)] transition-all active:scale-95"
                  onClick={handleSave}
                  disabled={saving}
                >{saving ? 'Saving...' : (editingId ? 'Update Module' : 'Create Module')}</button>
              </div>
            </div>
          </div>
        )}

        {/* Modules Grid */}
        {modules.length === 0 ? (
          <div className="bg-surface-container-low/60 rounded-2xl p-16 border border-outline-variant/20 flex flex-col items-center justify-center text-center">
            <span className="material-symbols-outlined text-8xl text-slate-500 mb-6 opacity-30">view_module</span>
            <h3 className="text-2xl font-headline font-bold text-slate-300 mb-2">No modules yet</h3>
            <p className="text-slate-500 mb-8 max-w-md">Create your first module to organize your quizzes. Modules help students navigate through the course material.</p>
            <button className="px-8 py-3 bg-primary/20 text-primary rounded-xl font-bold hover:bg-primary/30 transition-colors" onClick={openCreateForm}>
              <span className="material-symbols-outlined text-sm mr-1 align-middle">add</span> Create First Module
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {modules.map((mod, i) => (
              <div key={mod.id} className="bg-surface-container-low/80 backdrop-blur-md rounded-2xl border border-outline-variant/20 hover:border-primary/30 transition-all shadow-lg overflow-hidden">
                {/* Module Header */}
                <div className="p-6 flex items-center gap-5 cursor-pointer" onClick={() => handleExpandModule(mod.id)}>
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 transition-transform" style={{ backgroundColor: (mod.color || '#b76dff') + '20' }}>
                    <span className="material-symbols-outlined text-3xl" style={{ color: mod.color || '#b76dff' }}>{mod.icon || 'school'}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-xl font-headline font-bold text-on-surface truncate">{mod.title}</h3>
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded ${mod.is_published ? 'bg-tertiary/20 text-tertiary' : 'bg-amber-400/20 text-amber-400'}`}>
                        {mod.is_published ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 line-clamp-1">{mod.description}</p>
                  </div>

                  <div className="flex items-center gap-6 shrink-0">
                    <div className="text-center hidden md:block">
                      <div className="text-2xl font-display font-black" style={{ color: mod.color || '#b76dff' }}>{mod.quiz_count || 0}</div>
                      <div className="text-[10px] font-label text-slate-500 uppercase tracking-widest">Quizzes</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button className="w-9 h-9 rounded-lg flex items-center justify-center bg-surface-container-high hover:bg-surface-container-highest text-slate-400 hover:text-primary transition-all" onClick={e => { e.stopPropagation(); openEditForm(mod); }} title="Edit">
                        <span className="material-symbols-outlined text-lg">edit</span>
                      </button>
                      <button className="w-9 h-9 rounded-lg flex items-center justify-center bg-surface-container-high hover:bg-surface-container-highest text-slate-400 hover:text-tertiary transition-all" onClick={e => { e.stopPropagation(); togglePublish(mod); }} title={mod.is_published ? 'Unpublish' : 'Publish'}>
                        <span className="material-symbols-outlined text-lg">{mod.is_published ? 'unpublished' : 'publish'}</span>
                      </button>
                      <button className="w-9 h-9 rounded-lg flex items-center justify-center bg-surface-container-high hover:bg-error/20 text-slate-400 hover:text-error transition-all" onClick={e => { e.stopPropagation(); handleDelete(mod.id); }} title="Delete">
                        <span className="material-symbols-outlined text-lg">delete</span>
                      </button>
                    </div>

                    <span className={`material-symbols-outlined text-xl text-slate-400 transition-transform ${expandedModule === mod.id ? 'rotate-180' : ''}`}>expand_more</span>
                  </div>
                </div>

                {/* Expanded: Quizzes inside this module */}
                {expandedModule === mod.id && (
                  <div className="border-t border-outline-variant/10 bg-surface-container/30 p-6 animate-fadeIn">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-label font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">quiz</span>
                        Quizzes in this module
                      </h4>
                      <button
                        className="text-sm font-bold text-primary hover:text-primary-container transition-colors flex items-center gap-1"
                        onClick={() => navigate('/quiz-builder', { state: { preselectedModuleId: mod.id } })}
                      >
                        <span className="material-symbols-outlined text-sm">add</span> Add Quiz
                      </button>
                    </div>

                    {!moduleQuizzes[mod.id] ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    ) : moduleQuizzes[mod.id].length === 0 ? (
                      <div className="text-center py-8 text-slate-500">
                        <span className="material-symbols-outlined text-3xl opacity-30 block mb-2">inbox</span>
                        No quizzes yet. Add one to get started!
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {moduleQuizzes[mod.id].map(quiz => (
                          <div key={quiz.id} className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/15 hover:border-primary/30 transition-all group">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex gap-2">
                                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${quiz.is_published ? 'bg-tertiary/20 text-tertiary' : 'bg-amber-400/20 text-amber-400'}`}>
                                  {quiz.is_published ? 'Live' : 'Draft'}
                                </span>
                                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${quiz.difficulty === 'easy' ? 'bg-[#00504a] text-[#8ef4e9]' : quiz.difficulty === 'hard' ? 'bg-[#93000a] text-[#ffdad6]' : 'bg-[#604100] text-[#ffdead]'}`}>
                                  {quiz.difficulty}
                                </span>
                              </div>
                              <span className="text-xs text-slate-500 font-mono">{quiz.question_count} Qs</span>
                            </div>
                            <h5 className="font-headline font-bold text-on-surface mb-1 line-clamp-1">{quiz.title}</h5>
                            <p className="text-xs text-slate-400 line-clamp-2 mb-3">{quiz.description}</p>
                            <div className="flex items-center gap-2 mt-auto">
                              <button className="flex-1 py-1.5 text-xs font-bold bg-surface-container-high hover:bg-surface-container-highest text-slate-300 rounded-lg transition-colors flex items-center justify-center gap-1" onClick={() => navigate(`/quiz-builder/${quiz.id}`)}>
                                <span className="material-symbols-outlined text-[14px]">edit</span> Edit
                              </button>
                              <button className="flex-1 py-1.5 text-xs font-bold bg-primary/15 hover:bg-primary/25 text-primary rounded-lg transition-colors flex items-center justify-center gap-1" onClick={() => navigate(`/quiz/${quiz.id}`)}>
                                <span className="material-symbols-outlined text-[14px]">play_arrow</span> Preview
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
