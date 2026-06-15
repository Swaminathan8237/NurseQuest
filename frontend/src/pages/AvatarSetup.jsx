import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Avatar, { SKIN_TONES, HAIR_COLORS, FACES, EYES, MOUTHS, HAIRS } from '../components/Avatar';
import Navbar from '../components/Navbar';

const SCRUB_COLORS = ['#6C5CE7', '#00CEC9', '#00B894', '#FF6B6B', '#FDCB6E', '#FD79A8', '#74B9FF', '#A29BFE', '#55EFC4', '#F39C12'];
const ACCESSORY_OPTIONS = [
  { key: 'none', label: 'None', icon: 'block' },
  { key: 'cap', label: 'Nurse Cap', icon: 'medical_services' },
  { key: 'stethoscope', label: 'Stethoscope', icon: 'stethoscope' },
  { key: 'badge', label: 'Badge', icon: 'badge' },
  { key: 'glasses', label: 'Glasses', icon: 'eyeglasses' },
];

export default function AvatarSetup() {
  const { user, updateAvatar } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const [config, setConfig] = useState(user?.avatar_config && Object.keys(user.avatar_config).length > 0 ? user.avatar_config : {
    face: 0, skin: 0, hair: 0, hairColor: '#1a1a2e', eyes: 0, mouth: 0, accessory: 'cap', scrubsColor: '#6C5CE7'
  });

  const update = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateAvatar(config);
      navigate('/student');
    } catch (err) {
      console.error('Avatar save error:', err);
      alert('Failed to save avatar. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const randomize = () => {
    setConfig({
      face: Math.floor(Math.random() * FACES.length),
      skin: Math.floor(Math.random() * SKIN_TONES.length),
      hair: Math.floor(Math.random() * HAIRS.length),
      hairColor: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)],
      eyes: Math.floor(Math.random() * EYES.length),
      mouth: Math.floor(Math.random() * MOUTHS.length),
      accessory: ACCESSORY_OPTIONS[Math.floor(Math.random() * ACCESSORY_OPTIONS.length)].key,
      scrubsColor: SCRUB_COLORS[Math.floor(Math.random() * SCRUB_COLORS.length)]
    });
  };

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen pb-32">
      <Navbar />
      
      <main className="px-6 max-w-5xl mx-auto animate-fadeInUp" style={{ paddingTop: '100px' }}>
        <header className="mb-10 text-center">
          <h1 className="text-4xl md:text-5xl font-headline font-extrabold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-primary-container to-tertiary mb-3">
            Create Your Nurse Avatar
          </h1>
          <p className="text-on-surface-variant font-medium opacity-80">
            Personalize your clinical identity in the NurseQuest ecosystem.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Avatar Preview Section (Left Column) */}
          <div className="lg:col-span-5 flex flex-col items-center gap-6 sticky top-28">
            <div className="relative group w-full flex justify-center">
              {/* Glow background effect */}
              <div className="absolute inset-0 bg-primary/20 blur-[60px] rounded-full scale-110 pointer-events-none"></div>
              
              <div className="w-64 h-64 md:w-80 md:h-80 bg-surface-container-low/40 backdrop-blur-2xl rounded-xl flex items-center justify-center relative overflow-hidden ring-1 ring-white/10 shadow-2xl transition-transform duration-700 group-hover:scale-105">
                <div className="drop-shadow-[0_0_30px_rgba(183,109,255,0.3)] w-full h-full flex items-center justify-center">
                  <Avatar config={config} size={280} showBg={false} />
                </div>
              </div>
            </div>

            <div className="flex flex-col w-full gap-4 items-center">
              <div className="flex flex-col items-center mb-2">
                <span className="font-display font-bold text-2xl text-on-surface">{user?.name || 'Intern'}</span>
                <span className="text-xs font-mono tracking-widest uppercase text-tertiary px-3 py-1 bg-tertiary/10 rounded-full mt-2">Nurse Intern</span>
              </div>
              
              <div className="flex gap-4 w-full">
                <button 
                  onClick={randomize}
                  className="flex-1 py-4 px-6 rounded-xl bg-tertiary text-on-tertiary font-headline font-bold flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-95"
                >
                  <span className="material-symbols-outlined text-xl">casino</span>
                  Randomize
                </button>
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-4 px-6 rounded-xl bg-gradient-to-br from-primary-container to-primary text-on-primary font-headline font-bold flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(183,109,255,0.4)] transition-all hover:scale-[1.02] active:scale-95"
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
                        <Avatar config={{...config, face: i}} size={60} showBg={false} />
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
                        className={`w-10 h-10 rounded-full transition-all ${config.skin === i ? 'ring-2 ring-offset-2 ring-offset-surface ring-primary scale-110 shadow-[0_0_10px_rgba(221,183,255,0.5)]' : 'hover:scale-110 shadow-sm'}`}
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
                        <Avatar config={{...config, hair: i}} size={64} showBg={false} />
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
                        className={`w-10 h-10 rounded-full transition-all ${config.hairColor === color ? 'ring-2 ring-offset-2 ring-offset-surface ring-primary scale-110 shadow-[0_0_10px_rgba(221,183,255,0.5)]' : 'hover:scale-110 shadow-sm'}`}
                        style={{ backgroundColor: color }}
                        onClick={() => update('hairColor', color)}
                      ></button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Features Section */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-surface-variant/20 backdrop-blur-xl p-6 rounded-2xl ring-1 ring-white/10 shadow-lg">
                <p className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">visibility</span>
                  Eye Styles
                </p>
                <div className="flex flex-wrap gap-3">
                  {EYES.map((_, i) => (
                    <button 
                      key={i} 
                      className={`w-14 h-14 rounded-xl transition-all flex items-center justify-center overflow-hidden ${config.eyes === i ? 'bg-surface-container-highest ring-2 ring-primary shadow-[0_0_10px_rgba(221,183,255,0.3)]' : 'bg-surface-container-low border border-outline-variant/30 hover:bg-surface-container'}`}
                      onClick={() => update('eyes', i)}
                    >
                      <Avatar config={{...config, eyes: i}} size={48} showBg={false} />
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="bg-surface-variant/20 backdrop-blur-xl p-6 rounded-2xl ring-1 ring-white/10 shadow-lg">
                <p className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">sentiment_satisfied</span>
                  Mouth Styles
                </p>
                <div className="flex flex-wrap gap-3">
                  {MOUTHS.map((_, i) => (
                    <button 
                      key={i} 
                      className={`w-14 h-14 rounded-xl transition-all flex items-center justify-center overflow-hidden ${config.mouth === i ? 'bg-surface-container-highest ring-2 ring-primary shadow-[0_0_10px_rgba(221,183,255,0.3)]' : 'bg-surface-container-low border border-outline-variant/30 hover:bg-surface-container'}`}
                      onClick={() => update('mouth', i)}
                    >
                      <Avatar config={{...config, mouth: i}} size={48} showBg={false} />
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Accessories Section */}
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

            {/* Scrubs Section */}
            <section className="bg-surface-variant/20 backdrop-blur-xl p-8 rounded-2xl ring-1 ring-white/10 shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <p className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-widest">Scrubs Color</p>
              </div>
              <div className="flex flex-wrap gap-4">
                {SCRUB_COLORS.map((color, i) => (
                  <button 
                    key={i} 
                    className={`w-14 h-14 rounded-xl transition-all shadow-md ${config.scrubsColor === color ? 'ring-4 ring-offset-4 ring-offset-surface ring-primary scale-110 shadow-[0_0_15px_rgba(221,183,255,0.5)]' : 'hover:scale-110'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => update('scrubsColor', color)}
                  ></button>
                ))}
              </div>
            </section>
            
          </div>
        </div>
      </main>
    </div>
  );
}
