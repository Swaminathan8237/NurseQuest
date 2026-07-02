import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import lottie from 'lottie-web';
import Navbar from '../components/Navbar';
import monitorPulse from '../assets/lottie/monitorPulse.json';
import confetti from 'canvas-confetti';

const TOTAL_ROUNDS = 10;
const TARGET_CENTER = 0.52;
const TARGET_WINDOW = 0.1;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function NursingMiniGame() {
  const [gameStatus, setGameStatus] = useState('idle');
  const [round, setRound] = useState(1);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [heartRate, setHeartRate] = useState(92);
  const [hits, setHits] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [feedback, setFeedback] = useState('Start a shift and stabilize each IV drip in the target zone.');
  const [feedbackTone, setFeedbackTone] = useState('neutral');
  const [pulseBoost, setPulseBoost] = useState(false);
  const [bestScore, setBestScore] = useState(() => Number(localStorage.getItem('nq_minigame_best_score') || 0));

  const sceneRef = useRef(null);
  const lottieRef = useRef(null);
  const frameRef = useRef(0);

  const runningRef = useRef(false);
  const flowRef = useRef(0.2);
  const speedRef = useRef(0.0075);
  const roundRef = useRef(1);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const hitsRef = useRef(0);
  const attemptsRef = useRef(0);

  const accuracy = useMemo(() => {
    if (attempts === 0) return 0;
    return Math.round((hits / attempts) * 100);
  }, [hits, attempts]);

  const startGame = useCallback(() => {
    setGameStatus('running');
    setRound(1);
    setScore(0);
    setStreak(0);
    setHits(0);
    setAttempts(0);
    setHeartRate(92);
    setFeedback('Shift started: watch the drip and tap STABILIZE in the highlighted zone.');
    setFeedbackTone('neutral');

    roundRef.current = 1;
    scoreRef.current = 0;
    streakRef.current = 0;
    hitsRef.current = 0;
    attemptsRef.current = 0;
    flowRef.current = Math.random();
    speedRef.current = 0.0065;
    runningRef.current = true;
  }, []);

  const endGame = useCallback((finalScore) => {
    runningRef.current = false;
    setGameStatus('finished');
    const storedBest = Number(localStorage.getItem('nq_minigame_best_score') || 0);
    if (finalScore > storedBest) {
      localStorage.setItem('nq_minigame_best_score', String(finalScore));
      setBestScore(finalScore);
      setFeedback(`New personal best: ${finalScore} points. Great clinical timing!`);
      setFeedbackTone('perfect');
    } else {
      setBestScore(storedBest);
      setFeedback(`Shift complete: ${finalScore} points. Review timing and run another simulation.`);
      setFeedbackTone('good');
    }

    if (finalScore > 0) {
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    }
  }, []);

  const stabilizeFlow = useCallback(() => {
    if (!runningRef.current || gameStatus !== 'running') {
      return;
    }

    const normalized = flowRef.current % 1;
    const distance = Math.abs(normalized - TARGET_CENTER);
    const inZone = distance <= TARGET_WINDOW;
    const perfect = distance <= TARGET_WINDOW * 0.45;

    attemptsRef.current += 1;

    if (inZone) {
      hitsRef.current += 1;
      streakRef.current += 1;
    } else {
      streakRef.current = 0;
    }

    const basePoints = perfect ? 140 : inZone ? 90 : 25;
    const comboBonus = inZone ? streakRef.current * 6 : 0;
    scoreRef.current += basePoints + comboBonus;

    if (perfect) {
      setFeedback(`Perfect drip lock +${basePoints + comboBonus}`);
      setFeedbackTone('perfect');
      setHeartRate((prev) => clamp(prev - 3, 72, 135));
    } else if (inZone) {
      setFeedback(`Stable infusion +${basePoints + comboBonus}`);
      setFeedbackTone('good');
      setHeartRate((prev) => clamp(prev - 1, 72, 135));
    } else {
      setFeedback(`Flow drift +${basePoints}. Correct quickly.`);
      setFeedbackTone('miss');
      setHeartRate((prev) => clamp(prev + 4, 72, 135));
    }

    setScore(scoreRef.current);
    setStreak(streakRef.current);
    setHits(hitsRef.current);
    setAttempts(attemptsRef.current);

    setPulseBoost(true);
    window.setTimeout(() => setPulseBoost(false), 220);

    roundRef.current += 1;
    if (roundRef.current > TOTAL_ROUNDS) {
      setRound(TOTAL_ROUNDS);
      endGame(scoreRef.current);
      return;
    }

    setRound(roundRef.current);
  }, [endGame, gameStatus]);

  useEffect(() => {
    if (!lottieRef.current) {
      return undefined;
    }

    const animation = lottie.loadAnimation({
      container: lottieRef.current,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: monitorPulse,
    });

    return () => animation.destroy();
  }, []);

  useEffect(() => {
    if (!sceneRef.current) {
      return undefined;
    }

    const container = sceneRef.current;
    const scene = new THREE.Scene();
    scene.background = null; // Let the tailwind background show through
    scene.fog = new THREE.Fog('#0a1220', 7, 13);

    const width = container.clientWidth;
    const height = container.clientHeight;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 1.4, 6.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight('#8ec5ff', 0.55);
    const keyLight = new THREE.DirectionalLight('#ffffff', 1.05);
    keyLight.position.set(2, 4, 3);
    const fillLight = new THREE.DirectionalLight('#00cec9', 0.45);
    fillLight.position.set(-3, 1, -2);

    scene.add(ambientLight, keyLight, fillLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 5),
      new THREE.MeshStandardMaterial({ color: '#121b2d', roughness: 0.95, metalness: 0.05 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.7;
    scene.add(floor);

    const bed = new THREE.Mesh(
      new THREE.BoxGeometry(4.3, 0.32, 2.2),
      new THREE.MeshStandardMaterial({ color: '#22314b', roughness: 0.75, metalness: 0.1 })
    );
    bed.position.y = -1.2;
    scene.add(bed);

    const patientBody = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.55, 1.7, 10, 20),
      new THREE.MeshStandardMaterial({ color: '#7f9fbf', roughness: 0.85, metalness: 0.02 })
    );
    patientBody.rotation.z = Math.PI / 2;
    patientBody.position.set(-0.25, -0.45, 0);
    scene.add(patientBody);

    const patientHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 26, 26),
      new THREE.MeshStandardMaterial({ color: '#9ab8d3', roughness: 0.85, metalness: 0.02 })
    );
    patientHead.position.set(1.05, -0.45, 0);
    scene.add(patientHead);

    const standPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 3.9, 18),
      new THREE.MeshStandardMaterial({ color: '#c2d2e4', roughness: 0.35, metalness: 0.75 })
    );
    standPole.position.set(1.8, 0.25, 0);
    scene.add(standPole);

    const standHook = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.028, 10, 24, Math.PI),
      new THREE.MeshStandardMaterial({ color: '#d4e0ef', roughness: 0.25, metalness: 0.8 })
    );
    standHook.position.set(1.8, 2.18, 0);
    standHook.rotation.z = Math.PI;
    scene.add(standHook);

    const bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.62, 0.15),
      new THREE.MeshStandardMaterial({ color: '#59e3d8', transparent: true, opacity: 0.62, roughness: 0.45, metalness: 0.08 })
    );
    bag.position.set(1.8, 1.63, 0);
    scene.add(bag);

    const tubeCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(1.8, 1.3, 0),
      new THREE.Vector3(1.1, 0.5, 0.22),
      new THREE.Vector3(0.75, -0.8, 0)
    );
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(tubeCurve, 28, 0.028, 10, false),
      new THREE.MeshStandardMaterial({ color: '#7ad5e8', transparent: true, opacity: 0.7, roughness: 0.55, metalness: 0.08 })
    );
    scene.add(tube);

    const dropletMaterial = new THREE.MeshStandardMaterial({
      color: '#7ce5ff',
      emissive: '#16425e',
      emissiveIntensity: 0.55,
      roughness: 0.28,
      metalness: 0.02,
    });

    const droplet = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 20, 20),
      dropletMaterial
    );
    droplet.position.set(0.75, 0.5, 0);
    scene.add(droplet);

    const targetRingMaterial = new THREE.MeshStandardMaterial({
      color: '#f5c36d',
      emissive: '#6a4a15',
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.22,
    });

    const targetRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.045, 16, 36),
      targetRingMaterial
    );
    targetRing.rotation.x = Math.PI / 2;
    targetRing.position.set(0.75, THREE.MathUtils.lerp(1.28, -1.02, TARGET_CENTER), 0);
    scene.add(targetRing);

    const onResize = () => {
      if (!sceneRef.current) {
        return;
      }
      const nextWidth = container.clientWidth;
      const nextHeight = container.clientHeight;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    };

    window.addEventListener('resize', onResize);

    const animate = (time) => {
      frameRef.current = requestAnimationFrame(animate);

      bag.rotation.y = Math.sin(time * 0.0009) * 0.05;
      targetRing.rotation.z += 0.012;
      patientHead.rotation.y = Math.sin(time * 0.0006) * 0.05;

      if (runningRef.current) {
        speedRef.current = 0.0065 + ((Math.sin(time * 0.0015) + 1) * 0.0023);
        flowRef.current = (flowRef.current + speedRef.current) % 1;
        const y = THREE.MathUtils.lerp(1.28, -1.02, flowRef.current);
        droplet.position.y = y;

        const distance = Math.abs(flowRef.current - TARGET_CENTER);
        const inZone = distance <= TARGET_WINDOW;
        dropletMaterial.emissive.set(inZone ? '#00d8b8' : '#16425e');
        targetRingMaterial.emissive.set(inZone ? '#0f7f72' : '#6a4a15');
      } else {
        droplet.position.y = 0.2 + Math.sin(time * 0.003) * 0.18;
        dropletMaterial.emissive.set('#16425e');
        targetRingMaterial.emissive.set('#6a4a15');
      }

      renderer.render(scene, camera);
    };

    animate(0);

    return () => {
      runningRef.current = false;
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(frameRef.current);

      scene.traverse((obj) => {
        if (!obj.isMesh) {
          return;
        }
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((material) => material.dispose());
        } else {
          obj.material?.dispose();
        }
      });

      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const feedbackColors = {
    perfect: 'bg-tertiary/20 text-tertiary border-tertiary/50',
    good: 'bg-primary/20 text-primary border-primary/50',
    miss: 'bg-error/20 text-error border-error/50',
    neutral: 'bg-surface-container-highest text-on-surface-variant border-outline-variant/30'
  };

  return (
    <div className="min-h-screen bg-background text-on-surface font-body flex flex-col pb-24">
      <Navbar />

      <main className="flex-1 max-w-[1920px] w-full mx-auto p-4 lg:p-8 animate-fadeInUp" style={{ paddingTop: '100px' }}>

        {/* Hero Section */}
        <section className="bg-surface-container-low/60 backdrop-blur-xl rounded-2xl border border-outline-variant/20 shadow-xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-8 mb-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] pointer-events-none"></div>

          <div className="flex-1 z-10">
            <p className="text-sm font-label font-bold text-tertiary uppercase tracking-widest mb-2">Nursing Mini-Game System</p>
            <h1 className="text-3xl md:text-5xl font-headline font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-primary-container to-primary mb-4">
              IV Stabilization Sprint
            </h1>
            <p className="text-on-surface-variant font-medium max-w-2xl leading-relaxed">
              Practice infusion timing under pressure. Watch the 3D drip chamber, sync your action,
              and keep patient vitals steady through a 10-round shift simulation.
            </p>
          </div>

          <div className="bg-surface-container-highest rounded-xl p-4 border border-outline-variant/30 flex items-center gap-4 shadow-lg min-w-[240px] z-10">
            <div ref={lottieRef} className="w-16 h-16" aria-hidden="true" />
            <div>
              <div className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-widest">Monitor BPM</div>
              <div className={`text-3xl font-display font-black transition-transform duration-100 ${pulseBoost ? 'scale-125 text-rose-400 drop-shadow-[0_0_10px_rgba(251,113,133,0.5)]' : 'text-on-surface'}`}>
                {heartRate}
              </div>
            </div>
          </div>
        </section>

        {/* Game Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Main Simulation Panel */}
          <div className="lg:col-span-2 bg-surface-container-low/60 backdrop-blur-xl rounded-2xl border border-outline-variant/20 shadow-xl overflow-hidden flex flex-col h-[50vh] lg:h-[600px] relative">
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-surface-container/50 backdrop-blur z-10">
              <h2 className="text-lg font-headline font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">view_in_ar</span>
                3D Simulation
              </h2>
              <div className="text-xs font-bold text-amber-400 bg-amber-400/10 px-3 py-1 rounded-md">Target Window: 42%-62%</div>
            </div>

            {/* Three.js Container */}
            <div ref={sceneRef} className="flex-1 w-full bg-gradient-to-b from-[#0a1220] to-[#131b2e] relative cursor-crosshair">
              {/* Overlay elements can go here if needed */}
            </div>

            <div className="p-6 bg-surface-container/80 backdrop-blur-md border-t border-white/5 z-10">
              <div className="flex gap-4 mb-4">
                <button
                  className="flex-1 py-4 rounded-xl font-headline font-bold uppercase tracking-widest transition-all bg-surface-container-highest text-on-surface-variant hover:bg-on-surface/5 active:scale-95"
                  onClick={startGame}
                >
                  {gameStatus === 'running' ? 'Restart Shift' : 'Start Shift'}
                </button>

                <button
                  className={`flex-[2] py-4 rounded-xl font-headline font-bold uppercase tracking-widest transition-all shadow-lg active:scale-95 flex justify-center items-center gap-2 ${gameStatus === 'running' ? 'bg-gradient-to-r from-tertiary-container to-tertiary text-on-tertiary-container shadow-[0_4px_20px_rgba(50,160,151,0.4)] hover:shadow-[0_4px_25px_rgba(50,160,151,0.6)] hover:brightness-110' : 'bg-surface-container-highest text-on-surface-variant/40 cursor-not-allowed opacity-50'}`}
                  onClick={stabilizeFlow}
                  disabled={gameStatus !== 'running'}
                >
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>vaccines</span>
                  Stabilize IV
                </button>
              </div>

              <div className={`p-3 rounded-lg border text-center font-bold text-sm transition-colors duration-300 ${feedbackColors[feedbackTone]}`}>
                {feedback}
              </div>
            </div>
          </div>

          {/* Stats Sidebar */}
          <aside className="space-y-6">

            <div className="bg-surface-container-low/60 backdrop-blur-xl rounded-2xl border border-outline-variant/20 shadow-xl p-6">
              <h3 className="text-sm font-label font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">scoreboard</span> Shift Scoreboard
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-container-high rounded-xl p-4 text-center">
                  <div className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-1">Round</div>
                  <div className="text-2xl font-display font-black text-on-surface">{Math.min(round, TOTAL_ROUNDS)} <span className="text-sm text-on-surface-variant/60">/ {TOTAL_ROUNDS}</span></div>
                </div>
                <div className="bg-surface-container-high rounded-xl p-4 text-center">
                  <div className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-1">Score</div>
                  <div className="text-2xl font-display font-black text-primary">{score}</div>
                </div>
                <div className="bg-surface-container-high rounded-xl p-4 text-center">
                  <div className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-1">Streak</div>
                  <div className="text-2xl font-display font-black text-tertiary">{streak}</div>
                </div>
                <div className="bg-surface-container-high rounded-xl p-4 text-center">
                  <div className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-1">Accuracy</div>
                  <div className="text-2xl font-display font-black text-rose-400">{accuracy}%</div>
                </div>
              </div>
            </div>

            <div className="bg-surface-container-low/60 backdrop-blur-xl rounded-2xl border border-outline-variant/20 shadow-xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-rose-400/10 rounded-full blur-[40px] pointer-events-none"></div>

              <h3 className="text-sm font-label font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">monitor_heart</span> Performance Pulse
              </h3>

              <div className="h-8 bg-surface-container-highest rounded-full overflow-hidden relative mb-4">
                <div className={`absolute top-0 left-0 h-full w-full bg-[linear-gradient(90deg,transparent,rgba(251,113,133,0.3),transparent)] -translate-x-full transition-transform duration-[2s] ease-linear ${gameStatus === 'running' ? 'animate-[slide_2s_linear_infinite]' : ''}`} />
                <div className="absolute inset-0 border-t border-b border-rose-400/20" style={{ background: 'repeating-linear-gradient(90deg, transparent, transparent 10px, rgba(251,113,133,0.1) 10px, rgba(251,113,133,0.1) 11px)' }}></div>
              </div>

              <div className="flex justify-between text-sm font-bold text-on-surface-variant mb-4">
                <span>Hits: {hits}</span>
                <span>Attempts: {attempts}</span>
              </div>

              <div className={`text-center py-2 rounded-md text-xs font-bold uppercase tracking-widest ${gameStatus === 'running' ? 'bg-primary/20 text-primary animate-pulse' : gameStatus === 'finished' ? 'bg-tertiary/20 text-tertiary' : 'bg-surface-container-highest text-on-surface-variant/60'}`}>
                {gameStatus === 'running' ? 'Shift in progress' : gameStatus === 'finished' ? 'Shift complete' : 'Awaiting shift start'}
              </div>
            </div>

            <div className="bg-surface-container-low/60 backdrop-blur-xl rounded-2xl border border-outline-variant/20 shadow-xl p-6">
              <h3 className="text-sm font-label font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">lightbulb</span> Training Notes
              </h3>
              <ul className="space-y-3 text-sm text-on-surface-variant mb-6 font-medium">
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-primary text-[18px] mt-0.5">check_circle</span>
                  Tap only when the droplet passes through the ring zone.
                </li>
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-tertiary text-[18px] mt-0.5">bolt</span>
                  Consecutive stable hits increase combo bonus.
                </li>
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-rose-400 text-[18px] mt-0.5">favorite</span>
                  Keep BPM controlled to mimic calm intervention.
                </li>
              </ul>

              <div className="pt-4 border-t border-white/5 flex justify-between items-center text-sm">
                <span className="font-bold text-on-surface-variant">Best Shift Score</span>
                <span className="font-display font-black text-primary text-xl">{bestScore}</span>
              </div>
            </div>

          </aside>
        </section>
      </main>

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}} />
    </div>
  );
}
