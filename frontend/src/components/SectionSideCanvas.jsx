import React, { useEffect, useRef, useState } from 'react';

/**
 * SectionSideCanvas Component
 * High-performance frame-by-frame scroll scrubbing engine for Unit Section side animation.
 * Maps scroll position from Unit 1 down to Path Complete to WebP frame index (0..141).
 */
export default function SectionSideCanvas({ 
  totalFrames = 142, 
  getFramePath = (index) => `/section_frames/frame_${String(index + 1).padStart(4, '0')}.webp`,
  sectionRef
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const imagesRef = useRef([]);
  const currentFrameRef = useRef(0);
  const [isLoaded, setIsLoaded] = useState(false);

  // Contain-fit algorithm: fit full frame proportionally inside canvas without cropping
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

    // Right-anchored scaling: guarantees 100% visibility of nurse & stairs on the right.
    // Any cropping is strictly absorbed by the left empty space.
    let renderH = canvasH;
    let renderW = canvasH * imgRatio;
    let offsetX = canvasW - renderW;
    let offsetY = 0;

    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.drawImage(img, offsetX, offsetY, renderW, renderH);

    // Transparent background cutout for crisp character display without box overlay
    try {
      const imgData = ctx.getImageData(0, 0, canvasW, canvasH);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (min > 195 && (max - min) < 25) {
          data[i + 3] = 0;
        }
      }
      ctx.putImageData(imgData, 0, 0);
    } catch (e) {
      // Fallback
    }
  };

  // Preload frame sequence into memory
  useEffect(() => {
    let loadedCount = 0;
    const images = new Array(totalFrames);

    for (let i = 0; i < totalFrames; i++) {
      const img = new Image();
      img.src = getFramePath(i);
      img.onload = () => {
        loadedCount++;
        if (i === currentFrameRef.current) {
          drawFrame(i);
        }
        if (loadedCount >= Math.min(20, totalFrames)) {
          setIsLoaded(true);
        }
      };
      images[i] = img;
    }
    imagesRef.current = images;
  }, [totalFrames, getFramePath]);

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

  // Frame scrubbing bound across full page scroll down to final frame 142
  useEffect(() => {
    let animId;

    const handleScroll = () => {
      if (animId) cancelAnimationFrame(animId);

      animId = requestAnimationFrame(() => {
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const currentScroll = window.scrollY;

        let progress = 0;
        if (docHeight > 0) {
          progress = Math.min(Math.max(currentScroll / docHeight, 0), 1);
        }

        // Map progress across all 142 frames (index 0 to totalFrames - 1)
        let targetFrame = Math.floor(progress * (totalFrames - 1));

        // When reaching near the bottom of the page, guarantee final frame (frame_0142.webp)
        if (currentScroll >= docHeight - 15 || progress >= 0.97) {
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
  }, [sectionRef, totalFrames]);

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
