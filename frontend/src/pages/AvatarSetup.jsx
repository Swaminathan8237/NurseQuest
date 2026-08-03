import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import Avatar, { SKIN_TONES, HAIR_COLORS, FACES, EYES, MOUTHS, HAIRS, DICEBEAR_STYLES } from '../components/Avatar';
import Navbar from '../components/Navbar';

const SCRUB_COLORS = ['#6C5CE7', '#00CEC9', '#00B894', '#FF6B6B', '#FDCB6E', '#FD79A8', '#74B9FF', '#A29BFE', '#55EFC4', '#F39C12'];
const BG_COLORS = ['transparent', 'b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', '10b981', '7c3aed', '06b6d4', 'f59e0b'];
const ACCESSORY_OPTIONS = [
  { key: 'none', label: 'None', icon: 'block' },
  { key: 'cap', label: 'Cap', icon: 'school' },
  { key: 'stethoscope', label: 'Headphones', icon: 'headphones' },
  { key: 'badge', label: 'Badge', icon: 'badge' },
  { key: 'glasses', label: 'Glasses', icon: 'eyeglasses' },
];

export default function AvatarSetup() {
  const { user, updateAvatar } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  // Default mode: 'dicebear' or 'custom'
  const [mode, setMode] = useState(user?.avatar_config?.mode || (user?.avatar_config?.dicebearStyle ? 'dicebear' : 'dicebear'));

  const [config, setConfig] = useState(user?.avatar_config && Object.keys(user.avatar_config).length > 0 ? user.avatar_config : {
    mode: 'dicebear',
    dicebearStyle: 'adventurer',
    seed: user?.name || 'Explorer',
    bgColor: 'transparent',
    face: 0, skin: 0, hair: 0, hairColor: '#1a1a2e', eyes: 0, mouth: 0, accessory: 'cap', scrubsColor: '#6C5CE7'
  });

  const update = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const finalConfig = { ...config, mode };
      await updateAvatar(finalConfig);
      navigate('/student');
    } catch (err) {
      console.error('Avatar save error:', err);
      alert('Failed to save avatar. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const randomize = () => {
    if (mode === 'dicebear') {
      const randomStyle = DICEBEAR_STYLES[Math.floor(Math.random() * DICEBEAR_STYLES.length)].id;
      const randomSeed = Math.random().toString(36).substring(2, 9);
      const randomBg = BG_COLORS[Math.floor(Math.random() * BG_COLORS.length)];
      setConfig(prev => ({
        ...prev,
        mode: 'dicebear',
        dicebearStyle: randomStyle,
        seed: randomSeed,
        bgColor: randomBg,
      }));
    } else {
      setConfig(prev => ({
        ...prev,
        mode: 'custom',
        useDicebear: false,
        dicebearStyle: null,
        face: Math.floor(Math.random() * FACES.length),
        skin: Math.floor(Math.random() * SKIN_TONES.length),
        hair: Math.floor(Math.random() * HAIRS.length),
        hairColor: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)],
        eyes: Math.floor(Math.random() * EYES.length),
        mouth: Math.floor(Math.random() * MOUTHS.length),
        accessory: ACCESSORY_OPTIONS[Math.floor(Math.random() * ACCESSORY_OPTIONS.length)].key,
        scrubsColor: SCRUB_COLORS[Math.floor(Math.random() * SCRUB_COLORS.length)]
      }));
    }
  };

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen pb-32">
      <Navbar />
      
      <main className="px-6 max-w-5xl mx-auto animate-fadeInUp" style={{ paddingTop: '100px' }}>
        <header className="mb-8 text-center">
          <h1 className="text-4xl md:text-5xl font-headline font-extrabold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-[#7C3AED] via-[#A78BFA] to-[#F59E0B] mb-3">
            Avatar Creator Studio
          </h1>
          <p className="text-on-surface-variant font-medium opacity-80 max-w-lg mx-auto">
            Choose between DiceBear API style generators or our built-in custom vector avatar builder.
          </p>

          {/* Generator Engine Mode Switcher Tabs */}
          <div className="inline-flex p-1.5 bg-surface-container-high/80 backdrop-blur-xl rounded-2xl border border-white/10 mt-6 shadow-xl">
            <button
              onClick={() => {
                setMode('dicebear');
                update('mode', 'dicebear');
              }}
              className={`flex items-center gap-2.5 px-6 py-3 rounded-xl font-headline font-black text-sm tracking-wide transition-all duration-300 ${mode === 'dicebear' ? 'bg-gradient-to-r from-[#7C3AED] to-[#8B5CF6] text-white shadow-lg shadow-purple-500/30 scale-105' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
            >
              <span className="material-symbols-outlined text-lg">casino</span>
              DiceBear Avatars
            </button>
            <button
              onClick={() => {
                setMode('custom');
                update('mode', 'custom');
                update('dicebearStyle', null);
              }}
              className={`flex items-center gap-2.5 px-6 py-3 rounded-xl font-headline font-black text-sm tracking-wide transition-all duration-300 ${mode === 'custom' ? 'bg-gradient-to-r from-[#7C3AED] to-[#8B5CF6] text-white shadow-lg shadow-purple-500/30 scale-105' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
            >
              <span className="material-symbols-outlined text-lg">palette</span>
              Classic SVG Builder
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Avatar Preview Section (Left Column) */}
          <div className="lg:col-span-5 flex flex-col items-center gap-6 sticky top-28">
            <div className="relative group w-full flex justify-center">
              {/* Glow background effect */}
              <div className="absolute inset-0 bg-primary/25 blur-[60px] rounded-full scale-110 pointer-events-none"></div>
              
              <div className="w-64 h-64 md:w-80 md:h-80 bg-surface-container-low/50 backdrop-blur-2xl rounded-3xl flex items-center justify-center relative overflow-hidden ring-1 ring-white/15 shadow-2xl transition-transform duration-500 group-hover:scale-105">
                <div className="drop-shadow-[0_0_30px_rgba(183,109,255,0.4)] w-full h-full flex items-center justify-center p-6">
                  <Avatar config={{ ...config, mode }} size={240} showBg={false} />
                </div>
              </div>
            </div>

            <div className="flex flex-col w-full gap-4 items-center">
              <div className="flex flex-col items-center mb-2">
                <span className="font-display font-bold text-2xl text-on-surface">{user?.name || 'Explorer'}</span>
              </div>
              
              <div className="flex gap-4 w-full">
                <button 
                  onClick={randomize}
                  className="flex-1 py-4 px-6 rounded-2xl bg-tertiary text-on-tertiary font-headline font-bold flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-95 shadow-md"
                >
                  <span className="material-symbols-outlined text-xl">shuffle</span>
                  Randomize
                </button>
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-4 px-6 rounded-2xl bg-gradient-to-br from-primary-container to-primary text-on-primary font-headline font-bold flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(183,109,255,0.4)] transition-all hover:scale-[1.02] active:scale-95"
                >
                  <span className="material-symbols-outlined text-xl">save</span>
                  {saving ? 'Saving...' : 'Save Avatar'}
                </button>
              </div>
              
              <button 
                onClick={() => navigate('/student')}
                className="text-sm font-headline text-on-surface-variant hover:text-primary transition-colors mt-2"
              >
                Skip for now
              </button>
            </div>
          </div>

          {/* Customization Controls (Right Column) */}
          <div className="lg:col-span-7 space-y-6">

            {/* ══════════ MODE 1: DICEBEAR API STUDIO ══════════ */}
            {mode === 'dicebear' && (
              <>
                {/* DiceBear Style Picker */}
                <section className="bg-surface-variant/20 backdrop-blur-xl p-8 rounded-3xl ring-1 ring-white/10 shadow-lg">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-amber-400 text-2xl">auto_awesome</span>
                      <div>
                        <h2 className="text-xl font-headline font-bold text-on-surface">DiceBear Avatar Style</h2>
                        <p className="text-xs text-on-surface-variant">Select an API style framework</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {DICEBEAR_STYLES.map(style => {
                      const isActive = (config.dicebearStyle || 'adventurer') === style.id;
                      const previewUrl = `https://api.dicebear.com/9.x/${style.id}/svg?seed=${encodeURIComponent(config.seed || 'Preview')}`;

                      return (
                        <button
                          key={style.id}
                          onClick={() => {
                            update('dicebearStyle', style.id);
                            update('mode', 'dicebear');
                          }}
                          className={`p-3.5 rounded-2xl flex flex-col items-center gap-2 transition-all text-center border ${isActive ? 'bg-primary/15 border-primary ring-2 ring-primary/40 shadow-lg scale-102' : 'bg-surface-container-low/50 border-outline-variant/30 hover:bg-surface-container-high'}`}
                        >
                          <img src={previewUrl} alt={style.name} className="w-12 h-12 object-contain rounded-full bg-black/20 p-1" />
                          <div>
                            <div className="text-xs font-headline font-bold text-on-surface">{style.name}</div>
                            <div className="text-[10px] text-on-surface-variant font-mono opacity-80">{style.desc}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Seed Input & Customization */}
                <section className="bg-surface-variant/20 backdrop-blur-xl p-8 rounded-3xl ring-1 ring-white/10 shadow-lg space-y-6">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary text-2xl">key</span>
                    <div>
                      <h2 className="text-xl font-headline font-bold text-on-surface">Seed Generator</h2>
                      <p className="text-xs text-on-surface-variant">Type any text to morph the avatar features</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={config.seed || ''}
                      onChange={(e) => update('seed', e.target.value)}
                      placeholder="Enter seed phrase..."
                      className="flex-1 px-4 py-3.5 bg-surface-container-low border border-outline-variant/40 rounded-xl text-on-surface font-headline font-bold text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button
                      onClick={() => update('seed', Math.random().toString(36).substring(2, 9))}
                      className="px-5 py-3.5 bg-surface-container-high border border-outline-variant/30 hover:bg-primary/20 text-on-surface rounded-xl font-headline font-bold text-xs flex items-center gap-2 transition-all"
                    >
                      <span className="material-symbols-outlined text-sm">casino</span>
                      Shuffle Seed
                    </button>
                  </div>

                  {/* Background Color selector */}
                  <div>
                    <p className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-widest mb-3">Background Canvas</p>
                    <div className="flex flex-wrap gap-3">
                      {BG_COLORS.map((bg, idx) => (
                        <button
                          key={idx}
                          onClick={() => update('bgColor', bg)}
                          className={`w-10 h-10 rounded-full border-2 transition-all ${config.bgColor === bg ? 'border-primary ring-2 ring-primary/40 scale-110' : 'border-outline-variant/40 hover:scale-105'}`}
                          style={{ backgroundColor: bg === 'transparent' ? '#1E1B3A' : `#${bg}` }}
                          title={bg}
                        />
                      ))}
                    </div>
                  </div>
                </section>
              </>
            )}

            {/* ══════════ MODE 2: CLASSIC SVG BUILDER ══════════ */}
            {mode === 'custom' && (
              <>
                {/* Face & Skin Section */}
                <section className="bg-surface-variant/20 backdrop-blur-xl p-8 rounded-2xl ring-1 ring-white/10 shadow-lg">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="material-symbols-outlined text-tertiary">face</span>
                    <h2 className="text-xl font-headline font-bold text-on-surface">Face & Skin</h2>
                  </div>
                  
                  <div className="space-y-8">
                    <div>
                      <p className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-widest mb-4">Face Shape</p>
                      <div className="flex flex-wrap gap-4">
                        {FACES.map((_, i) => (
                          <button 
                            key={i} 
                            className={`w-14 h-14 rounded-full bg-surface-container-highest transition-all flex items-center justify-center overflow-hidden ${config.face === i ? 'ring-2 ring-primary shadow-[0_0_15px_rgba(221,183,255,0.4)]' : 'ring-1 ring-outline-variant hover:ring-primary/50'}`} 
                            onClick={() => update('face', i)}
                          >
                            <Avatar config={{...config, face: i, mode: 'custom'}} size={60} showBg={false} />
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <p className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-widest mb-4">Skin Tone</p>
                      <div className="flex flex-wrap gap-3">
                        {SKIN_TONES.map((color, i) => (
                          <button 
                            key={i} 
                            className={`w-11 h-11 rounded-full transition-all ${config.skin === i ? 'ring-2 ring-offset-2 ring-offset-surface ring-primary scale-110 shadow-[0_0_10px_rgba(221,183,255,0.5)]' : 'hover:scale-110 shadow-sm'}`}
                            style={{ backgroundColor: color }}
                            onClick={() => update('skin', i)}
                          ></button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Hair Style Section */}
                <section className="bg-surface-variant/20 backdrop-blur-xl p-8 rounded-2xl ring-1 ring-white/10 shadow-lg">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="material-symbols-outlined text-primary">content_cut</span>
                    <h2 className="text-xl font-headline font-bold text-on-surface">Hair & Color</h2>
                  </div>
                  
                  <div className="space-y-8">
                    <div>
                      <p className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-widest mb-4">Hair Style</p>
                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-4">
                        {HAIRS.map((_, i) => (
                          <button 
                            key={i} 
                            className={`aspect-square rounded-xl flex items-center justify-center transition-all overflow-hidden ${config.hair === i ? 'bg-surface-container-highest ring-2 ring-primary shadow-[0_0_15px_rgba(221,183,255,0.3)]' : 'bg-surface-container-low hover:bg-surface-container-highest border border-outline-variant/30'}`}
                            onClick={() => update('hair', i)}
                          >
                            <Avatar config={{...config, hair: i, mode: 'custom'}} size={64} showBg={false} />
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <p className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-widest mb-4">Hair Color</p>
                      <div className="flex flex-wrap gap-3">
                        {HAIR_COLORS.map((color, i) => (
                          <button 
                            key={i} 
                            className={`w-11 h-11 rounded-full transition-all ${config.hairColor === color ? 'ring-2 ring-offset-2 ring-offset-surface ring-primary scale-110 shadow-[0_0_10px_rgba(221,183,255,0.5)]' : 'hover:scale-110 shadow-sm'}`}
                            style={{ backgroundColor: color }}
                            onClick={() => update('hairColor', color)}
                          ></button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Accessories & Scrubs */}
                <section className="bg-surface-variant/20 backdrop-blur-xl p-8 rounded-2xl ring-1 ring-white/10 shadow-lg">
                  <p className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-widest mb-6">Clinical Accessories</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {ACCESSORY_OPTIONS.map(acc => (
                      <button 
                        key={acc.key}
                        className={`flex flex-col items-center justify-center gap-3 p-4 rounded-xl transition-all ${config.accessory === acc.key ? 'bg-primary-container text-on-primary-container ring-2 ring-primary shadow-[0_0_15px_rgba(221,183,255,0.3)]' : 'bg-surface-container-low text-on-surface-variant border border-outline-variant/30 hover:bg-surface-container-high'}`}
                        onClick={() => update('accessory', acc.key)}
                      >
                        <span className="material-symbols-outlined text-3xl">{acc.icon}</span>
                        <span className="text-xs font-bold uppercase tracking-wider">{acc.label}</span>
                      </button>
                    ))}
                  </div>
                </section>
              </>
            )}

          </div>
        </div>

        {/* ══════════ FOOTER CREDIT ══════════ */}
        <footer className="mt-16 text-center border-t border-outline-variant/20 pt-8 flex flex-col items-center justify-center gap-2">
          <div className="flex items-center gap-2 text-xs font-headline font-bold text-on-surface-variant/80">
            <span className="material-symbols-outlined text-amber-400 text-sm">auto_awesome</span>
            <span>Powered by <a href="https://dicebear.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-extrabold">DiceBear</a></span>
          </div>
          <p className="text-[11px] text-on-surface-variant/50 font-mono">Open-source avatar library & API</p>
        </footer>
      </main>
    </div>
  );
}
