import { useState } from "react";

const css = `
.viewer-page {
  min-height: 100vh;
  padding-top: 64px;
  background: var(--bg);
  display: flex;
  flex-direction: column;
}

.viewer-header {
  padding: 32px 48px 0;
  display: flex; align-items: flex-end; justify-content: space-between;
}
.viewer-header-left { }
.viewer-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 1.8rem; font-weight: 700; line-height: 1.2;
}
.viewer-meta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem; color: var(--muted); letter-spacing: 0.1em;
  margin-top: 6px; display: flex; align-items: center; gap: 16px;
}
.meta-sep { width: 1px; height: 12px; background: var(--glass-border); }

.viewer-toolbar {
  display: flex; align-items: center; gap: 8px;
}
.toolbar-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 16px;
  background: var(--glass);
  border: 1px solid rgba(14,165,233,0.12);
  border-radius: 5px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem; letter-spacing: 0.06em;
  color: var(--muted);
  transition: all 0.2s ease;
}
.toolbar-btn:hover {
  border-color: rgba(14,165,233,0.35);
  color: var(--text); background: rgba(14,165,233,0.07);
}
.toolbar-btn.active {
  border-color: var(--cyan); color: var(--cyan);
  background: rgba(14,165,233,0.1);
}
.tb-dot {
  width: 5px; height: 5px; border-radius: 50%;
  border: 1px solid currentColor;
}
.toolbar-btn.active .tb-dot { background: currentColor; box-shadow: 0 0 6px currentColor; }

/* ── Main layout ── */
.viewer-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 220px 1fr 200px;
  gap: 12px;
  padding: 20px 48px 32px;
}

/* ── Panels ── */
.v-panel {
  background: rgba(10,14,26,0.8);
  border: 1px solid rgba(14,165,233,0.1);
  border-radius: 8px;
  padding: 20px;
  backdrop-filter: blur(20px);
  display: flex; flex-direction: column; gap: 0;
}
.v-panel-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.58rem; font-weight: 600;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--cyan); margin-bottom: 20px;
  display: flex; align-items: center; gap: 8px;
}
.v-panel-title::after {
  content: ''; flex: 1; height: 1px;
  background: linear-gradient(90deg, rgba(14,165,233,0.3), transparent);
}

/* Stats */
.v-stat { margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid rgba(14,165,233,0.05); }
.v-stat:last-of-type { border-bottom: none; }
.v-stat-lbl {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.58rem; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--dim); margin-bottom: 6px;
}
.v-stat-val {
  font-family: 'Orbitron', sans-serif;
  font-size: 1.05rem; font-weight: 700;
  background: linear-gradient(90deg, var(--cyan), var(--blue));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
.v-stat-sub { font-size: 0.68rem; color: var(--muted); margin-top: 2px; }

.gpu-pill {
  display: inline-flex; align-items: center; gap: 6px;
  background: rgba(139,92,246,0.1);
  border: 1px solid rgba(139,92,246,0.25);
  border-radius: 100px; padding: 5px 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.58rem; letter-spacing: 0.08em; color: var(--purple);
  margin-top: 4px;
}
.gpu-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--purple); box-shadow: 0 0 6px var(--purple); animation: pulse 2s ease infinite; }

/* ── Canvas ── */
.viewer-canvas {
  position: relative;
  background: radial-gradient(ellipse 70% 60% at 50% 50%,
    rgba(14,165,233,0.04) 0%, rgba(6,9,16,0.95) 70%
  );
  border: 1px solid rgba(14,165,233,0.1);
  border-radius: 8px;
  overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  min-height: 500px;
}

.canvas-corner {
  position: absolute;
  width: 16px; height: 16px;
}
.cc-tl { top: 12px; left: 12px; border-top: 1px solid rgba(14,165,233,0.5); border-left: 1px solid rgba(14,165,233,0.5); }
.cc-tr { top: 12px; right: 12px; border-top: 1px solid rgba(14,165,233,0.5); border-right: 1px solid rgba(14,165,233,0.5); }
.cc-bl { bottom: 12px; left: 12px; border-bottom: 1px solid rgba(14,165,233,0.5); border-left: 1px solid rgba(14,165,233,0.5); }
.cc-br { bottom: 12px; right: 12px; border-bottom: 1px solid rgba(14,165,233,0.5); border-right: 1px solid rgba(14,165,233,0.5); }

.canvas-scan {
  position: absolute;
  left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, var(--cyan), transparent);
  animation: scanDown 5s ease-in-out infinite;
  opacity: 0.35;
}

.canvas-label {
  position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.6rem; letter-spacing: 0.12em; color: var(--dim);
  display: flex; align-items: center; gap: 6px;
}
.canvas-live-dot { width: 5px; height: 5px; border-radius: 50%; background: #22C55E; box-shadow: 0 0 6px #22C55E; animation: pulse 2s ease infinite; }

/* SVG scene */
.scene-svg { opacity: 0.75; }

.canvas-hint {
  position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.58rem; letter-spacing: 0.1em; color: var(--dim);
  display: flex; align-items: center; gap: 16px;
  white-space: nowrap;
}

/* ── Control buttons ── */
.ctrl-section { margin-bottom: 20px; }
.ctrl-section-lbl {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.55rem; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--dim); margin-bottom: 8px;
}
.ctrl-btn-sm {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 9px 12px;
  background: rgba(14,165,233,0.03);
  border: 1px solid rgba(14,165,233,0.1);
  border-radius: 5px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.67rem; letter-spacing: 0.04em;
  color: var(--muted); margin-bottom: 6px;
  transition: all 0.2s ease;
  text-align: left;
}
.ctrl-btn-sm:hover { border-color: rgba(14,165,233,0.3); color: var(--text); background: rgba(14,165,233,0.06); }
.ctrl-btn-sm.on { border-color: rgba(14,165,233,0.4); color: var(--cyan); background: rgba(14,165,233,0.08); }
.ctrl-dot-sm {
  width: 6px; height: 6px; border-radius: 50%;
  border: 1px solid currentColor; flex-shrink: 0;
}
.ctrl-btn-sm.on .ctrl-dot-sm { background: var(--cyan); box-shadow: 0 0 6px var(--cyan); }

.ctrl-divider { height: 1px; background: rgba(14,165,233,0.06); margin: 12px 0; }

.action-btn {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 9px 12px;
  background: none;
  border: 1px solid rgba(14,165,233,0.08);
  border-radius: 5px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.67rem; letter-spacing: 0.04em;
  color: var(--dim); margin-bottom: 6px;
  transition: all 0.2s ease; text-align: left;
}
.action-btn:hover { border-color: rgba(14,165,233,0.25); color: var(--muted); }
.action-icon { font-size: 0.8rem; opacity: 0.6; }
`;

const LAYER_CONTROLS = [
  { key: "points",    label: "Point Cloud" },
  { key: "mesh",      label: "Mesh Surface" },
  { key: "wireframe", label: "Wireframe" },
];

// SVG Point cloud visualization
function SceneViz({ layers }) {
  const pts = Array.from({ length: 200 }, (_, i) => {
    const a = (i / 200) * Math.PI * 2;
    const r = 40 + Math.sin(i * 1.7 + 0.3) * 55 + Math.cos(i * 0.8) * 30;
    const y = 200 + Math.sin(a * 0.7) * r * 0.45 + (Math.random() - 0.5) * 40;
    const x = 280 + Math.cos(a) * r * 1.1 + (Math.random() - 0.5) * 30;
    return { x, y, r: Math.random() > 0.85 ? 2.2 : 1.1, c: i % 5 === 0 ? "#22D3EE" : i % 3 === 0 ? "#8B5CF6" : "#0EA5E9" };
  });

  return (
    <svg className="scene-svg" viewBox="0 0 560 400" style={{ width: "100%", maxWidth: 480 }}>
      <defs>
        <filter id="vglow">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Wireframe box */}
      {(layers.wireframe || layers.mesh) && (
        <g opacity={layers.wireframe ? 0.6 : 0.2}>
          {/* Cube outline */}
          <polygon points="280,80 400,140 400,260 280,320 160,260 160,140"
            fill={layers.mesh ? "rgba(14,165,233,0.04)" : "none"}
            stroke="rgba(14,165,233,0.35)" strokeWidth="0.8" filter="url(#vglow)" />
          <polygon points="280,80 400,140 280,200 160,140"
            fill={layers.mesh ? "rgba(14,165,233,0.03)" : "none"}
            stroke="rgba(14,165,233,0.2)" strokeWidth="0.8" />
          <line x1="280" y1="200" x2="280" y2="320" stroke="rgba(14,165,233,0.2)" strokeWidth="0.8" />
          <line x1="280" y1="200" x2="400" y2="260" stroke="rgba(14,165,233,0.15)" strokeWidth="0.6" />
          <line x1="280" y1="200" x2="160" y2="260" stroke="rgba(14,165,233,0.15)" strokeWidth="0.6" />
          {/* Grid lines */}
          {[0.33, 0.66].map((t, i) => (
            <g key={i}>
              <line x1={160 + 240 * t} y1={140 + 60 * t} x2={280 + 120 * t} y2={80 + 60 * t} stroke="rgba(14,165,233,0.1)" strokeWidth="0.5" />
              <line x1={160 + 240 * t} y1={140 + 60 * t} x2={160 + 240 * t} y2={260 + 60 * t} stroke="rgba(14,165,233,0.1)" strokeWidth="0.5" />
            </g>
          ))}
        </g>
      )}

      {/* Point cloud */}
      {layers.points && pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.r}
          fill={p.c} opacity={0.35 + Math.random() * 0.55}
          filter={p.r > 1.8 ? "url(#vglow)" : undefined} />
      ))}

      {/* Center glow */}
      <circle cx="280" cy="200" r="8" fill="#22D3EE" opacity="0.7" filter="url(#vglow)" />
      <circle cx="280" cy="200" r="3" fill="#fff" opacity="0.9" />

      {/* Axes */}
      <g opacity="0.5">
        <line x1="280" y1="200" x2="360" y2="160" stroke="#EF4444" strokeWidth="1.5" />
        <line x1="280" y1="200" x2="280" y2="120" stroke="#22C55E" strokeWidth="1.5" />
        <line x1="280" y1="200" x2="200" y2="160" stroke="#3B82F6" strokeWidth="1.5" />
        <text x="365" y="158" fill="#EF4444" fontSize="8" fontFamily="JetBrains Mono">X</text>
        <text x="278" y="112" fill="#22C55E" fontSize="8" fontFamily="JetBrains Mono">Y</text>
        <text x="185" y="158" fill="#3B82F6" fontSize="8" fontFamily="JetBrains Mono">Z</text>
      </g>
    </svg>
  );
}

export default function ViewerPage({ setPage }) {
  const [layers, setLayers] = useState({ points: true, mesh: false, wireframe: true });
  const toggle = (k) => setLayers(l => ({ ...l, [k]: !l[k] }));

  return (
    <div className="viewer-page">
      <style>{css}</style>

      {/* Header */}
      <div className="viewer-header">
        <div className="viewer-header-left">
          <div className="section-tag" style={{ marginBottom: 8 }}>04 — Scene Viewer</div>
          <div className="viewer-title">
            <span className="gradient-text">3D</span> Scene
          </div>
          <div className="viewer-meta">
            <span>scene_001.ply</span>
            <div className="meta-sep" />
            <span>Loaded 4.3s ago</span>
            <div className="meta-sep" />
            <span style={{ color: "var(--cyan)" }}>1.2M points</span>
          </div>
        </div>

        <div className="viewer-toolbar">
          {["Orbit", "Pan", "Zoom"].map(t => (
            <button key={t} className={`toolbar-btn ${t === "Orbit" ? "active" : ""}`}>
              <div className="tb-dot" />
              {t}
            </button>
          ))}
          <button className="toolbar-btn" style={{ color: "var(--muted)" }} onClick={() => setPage("upload")}>
            ← New Upload
          </button>
        </div>
      </div>

      {/* Layout */}
      <div className="viewer-layout">
        {/* Stats panel */}
        <div className="v-panel">
          <div className="v-panel-title">Scene Stats</div>

          {[
            { lbl: "Frames Processed", val: "2,847", sub: "At 30fps" },
            { lbl: "3D Point Count", val: "1.2M", sub: "Dense cloud" },
            { lbl: "Reconstruction", val: "4.3s", sub: "Total time" },
            { lbl: "Depth Resolution", val: "512px", sub: "Per frame" },
          ].map((s, i) => (
            <div className="v-stat" key={i}>
              <div className="v-stat-lbl">{s.lbl}</div>
              <div className="v-stat-val">{s.val}</div>
              <div className="v-stat-sub">{s.sub}</div>
            </div>
          ))}

          <div className="v-stat-lbl" style={{ marginTop: 4 }}>Acceleration</div>
          <div className="gpu-pill">
            <div className="gpu-dot" />
            GPU · CUDA 12.1
          </div>
        </div>

        {/* Canvas */}
        <div className="viewer-canvas">
          <div className="canvas-corner cc-tl" />
          <div className="canvas-corner cc-tr" />
          <div className="canvas-corner cc-bl" />
          <div className="canvas-corner cc-br" />
          <div className="canvas-scan" />
          <div className="canvas-label">
            <div className="canvas-live-dot" />
            REAL-TIME RENDER · INTERACTIVE
          </div>
          <SceneViz layers={layers} />
          <div className="canvas-hint">
            <span>↻ Orbit</span>
            <span>⌖ Pan</span>
            <span>⊕ Zoom</span>
          </div>
        </div>

        {/* Controls panel */}
        <div className="v-panel">
          <div className="v-panel-title">Controls</div>

          <div className="ctrl-section">
            <div className="ctrl-section-lbl">Layers</div>
            {LAYER_CONTROLS.map(c => (
              <button
                key={c.key}
                className={`ctrl-btn-sm ${layers[c.key] ? "on" : ""}`}
                onClick={() => toggle(c.key)}
              >
                <div className="ctrl-dot-sm" />
                {c.label}
              </button>
            ))}
          </div>

          <div className="ctrl-divider" />

          <div className="ctrl-section">
            <div className="ctrl-section-lbl">Camera</div>
            {["Reset View", "Top Down", "Side View"].map(l => (
              <button key={l} className="action-btn">
                <span className="action-icon">⊙</span>
                {l}
              </button>
            ))}
          </div>

          <div className="ctrl-divider" />

          <div className="ctrl-section">
            <div className="ctrl-section-lbl">Export</div>
            {[
              { icon: "↓", label: "Point Cloud (.ply)" },
              { icon: "↓", label: "Mesh (.obj)" },
              { icon: "↓", label: "MuJoCo (.xml)" },
            ].map(a => (
              <button key={a.label} className="action-btn">
                <span className="action-icon">{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
