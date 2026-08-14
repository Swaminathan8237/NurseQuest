import React, { useEffect, useRef, useState } from 'react';

/**
 * SectionSideCanvas Component
 * High-performance frame-by-frame scroll scrubbing engine for Unit Section side animation.
 * Maps scroll position from Unit 1 down to Path Complete to WebP frame index (0..141).
 */
export default function SectionSideCanvas({
  totalFrames = 142,
  getFramePath = (index) => `/section_frames/frame_${String(index + 1).padStart(4, '0')}.webp`,
  sectionRef,
  sceneRef,
  pinTop = 0
}) {
  // Respect the OS "reduce motion" setting: when on, we render a single static frame
  // and never bind the scroll listener. The global CSS reduced-motion guard can't stop
  // rAF-driven canvas redraws, so we must handle it here.
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const imagesRef = useRef([]);
  // Under reduced motion we park on a representative mid-climb frame instead of frame 0.
  const currentFrameRef = useRef(prefersReducedMotion ? Math.floor((totalFrames - 1) / 2) : 0);
  const [isLoaded, setIsLoaded] = useState(false);

  // Contain-fit algorithm: fit full frame proportionally inside canvas without cropping
  const drawFrame = (frameIndex) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Every frame draws and then reads the whole canvas back to knock out the
    // near-white background, which is precisely the access pattern
    // willReadFrequently is for — without it Chrome warns and keeps the surface
    // on the GPU, so each getImageData stalls on a readback. Pixel output is
    // identical either way.
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = imagesRef.current[frameIndex];

    if (!img || !img.complete || !img.naturalWidth) return;

    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;
    const canvasW = canvas.width;
    const canvasH = canvas.height;
    if (canvasW === 0 || canvasH === 0) return;

    const imgRatio = imgW / imgH;
    const canvasRatio = canvasW / canvasH;

    // Right-anchored scaling: guarantees 100% visibility of nurse & stairs on the right.
    // Any cropping is strictly absorbed by the left empty space.
    let renderH = canvasH;
    let renderW = canvasH * imgRatio;
    let offsetX = canvasW - renderW;
    let offsetY = 0;

    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.drawImage(img, offsetX, offsetY, renderW, renderH);

    // Transparent background cutout for crisp character display without box overlay.
    //
    // The threshold matters more than it looks. Measured across the real frames
    // (1, 20, 40, 60, 80, 100, 120, 130, 136, 142): the empty sky never drops below
    // channel 236, while the shading on her cap and hair runs 200-231. The old
    // `min > 195` cut therefore swallowed those mid-greys, punching holes through
    // the top of her head — which read as "her head disappears in the white",
    // because the card behind the canvas is white.
    //
    // 230 sits in the gap between the two populations: it recovers 344-781 pixels
    // of her per frame and removes exactly zero additional background (verified —
    // the leftmost surviving pixel is unchanged on every frame sampled, and no
    // speckle appears in the empty left half).
    const BG_KNOCKOUT_MIN = 230;
    try {
      const imgData = ctx.getImageData(0, 0, canvasW, canvasH);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (min > BG_KNOCKOUT_MIN && (max - min) < 25) {
          data[i + 3] = 0;
        }
      }
      ctx.putImageData(imgData, 0, 0);
    } catch (e) {
      // Fallback
    }
  };

  // Preload frame sequence into memory.
  //
  // Under reduced motion only one frame is ever drawn, so fetching the whole
  // sequence would be 447 KB (mobile) / 660 KB (desktop) of frames nothing
  // renders — spent on exactly the users most likely to be on a constrained
  // device. Load the single frame we park on instead.
  useEffect(() => {
    let loadedCount = 0;
    const images = new Array(totalFrames);
    const only = prefersReducedMotion ? currentFrameRef.current : null;

    for (let i = 0; i < totalFrames; i++) {
      if (only !== null && i !== only) continue;
      const img = new Image();
      img.src = getFramePath(i);
      img.onload = () => {
        loadedCount++;
        if (i === currentFrameRef.current) {
          drawFrame(i);
        }
        if (loadedCount >= Math.min(20, only !== null ? 1 : totalFrames)) {
          setIsLoaded(true);
        }
      };
      images[i] = img;
    }
    imagesRef.current = images;
  }, [totalFrames, getFramePath, prefersReducedMotion]);

  // Dimension sync
  useEffect(() => {
    const updateDimensions = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      drawFrame(currentFrameRef.current);
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Frame scrubbing bound to scroll. Two modes:
  //   • sceneRef given  → progress is scoped to that scene's pinned travel (mobile hero).
  //   • sceneRef absent → progress spans the whole document (desktop side panel — unchanged).
  // Under reduced motion we draw a single representative frame and bind no scroll listener.
  useEffect(() => {
    if (prefersReducedMotion) {
      drawFrame(currentFrameRef.current);
      return;
    }

    let animId;

    const handleScroll = () => {
      if (animId) cancelAnimationFrame(animId);

      animId = requestAnimationFrame(() => {
        let progress = 0;

        const scene = sceneRef && sceneRef.current;
        if (scene) {
          // Scene-scoped: map the stage's pinned travel onto 0→1, all in document
          // coordinates so the ends are exact.
          const rect = scene.getBoundingClientRect();
          const stageH = containerRef.current
            ? containerRef.current.getBoundingClientRect().height
            : 0;
          const scrollY = window.scrollY;
          const pinStart = rect.top + scrollY - pinTop;
          const pinEnd = pinStart + (rect.height - stageH);
          // The scene can be taller than the reader can actually scroll (page padding
          // below it, short content). Ending the climb at whichever comes first
          // guarantees the last frame is always reached.
          const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
          const span = Math.min(pinEnd, maxScroll) - pinStart;
          if (span > 0) {
            progress = Math.min(Math.max((scrollY - pinStart) / span, 0), 1);
          }
        } else {
          // Whole-document (desktop side panel) — original behavior preserved exactly.
          const docHeight = document.documentElement.scrollHeight - window.innerHeight;
          const currentScroll = window.scrollY;
          if (docHeight > 0) {
            progress = Math.min(Math.max(currentScroll / docHeight, 0), 1);
          }
          // Near the bottom of the page, guarantee the final frame (frame_0142.webp).
          if (currentScroll >= docHeight - 15 || progress >= 0.97) {
            progress = 1;
          }
        }

        // Map progress across all frames (index 0 to totalFrames - 1)
        let targetFrame = Math.floor(progress * (totalFrames - 1));
        if (progress >= 0.97) {
          targetFrame = totalFrames - 1;
        }

        if (targetFrame !== currentFrameRef.current) {
          currentFrameRef.current = targetFrame;
          drawFrame(targetFrame);
        }
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (animId) cancelAnimationFrame(animId);
    };
  }, [sectionRef, sceneRef, pinTop, totalFrames, prefersReducedMotion]);

  return (
    <div 
      ref={containerRef}
      className="w-full h-full relative flex items-center justify-center pointer-events-none"
    >
      <canvas 
        ref={canvasRef} 
        className="w-full h-full block object-contain mix-blend-multiply"
      />
    </div>
  );
}
