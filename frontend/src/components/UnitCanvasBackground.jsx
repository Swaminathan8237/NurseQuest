import React, { useEffect, useRef } from 'react';

/**
 * UnitCanvasBackground Component
 * High-performance 240 WebP frame sequence scroll engine, modeled after LandingPage.jsx.
 * Dynamic frame scrubbing with scroll, 100% static when scroll stops.
 */
export default function UnitCanvasBackground({ totalFrames = 240, isFullPage = false, className = "" }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const imagesRef = useRef([]);
  const currentFrameRef = useRef(0);

  // Draw frame with object-fit "cover" algorithm
  const drawFrame = (frameIndex) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const img = imagesRef.current[frameIndex];

    if (!img || !img.complete || !img.naturalWidth) return;

    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;
    const canvasW = canvas.width;
    const canvasH = canvas.height;
    if (canvasW === 0 || canvasH === 0) return;

    const imgRatio = imgW / imgH;
    const canvasRatio = canvasW / canvasH;

    let renderW, renderH, offsetX, offsetY;
    if (canvasRatio > imgRatio) {
      renderW = canvasW;
      renderH = canvasW / imgRatio;
      offsetX = 0;
      offsetY = (canvasH - renderH) / 2;
    } else {
      renderW = canvasH * imgRatio;
      renderH = canvasH;
      offsetX = (canvasW - renderW) / 2;
      offsetY = 0;
    }

    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.drawImage(img, offsetX, offsetY, renderW, renderH);
  };

  // Preload all 240 frames into memory & draw initial frame immediately
  useEffect(() => {
    const images = new Array(totalFrames);
    for (let i = 0; i < totalFrames; i++) {
      const img = new Image();
      const frameNum = String(i + 1).padStart(4, '0');
      img.src = `/frames/frame_${frameNum}.webp`;
      img.onload = () => {
        if (i === currentFrameRef.current) {
          drawFrame(i);
        }
      };
      images[i] = img;
    }
    imagesRef.current = images;
  }, [totalFrames]);

  // Dimension sync (Sync canvas resolution natural size to window/container size)
  useEffect(() => {
    const updateDimensions = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas) return;

      if (isFullPage) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      } else if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
      drawFrame(currentFrameRef.current);
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [isFullPage]);

  // Dynamic Scroll Listener (Scrubs live with scroll, static when idle)
  useEffect(() => {
    let animId;

    const handleScroll = () => {
      if (animId) cancelAnimationFrame(animId);

      animId = requestAnimationFrame(() => {
        const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (totalHeight <= 0) return;

        // Calculate scroll ratio (0.0 to 1.0)
        const scrollRatio = Math.min(Math.max(window.scrollY / totalHeight, 0), 1);
        const targetFrame = Math.min(Math.floor(scrollRatio * (totalFrames - 1)), totalFrames - 1);

        if (targetFrame !== currentFrameRef.current) {
          currentFrameRef.current = targetFrame;
          drawFrame(targetFrame);
        }
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    // Immediate initial sync
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (animId) cancelAnimationFrame(animId);
    };
  }, [totalFrames]);

  if (isFullPage) {
    return (
      <canvas
        ref={canvasRef}
        className={`fixed inset-0 w-full h-full pointer-events-none z-0 object-cover opacity-45 filter brightness-105 saturate-125 ${className}`}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={`absolute top-0 right-0 w-full md:w-[45%] h-full pointer-events-none z-0 overflow-hidden ${className}`}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full object-cover opacity-35 filter brightness-110 saturate-125"
      />
      {/* Soft gradient edge fade into content */}
      <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent pointer-events-none" />
    </div>
  );
}
