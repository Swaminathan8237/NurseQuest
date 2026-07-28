import React, { useEffect, useRef, useState } from 'react';

/**
 * Apple-style On-Scroll Video Canvas Component
 * Uses HTML5 <canvas>, image sequence preloading, zero-rerender requestAnimationFrame engine,
 * and responsive object-fit "cover" cropping.
 */
export default function AppleScrollCanvas({
  frameCount = 120,
  getFramePath = (index) => `/frames/frame_${String(index + 1).padStart(4, '0')}.webp`,
  title = "SkillQuest",
  subtitle = "Learn Anything. Play to Master.",
  ctaText = "Scroll to Explore",
  className = "",
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const imagesRef = useRef([]);
  const currentFrameRef = useRef(0);
  const animFrameIdRef = useRef(null);

  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isPreloaded, setIsPreloaded] = useState(false);

  // ── Helper: Cover Fitting Algorithm ──
  const drawCover = (ctx, img, width, height) => {
    if (!ctx) return;

    // Handle procedural fallback if image hasn't loaded yet
    if (!img || !img.complete || !img.naturalWidth) {
      drawProceduralFallback(ctx, width, height, currentFrameRef.current);
      return;
    }

    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;
    const imgRatio = imgW / imgH;
    const canvasRatio = width / height;

    let renderW, renderH, offsetX, offsetY;

    if (canvasRatio > imgRatio) {
      renderW = width;
      renderH = width / imgRatio;
      offsetX = 0;
      offsetY = (height - renderH) / 2;
    } else {
      renderW = height * imgRatio;
      renderH = height;
      offsetX = (width - renderW) / 2;
      offsetY = 0;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, offsetX, offsetY, renderW, renderH);
  };

  // ── Helper: Procedural Canvas Fallback Render ──
  const drawProceduralFallback = (ctx, width, height, frameIndex) => {
    ctx.clearRect(0, 0, width, height);

    // Deep gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#0F0E1A');
    bgGradient.addColorStop(0.5, '#1A1636');
    bgGradient.addColorStop(1, '#0B0A14');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    const progress = frameIndex / (frameCount - 1);
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) * 0.35;

    // Glowing particle orbit effect
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(progress * Math.PI * 4);

    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const r = maxRadius * (0.6 + 0.4 * Math.sin(progress * Math.PI * 2 + i));
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;

      const glow = ctx.createRadialGradient(x, y, 0, x, y, 40);
      glow.addColorStop(0, i % 2 === 0 ? 'rgba(124, 58, 237, 0.8)' : 'rgba(6, 182, 212, 0.8)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 40, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Central pulsing orb
    const centerGlow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadius * 0.8);
    centerGlow.addColorStop(0, `rgba(245, 158, 11, ${0.4 + 0.3 * Math.sin(progress * Math.PI * 3)})`);
    centerGlow.addColorStop(1, 'rgba(15, 14, 26, 0)');
    ctx.fillStyle = centerGlow;
    ctx.beginPath();
    ctx.arc(centerX, centerY, maxRadius * 0.8, 0, Math.PI * 2);
    ctx.fill();
  };

  // ── Draw Active Frame ──
  const renderFrame = (index) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const img = imagesRef.current[index];

    drawCover(ctx, img, canvas.width, canvas.height);
  };

  // ── Preload Image Sequence ──
  useEffect(() => {
    let loadedCount = 0;
    const images = new Array(frameCount);

    for (let i = 0; i < frameCount; i++) {
      const img = new Image();
      img.src = getFramePath(i);

      img.onload = () => {
        loadedCount++;
        setLoadingProgress(Math.round((loadedCount / frameCount) * 100));
        if (loadedCount === frameCount) {
          setIsPreloaded(true);
        }
      };

      img.onerror = () => {
        loadedCount++;
        setLoadingProgress(Math.round((loadedCount / frameCount) * 100));
        if (loadedCount === frameCount) {
          setIsPreloaded(true);
        }
      };

      images[i] = img;
    }

    imagesRef.current = images;

    // Force fallback readiness after short timeout
    const timeout = setTimeout(() => setIsPreloaded(true), 1500);
    return () => clearTimeout(timeout);
  }, [frameCount, getFramePath]);

  // ── Responsive Resize Listener ──
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      renderFrame(currentFrameRef.current);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ── Scroll Engine (High Performance, Zero Re-renders) ──
  useEffect(() => {
    const handleScroll = () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }

      animFrameIdRef.current = requestAnimationFrame(() => {
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const containerHeight = rect.height;
        const viewportHeight = window.innerHeight;

        const scrollableDistance = containerHeight - viewportHeight;
        if (scrollableDistance <= 0) return;

        // Calculate scroll ratio (0.0 to 1.0)
        const currentScroll = -rect.top;
        const progress = Math.min(Math.max(currentScroll / scrollableDistance, 0), 1);

        // Map to frame index (0 to frameCount - 1)
        const targetFrame = Math.floor(progress * (frameCount - 1));

        if (targetFrame !== currentFrameRef.current) {
          currentFrameRef.current = targetFrame;
          renderFrame(targetFrame);
        }
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    // Initial draw
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [frameCount]);

  return (
    <div
      ref={containerRef}
      className={`relative min-h-[300vh] bg-[#0B0A14] text-white ${className}`}
    >
      {/* Sticky Canvas Container */}
      <div className="sticky top-0 h-screen w-full overflow-hidden flex items-center justify-center">
        {/* Canvas Element */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
        />

        {/* Preloader Indicator Bar */}
        {!isPreloaded && (
          <div className="absolute top-6 right-6 z-30 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 flex items-center gap-2 text-xs font-mono text-slate-300">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
            <span>Loading Sequence {loadingProgress}%</span>
          </div>
        )}

        {/* Centered Overlay Content (Pointer-Events-None) */}
        <div className="relative z-20 pointer-events-none text-center max-w-4xl px-6 flex flex-col items-center justify-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-semibold uppercase tracking-wider mb-6 backdrop-blur-md">
            <span>✦ APPLE-STYLE SCROLL ENGINE</span>
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[0.95] mb-6 drop-shadow-2xl">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-purple-300">
              {title}
            </span>
          </h1>

          <p className="text-lg md:text-2xl text-slate-300 max-w-2xl mx-auto font-medium leading-relaxed drop-shadow-lg mb-10">
            {subtitle}
          </p>

          {/* Scroll Indicator Prompt */}
          <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-mono text-slate-200 shadow-xl animate-bounce">
            <span className="material-symbols-outlined text-sm">arrow_downward</span>
            <span>{ctaText}</span>
          </div>
        </div>

        {/* Gradient Edge Blends */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-[#0B0A14] to-transparent pointer-events-none z-10" />
        <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-[#0B0A14] to-transparent pointer-events-none z-10" />
      </div>
    </div>
  );
}
