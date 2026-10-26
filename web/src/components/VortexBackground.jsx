import { useEffect, useRef } from 'react';

// Live vortex theme: the supplied artwork sits behind the site, and a canvas draws
// particles spiralling inward, with faster rotation near the centre.
// Respects prefers-reduced-motion (static artwork only) and pauses in hidden tabs.
export default function VortexBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return undefined;

    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles = [];
    let raf = 0;
    let last = performance.now();
    let running = false;

    const TAU = Math.PI * 2;
    const particleCount = () => (window.innerWidth < 700 ? 420 : 900);

    function spawn(p, initial) {
      const maxR = Math.max(width, height) * 0.62;
      p.maxR = maxR;
      p.r = initial ? Math.random() * maxR : maxR * (0.9 + Math.random() * 0.1);
      p.a = Math.random() * TAU;
      p.size = 0.5 + Math.random() * 1.6;
      p.light = Math.random() < 0.18;
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = Array.from({ length: particleCount() }, () => {
        const p = {};
        spawn(p, true);
        return p;
      });
    }

    function step(t) {
      const cx = width / 2;
      const cy = height / 2;

      // Fade previous frame's trails without covering the artwork beneath.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = 'lighter';

      // Soft glowing core.
      const coreR = Math.min(width, height) * 0.14;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      glow.addColorStop(0, 'rgba(230, 215, 255, 0.35)');
      glow.addColorStop(1, 'rgba(155, 123, 212, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cx - coreR, cy - coreR, coreR * 2, coreR * 2);

      for (const p of particles) {
        // Angular speed rises as the particle nears the centre: the swirl tightens.
        const omega = 0.9 / (0.35 + p.r / p.maxR);
        p.a += omega * t * 0.02;
        // Inward pull accelerates toward the centre.
        p.r -= (0.5 + 22 * (1 - p.r / p.maxR) ** 2) * t * 0.02;
        if (p.r < 4) { spawn(p, false); continue; }

        // Project onto a tilted ellipse so the disc reads as a vortex seen from above.
        const x = cx + Math.cos(p.a) * p.r;
        const y = cy + Math.sin(p.a) * p.r * 0.55;
        const alpha = Math.min(1, (1 - p.r / p.maxR) * 1.4) * 0.85;
        ctx.fillStyle = p.light
          ? `rgba(240, 232, 255, ${alpha})`
          : `rgba(170, 140, 225, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size * (0.6 + 0.6 * (1 - p.r / p.maxR)), 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    function frame(now) {
      if (!running) return;
      const dt = Math.min(now - last, 50);
      last = now;
      step(dt);
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (running || document.hidden) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    function onVisibility() {
      if (document.hidden) stop(); else start();
    }

    let resizeTimer = 0;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 150);
    }

    resize();
    start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', onResize);

    return () => {
      stop();
      clearTimeout(resizeTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const artwork = `${import.meta.env.BASE_URL}vortex-art.jpg`;

  return (
    <div className="vortex-stage" aria-hidden="true">
      <div className="vortex-art" style={{ backgroundImage: `url("${artwork}")` }} />
      <canvas ref={canvasRef} className="vortex-canvas" />
    </div>
  );
}
