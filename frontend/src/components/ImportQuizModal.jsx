import { useState, useEffect, useRef, useCallback } from 'react';
import { quizAPI, moduleAPI } from '../api';

/* ─── Captcha Bounding-Box Editor ─── */
function CaptchaBoundingBoxEditor({ imageUrl, value, onChange }) {
  const containerRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [startPt, setStartPt] = useState(null);
  const [box, setBox] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizing, setResizing] = useState(null); // 'nw','ne','sw','se' or null
  const [imgLoaded, setImgLoaded] = useState(false);

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
      if (pos.x >= box.x && pos.x <= box.x + box.w && pos.y >= box.y && pos.y <= box.y + box.h) {
        setDragging(true);
        setDragOffset({ x: pos.x - box.x, y: pos.y - box.y });
        return;
      }
    }

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
        {box && imgLoaded && (
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
            <div className="absolute inset-0 bg-black/40" />
            <div
              className="absolute border-2 border-primary shadow-[0_0_20px_rgba(0,229,255,0.6)]"
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
          </div>
        )}
        {!box && imgLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
            <div className="bg-surface/80 backdrop-blur-sm px-6 py-3 rounded-xl border border-outline-variant/30 text-center">
              <span className="material-symbols-outlined text-primary text-3xl block mb-1">center_focus_strong</span>
              <p className="text-sm font-medium text-on-surface">Click & drag to select correct captcha box region</p>
            </div>
          </div>
        )}
      </div>
      {box && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-primary/70 font-mono">
            <span className="material-symbols-outlined text-[14px]">check_circle</span>
            Box coordinates: x:{box.x.toFixed(2)}, y:{box.y.toFixed(2)}, w:{box.w.toFixed(2)}, h:{box.h.toFixed(2)}
          </div>
          <button type="button" className="text-xs text-error hover:text-error/80 font-bold transition-colors" onClick={clearBox}>
            Clear region selection
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

export default function ImportQuizModal({ onClose, onImportSuccess }) {
  const [stage, setStage] = useState('upload'); // 'upload' | 'preview' | 'saving'
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [warnings, setWarnings] = useState([]);

  // Quiz metadata
  const [quizMeta, setQuizMeta] = useState({
    title: '',
    description: '',
    category: 'General Nursing',
    difficulty: 'medium',
    unit: 1,
    timePerQuestion: 30,
    moduleId: ''
  });

  const [questions, setQuestions] = useState([]);
  const [activeQ, setActiveQ] = useState(0);
  const [modules, setModules] = useState([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  useEffect(() => {
    moduleAPI.getAll().then(data => setModules(data)).catch(console.error);
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('border-primary', 'bg-primary/5');
  };

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove('border-primary', 'bg-primary/5');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('border-primary', 'bg-primary/5');
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) processFileSelection(droppedFile);
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) processFileSelection(selectedFile);
  };

  const processFileSelection = (selectedFile) => {
    const ext = selectedFile.name.split('.').pop().toLowerCase();
    if (!['pdf', 'docx', 'txt', 'zip'].includes(ext)) {
      setError('Only PDF, DOCX, TXT, and ZIP files are allowed.');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File size exceeds 10MB limit.');
      return;
    }
    setFile(selectedFile);
    setError('');
  };

  const handleUploadSubmit = async () => {
    if (!file) return;
    setStage('saving');
    setError('');

    try {
      const data = await quizAPI.importFile(file);
      setQuizMeta(prev => ({
        ...prev,
        title: data.title || 'Imported Quiz'
      }));

      // Standardize questions formats to ensure no missing fields
      const formattedQs = (data.questions || []).map(q => ({
        type: q.type || 'mcq',
        questionText: q.questionText || '',
        mediaUrl: q.mediaUrl || '',
        options: Array.isArray(q.options) ? q.options : ['', '', '', ''],
        correctAnswer: q.correctAnswer || '',
        explanation: q.explanation || '',
        points: q.points || 1000,
        sliderMin: q.sliderMin !== undefined && q.sliderMin !== null ? q.sliderMin : 0,
        sliderMax: q.sliderMax !== undefined && q.sliderMax !== null ? q.sliderMax : 100,
        sliderStep: q.sliderStep !== undefined && q.sliderStep !== null ? q.sliderStep : 1,
        sliderUnit: q.sliderUnit || '',
        matchingPairs: Array.isArray(q.matchingPairs) ? q.matchingPairs : ['', '', '', ''],
        _unresolvedMedia: q._unresolvedMedia || null
      }));

      setQuestions(formattedQs);
      setWarnings(data.warnings || []);
      setStage('preview');
      setActiveQ(0);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to upload and parse file.');
      setStage('upload');
    }
  };

  const handleMediaUpload = async (qIndex, fileObj) => {
    setUploadingMedia(true);
    try {
      const data = await quizAPI.uploadMedia(fileObj);

      setQuestions(prev => prev.map((q, idx) => {
        if (idx !== qIndex) return q;
        const updated = { ...q, mediaUrl: data.url };
        delete updated._unresolvedMedia;
        return updated;
      }));
    } catch (err) {
      console.error(err);
      alert('Upload failed: ' + err.message);
    } finally {
      setUploadingMedia(false);
    }
  };

  const updateQuestion = (i, field, value) => {
    setQuestions(prev => prev.map((q, idx) => idx === i ? { ...q, [field]: value } : q));
  };

  const updateOption = (qi, oi, value) => {
    setQuestions(prev => prev.map((q, idx) => {
      if (idx !== qi) return q;
      const opts = [...q.options];
      opts[oi] = value;
      return { ...q, options: opts };
    }));
  };

  const addOption = (qi) => {
    setQuestions(prev => prev.map((q, idx) => {
      if (idx !== qi) return q;
      return { ...q, options: [...q.options, ''] };
    }));
  };

  const removeOption = (qi, oi) => {
    setQuestions(prev => prev.map((q, idx) => {
      if (idx !== qi) return q;
      if (q.options.length <= 2) return q;
      const opts = q.options.filter((_, i) => i !== oi);
      return { ...q, options: opts };
    }));
  };

  const deleteQuestion = (i) => {
    if (questions.length <= 1) return;
    setQuestions(prev => prev.filter((_, idx) => idx !== i));
    setActiveQ(prev => Math.max(0, Math.min(prev, questions.length - 2)));
  };

  // Standardize normalization matching backend
  const normalize = (str) => (str || '').toString().toUpperCase().trim();

  // Validate questions to catch errors early
  const getQuestionErrors = (q, i) => {
    const errors = [];
    if (!q.questionText || !q.questionText.trim()) {
      errors.push('Question text is required.');
    }

    switch (q.type) {
      case 'mcq':
      case 'image':
      case 'video':
      case 'audio': {
        const opts = (q.options || []).filter(o => o.trim() !== '');
        if (opts.length < 2) {
          errors.push('Needs at least 2 non-empty options.');
        } else if (!q.correctAnswer || !q.correctAnswer.trim()) {
          errors.push('Correct answer is required.');
        } else {
          const hasMatch = opts.some(o => normalize(o) === normalize(q.correctAnswer));
          if (!hasMatch) {
            errors.push('Answer must match one of the options.');
          }
        }
        if (['image', 'video', 'audio'].includes(q.type) && !q.mediaUrl) {
          errors.push(`${q.type} question requires media file attached.`);
        }
        break;
      }
      case 'matching': {
        const opts = (q.options || []).filter(o => o.trim() !== '');
        const pairs = (q.matchingPairs || []).filter(p => p.trim() !== '');
        if (opts.length < 2 || pairs.length < 2 || opts.length !== pairs.length) {
          errors.push('Matching requires at least 2 complete pairs.');
        }
        break;
      }
      case 'jumbled_sequence': {
        let steps = [];
        try {
          steps = typeof q.correctAnswer === 'string' ? JSON.parse(q.correctAnswer) : q.correctAnswer;
        } catch { }
        if (!Array.isArray(steps)) {
          steps = q.options || [];
        }
        const validSteps = steps.filter(s => s && s.trim() !== '');
        if (validSteps.length < 2) {
          errors.push('Sequence order requires at least 2 steps.');
        }
        break;
      }
      case 'jumbled_letters': {
        if (!q.correctAnswer || !q.correctAnswer.trim()) {
          errors.push('Correct word is required.');
        }
        break;
      }
      case 'slider': {
        const min = parseFloat(q.sliderMin);
        const max = parseFloat(q.sliderMax);
        const ans = parseFloat(q.correctAnswer);
        if (isNaN(min) || isNaN(max) || min >= max) {
          errors.push('Min value must be less than Max value.');
        } else if (isNaN(ans) || ans < min || ans > max) {
          errors.push(`Answer must be a number between ${min} and ${max}.`);
        }
        break;
      }
      case 'captcha': {
        if (!q.mediaUrl) {
          errors.push('Captcha requires an image.');
        }
        if (!q.correctAnswer || q.correctAnswer === '{}') {
          errors.push('Please draw/select the correct region box on the image.');
        }
        break;
      }
    }
    return errors;
  };

  const allErrorsMap = questions.map((q, idx) => getQuestionErrors(q, idx));
  const hasErrors = allErrorsMap.some(errs => errs.length > 0) || !quizMeta.title.trim();

  const handleConfirmSave = async () => {
    if (hasErrors) return;
    setStage('saving');
    setError('');

    try {
      const payload = {
        title: quizMeta.title,
        description: quizMeta.description,
        category: quizMeta.category,
        difficulty: quizMeta.difficulty,
        unit: quizMeta.unit === null ? null : (parseInt(quizMeta.unit) || 1),
        timePerQuestion: parseInt(quizMeta.timePerQuestion) || 30,
        moduleId: quizMeta.moduleId || null,
        questions: questions.map(q => {
          // Standardize JSON correctAnswers for matching & sequence
          let processedAns = q.correctAnswer;
          if (q.type === 'matching') {
            const opts = q.options.filter(o => o.trim());
            const pairs = q.matchingPairs.slice(0, opts.length);
            processedAns = JSON.stringify(Object.fromEntries(opts.map((opt, idx) => [opt, pairs[idx] || ''])));
          } else if (q.type === 'jumbled_sequence') {
            processedAns = JSON.stringify(q.options.filter(o => o.trim()));
          }
          return {
            type: q.type,
            questionText: q.questionText,
            mediaUrl: q.mediaUrl || null,
            options: q.options.filter(o => o.trim()),
            correctAnswer: processedAns,
            explanation: q.explanation,
            points: q.points || 1000,
            sliderMin: q.type === 'slider' ? q.sliderMin : null,
            sliderMax: q.type === 'slider' ? q.sliderMax : null,
            sliderStep: q.type === 'slider' ? q.sliderStep : null,
            sliderUnit: q.type === 'slider' ? q.sliderUnit : null,
            matchingPairs: q.type === 'matching' ? q.matchingPairs.filter(p => p.trim()) : null
          };
        })
      };

      const newQuiz = await quizAPI.confirmImport(payload);
      onImportSuccess(newQuiz);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to save imported quiz.');
      setStage('preview');
    }
  };

  const activeQuestion = questions[activeQ];
  const activeErrors = allErrorsMap[activeQ] || [];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl w-full max-w-5xl shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden animate-fadeInUp">

        {/* Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-surface-container/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined">upload_file</span>
            </div>
            <div>
              <h2 className="text-xl font-headline font-extrabold text-on-surface">Import Quiz</h2>
              <p className="text-xs text-slate-400">Generate high-fidelity quiz questions automatically</p>
            </div>
          </div>
          <button className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-slate-400 hover:text-on-surface" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Errors / Message banner */}
        {error && (
          <div className="bg-danger-light text-danger text-sm font-semibold p-4 flex items-center gap-2 border-b border-danger/20">
            <span className="material-symbols-outlined text-[18px]">error</span>
            {error}
          </div>
        )}

        {/* Stage 1: Upload */}
        {stage === 'upload' && (
          <div className="p-8 flex flex-col items-center justify-center space-y-6 flex-1 overflow-y-auto min-h-[350px]">
            <div
              className={`w-full max-w-lg border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer group flex flex-col items-center justify-center space-y-4 ${file ? 'border-primary bg-primary/5' : 'border-outline-variant/30 hover:border-primary/50 hover:bg-primary/5'}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('import-file-selector').click()}
            >
              <div className="w-16 h-16 rounded-full bg-surface-container-highest flex items-center justify-center text-slate-400 group-hover:text-primary group-hover:scale-110 transition-all shadow-md">
                <span className="material-symbols-outlined text-4xl">cloud_upload</span>
              </div>
              <div>
                <p className="text-base font-bold text-on-surface">Drag & drop your quiz file here</p>
                <p className="text-xs text-slate-400 mt-1">Accepts Word (.docx), PDF (.pdf), Text (.txt), or media ZIP (.zip) bundles</p>
              </div>
              <input id="import-file-selector" type="file" className="hidden" accept=".pdf,.docx,.txt,.zip" onChange={handleFileChange} />

              {file ? (
                <div className="bg-primary/10 border border-primary/20 rounded-xl px-4 py-2 flex items-center gap-3 text-sm text-primary font-bold animate-pulse">
                  <span className="material-symbols-outlined text-lg">description</span>
                  {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </div>
              ) : (
                <button type="button" className="btn btn-secondary btn-sm rounded-full">
                  Browse Files
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button className="btn btn-secondary rounded-xl px-6" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary rounded-xl px-8" onClick={handleUploadSubmit} disabled={!file}>
                Parse Document
              </button>
            </div>
          </div>
        )}

        {/* Stage 2: Preview / Edit */}
        {stage === 'preview' && (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* Warnings list */}
            {warnings.length > 0 && (
              <div className="bg-warning-light text-warning text-xs font-semibold p-4 max-h-[100px] overflow-y-auto border-b border-warning/20">
                <p className="font-bold flex items-center gap-1 mb-1 text-sm"><span className="material-symbols-outlined text-[16px]">warning</span> Import Warnings/Adjustments:</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {warnings.map((w, wi) => <li key={wi}>{w}</li>)}
                </ul>
              </div>
            )}

            {/* Split Editor workspace */}
            <div className="flex-1 flex overflow-hidden min-h-0">

              {/* Left sidebar: Questions navigation */}
              <div className="w-1/3 border-r border-white/5 bg-surface-container/20 flex flex-col overflow-y-auto">
                <div className="p-4 border-b border-white/5 space-y-4">
                  <h3 className="font-headline font-bold text-sm text-slate-400 uppercase tracking-wider">Quiz Metadata</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Quiz Title *</label>
                      <input
                        className={`w-full bg-surface-container-high border rounded px-3 py-2 text-sm text-on-surface outline-none ${!quizMeta.title.trim() ? 'border-danger' : 'border-outline-variant/30'}`}
                        value={quizMeta.title}
                        onChange={e => setQuizMeta({ ...quizMeta, title: e.target.value })}
                        placeholder="Enter quiz title"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Unit</label>
                      <select
                        className="w-full bg-surface-container-high border border-outline-variant/30 rounded px-3 py-2 text-sm text-on-surface outline-none"
                        value={quizMeta.unit === null ? 'standalone' : quizMeta.unit}
                        onChange={e => setQuizMeta({ ...quizMeta, unit: e.target.value === 'standalone' ? null : (parseInt(e.target.value) || 1) })}
                      >
                        <option value="standalone">None (Standalone / Practice)</option>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(u => (
                          <option key={u} value={u}>Unit {u}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Category</label>
                        <select
                          className="w-full bg-surface-container-high border border-outline-variant/30 rounded px-2 py-2 text-xs text-on-surface outline-none"
                          value={quizMeta.category}
                          onChange={e => setQuizMeta({ ...quizMeta, category: e.target.value })}
                        >
                          <option value="General Nursing">General Nursing</option>
                          <option value="Patient Care">Patient Care</option>
                          <option value="Pharmacology">Pharmacology</option>
                          <option value="Anatomy">Anatomy</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Difficulty</label>
                        <select
                          className="w-full bg-surface-container-high border border-outline-variant/30 rounded px-2 py-2 text-xs text-on-surface outline-none"
                          value={quizMeta.difficulty}
                          onChange={e => setQuizMeta({ ...quizMeta, difficulty: e.target.value })}
                        >
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 border-b border-white/5 flex items-center justify-between bg-surface-container/10">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Parsed Questions ({questions.length})</span>
                </div>

                <div className="flex-1 divide-y divide-white/5">
                  {questions.map((q, idx) => {
                    const isSelected = idx === activeQ;
                    const errs = allErrorsMap[idx] || [];
                    const typeConfig = Q_TYPES.find(t => t.value === q.type);
                    return (
                      <div
                        key={idx}
                        className={`p-4 cursor-pointer hover:bg-surface-container/40 transition-colors flex items-start justify-between gap-3 ${isSelected ? 'bg-primary/10 border-l-4 border-primary' : ''}`}
                        onClick={() => setActiveQ(idx)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold text-primary">#{idx + 1}</span>
                            <span className="material-symbols-outlined text-xs text-slate-500">{typeConfig?.icon}</span>
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider truncate">{typeConfig?.label}</span>
                          </div>
                          <p className="text-sm font-semibold text-on-surface truncate pr-2">
                            {q.questionText || <span className="text-slate-500 italic">Empty question...</span>}
                          </p>
                          {q._unresolvedMedia && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-warning bg-warning/10 px-2 py-0.5 rounded mt-1.5 animate-pulse">
                              <span className="material-symbols-outlined text-[12px]">link_off</span>
                              Media upload required
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {errs.length > 0 && (
                            <span className="w-2.5 h-2.5 rounded-full bg-danger shadow-[0_0_8px_rgba(255,49,49,0.8)]" title={`${errs.length} errors`} />
                          )}
                          <button
                            type="button"
                            className="p-1 text-slate-500 hover:text-error transition-colors"
                            onClick={(e) => { e.stopPropagation(); deleteQuestion(idx); }}
                            disabled={questions.length <= 1}
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right side: Detailed question editor */}
              {activeQuestion && (
                <div className="w-2/3 p-6 overflow-y-auto space-y-6 bg-surface-container-lowest/30">
                  {/* Validation errors banner */}
                  {activeErrors.length > 0 && (
                    <div className="bg-danger/10 border border-danger/20 text-danger text-xs font-bold p-3 rounded-lg flex flex-col gap-1">
                      <span className="flex items-center gap-1 font-black uppercase tracking-wider text-xs"><span className="material-symbols-outlined text-sm">error</span> Issues to resolve:</span>
                      <ul className="list-disc pl-5">
                        {activeErrors.map((err, ei) => <li key={ei}>{err}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Question type selector grid */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Question Type</label>
                    <div className="grid grid-cols-5 gap-2">
                      {Q_TYPES.map(t => {
                        const isActive = activeQuestion.type === t.value;
                        return (
                          <button
                            key={t.value}
                            type="button"
                            className={`py-2 px-1.5 rounded-lg flex flex-col items-center justify-center gap-1 transition-all border ${isActive ? 'bg-primary/10 border-primary text-primary shadow-[0_0_10px_rgba(0,229,255,0.2)]' : 'bg-surface-container border-transparent text-slate-400 hover:bg-surface-container-high hover:text-on-surface'}`}
                            onClick={() => updateQuestion(activeQ, 'type', t.value)}
                          >
                            <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-center">{t.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Question text */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Question Text</label>
                    <textarea
                      className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface font-body text-base focus:border-primary outline-none h-24 resize-none shadow-inner"
                      value={activeQuestion.questionText}
                      onChange={e => updateQuestion(activeQ, 'questionText', e.target.value)}
                      placeholder="Enter question text here..."
                    />
                  </div>

                  {/* Media Upload (if media type) */}
                  {['image', 'video', 'audio', 'captcha'].includes(activeQuestion.type) && (
                    <div className="space-y-3">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Attach Media {activeQuestion.type === 'video' ? '(Video)' : activeQuestion.type === 'audio' ? '(Audio)' : '(Image)'}
                      </label>

                      {activeQuestion._unresolvedMedia && (
                        <div className="bg-warning-light border border-warning/20 text-warning text-xs font-bold p-3 rounded-lg flex items-center gap-2">
                          <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                          <span>Original file named <strong className="font-mono bg-warning/10 px-1 rounded">{activeQuestion._unresolvedMedia}</strong> was referenced in text. Please upload it below.</span>
                        </div>
                      )}

                      <div
                        className={`relative border-2 border-dashed rounded-xl p-5 text-center transition-all cursor-pointer group flex flex-col items-center justify-center space-y-2 ${activeQuestion.mediaUrl ? 'border-primary/40 bg-primary/5' : 'border-outline-variant/30 hover:border-primary/50 bg-surface-container hover:bg-primary/5'}`}
                        onClick={() => document.getElementById(`media-picker-${activeQ}`).click()}
                      >
                        {uploadingMedia && (
                          <div className="absolute inset-0 bg-surface/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center z-20">
                            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mb-2"></div>
                            <p className="text-xs text-primary font-bold">Uploading media...</p>
                          </div>
                        )}
                        {activeQuestion.mediaUrl ? (
                          <div className="space-y-2 w-full">
                            {activeQuestion.type === 'image' && (
                              <img src={activeQuestion.mediaUrl} alt="Preview" className="max-h-32 mx-auto rounded shadow-sm object-contain" />
                            )}
                            {activeQuestion.type === 'video' && (
                              <video src={activeQuestion.mediaUrl} className="max-h-32 mx-auto rounded shadow-sm" />
                            )}
                            {activeQuestion.type === 'audio' && (
                              <audio src={activeQuestion.mediaUrl} controls className="mx-auto" />
                            )}
                            <div className="text-xs text-primary font-bold flex items-center justify-center gap-1">
                              <span className="material-symbols-outlined text-sm">check_circle</span> Attached: {activeQuestion.mediaUrl.split('/').pop()}
                            </div>
                            <button
                              type="button"
                              className="text-[10px] text-error hover:text-error/80 font-bold transition-colors"
                              onClick={(e) => { e.stopPropagation(); updateQuestion(activeQ, 'mediaUrl', ''); }}
                            >
                              Remove file
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-3xl text-slate-400 group-hover:text-primary transition-colors">upload_file</span>
                            <p className="text-xs font-bold text-slate-400 group-hover:text-on-surface">Click to select or drag & drop file</p>
                          </>
                        )}
                        <input
                          id={`media-picker-${activeQ}`}
                          type="file"
                          className="hidden"
                          accept={['image', 'captcha'].includes(activeQuestion.type) ? 'image/*' : activeQuestion.type === 'video' ? 'video/*' : 'audio/*'}
                          onChange={e => {
                            const fileObj = e.target.files[0];
                            if (fileObj) handleMediaUpload(activeQ, fileObj);
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* MCQ Options List */}
                  {['mcq', 'image', 'video', 'audio'].includes(activeQuestion.type) && (
                    <div className="space-y-3">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Answer Options</label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {activeQuestion.options.map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-2 bg-surface-container rounded-lg p-2 pl-3 border border-outline-variant/20 focus-within:border-primary/50 transition-colors">
                            <span className="font-mono text-xs font-bold text-slate-500">{(oi + 10).toString(36).toUpperCase()})</span>
                            <input
                              className="bg-transparent border-none text-sm text-on-surface flex-1 outline-none font-medium"
                              value={opt}
                              onChange={e => updateOption(activeQ, oi, e.target.value)}
                              placeholder={`Option ${oi + 1}`}
                            />
                            {activeQuestion.options.length > 2 && (
                              <button
                                type="button"
                                className="text-slate-500 hover:text-error p-1"
                                onClick={() => removeOption(activeQ, oi)}
                              >
                                <span className="material-symbols-outlined text-sm">close</span>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="py-2 w-full border border-dashed border-outline-variant/40 rounded-lg text-slate-400 font-bold hover:text-primary hover:border-primary/50 text-xs transition-colors flex items-center justify-center gap-1"
                        onClick={() => addOption(activeQ)}
                      >
                        <span className="material-symbols-outlined text-sm">add</span> Add Option
                      </button>
                    </div>
                  )}

                  {/* Matching Pairs List */}
                  {activeQuestion.type === 'matching' && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Matching Pairs</label>
                        <p className="text-[10px] text-primary/70 font-semibold">Pairs will be scrambled on quiz play</p>
                      </div>
                      <div className="space-y-2">
                        {activeQuestion.options.map((leftItem, pi) => (
                          <div key={pi} className="flex items-center gap-2">
                            <input
                              className="flex-1 bg-surface-container border border-outline-variant/30 rounded-lg p-2.5 text-xs text-on-surface outline-none font-medium focus:border-primary"
                              value={leftItem}
                              onChange={e => {
                                const opts = [...activeQuestion.options];
                                opts[pi] = e.target.value;
                                updateQuestion(activeQ, 'options', opts);
                              }}
                              placeholder="Left term"
                            />
                            <span className="material-symbols-outlined text-slate-500 text-sm">compare_arrows</span>
                            <input
                              className="flex-1 bg-surface-container border border-outline-variant/30 rounded-lg p-2.5 text-xs text-on-surface outline-none font-medium focus:border-[#71d7cd]"
                              value={activeQuestion.matchingPairs[pi] || ''}
                              onChange={e => {
                                const pairs = [...activeQuestion.matchingPairs];
                                pairs[pi] = e.target.value;
                                updateQuestion(activeQ, 'matchingPairs', pairs);
                              }}
                              placeholder="Right matching match"
                            />
                            {activeQuestion.options.length > 2 && (
                              <button
                                type="button"
                                className="text-slate-500 hover:text-error p-1"
                                onClick={() => {
                                  const opts = activeQuestion.options.filter((_, idx) => idx !== pi);
                                  const pairs = activeQuestion.matchingPairs.filter((_, idx) => idx !== pi);
                                  updateQuestion(activeQ, 'options', opts);
                                  updateQuestion(activeQ, 'matchingPairs', pairs);
                                }}
                              >
                                <span className="material-symbols-outlined text-sm">close</span>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="py-2.5 w-full border border-dashed border-outline-variant/40 rounded-lg text-slate-400 font-bold hover:text-primary hover:border-primary/50 text-xs transition-colors flex items-center justify-center gap-1"
                        onClick={() => {
                          updateQuestion(activeQ, 'options', [...activeQuestion.options, '']);
                          updateQuestion(activeQ, 'matchingPairs', [...activeQuestion.matchingPairs, '']);
                        }}
                      >
                        <span className="material-symbols-outlined text-sm">add</span> Add Pair
                      </button>
                    </div>
                  )}

                  {/* Jumbled Sequence Steps */}
                  {activeQuestion.type === 'jumbled_sequence' && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Sequence Steps (Correct Order)</label>
                        <p className="text-[10px] text-primary/70 font-semibold">Steps are scrambled for students</p>
                      </div>
                      <div className="space-y-2">
                        {activeQuestion.options.map((step, si) => (
                          <div key={si} className="flex items-center gap-2 bg-surface-container rounded-lg p-2 pl-3 border border-outline-variant/20">
                            <span className="font-mono text-xs font-bold text-slate-500">#{si + 1}</span>
                            <input
                              className="bg-transparent border-none text-xs text-on-surface flex-1 outline-none font-medium"
                              value={step}
                              onChange={e => {
                                const opts = [...activeQuestion.options];
                                opts[si] = e.target.value;
                                updateQuestion(activeQ, 'options', opts);
                                updateQuestion(activeQ, 'correctAnswer', JSON.stringify(opts));
                              }}
                              placeholder={`Sequence step ${si + 1}`}
                            />
                            {activeQuestion.options.length > 2 && (
                              <button
                                type="button"
                                className="text-slate-500 hover:text-error p-1"
                                onClick={() => {
                                  const opts = activeQuestion.options.filter((_, idx) => idx !== si);
                                  updateQuestion(activeQ, 'options', opts);
                                  updateQuestion(activeQ, 'correctAnswer', JSON.stringify(opts));
                                }}
                              >
                                <span className="material-symbols-outlined text-sm">close</span>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="py-2.5 w-full border border-dashed border-outline-variant/40 rounded-lg text-slate-400 font-bold hover:text-primary hover:border-primary/50 text-xs transition-colors flex items-center justify-center gap-1"
                        onClick={() => {
                          const opts = [...activeQuestion.options, ''];
                          updateQuestion(activeQ, 'options', opts);
                          updateQuestion(activeQ, 'correctAnswer', JSON.stringify(opts));
                        }}
                      >
                        <span className="material-symbols-outlined text-sm">add</span> Add Step
                      </button>
                    </div>
                  )}

                  {/* Jumbled Letters Word */}
                  {activeQuestion.type === 'jumbled_letters' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Correct Word (Scrambled automatically)</label>
                      <input
                        className="w-full bg-surface-container border border-outline-variant/30 rounded-lg px-4 py-3 text-on-surface font-body font-bold text-base uppercase tracking-widest focus:border-primary outline-none"
                        value={activeQuestion.correctAnswer}
                        onChange={e => {
                          const word = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
                          updateQuestion(activeQ, 'correctAnswer', word);
                          updateQuestion(activeQ, 'options', word.split(''));
                        }}
                        placeholder="e.g., HYPOXIA"
                      />
                    </div>
                  )}

                  {/* Slider Config */}
                  {activeQuestion.type === 'slider' && (
                    <div className="space-y-4">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Slider Config & Answer</label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1">Min Value</label>
                          <input
                            type="number"
                            className="w-full bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-2 text-xs text-on-surface focus:border-primary outline-none"
                            value={activeQuestion.sliderMin}
                            onChange={e => updateQuestion(activeQ, 'sliderMin', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1">Max Value</label>
                          <input
                            type="number"
                            className="w-full bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-2 text-xs text-on-surface focus:border-primary outline-none"
                            value={activeQuestion.sliderMax}
                            onChange={e => updateQuestion(activeQ, 'sliderMax', parseFloat(e.target.value) || 100)}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1">Step</label>
                          <input
                            type="number"
                            className="w-full bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-2 text-xs text-on-surface focus:border-primary outline-none"
                            value={activeQuestion.sliderStep}
                            onChange={e => updateQuestion(activeQ, 'sliderStep', parseFloat(e.target.value) || 1)}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1">Unit Label</label>
                          <input
                            type="text"
                            className="w-full bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-2 text-xs text-on-surface focus:border-primary outline-none"
                            value={activeQuestion.sliderUnit}
                            onChange={e => updateQuestion(activeQ, 'sliderUnit', e.target.value)}
                            placeholder="e.g. °C"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Correct Answer Value</label>
                        <input
                          type="number"
                          className="w-full bg-surface-container border border-outline-variant/30 rounded-lg px-4 py-2.5 text-sm font-bold text-on-surface focus:border-primary outline-none"
                          value={activeQuestion.correctAnswer}
                          onChange={e => updateQuestion(activeQ, 'correctAnswer', e.target.value)}
                          placeholder="Correct numeric answer"
                          min={activeQuestion.sliderMin}
                          max={activeQuestion.sliderMax}
                          step={activeQuestion.sliderStep}
                        />
                      </div>
                    </div>
                  )}

                  {/* Captcha Box Drawing */}
                  {activeQuestion.type === 'captcha' && activeQuestion.mediaUrl && (
                    <div className="space-y-3">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Correct Bounding Region</label>
                      <CaptchaBoundingBoxEditor
                        imageUrl={activeQuestion.mediaUrl}
                        value={activeQuestion.correctAnswer}
                        onChange={(boxJson) => updateQuestion(activeQ, 'correctAnswer', boxJson)}
                      />
                    </div>
                  )}

                  {/* Correct Answer Dropdown & Explanation (standardized) */}
                  <div className="pt-6 border-t border-white/5 space-y-4">
                    {['mcq', 'image', 'video', 'audio'].includes(activeQuestion.type) && (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider sm:w-28 shrink-0">Correct Answer</label>
                        <select
                          className="flex-1 bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-2.5 text-xs text-on-surface outline-none"
                          value={activeQuestion.correctAnswer}
                          onChange={e => updateQuestion(activeQ, 'correctAnswer', e.target.value)}
                        >
                          <option value="">Select correct option...</option>
                          {activeQuestion.options.filter(o => o.trim() !== '').map((opt, oidx) => (
                            <option key={oidx} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Clinical Explanation (Optional)</label>
                      <textarea
                        className="w-full bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-2.5 text-xs text-slate-300 font-body focus:border-primary outline-none h-16 resize-none"
                        value={activeQuestion.explanation}
                        onChange={e => updateQuestion(activeQ, 'explanation', e.target.value)}
                        placeholder="Explain the clinical reason why this answer is correct..."
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-white/5 flex items-center justify-between bg-surface-container/50">
              <button className="btn btn-secondary rounded-xl px-6" onClick={() => setStage('upload')}>
                Back to Upload
              </button>
              <div className="flex items-center gap-3">
                <button className="btn btn-ghost rounded-xl px-4 text-xs font-bold text-slate-400" onClick={onClose}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary rounded-xl px-8"
                  onClick={handleConfirmSave}
                  disabled={hasErrors}
                >
                  Confirm & Import Quiz
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stage 3: Saving */}
        {stage === 'saving' && (
          <div className="p-10 flex flex-col items-center justify-center space-y-4 flex-1">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-base font-bold text-on-surface">Uploading and parsing quiz data...</p>
            <p className="text-xs text-slate-400">Please wait. Processing quiz structure and formatting options.</p>
          </div>
        )}
      </div>
    </div>
  );
}
