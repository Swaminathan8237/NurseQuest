import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { quizAPI } from '../api';
import Navbar from '../components/Navbar';

/* ─── Captcha Bounding-Box Editor (Teacher draws the correct region) ─── */
function CaptchaBoundingBoxEditor({ imageUrl, value, onChange }) {
  const containerRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [startPt, setStartPt] = useState(null);
  const [box, setBox] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizing, setResizing] = useState(null); // 'nw','ne','sw','se' or null
  const [imgLoaded, setImgLoaded] = useState(false);

  // Parse existing value
  useEffect(() => {
    if (!value) { setBox(null); return; }
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      if (parsed && typeof parsed.x === 'number') setBox(parsed);
    } catch { /* ignore */ }
  }, [value]);

  const getRelativePos = useCallback((e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }, []);

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    const pos = getRelativePos(e);

    // Check if clicking on a resize handle
    if (box) {
      const handles = [
        { name: 'nw', x: box.x, y: box.y },
        { name: 'ne', x: box.x + box.w, y: box.y },
        { name: 'sw', x: box.x, y: box.y + box.h },
        { name: 'se', x: box.x + box.w, y: box.y + box.h },
      ];
      const rect = containerRef.current?.getBoundingClientRect();
      const threshold = rect ? 16 / Math.min(rect.width, rect.height) : 0.03;
      for (const h of handles) {
        if (Math.abs(pos.x - h.x) < threshold && Math.abs(pos.y - h.y) < threshold) {
          setResizing(h.name);
          return;
        }
      }
      // Check if inside box → drag
      if (pos.x >= box.x && pos.x <= box.x + box.w && pos.y >= box.y && pos.y <= box.y + box.h) {
        setDragging(true);
        setDragOffset({ x: pos.x - box.x, y: pos.y - box.y });
        return;
      }
    }

    // Start drawing new box
    setStartPt(pos);
    setDrawing(true);
    setBox(null);
  }, [box, getRelativePos]);

  const handlePointerMove = useCallback((e) => {
    e.preventDefault();
    const pos = getRelativePos(e);

    if (drawing && startPt) {
      const newBox = {
        x: Math.min(startPt.x, pos.x),
        y: Math.min(startPt.y, pos.y),
        w: Math.abs(pos.x - startPt.x),
        h: Math.abs(pos.y - startPt.y),
      };
      setBox(newBox);
    } else if (dragging && box) {
      const newX = Math.max(0, Math.min(1 - box.w, pos.x - dragOffset.x));
      const newY = Math.max(0, Math.min(1 - box.h, pos.y - dragOffset.y));
      setBox({ ...box, x: newX, y: newY });
    } else if (resizing && box) {
      let newBox = { ...box };
      if (resizing === 'se') {
        newBox.w = Math.max(0.02, Math.min(1 - box.x, pos.x - box.x));
        newBox.h = Math.max(0.02, Math.min(1 - box.y, pos.y - box.y));
      } else if (resizing === 'nw') {
        const right = box.x + box.w;
        const bottom = box.y + box.h;
        newBox.x = Math.max(0, Math.min(right - 0.02, pos.x));
        newBox.y = Math.max(0, Math.min(bottom - 0.02, pos.y));
        newBox.w = right - newBox.x;
        newBox.h = bottom - newBox.y;
      } else if (resizing === 'ne') {
        const bottom = box.y + box.h;
        newBox.w = Math.max(0.02, Math.min(1 - box.x, pos.x - box.x));
        newBox.y = Math.max(0, Math.min(bottom - 0.02, pos.y));
        newBox.h = bottom - newBox.y;
      } else if (resizing === 'sw') {
        const right = box.x + box.w;
        newBox.x = Math.max(0, Math.min(right - 0.02, pos.x));
        newBox.w = right - newBox.x;
        newBox.h = Math.max(0.02, Math.min(1 - box.y, pos.y - box.y));
      }
      setBox(newBox);
    }
  }, [drawing, startPt, dragging, dragOffset, resizing, box, getRelativePos]);

  const handlePointerUp = useCallback(() => {
    if (drawing && box && box.w > 0.01 && box.h > 0.01) {
      onChange(JSON.stringify({ x: +box.x.toFixed(4), y: +box.y.toFixed(4), w: +box.w.toFixed(4), h: +box.h.toFixed(4) }));
    } else if ((dragging || resizing) && box) {
      onChange(JSON.stringify({ x: +box.x.toFixed(4), y: +box.y.toFixed(4), w: +box.w.toFixed(4), h: +box.h.toFixed(4) }));
    }
    setDrawing(false);
    setStartPt(null);
    setDragging(false);
    setResizing(null);
  }, [drawing, dragging, resizing, box, onChange]);

  const clearBox = () => {
    setBox(null);
    onChange('');
  };

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="relative rounded-xl overflow-hidden border-2 border-outline-variant/30 bg-surface-container-highest cursor-crosshair select-none touch-none"
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
      >
        <img
          src={imageUrl}
          alt="Captcha"
          className="w-full block"
          draggable={false}
          onLoad={() => setImgLoaded(true)}
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        />
        {/* Darkened overlay outside bounding box */}
        {box && imgLoaded && (
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
            {/* Semi-transparent overlay */}
            <div className="absolute inset-0 bg-black/40" />
            {/* Clear cutout for the selected region */}
            <div
              className="absolute border-2 border-primary shadow-[0_0_20px_rgba(108,92,231,0.6)]"
              style={{
                left: `${box.x * 100}%`,
                top: `${box.y * 100}%`,
                width: `${box.w * 100}%`,
                height: `${box.h * 100}%`,
                backgroundColor: 'transparent',
                boxShadow: `0 0 0 9999px rgba(0,0,0,0.4)`,
                zIndex: 2,
              }}
            />
            {/* Corner handles */}
            {[
              { name: 'nw', left: box.x, top: box.y },
              { name: 'ne', left: box.x + box.w, top: box.y },
              { name: 'sw', left: box.x, top: box.y + box.h },
              { name: 'se', left: box.x + box.w, top: box.y + box.h },
            ].map(h => (
              <div
                key={h.name}
                className="absolute w-4 h-4 bg-primary border-2 border-on-primary rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
                style={{ left: `${h.left * 100}%`, top: `${h.top * 100}%`, zIndex: 3, cursor: `${h.name}-resize` }}
              />
            ))}
            {/* Dimension label */}
            <div
              className="absolute text-[10px] font-mono font-bold text-on-primary bg-primary/90 px-2 py-0.5 rounded pointer-events-none"
              style={{
                left: `${(box.x + box.w / 2) * 100}%`,
                top: `${box.y * 100}%`,
                transform: 'translate(-50%, -120%)',
                zIndex: 3,
              }}
            >
              {(box.w * 100).toFixed(0)}% × {(box.h * 100).toFixed(0)}%
            </div>
          </div>
        )}
        {/* Instruction overlay when no box */}
        {!box && imgLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
            <div className="bg-surface/80 backdrop-blur-sm px-6 py-3 rounded-xl border border-outline-variant/30 text-center">
              <span className="material-symbols-outlined text-primary text-3xl block mb-1">center_focus_strong</span>
              <p className="text-sm font-medium text-on-surface">Click & drag to select the correct region</p>
            </div>
          </div>
        )}
      </div>
      {box && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-primary/70 font-mono">
            <span className="material-symbols-outlined text-[14px]" style={{fontVariationSettings: "'FILL' 1"}}>check_circle</span>
            Region selected: ({(box.x * 100).toFixed(1)}%, {(box.y * 100).toFixed(1)}%) — {(box.w * 100).toFixed(1)}% × {(box.h * 100).toFixed(1)}%
          </div>
          <button
            type="button"
            className="text-xs text-error hover:text-error/80 font-bold transition-colors"
            onClick={clearBox}
          >
            Clear selection
          </button>
        </div>
      )}
    </div>
  );
}

const Q_TYPES = [
  { value: 'mcq', label: 'Multiple Choice', icon: 'list_alt' },
  { value: 'image', label: 'Image Based', icon: 'image' },
  { value: 'video', label: 'Video Based', icon: 'play_circle' },
  { value: 'audio', label: 'Audio Based', icon: 'volume_up' },
  { value: 'jumbled_letters', label: 'Jumbled Letters', icon: 'sort_by_alpha' },
  { value: 'jumbled_sequence', label: 'Sequence Order', icon: 'format_list_numbered' },
  { value: 'slider', label: 'Slider', icon: 'linear_scale' },
  { value: 'matching', label: 'Match Pairs', icon: 'compare_arrows' },
  { value: 'captcha', label: 'Image Captcha', icon: 'center_focus_strong' },
];

export default function QuizBuilder() {
  const { id: editId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [saving, setSaving] = useState(false);
  const [quiz, setQuiz] = useState({ title: '', description: '', category: 'Patient Care', difficulty: 'medium', unit: 1, timePerQuestion: 30 });
  const [questions, setQuestions] = useState([createEmptyQuestion()]);
  const [activeQ, setActiveQ] = useState(0);
  const [uploading, setUploading] = useState(false);

  // Upload media file to server
  async function handleMediaUpload(questionIndex, file) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('media', file);
      const token = localStorage.getItem('nursequest_token');
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      updateQuestion(questionIndex, 'mediaUrl', data.url);
    } catch (err) {
      console.error('Upload error:', err);
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    if (editId) {
      quizAPI.getById(editId).then(data => {
        setQuiz({
          title: data.title,
          description: data.description || '',
          category: data.category || 'Patient Care',
          difficulty: data.difficulty || 'medium',
          unit: data.unit !== undefined ? data.unit : 1,
          timePerQuestion: data.time_per_question || 30,
          moduleId: data.module_id || ''
        });
        if (data.questions && data.questions.length > 0) {
          setQuestions(data.questions.map(q => ({
            id: q.id,
            type: q.type,
            questionText: q.question_text || '',
            mediaUrl: q.media_url || '',
            options: q.options && q.options.length > 0 ? q.options : ['', '', '', ''],
            correctAnswer: q.correct_answer || '',
            explanation: q.explanation || '',
            points: q.points || 1000,
            sliderMin: q.slider_min !== null ? q.slider_min : 0,
            sliderMax: q.slider_max !== null ? q.slider_max : 100,
            sliderStep: q.slider_step !== null ? q.slider_step : 1,
            sliderUnit: q.slider_unit || '',
            matchingPairs: q.matching_pairs && q.matching_pairs.length > 0 ? q.matching_pairs : ['', '', '', '']
          })));
        }
      }).catch(err => {
        console.error('Failed to load quiz:', err);
      });
    }
  }, [editId]);



  function createEmptyQuestion() {
    return { type: 'mcq', questionText: '', mediaUrl: '', options: ['', '', '', ''], correctAnswer: '', explanation: '', points: 1000, sliderMin: 0, sliderMax: 100, sliderStep: 1, sliderUnit: '', matchingPairs: ['', '', '', ''] };
  }

  const updateQuestion = (i, field, value) => {
    setQuestions(prev => prev.map((q, idx) => idx === i ? { ...q, [field]: value } : q));
  };

  const updateOption = (qi, oi, value) => {
    setQuestions(prev => prev.map((q, idx) => {
      if (idx !== qi) return q;
      const opts = [...q.options]; opts[oi] = value; return { ...q, options: opts };
    }));
  };

  const addQuestion = () => { setQuestions(prev => [...prev, createEmptyQuestion()]); setActiveQ(questions.length); };
  const removeQuestion = (i) => {
    if (questions.length <= 1) return;
    setQuestions(prev => prev.filter((_, idx) => idx !== i));
    if (activeQ >= questions.length - 1) setActiveQ(Math.max(0, questions.length - 2));
  };

  const handleSave = async (publish = false) => {
    if (!quiz.title || quiz.title.trim() === '') {
      alert('Please enter a quiz title before saving.');
      return;
    }
    setSaving(true);
    try {
      const data = { ...quiz, questions, isPublished: publish };
      if (editId) await quizAPI.update(editId, data);
      else await quizAPI.create(data);
      navigate('/teacher');
    } catch (err) { console.error(err); alert(err.message); }
    finally { setSaving(false); }
  };

  const q = questions[activeQ] || questions[0];

  return (
    <div className="min-h-screen bg-background text-on-surface font-body flex flex-col overflow-hidden">
      <Navbar />
      
      <main className="flex-1 flex flex-col overflow-hidden" style={{ paddingTop: '100px' }}>
        {/* Workspace Split */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden p-4 lg:p-6 gap-6 max-w-[1920px] mx-auto w-full animate-fadeInUp">
          
          {/* LEFT PANEL: Quiz Builder */}
          <section className="flex-[0_0_100%] lg:flex-[0_0_65%] flex flex-col overflow-y-auto space-y-6 lg:pr-2 custom-scrollbar">
            
            {/* Header */}
            <div className="clay-card p-6 flex flex-col gap-2">
              <nav className="flex text-sm text-slate-400 font-label items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">home</span>
                <span>/</span>
                <span onClick={() => navigate('/teacher')} className="cursor-pointer hover:text-primary transition-colors">Dashboard</span>
                <span>/</span>
                <span className="text-primary">{editId ? 'Edit Quiz' : 'Create Quiz'}</span>
              </nav>
              <h2 className="text-3xl font-headline font-extrabold text-on-surface tracking-tight flex items-center gap-3">
                <span className="text-3xl">✏️</span> {editId ? 'Edit Quiz' : 'Create Quiz'}
              </h2>
            </div>

            {/* Quiz Details Form */}
            <div className="clay-card p-8 space-y-6">
              <h3 className="text-xl font-headline font-bold text-primary mb-4 border-b border-brand-elevated/40 pb-2">Quiz Settings</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-label font-semibold text-slate-400 mb-1 uppercase tracking-wider">Title</label>
                  <input 
                    className="input" 
                    type="text" 
                    value={quiz.title} 
                    onChange={e => setQuiz({...quiz, title: e.target.value})} 
                    placeholder="Enter quiz title..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-label font-semibold text-slate-400 mb-1 uppercase tracking-wider">Description</label>
                  <textarea 
                    className="input h-24 resize-none" 
                    value={quiz.description} 
                    onChange={e => setQuiz({...quiz, description: e.target.value})} 
                    placeholder="Enter quiz description..."
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-label font-semibold text-slate-400 mb-1 uppercase tracking-wider">Category</label>
                    <select 
                      className="input cursor-pointer"
                      value={quiz.category} 
                      onChange={e => setQuiz({...quiz, category: e.target.value})}
                    >
                      <option value="Patient Care">Patient Care</option>
                      <option value="Pharmacology">Pharmacology</option>
                      <option value="Anatomy">Anatomy</option>
                      <option value="General Nursing">General Nursing</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-label font-semibold text-slate-400 mb-1 uppercase tracking-wider">Difficulty</label>
                    <select 
                      className="input cursor-pointer"
                      value={quiz.difficulty} 
                      onChange={e => setQuiz({...quiz, difficulty: e.target.value})}
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-label font-semibold text-slate-400 mb-1 uppercase tracking-wider">Time (Secs)</label>
                    <input 
                      className="input" 
                      type="number" min="5" max="120" 
                      value={quiz.timePerQuestion} 
                      onChange={e => setQuiz({...quiz, timePerQuestion: parseInt(e.target.value)})} 
                    />
                  </div>
                </div>

                {/* Unit Selector */}
                <div>
                  <label className="block text-sm font-label font-semibold text-slate-400 mb-1 uppercase tracking-wider">Unit</label>
                  <select 
                    className="input cursor-pointer"
                    value={quiz.unit === null ? 'standalone' : quiz.unit} 
                    onChange={e => setQuiz({...quiz, unit: e.target.value === 'standalone' ? null : (parseInt(e.target.value) || 1)})}
                  >
                    <option value="standalone">None (Standalone / Practice Quiz)</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(u => (
                      <option key={u} value={u}>Unit {u}</option>
                    ))}
                  </select>
                  <p className="text-xs text-primary/70 mt-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">info</span>
                    Select which unit this quiz belongs to, or None for a standalone/practice quiz.
                  </p>
                </div>
              </div>
            </div>
            {/* Question Editor */}
            <div className="clay-card p-8 space-y-6 relative overflow-hidden">
              <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/10 rounded-full blur-[80px] pointer-events-none"></div>
              
              <div className="flex justify-between items-center mb-4 border-b border-brand-elevated/40 pb-3">
                <h3 className="text-xl font-headline font-bold text-primary">Question Editor</h3>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-primary bg-brand-surface shadow-clay-sunken px-3 py-1 rounded-full border-2 border-primary/30">
                    Question {activeQ + 1}
                  </span>
                  {questions.length > 1 && (
                    <button className="text-slate-400 hover:text-error transition-colors p-1" onClick={() => removeQuestion(activeQ)} title="Delete Question">
                      <span className="material-symbols-outlined text-xl">delete</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Question Types Grid */}
              <div className="grid grid-cols-2 md:grid-cols-5 xl:grid-cols-9 gap-3 mb-6">
                {Q_TYPES.map(t => {
                  const isActive = q.type === t.value;
                  return (
                    <button 
                      key={t.value} 
                      className={`rounded-xl py-3 flex flex-col items-center justify-center gap-1 transition-all border-2 ${isActive ? 'bg-brand-surface shadow-clay-sunken border-primary text-primary' : 'bg-brand-surface border-transparent text-slate-400 hover:scale-[1.02]'}`}
                      onClick={() => updateQuestion(activeQ, 'type', t.value)}
                    >
                      <span className="material-symbols-outlined text-[20px]">{t.icon}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-center px-1">{t.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Editor Fields */}
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-label font-semibold text-slate-400 mb-2 uppercase tracking-wider">Question Text</label>
                  <textarea 
                    className="input h-32 resize-none" 
                    value={q.questionText} 
                    onChange={e => updateQuestion(activeQ, 'questionText', e.target.value)} 
                    placeholder="Enter your question here..."
                  />
                </div>

                {['image','video','audio','captcha'].includes(q.type) && (
                  <div>
                    <label className="block text-sm font-label font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                      Media {q.type === 'image' || q.type === 'captcha' ? '(Image)' : q.type === 'video' ? '(Video)' : '(Audio)'}
                    </label>

                    {/* File Upload Zone */}
                    <div
                      className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer group ${q.mediaUrl ? 'border-tertiary/40 bg-brand-surface shadow-clay-sunken' : 'border-brand-elevated/40 hover:border-primary/50 bg-brand-surface shadow-clay-outer hover:scale-[1.01]'}`}
                      onClick={() => document.getElementById(`media-file-${activeQ}`).click()}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-primary', 'bg-primary/10'); }}
                      onDragLeave={e => { e.currentTarget.classList.remove('border-primary', 'bg-primary/10'); }}
                      onDrop={async e => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('border-primary', 'bg-primary/10');
                        const file = e.dataTransfer.files[0];
                        if (file) await handleMediaUpload(activeQ, file);
                      }}
                    >
                      {/* Uploading overlay */}
                      {uploading && (
                        <div className="absolute inset-0 bg-surface/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center z-20">
                          <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mb-3"></div>
                          <p className="text-sm text-primary font-bold">Uploading...</p>
                        </div>
                      )}
                      {q.mediaUrl ? (
                        <div className="space-y-3">
                          {/* Preview */}
                          {q.type === 'image' && (
                            <img src={q.mediaUrl} alt="Preview" className="max-h-40 mx-auto rounded-lg shadow-md object-contain" onError={e => e.target.style.display='none'} />
                          )}
                          {q.type === 'video' && (
                            <video src={q.mediaUrl} controls className="max-h-40 mx-auto rounded-lg shadow-md" />
                          )}
                          {q.type === 'audio' && (
                            <audio src={q.mediaUrl} controls className="mx-auto" />
                          )}
                          <div className="flex items-center justify-center gap-2 text-sm text-tertiary font-medium">
                            <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                            Media attached
                          </div>
                          <button
                            type="button"
                            className="text-xs text-error hover:text-error/80 font-bold transition-colors"
                            onClick={e => { e.stopPropagation(); updateQuestion(activeQ, 'mediaUrl', ''); }}
                          >
                            Remove media
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <span className="material-symbols-outlined text-4xl text-slate-400 group-hover:text-primary transition-colors">
                            {q.type === 'image' ? 'add_photo_alternate' : q.type === 'video' ? 'video_file' : 'audio_file'}
                          </span>
                          <p className="text-sm text-slate-400 font-medium group-hover:text-on-surface transition-colors">
                            Click to choose a file or drag & drop here
                          </p>
                          <p className="text-xs text-slate-500">
                            {q.type === 'image' ? 'JPG, PNG, GIF, WebP (max 10MB)' : q.type === 'video' ? 'MP4, WebM, MOV (max 50MB)' : 'MP3, WAV, OGG (max 50MB)'}
                          </p>
                        </div>
                      )}

                      <input
                        id={`media-file-${activeQ}`}
                        type="file"
                        className="hidden"
                        accept={q.type === 'image' || q.type === 'captcha' ? 'image/*' : q.type === 'video' ? 'video/*' : 'audio/*'}
                        onChange={async e => {
                          const file = e.target.files[0];
                          if (file) await handleMediaUpload(activeQ, file);
                          e.target.value = '';
                        }}
                      />
                    </div>

                    {/* OR use URL */}
                    <div className="flex items-center gap-3 mt-3">
                      <div className="h-px flex-1 bg-outline-variant/20"></div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">or paste URL</span>
                      <div className="h-px flex-1 bg-outline-variant/20"></div>
                    </div>
                    <div className="flex items-center gap-3 bg-surface-container-highest border border-outline-variant/30 rounded-lg p-2 pl-4 mt-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30 transition-all">
                      <span className="material-symbols-outlined text-slate-400 text-[18px]">link</span>
                      <input 
                        className="bg-transparent border-none text-sm text-on-surface flex-1 outline-none" 
                        value={q.mediaUrl} 
                        onChange={e => updateQuestion(activeQ, 'mediaUrl', e.target.value)} 
                        placeholder="https://example.com/media-file"
                      />
                    </div>
                  </div>
                )}

                {/* Multiple Choice Options */}
                {['mcq','image','video','audio'].includes(q.type) && !['captcha'].includes(q.type) && (
                  <div>
                    <label className="block text-sm font-label font-semibold text-slate-400 mb-3 uppercase tracking-wider">Answer Options</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {q.options.map((opt, oi) => {
                        const colors = ['bg-primary', 'bg-[#71d7cd]', 'bg-amber-400', 'bg-error'];
                        const shadows = ['shadow-[0_0_8px_rgba(221,183,255,0.6)]', 'shadow-[0_0_8px_rgba(113,215,205,0.6)]', 'shadow-[0_0_8px_rgba(251,191,36,0.6)]', 'shadow-[0_0_8px_rgba(255,180,171,0.6)]'];
                        return (
                          <div key={oi} className="flex items-center gap-3 bg-surface-container-high rounded-lg p-3 pl-4 border border-outline-variant/20 focus-within:border-primary/50 transition-colors">
                            <div className={`w-3 h-3 rounded-full ${colors[oi % 4]} ${shadows[oi % 4]}`}></div>
                            <input 
                              className="bg-transparent border-none text-sm text-on-surface flex-1 outline-none" 
                              value={opt} 
                              onChange={e => updateOption(activeQ, oi, e.target.value)} 
                              placeholder={`Option ${oi+1}`} 
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Jumbled Letters */}
                {q.type === 'jumbled_letters' && (
                  <div>
                    <label className="block text-sm font-label font-semibold text-slate-400 mb-2 uppercase tracking-wider">Correct Word (Answer)</label>
                    <input 
                      className="w-full bg-surface-container-highest border border-outline-variant/30 rounded-lg px-4 py-3 text-on-surface font-body font-bold text-lg uppercase tracking-widest focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none" 
                      value={q.correctAnswer} 
                      onChange={e => {
                        const word = e.target.value.toUpperCase();
                        updateQuestion(activeQ, 'correctAnswer', word);
                        updateQuestion(activeQ, 'options', word.split(''));
                      }} 
                      placeholder="e.g., ACETAMINOPHEN" 
                    />
                    <p className="text-xs text-primary/70 mt-2 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">info</span>
                      Letters will be scrambled automatically for the student.
                    </p>
                  </div>
                )}

                {/* Sequence Order */}
                {q.type === 'jumbled_sequence' && (
                  <div>
                    <label className="block text-sm font-label font-semibold text-slate-400 mb-3 uppercase tracking-wider">Steps (In Correct Order)</label>
                    <div className="space-y-3">
                      {(q.options || ['']).map((step, si) => (
                        <div key={si} className="flex items-center gap-3 bg-surface-container-high rounded-lg p-3 pl-4 border border-outline-variant/20">
                          <span className="font-mono font-bold text-slate-500">{si+1}</span>
                          <input 
                            className="bg-transparent border-none text-sm text-on-surface flex-1 outline-none" 
                            value={step} 
                            onChange={e => {
                              const opts = [...(q.options || [])]; opts[si] = e.target.value;
                              updateQuestion(activeQ, 'options', opts);
                              updateQuestion(activeQ, 'correctAnswer', JSON.stringify(opts));
                            }} 
                            placeholder={`Step ${si+1}`} 
                          />
                          <button 
                            className="text-slate-500 hover:text-error transition-colors p-1" 
                            onClick={() => {
                              const opts = q.options.filter((_,i)=>i!==si);
                              updateQuestion(activeQ, 'options', opts);
                              updateQuestion(activeQ, 'correctAnswer', JSON.stringify(opts));
                            }}
                          >
                            <span className="material-symbols-outlined text-sm">close</span>
                          </button>
                        </div>
                      ))}
                      <button 
                        className="w-full py-3 border border-dashed border-outline-variant/50 rounded-lg text-slate-400 font-semibold hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all flex items-center justify-center gap-2" 
                        onClick={() => {
                          const opts = [...(q.options || []), ''];
                          updateQuestion(activeQ, 'options', opts);
                        }}
                      >
                        <span className="material-symbols-outlined text-sm">add</span> Add Step
                      </button>
                    </div>
                  </div>
                )}

                {/* Slider Editor */}
                {q.type === 'slider' && (
                  <div>
                    <label className="block text-sm font-label font-semibold text-slate-400 mb-3 uppercase tracking-wider">Slider Configuration</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div>
                        <label className="block text-xs font-label text-slate-500 mb-1">Min Value</label>
                        <input 
                          className="w-full bg-surface-container-highest border border-outline-variant/30 rounded-lg px-4 py-3 text-on-surface font-body focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none" 
                          type="number" 
                          value={q.sliderMin} 
                          onChange={e => updateQuestion(activeQ, 'sliderMin', parseFloat(e.target.value) || 0)} 
                          placeholder="0" 
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-label text-slate-500 mb-1">Max Value</label>
                        <input 
                          className="w-full bg-surface-container-highest border border-outline-variant/30 rounded-lg px-4 py-3 text-on-surface font-body focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none" 
                          type="number" 
                          value={q.sliderMax} 
                          onChange={e => updateQuestion(activeQ, 'sliderMax', parseFloat(e.target.value) || 100)} 
                          placeholder="100" 
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-label text-slate-500 mb-1">Step</label>
                        <input 
                          className="w-full bg-surface-container-highest border border-outline-variant/30 rounded-lg px-4 py-3 text-on-surface font-body focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none" 
                          type="number" 
                          value={q.sliderStep} 
                          onChange={e => updateQuestion(activeQ, 'sliderStep', parseFloat(e.target.value) || 1)} 
                          placeholder="1" 
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-label text-slate-500 mb-1">Unit Label</label>
                        <input 
                          className="w-full bg-surface-container-highest border border-outline-variant/30 rounded-lg px-4 py-3 text-on-surface font-body focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none" 
                          type="text" 
                          value={q.sliderUnit} 
                          onChange={e => updateQuestion(activeQ, 'sliderUnit', e.target.value)} 
                          placeholder="e.g., mmHg, bpm" 
                        />
                      </div>
                    </div>
                    <div className="mb-4">
                      <label className="block text-xs font-label text-slate-500 mb-1">Correct Value</label>
                      <input 
                        className="w-full bg-surface-container-highest border border-outline-variant/30 rounded-lg px-4 py-3 text-on-surface font-body font-bold text-lg focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none" 
                        type="number" 
                        value={q.correctAnswer} 
                        onChange={e => updateQuestion(activeQ, 'correctAnswer', e.target.value)} 
                        placeholder="Enter the correct value" 
                        min={q.sliderMin} 
                        max={q.sliderMax} 
                        step={q.sliderStep} 
                      />
                    </div>
                    {/* Slider Preview */}
                    <div className="bg-surface-container-high rounded-lg p-4 border border-outline-variant/20">
                      <p className="text-xs font-label text-slate-500 mb-3 uppercase tracking-wider">Preview</p>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm text-primary">{q.sliderMin}</span>
                        <div className="flex-1 h-2 bg-gradient-to-r from-primary to-primary-container rounded-full relative">
                          {q.correctAnswer !== '' && (
                            <div 
                              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-primary rounded-full border-2 border-on-primary shadow-[0_0_8px_rgba(221,183,255,0.6)]"
                              style={{ left: `${Math.max(0, Math.min(100, ((parseFloat(q.correctAnswer) - q.sliderMin) / (q.sliderMax - q.sliderMin)) * 100))}%`, transform: 'translate(-50%, -50%)' }}
                            ></div>
                          )}
                        </div>
                        <span className="font-mono text-sm text-primary">{q.sliderMax}</span>
                        {q.sliderUnit && <span className="font-mono text-xs text-slate-400">{q.sliderUnit}</span>}
                      </div>
                    </div>
                  </div>
                )}

                {/* Matching Pairs Editor */}
                {q.type === 'matching' && (
                  <div>
                    <label className="block text-sm font-label font-semibold text-slate-400 mb-3 uppercase tracking-wider">Match Pairs</label>
                    <p className="text-xs text-primary/70 mb-4 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">info</span>
                      Students will see the right column shuffled. Define the correct pairs here.
                    </p>
                    <div className="space-y-3">
                      {(q.options || ['']).map((leftItem, pi) => (
                        <div key={pi} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 bg-surface-container-high rounded-lg p-3 border border-outline-variant/20">
                          <div className="flex items-center gap-2 flex-1">
                            <div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_8px_rgba(221,183,255,0.6)] shrink-0"></div>
                            <input 
                              className="bg-transparent border-none text-sm text-on-surface flex-1 outline-none min-w-0" 
                              value={leftItem} 
                              onChange={e => {
                                const opts = [...(q.options || [])]; opts[pi] = e.target.value;
                                updateQuestion(activeQ, 'options', opts);
                                updateQuestion(activeQ, 'correctAnswer', JSON.stringify(Object.fromEntries(opts.map((opt, i) => [opt, (q.matchingPairs || [])[i] || '']))));
                              }} 
                              placeholder={`Left item ${pi+1}`} 
                            />
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3">
                            <span className="material-symbols-outlined text-slate-500 text-sm sm:text-base">compare_arrows</span>
                            <div className="flex items-center gap-2 flex-1">
                              <div className="w-3 h-3 rounded-full bg-[#71d7cd] shadow-[0_0_8px_rgba(113,215,205,0.6)] shrink-0"></div>
                              <input 
                                className="bg-transparent border-none text-sm text-on-surface flex-1 outline-none min-w-0" 
                                value={(q.matchingPairs || [])[pi] || ''} 
                                onChange={e => {
                                  const pairs = [...(q.matchingPairs || [])]; pairs[pi] = e.target.value;
                                  updateQuestion(activeQ, 'matchingPairs', pairs);
                                  updateQuestion(activeQ, 'correctAnswer', JSON.stringify(Object.fromEntries((q.options || []).map((opt, i) => [opt, pairs[i] || '']))));
                                }} 
                                placeholder={`Right item ${pi+1}`} 
                              />
                            </div>
                            <button 
                              className="text-slate-500 hover:text-error transition-colors p-1 shrink-0" 
                              onClick={() => {
                                if ((q.options || []).length <= 1) return;
                                const opts = q.options.filter((_,i)=>i!==pi);
                                const pairs = (q.matchingPairs || []).filter((_,i)=>i!==pi);
                                updateQuestion(activeQ, 'options', opts);
                                updateQuestion(activeQ, 'matchingPairs', pairs);
                                updateQuestion(activeQ, 'correctAnswer', JSON.stringify(Object.fromEntries(opts.map((opt, i) => [opt, pairs[i] || '']))));
                              }}
                            >
                              <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                          </div>
                        </div>
                      ))}
                      <button 
                        className="w-full py-3 border border-dashed border-outline-variant/50 rounded-lg text-slate-400 font-semibold hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all flex items-center justify-center gap-2" 
                        onClick={() => {
                          const opts = [...(q.options || []), ''];
                          const pairs = [...(q.matchingPairs || []), ''];
                          updateQuestion(activeQ, 'options', opts);
                          updateQuestion(activeQ, 'matchingPairs', pairs);
                        }}
                      >
                        <span className="material-symbols-outlined text-sm">add</span> Add Pair
                      </button>
                    </div>
                  </div>
                )}

                {/* Captcha Bounding Box Editor */}
                {q.type === 'captcha' && q.mediaUrl && (
                  <div>
                    <label className="block text-sm font-label font-semibold text-slate-400 mb-3 uppercase tracking-wider">Select Correct Region</label>
                    <p className="text-xs text-primary/70 mb-4 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">info</span>
                      Click and drag on the image to draw a bounding box around the correct region. Students will need to select a similar area.
                    </p>
                    <CaptchaBoundingBoxEditor
                      imageUrl={q.mediaUrl}
                      value={q.correctAnswer}
                      onChange={(boxJson) => updateQuestion(activeQ, 'correctAnswer', boxJson)}
                    />
                  </div>
                )}
                {q.type === 'captcha' && !q.mediaUrl && (
                  <div className="bg-brand-surface shadow-clay-inner rounded-xl p-8 text-center border-2 border-dashed border-brand-elevated/40">
                    <span className="material-symbols-outlined text-5xl text-slate-500 mb-3 block">add_photo_alternate</span>
                    <p className="text-sm text-slate-400 font-medium">Upload an image above to set the correct region</p>
                  </div>
                )}

                {/* Correct Answer & Explanation */}
                <div className="pt-6 border-t border-brand-elevated/40 space-y-4">
                  {['mcq','image','video','audio'].includes(q.type) && q.type !== 'captcha' && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <label className="text-sm font-label font-semibold text-slate-400 uppercase tracking-wider sm:w-40 shrink-0">Correct Answer</label>
                      <select 
                        className="flex-1 input cursor-pointer text-sm" 
                        value={q.correctAnswer} 
                        onChange={e => updateQuestion(activeQ, 'correctAnswer', e.target.value)}
                      >
                        <option value="">Select correct option...</option>
                        {q.options.filter(o=>o).map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-label font-semibold text-slate-400 mb-2 uppercase tracking-wider">Clinical Explanation (Optional)</label>
                    <textarea 
                      className="input h-24 resize-none text-sm" 
                      value={q.explanation} 
                      onChange={e => updateQuestion(activeQ, 'explanation', e.target.value)} 
                      placeholder="Explain the clinical rationale for the correct answer..."
                    />
                  </div>
                </div>

              </div>
            </div>
          </section>

          {/* RIGHT PANEL: Question List */}
          <aside className="flex-[0_0_100%] lg:flex-[0_0_35%] flex flex-col clay-card p-0 overflow-hidden">
            <div className="p-6 border-b border-brand-elevated/40 bg-brand-surface flex justify-between items-center z-10">
              <h3 className="text-lg font-headline font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-tertiary">format_list_bulleted</span>
                Questions ({questions.length})
              </h3>
              <span className="text-xs bg-brand-surface shadow-clay-sunken px-3 py-1 rounded-md text-primary font-bold tracking-widest uppercase">
                {questions.length * (quiz.timePerQuestion || 30)} Secs
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {questions.map((qq, i) => {
                const isActive = activeQ === i;
                const typeInfo = Q_TYPES.find(t => t.value === qq.type);
                
                return (
                  <div 
                    key={i} 
                    className={`rounded-xl p-4 flex items-start gap-3 group transition-all cursor-pointer border-2 ${isActive ? 'bg-brand-surface shadow-clay-sunken border-primary/30 relative overflow-hidden' : 'bg-brand-surface border-transparent shadow-clay-outer hover:scale-[1.02]'}`}
                    onClick={() => setActiveQ(i)}
                  >
                    {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>}
                    
                    <span className={`material-symbols-outlined mt-1 text-sm ${isActive ? 'text-primary' : 'text-slate-500'}`}>drag_indicator</span>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[10px] font-black tracking-widest px-2 py-0.5 rounded uppercase ${isActive ? 'bg-brand-elevated text-primary shadow-clay-sunken' : 'bg-brand-surface text-on-surface shadow-clay-outer'}`}>
                          Q{i+1}
                        </span>
                        <span className={`material-symbols-outlined text-[14px] ${isActive ? 'text-primary' : 'text-slate-400'}`}>
                          {typeInfo?.icon || 'help_outline'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-bold uppercase truncate">{typeInfo?.label}</span>
                      </div>
                      <p className={`text-sm font-medium line-clamp-2 ${isActive ? 'text-on-surface' : 'text-slate-300'}`}>
                        {qq.questionText || <span className="italic opacity-50">Empty Question</span>}
                      </p>
                    </div>
                    
                    {questions.length > 1 && (
                      <button 
                        className="text-slate-500 hover:text-error opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1"
                        onClick={(e) => { e.stopPropagation(); removeQuestion(i); }}
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    )}
                  </div>
                );
              })}
              
              <button 
                className="w-full py-4 bg-brand-surface text-slate-400 font-bold hover:text-primary transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-sm mt-4 shadow-clay-outer rounded-xl" 
                onClick={addQuestion}
              >
                <span className="material-symbols-outlined">add_circle</span> Add Question
              </button>
            </div>
            
            {/* Right Panel Footer CTA */}
            <div className="p-6 bg-brand-surface border-t border-brand-elevated/40 space-y-3 z-10">
              <button 
                className="w-full py-3 clay-button clay-button-outline text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2"
                onClick={() => handleSave(false)}
                disabled={saving}
              >
                <span className="material-symbols-outlined text-sm">save</span>
                Save Draft
              </button>
              <button 
                className="w-full py-3 clay-button clay-button-primary text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2"
                onClick={() => handleSave(true)}
                disabled={saving}
              >
                <span className="material-symbols-outlined text-sm" style={{fontVariationSettings: "'FILL' 1"}}>send</span>
                Publish Quiz
              </button>
            </div>
          </aside>
          
        </div>
      </main>
    </div>
  );
}
