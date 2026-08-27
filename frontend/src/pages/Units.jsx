import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { quizAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import SectionSideCanvas from '../components/SectionSideCanvas';
import LevelPath from '../components/LevelPath';
import { dedupeUnitQuizzes } from '../utils/unitQuizzes';
import { CLIMB_PLATE_LIGHT } from '../utils/climbPlate';
import { PASS_PERCENT } from '../constants';

// ── Mobile climb-scene tuning ────────────────────────────────────────────────
// The phone hero pins just under the floating navbar (fixed top-0 + mt-2 + py-2.5
// around a 36px logo ≈ 64px tall), so 80px clears it with a little breathing room.
const MOBILE_PIN_TOP = 80;
// The frames are 720×405 (16:9) with the nurse climbing left→right; measured against
// the assets she occupies x-fraction 0.52→1.0 of the frame. SectionSideCanvas does a
// right-anchored contain-fit, so the visible slice is boxW / (boxH × 16/9) — meaning
// the BOX ASPECT RATIO alone decides how much of her is on screen. 0.94 reveals the
// rightmost ~53% (matches the approved preview and comfortably covers 0.52→1.0);
// a tall `h-full` box would drop to ~29% and crop her out entirely.
const MOBILE_CANVAS_ASPECT = 0.94;
// The stage stays pinned for the WHOLE level list (it rides along with the reader,
// like the desktop fixed panel), so it has to be compact enough that the cards still
// own most of the screen. The canvas fills the stage edge to edge — there is no
// separate caption band, so no reserved empty space.
const MOBILE_BOX_H = 'clamp(180px, 27vh, 240px)';
const MOBILE_BOX_W = `min(84vw, calc(${MOBILE_BOX_H} * ${MOBILE_CANVAS_ASPECT}))`;
// The caption sits on the frame's own sky, but on the last few frames she tops out
// and her raised arm reaches it. A white scrim over the art would keep the text
// readable at the cost of bleaching her head, so the contrast lives on the glyphs
// instead: a white halo per letter, which leaves every pixel of the art untouched.
const CAPTION_HALO = {
  textShadow:
    '0 0 5px rgba(255,255,255,0.98), 0 0 10px rgba(255,255,255,0.95), 0 0 18px rgba(255,255,255,0.85)',
};
// Lite-48: sample 48 of the 142 WebP frames (~3× less data than desktop) and map
// each onto its real file. Defined at module scope so its identity is stable —
// SectionSideCanvas keys its preload effect on getFramePath, and an inline arrow
// would re-trigger a full 48-image reload on every render.
// The trail is roughly half as tall as the card timeline it replaced, so the climb
// now plays out over half the scroll distance. 96 keeps the frame-to-frame delta
// where it was at 48 over the old, longer page (~450KB at ~4.7KB/frame, still well
// under the desktop panel's full 142).
const MOBILE_FRAMES = 96;
const mobileFramePath = (index) =>
  `/section_frames/frame_${String(
    Math.round((index / (MOBILE_FRAMES - 1)) * 141) + 1
  ).padStart(4, '0')}.webp`;

export default function Units() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const sectionRef = useRef(null);
  // Scroll runway for the mobile pinned climb-scene; drives scene-scoped progress.
  const sceneRef = useRef(null);

  // Mount exactly one canvas per viewport: the desktop side panel above `lg`,
  // the climb-scene below it. 1024px matches the panel's own `lg` cutoff.
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    quizAPI.getAll()
      .then((data) => {
        // Collapse to one quiz per unit — shared with the dashboard so both
        // pages agree on the path (see utils/unitQuizzes).
        setQuizzes(dedupeUnitQuizzes(data));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f2f2f2] text-slate-900 font-body">
        <Navbar />
        <div className="flex flex-col items-center justify-center h-[70vh] gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-bold text-slate-600 font-headline">Loading Clinical Levels...</p>
        </div>
      </div>
    );
  }

  const totalUnits = quizzes.length;
  const completedUnits = quizzes.filter(q => q.bestScorePercent >= PASS_PERCENT).length;

  const progressPercent = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;

  return (
    // overflow-x-*clip* (not hidden): `hidden` computes overflow-y to `auto`, which
    // turns this div into a scroll container and silently breaks `position: sticky`
    // for the mobile climb-scene below. `clip` suppresses horizontal overflow the
    // same way while leaving overflow-y `visible`, so sticky keeps working.
    <div className="min-h-screen pb-24 font-body relative overflow-x-clip bg-[#f2f2f2] text-slate-900">
      <Navbar />

      <main className="max-w-7xl mx-auto px-6 flex flex-col gap-8 pb-12 animate-slideUp relative z-10" style={{ paddingTop: '100px' }}>
        {/* Header and Progress Overview */}
        <section className="w-full lg:max-w-[660px] xl:max-w-[760px] bg-white border border-slate-200/90 shadow-xl rounded-3xl p-8 relative overflow-hidden flex flex-col md:flex-row items-center gap-8 justify-between">
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/10 rounded-full blur-[80px] pointer-events-none"></div>
          
          <div className="flex-1 space-y-2">
            <nav className="flex text-xs text-slate-500 font-label items-center gap-2 font-semibold">
              <span className="material-symbols-outlined text-[14px]">home</span>
              <span>/</span>
              <span onClick={() => navigate('/student')} className="cursor-pointer hover:text-primary transition-colors">Dashboard</span>
              <span>/</span>
              <span className="text-primary font-bold">Learning Path</span>
            </nav>
            <h1 className="font-headline text-4xl text-slate-900 font-extrabold tracking-tight">
              Level-Based <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-tertiary">Learning Path</span>
            </h1>
            <p className="font-body text-slate-600 text-base font-medium">
              Master each level step-by-step. Score {PASS_PERCENT}%+ to unlock the next clinical challenge!
            </p>
          </div>

          {/* Progress Ring / Bar */}
          <div className="bg-slate-50 border border-slate-200 shadow-inner rounded-2xl p-6 min-w-[280px] w-full md:w-auto">
            <div className="flex justify-between items-center mb-3 font-headline">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">Overall Progress</span>
              <span className="text-sm font-black text-slate-900">{completedUnits} / {totalUnits} Levels</span>
            </div>
            <div className="w-full h-4 bg-slate-200 rounded-full overflow-hidden mb-2">
              <div 
                className="h-full bg-gradient-to-r from-primary via-indigo-500 to-emerald-400 rounded-full transition-all duration-700" 
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
            <div className="flex justify-between font-headline text-xs font-bold text-slate-500">
              <span>0%</span>
              <span className="font-extrabold text-primary">{progressPercent}% Completed</span>
              <span>100%</span>
            </div>
          </div>
        </section>

        {/* ── Mobile climb-scene (below lg only) ──────────────────────────────
            Mirrors what the desktop fixed panel does: the hero rides ALONG with the
            reader for the whole level list. The stage pins under the navbar as the
            header scrolls away and stays pinned all the way down the list, the nurse
            climbing frame-by-frame with each level you pass, topping out on the last
            card. The canvas fills the stage edge to edge and the caption is overlaid
            on the frame's own empty sky, so no band of dead space is ever reserved. */}
        {isMobile && prefersReducedMotion && (
          // Reduce-motion: one static hero in normal flow — nothing pinned, nothing
          // redrawn on scroll.
          <div
            className="relative rounded-[28px] overflow-hidden border border-primary/15 shadow-lg flex items-end justify-center"
            style={{ height: MOBILE_BOX_H, ...CLIMB_PLATE_LIGHT }}
          >
            <div className="absolute inset-x-0 top-3.5 text-center px-4 z-10 pointer-events-none">
              <p className="font-headline font-black text-[13px] text-slate-900" style={CAPTION_HALO}>Your climb to graduation</p>
              <p className="font-headline text-[10.5px] font-extrabold uppercase tracking-wider text-slate-600 mt-0.5" style={CAPTION_HALO}>
                {completedUnits} / {totalUnits} Levels cleared
              </p>
            </div>
            <div style={{ width: MOBILE_BOX_W, height: MOBILE_BOX_H }}>
              <SectionSideCanvas totalFrames={MOBILE_FRAMES} getFramePath={mobileFramePath} />
            </div>
          </div>
        )}

        {/* The scene spans the hero AND the level list, so the pinned stage travels
            with the list and the climb maps onto it. On desktop this is an inert
            wrapper — the section inside is unchanged. */}
        <div ref={sceneRef} className="relative">
          {isMobile && !prefersReducedMotion && (
            // The pinned wrapper is a full-bleed band in the page colour (-mx-6 px-6),
            // so cards scrolling up disappear into it a little before they reach the
            // hero's rounded edge instead of being sliced mid-glyph against it.
            // top 64 + pt-4 puts the hero's own top at MOBILE_PIN_TOP (80).
            <div className="sticky z-30 -mx-6 px-6 pt-4 pb-4 mb-4 bg-[#f2f2f2]" style={{ top: '64px' }}>
            {/* The plate she stands on is pinned LIGHT, not themed — this page hardcodes
                its palette, so a themed plate would be the only element that darkened.
                See THE INVARIANT in utils/climbPlate.js. No mask: this is a bordered card
                already, and feathering would fight its own edge. */}
            <div
              className="relative rounded-[28px] overflow-hidden border border-primary/15 shadow-[0_18px_42px_rgba(2,6,23,0.12)] flex items-end justify-center"
              style={{ height: MOBILE_BOX_H, ...CLIMB_PLATE_LIGHT }}
            >
              {/* Caption overlays the empty upper part of the frame — it costs no height.
                  Contrast comes from a per-glyph white halo (CAPTION_HALO) rather than a
                  scrim, so when she tops out into this band she stays fully drawn. */}
              <div className="absolute inset-x-0 top-3.5 text-center px-4 z-10 pointer-events-none">
                <p className="font-headline font-black text-[13px] text-slate-900" style={CAPTION_HALO}>Your climb to graduation</p>
                <p className="font-headline text-[10.5px] font-extrabold uppercase tracking-wider text-slate-600 mt-0.5" style={CAPTION_HALO}>
                  {completedUnits} / {totalUnits} Levels cleared
                </p>
              </div>

              {/* Soft floor line so she reads as standing on something */}
              <div
                className="absolute left-6 right-6 bottom-3 h-[2px] rounded-full pointer-events-none"
                style={{ background: 'linear-gradient(90deg, rgba(124,58,237,0), rgba(124,58,237,0.28) 50%, rgba(124,58,237,0))' }}
              />

              {/* Centering box: the frames are right-anchored, so this centered box
                  lands the nurse in the middle of the stage. Its ratio (not its
                  height) is what keeps her in frame — see MOBILE_CANVAS_ASPECT. */}
              <div style={{ width: MOBILE_BOX_W, height: MOBILE_BOX_H }}>
                <SectionSideCanvas
                  sceneRef={sceneRef}
                  pinTop={MOBILE_PIN_TOP}
                  totalFrames={MOBILE_FRAMES}
                  getFramePath={mobileFramePath}
                />
              </div>
            </div>
            </div>
          )}

          {/* ── Learning Levels ─────────────────────────────────────────────
              The level list is a climbing trail: one stepping stone per level,
              alternating either side of a centre line and joined by a dotted
              track, echoing the nurse's climb in the animation beside it. Tapping
              a stone opens its detail sheet (description, best score, action).
              Same trail at every width — see LevelPath. */}
          <section ref={sectionRef} className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-headline font-black text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-3xl">stairs</span> Learning Levels
              </h2>
              <p className="font-headline text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                Tap a stone to open the level
              </p>
            </div>

            {quizzes.length === 0 ? (
              <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center text-slate-500 shadow-sm">
                <span className="material-symbols-outlined text-5xl mb-3 opacity-40">inventory_2</span>
                <p className="text-lg font-semibold">No level quizzes imported yet. Please contact your instructor.</p>
              </div>
            ) : (
              // Kept inside the same left-hand column the timeline used, so on
              // desktop the trail never runs under the fixed nurse panel.
              <div className="w-full lg:max-w-[660px] xl:max-w-[760px] px-2 pt-6 pb-2">
                <LevelPath
                  quizzes={quizzes}
                  isTeacher={user?.role === 'teacher'}
                  compact={isMobile}
                  reducedMotion={prefersReducedMotion}
                  onOpenQuiz={(id) => navigate(`/quiz/${id}`)}
                />
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Fixed Position Animation Canvas — stays locked in fixed position on screen throughout scroll */}
      {/* Gated on !isMobile so phones don't preload 142 frames for a panel `hidden lg:block`
          already hides; on desktop this renders exactly as before. */}
      {!isMobile && (
        <div className="hidden lg:block fixed top-28 right-6 xl:right-[max(1.5rem,calc((100vw-1280px)/2+1.5rem))] w-[380px] xl:w-[440px] h-[550px] pointer-events-none z-20">
          <SectionSideCanvas sectionRef={sectionRef} totalFrames={142} />
        </div>
      )}
    </div>
  );
}
