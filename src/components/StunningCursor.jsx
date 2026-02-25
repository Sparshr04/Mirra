import { useEffect, useRef } from "react";

/* ── Stunning Orbital Cursor with Particle Trail ── */
export function StunningCursor() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let W = window.innerWidth;
    let H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;

    const mouse = { x: W / 2, y: H / 2 };
    const smoothed = { x: W / 2, y: H / 2 };
    let clicking = false;
    let hovering = false;
    let raf;
    let t = 0;

    // Trail particles
    const TRAIL_LEN = 22;
    const trail = Array.from({ length: TRAIL_LEN }, () => ({
      x: W / 2, y: H / 2, alpha: 0
    }));

    // Orbiting ring dots
    const RING_DOTS = 6;
    const ringDots = Array.from({ length: RING_DOTS }, (_, i) => ({
      angle: (i / RING_DOTS) * Math.PI * 2,
      speed: 0.018 + i * 0.002,
      radius: 18,
      size: i % 2 === 0 ? 2 : 1.5,
    }));

    const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onDown = () => { clicking = true; };
    const onUp   = () => { clicking = false; };
    const onOver = (e) => { hovering = !!e.target.closest("button,a,[data-hover]"); };
    const onResize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W; canvas.height = H;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    document.addEventListener("mouseover", onOver);
    window.addEventListener("resize", onResize);

    const lerp = (a, b, f) => a + (b - a) * f;
    const CYAN   = "34,211,238";
    const PURPLE = "139,92,246";
    const BLUE   = "14,165,233";

    function draw() {
      t += 0.016;
      ctx.clearRect(0, 0, W, H);

      // Smooth cursor position
      const spd = clicking ? 0.25 : hovering ? 0.2 : 0.14;
      smoothed.x = lerp(smoothed.x, mouse.x, spd);
      smoothed.y = lerp(smoothed.y, mouse.y, spd);
      const cx = smoothed.x;
      const cy = smoothed.y;

      // Scale factor
      const scale = clicking ? 0.75 : hovering ? 1.4 : 1;

      // ── Trail ──
      // Shift trail
      for (let i = TRAIL_LEN - 1; i > 0; i--) {
        trail[i].x = lerp(trail[i].x, trail[i - 1].x, 0.35);
        trail[i].y = lerp(trail[i].y, trail[i - 1].y, 0.35);
      }
      trail[0].x = cx;
      trail[0].y = cy;

      for (let i = 0; i < TRAIL_LEN; i++) {
        const progress = 1 - i / TRAIL_LEN;
        const r = progress * 4 * scale;
        const alpha = progress * 0.35;

        // Alternate cyan/purple for trail
        const color = i % 3 === 0 ? CYAN : i % 3 === 1 ? PURPLE : BLUE;
        ctx.beginPath();
        ctx.arc(trail[i].x, trail[i].y, Math.max(0.5, r), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color},${alpha})`;
        ctx.fill();
      }

      // ── Outer glow ring ──
      const ringR = 20 * scale;
      const gradient = ctx.createRadialGradient(cx, cy, ringR * 0.3, cx, cy, ringR * 1.4);
      gradient.addColorStop(0, `rgba(${CYAN}, 0)`);
      gradient.addColorStop(0.6, `rgba(${CYAN}, ${clicking ? 0.08 : 0.04})`);
      gradient.addColorStop(1, `rgba(${CYAN}, 0)`);
      ctx.beginPath();
      ctx.arc(cx, cy, ringR * 1.4, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // ── Rotating outer ring ──
      const outerR = 20 * scale;
      const dashLen = hovering ? Math.PI * 2 : Math.PI * 0.45;
      const gapLen  = hovering ? 0 : Math.PI * 0.22;

      // Segmented outer ring
      for (let seg = 0; seg < 4; seg++) {
        const startAngle = t * 1.2 + (seg * Math.PI * 2) / 4;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, startAngle, startAngle + dashLen);
        ctx.strokeStyle = hovering
          ? `rgba(${CYAN}, 0.9)`
          : `rgba(${CYAN}, 0.55)`;
        ctx.lineWidth = hovering ? 1.5 : 1;
        ctx.shadowColor = `rgba(${CYAN}, 0.8)`;
        ctx.shadowBlur = hovering ? 12 : 6;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // ── Inner ring (counter-rotate) ──
      const innerR = 11 * scale;
      for (let seg = 0; seg < 3; seg++) {
        const startAngle = -t * 1.8 + (seg * Math.PI * 2) / 3;
        const segLen = Math.PI * 0.3;
        ctx.beginPath();
        ctx.arc(cx, cy, innerR, startAngle, startAngle + segLen);
        ctx.strokeStyle = `rgba(${PURPLE}, ${hovering ? 0.7 : 0.4})`;
        ctx.lineWidth = 1;
        ctx.shadowColor = `rgba(${PURPLE}, 0.6)`;
        ctx.shadowBlur = 5;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // ── Orbiting dots ──
      ringDots.forEach((dot, i) => {
        dot.angle += dot.speed;
        const r = dot.radius * scale;
        const dx = cx + Math.cos(dot.angle) * r;
        const dy = cy + Math.sin(dot.angle) * r * 0.55; // elliptical
        const color = i % 2 === 0 ? CYAN : PURPLE;
        const alpha = hovering ? 1 : 0.7;

        ctx.beginPath();
        ctx.arc(dx, dy, dot.size * scale, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color}, ${alpha})`;
        ctx.shadowColor = `rgba(${color}, 0.9)`;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // ── Center dot ──
      const dotR = clicking ? 1.5 : hovering ? 4 : 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, dotR * scale, 0, Math.PI * 2);
      ctx.fillStyle = clicking
        ? `rgba(${CYAN}, 1)`
        : `rgba(255, 255, 255, 0.95)`;
      ctx.shadowColor = `rgba(${CYAN}, 1)`;
      ctx.shadowBlur = clicking ? 20 : 8;
      ctx.fill();
      ctx.shadowBlur = 0;

      // ── Cross hairs (short ticks at 4 corners) ──
      const tickDist = (outerR + 6) * scale;
      const tickLen  = hovering ? 6 : 4;
      const tickColor = hovering ? `rgba(255,255,255,0.6)` : `rgba(${CYAN}, 0.4)`;
      const positions = [
        { dx:  tickDist, dy: 0, rot: 0 },
        { dx: -tickDist, dy: 0, rot: Math.PI },
        { dx: 0, dy:  tickDist, rot: Math.PI / 2 },
        { dx: 0, dy: -tickDist, rot: -Math.PI / 2 },
      ];
      positions.forEach(({ dx, dy }) => {
        // Draw a small tick mark
        const tx = cx + dx;
        const ty = cy + dy;
        const ang = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.moveTo(tx - Math.cos(ang) * tickLen, ty - Math.sin(ang) * tickLen);
        ctx.lineTo(tx + Math.cos(ang) * tickLen, ty + Math.sin(ang) * tickLen);
        ctx.strokeStyle = tickColor;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = `rgba(${CYAN}, 0.5)`;
        ctx.shadowBlur = 4;
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      // ── Click ripple ──
      if (clicking) {
        const rippleR = 28 * scale + Math.sin(t * 15) * 4;
        ctx.beginPath();
        ctx.arc(cx, cy, rippleR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${CYAN}, ${0.3 + Math.sin(t * 15) * 0.15})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      document.removeEventListener("mouseover", onOver);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0, left: 0,
        width: "100vw", height: "100vh",
        pointerEvents: "none",
        zIndex: 999999,
      }}
    />
  );
}
