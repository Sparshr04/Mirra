import { useEffect, useRef, useState, useCallback } from "react";
import Spline from "@splinetool/react-spline";

const css = `
/* ──────────────────────────────────────────
   HERO PAGE
   ────────────────────────────────────────── */
.hero-page {
  position: relative;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.hero-ambient {
  position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 80% 60% at 65% 100%, rgba(14,165,233,0.11) 0%, transparent 65%),
    radial-gradient(ellipse 50% 40% at 5% 10%, rgba(139,92,246,0.08) 0%, transparent 55%),
    radial-gradient(ellipse 30% 25% at 92% 5%, rgba(14,165,233,0.05) 0%, transparent 50%),
    #060910;
  pointer-events: none;
}

.hero-grid {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(14,165,233,0.026) 1px, transparent 1px),
    linear-gradient(90deg, rgba(14,165,233,0.026) 1px, transparent 1px);
  background-size: 72px 72px;
  mask-image: radial-gradient(ellipse 95% 90% at 50% 50%, black, transparent);
  pointer-events: none;
}

/* Spline canvas */
.hero-spline {
  position: absolute; inset: 0; z-index: 1;
}
.hero-spline canvas { width: 100% !important; height: 100% !important; display: block; }

/* Gradient fades for text readability */
.hero-fade-left {
  position: absolute; inset: 0;
  background: linear-gradient(
    90deg,
    rgba(6,9,16,0.97) 0%,
    rgba(6,9,16,0.85) 28%,
    rgba(6,9,16,0.38) 52%,
    transparent 72%
  );
  z-index: 2; pointer-events: none;
}
.hero-fade-bottom {
  position: absolute; bottom: 0; left: 0; right: 0; height: 200px;
  background: linear-gradient(transparent, rgba(6,9,16,0.99));
  z-index: 3; pointer-events: none;
}

/* Cover Spline badge - matches background exactly */
.spline-cover {
  position: absolute;
  bottom: 0; right: 0;
  width: 230px; height: 56px;
  background: #060910;
  z-index: 100;
  pointer-events: none;
}

/* Transparent overlay on the RIGHT side to capture mouse over the robot */
.spline-mouse-capture {
  position: absolute;
  top: 0; right: 0; bottom: 0;
  left: 30%;
  z-index: 6;
  pointer-events: auto;
  background: transparent;
}

/* Main content above stats */
.hero-body {
  flex: 1;
  display: flex;
  align-items: center;
  position: relative;
  z-index: 10;
  padding: 80px 80px 0;
  pointer-events: none; /* let mouse through to Spline */
}
/* Re-enable pointer on interactive elements */
.hero-body button, .hero-body a { pointer-events: auto; }

.hero-content { max-width: 560px; }

/* Eyebrow */
.hero-eyebrow {
  display: inline-flex; align-items: center; gap: 10px;
  border: 1px solid rgba(14,165,233,0.22);
  background: rgba(14,165,233,0.06);
  backdrop-filter: blur(14px);
  border-radius: 100px; padding: 6px 16px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.59rem; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--cyan);
  margin-bottom: 24px;
  animation: fadeUp 0.9s cubic-bezier(0.23,1,0.32,1) 0.1s both;
  pointer-events: auto;
}
.eyebrow-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--cyan); box-shadow: 0 0 8px var(--cyan);
  animation: pulse 2.2s ease infinite;
}
.eyebrow-ver {
  padding: 2px 8px;
  background: rgba(14,165,233,0.1); border: 1px solid rgba(14,165,233,0.2);
  border-radius: 100px; font-size: 0.54rem; letter-spacing: 0.1em;
  color: rgba(34,211,238,0.65);
}

/* Title */
.hero-title {
  font-family: 'Orbitron', sans-serif;
  font-size: clamp(2.6rem, 5.5vw, 5.4rem);
  font-weight: 900; line-height: 1.06;
  letter-spacing: -0.02em;
  margin-bottom: 20px;
  animation: fadeUp 1s cubic-bezier(0.23,1,0.32,1) 0.22s both;
}
.ht-1 { display: block; color: rgba(232,237,245,0.95); }
.ht-2 {
  display: block;
  background: linear-gradient(90deg, var(--blue) 0%, var(--cyan) 45%, var(--purple) 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.ht-3 { display: block; color: rgba(232,237,245,0.65); }

/* Subtitle */
.hero-sub {
  font-size: 0.97rem; color: var(--muted);
  line-height: 1.8; max-width: 420px;
  margin-bottom: 40px;
  animation: fadeUp 1s cubic-bezier(0.23,1,0.32,1) 0.36s both;
}

/* CTA */
.hero-ctas {
  display: flex; align-items: center; gap: 12px;
  animation: fadeUp 1s cubic-bezier(0.23,1,0.32,1) 0.5s both;
}

.btn-launch {
  position: relative;
  display: inline-flex; align-items: center; gap: 12px;
  padding: 14px 30px;
  background: linear-gradient(135deg, rgba(14,165,233,0.2), rgba(139,92,246,0.14));
  border: 1px solid rgba(14,165,233,0.5);
  border-radius: 4px;
  font-family: 'Orbitron', sans-serif;
  font-size: 0.63rem; font-weight: 700; letter-spacing: 0.15em;
  text-transform: uppercase; color: var(--text);
  overflow: hidden; transition: all 0.3s ease;
}
.btn-launch::before {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(14,165,233,0.15), transparent);
  background-size: 200% 100%; animation: shimmer 3.5s ease infinite;
}
.btn-launch:hover {
  border-color: var(--cyan);
  box-shadow: 0 0 40px rgba(14,165,233,0.28), 0 0 80px rgba(14,165,233,0.1);
  transform: translateY(-2px);
}
.btn-launch .arr { transition: transform 0.3s ease; display: inline-block; }
.btn-launch:hover .arr { transform: translateX(5px); }

.btn-outline {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 14px 24px;
  background: rgba(14,165,233,0.03);
  border: 1px solid rgba(232,237,245,0.1); border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem; letter-spacing: 0.08em; color: var(--muted);
  transition: all 0.25s ease;
}
.btn-outline:hover {
  border-color: rgba(232,237,245,0.22); color: var(--text);
  background: rgba(14,165,233,0.05);
}

/* Floating data tags */
.ftag {
  position: absolute;
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px;
  background: rgba(6,9,16,0.78);
  border: 1px solid rgba(14,165,233,0.18);
  border-radius: 6px; backdrop-filter: blur(16px);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.58rem; letter-spacing: 0.06em; color: var(--muted);
  white-space: nowrap; z-index: 15; pointer-events: none;
  animation: floatTag 4s ease infinite;
}
@keyframes floatTag { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-8px);} }
.ftag-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
.ftag-dot.c { background: var(--cyan); box-shadow: 0 0 6px var(--cyan); }
.ftag-dot.p { background: var(--purple); box-shadow: 0 0 6px var(--purple); }
.ftag-dot.b { background: var(--blue); box-shadow: 0 0 6px var(--blue); }

/* Stats strip — flush at bottom */
.hero-stats {
  position: relative;
  z-index: 20;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid rgba(14,165,233,0.1);
  animation: fadeUp 1s cubic-bezier(0.23,1,0.32,1) 0.7s both;
  flex-shrink: 0;
}

.sc {
  padding: 18px 28px;
  background: rgba(6,9,16,0.92);
  backdrop-filter: blur(24px);
  border-right: 1px solid rgba(14,165,233,0.07);
  position: relative; overflow: hidden;
  transition: background 0.3s ease;
}
.sc:last-child { border-right: none; }
.sc:hover { background: rgba(14,165,233,0.04); }
.sc::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(14,165,233,0.5), transparent);
  opacity: 0; transition: opacity 0.3s;
}
.sc:hover::before { opacity: 1; }
.sc-v {
  font-family: 'Orbitron', sans-serif;
  font-size: 1.25rem; font-weight: 800;
  background: linear-gradient(90deg, var(--cyan), var(--blue));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text; line-height: 1; margin-bottom: 5px;
}
.sc-l {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.56rem; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--dim);
}

/* Side decoration */
.side-decor {
  position: absolute; left: 0; top: 64px; bottom: 80px;
  width: 3px; z-index: 10; pointer-events: none;
}
.side-line {
  position: absolute; top: 20%; left: 0;
  width: 2px; height: 40%;
  background: linear-gradient(180deg, transparent, var(--blue), var(--purple), transparent);
  opacity: 0.35;
}

/* Cursor XY readout */
.cursor-coords {
  position: absolute; left: 80px; bottom: 90px; z-index: 20;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.56rem; letter-spacing: 0.1em; color: var(--dim);
  display: flex; gap: 12px; pointer-events: none;
  animation: fadeIn 2s ease 1.2s both;
}
.coord-v { color: var(--muted); }

/* Robot look indicator */
.robot-look-indicator {
  position: absolute;
  z-index: 15; pointer-events: none;
  width: 60px; height: 60px;
  border: 1px solid rgba(34,211,238,0.15);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  transition: left 0.08s ease, top 0.08s ease;
}
.rli-inner {
  width: 8px; height: 8px; border-radius: 50%;
  background: rgba(34,211,238,0.4);
  box-shadow: 0 0 12px rgba(34,211,238,0.6);
  animation: pulse 2s ease infinite;
}
`;

/* ─── The core trick: directly rotate the Spline 3D object ──────────────
   Spline's Application object exposes findObjectByName() which returns
   the Three.js-like object. We animate its rotation.y / rotation.x
   smoothly with a lerp RAF loop to follow the cursor.
   ─────────────────────────────────────────────────────────────────────── */
export default function HeroPage({ setPage }) {
  const splineRef    = useRef(null);
  const robotRef     = useRef(null);   // the 3D object we'll rotate
  const headRef      = useRef(null);   // secondary object (head if found)
  const targetRot    = useRef({ x: 0, y: 0 });
  const currentRot   = useRef({ x: 0, y: 0 });
  const rafRef       = useRef(null);
  const [coords, setCoords] = useState({ x: 0, y: 0 });

  /* ── On Spline load, grab the robot object by name ── */
  const onSplineLoad = useCallback((spline) => {
    splineRef.current = spline;

    // Try common names used in Spline scenes for robot/character objects.
    // The NEXBOT scene typically names its root object "Scene" or "Robot".
    // We try multiple fallback names.
    const names = [
      "Robot", "robot", "Character", "character",
      "Head", "head", "Armature", "Root",
      "Scene", "Mesh", "Body", "NEXBOT", "Bot"
    ];

    let found = null;
    for (const name of names) {
      try {
        const obj = spline.findObjectByName(name);
        if (obj) { found = obj; break; }
      } catch (_) {}
    }

    if (found) {
      robotRef.current = found;
    } else {
      // If no named object found, try to get all objects
      try {
        const all = spline.getAllObjects ? spline.getAllObjects() : [];
        // Pick the largest/root object
        if (all && all.length > 0) {
          robotRef.current = all[0];
        }
      } catch (_) {}
    }

    // Start the smooth rotation RAF loop
    startRotationLoop();
  }, []);

  /* ── RAF loop: smooth lerp current rotation → target ── */
  const startRotationLoop = useCallback(() => {
    const lerp = (a, b, t) => a + (b - a) * t;
    const tick = () => {
      // 0.07 = smooth but responsive; higher = snappier
      currentRot.current.x = lerp(currentRot.current.x, targetRot.current.x, 0.07);
      currentRot.current.y = lerp(currentRot.current.y, targetRot.current.y, 0.07);

      if (robotRef.current) {
        try {
          // Apply to all possible rotation properties
          robotRef.current.rotation.y = currentRot.current.y;
          robotRef.current.rotation.x = currentRot.current.x;
          // Also try position offset for scenes that use position-based tracking
          robotRef.current.position && (robotRef.current.position.x = currentRot.current.y * 30);
        } catch (_) {}
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  /* ── Mouse move: compute normalized angles ── */
  const handleMouseMove = useCallback((e) => {
    const { innerWidth: W, innerHeight: H } = window;

    // nx: -1 (left) → +1 (right)
    const nx = (e.clientX / W - 0.5) * 2;
    // ny: -1 (top) → +1 (bottom)  — NOTE: no negation, so cursor down = positive
    const ny = (e.clientY / H - 0.5) * 2;

    // In Spline/Three.js:
    //   rotation.y positive = turn LEFT (face right when cursor goes right → negative)
    //   rotation.x positive = tilt DOWN (face down when cursor goes down → positive)
    const MAX_Y = 0.4;   // horizontal range
    const MAX_X = 0.25;  // vertical range — more range so bottom is reachable

    targetRot.current.y = nx * MAX_Y;   // cursor right → robot looks right
    targetRot.current.x = ny * MAX_X;   // cursor down → robot looks down

    setCoords({ x: Math.round(e.clientX), y: Math.round(e.clientY) });
  }, []);

  /* ── Cleanup RAF on unmount ── */
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <>
      <style>{css}</style>

      <div className="hero-page" onMouseMove={handleMouseMove}>
        <div className="hero-ambient" />
        <div className="hero-grid" />

        {/* Spline 3D Robot */}
        <div className="hero-spline">
          <Spline
            scene="https://prod.spline.design/QZ3SIjVtdoEgkUWa/scene.splinecode"
            onLoad={onSplineLoad}
          />
        </div>

        {/* Gradient fades */}
        <div className="hero-fade-left" />
        <div className="hero-fade-bottom" />

        {/* Cover "Built with Spline" badge */}
        <div className="spline-cover" />

        {/* Side decoration */}
        <div className="side-decor">
          <div className="side-line" />
        </div>

        {/* Main content */}
        <div className="hero-body">
          <div className="hero-content">
            <div className="hero-eyebrow">
              <div className="eyebrow-dot" />
              Simulation Engine
              <div className="eyebrow-ver">v2.4.1</div>
            </div>

            <h1 className="hero-title">
              <span className="ht-1">From</span>
              <span className="ht-2">Pixels</span>
              <span className="ht-3">to Physics</span>
            </h1>

            <p className="hero-sub">
              Transform real-world videos into physics-aware 3D robotic
              simulation environments — automatically, in seconds.
            </p>

            <div className="hero-ctas">
              <button className="btn-launch" onClick={() => setPage("upload")}>
                Launch Engine
                <span className="arr">→</span>
              </button>
              <button className="btn-outline" onClick={() => setPage("pipeline")}>
                <span style={{ opacity: 0.4, fontSize: "0.65rem" }}>▶</span>
                View Pipeline
              </button>
            </div>
          </div>
        </div>

        {/* Floating data tags near robot */}
        <div className="ftag" style={{ top: "26%", right: "7%", animationDuration: "3.8s" }}>
          <div className="ftag-dot c" />Depth Est. · Active
        </div>
        <div className="ftag" style={{ top: "50%", right: "3%", animationDuration: "4.5s", animationDelay: "1.1s" }}>
          <div className="ftag-dot p" />1.2M Points · Rendered
        </div>
        <div className="ftag" style={{ top: "69%", right: "9%", animationDuration: "4.1s", animationDelay: "0.6s" }}>
          <div className="ftag-dot b" />CUDA 12.1 · RTX 4090
        </div>

        {/* Live cursor coordinates */}
        <div className="cursor-coords">
          <span>X <span className="coord-v">{String(coords.x).padStart(4, "0")}</span></span>
          <span>Y <span className="coord-v">{String(coords.y).padStart(4, "0")}</span></span>
          <span style={{ color: "rgba(34,211,238,0.4)" }}>· TRACKING</span>
        </div>

        {/* Stats strip — bottom of flex column, no overlap */}
        <div className="hero-stats">
          {[
            { v: "< 5s",  l: "Reconstruction Time" },
            { v: "1.2M",  l: "Points Per Scene" },
            { v: "99.3%", l: "Depth Accuracy" },
            { v: "CUDA",  l: "GPU Accelerated" },
          ].map((s, i) => (
            <div className="sc" key={i}>
              <div className="sc-v">{s.v}</div>
              <div className="sc-l">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
