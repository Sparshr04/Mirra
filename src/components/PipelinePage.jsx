import { useState, useEffect } from "react";

const css = `
.pipeline-page {
  min-height: 100vh;
  padding-top: 64px;
  background: var(--bg);
  position: relative;
  overflow: hidden;
}

.pipeline-page-bg {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 60% 40% at 80% 20%, rgba(139,92,246,0.07) 0%, transparent 60%),
    radial-gradient(ellipse 40% 30% at 20% 80%, rgba(14,165,233,0.06) 0%, transparent 55%);
}

.pipeline-grid {
  position: absolute; inset: 0; pointer-events: none;
  background-image:
    linear-gradient(rgba(14,165,233,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(14,165,233,0.025) 1px, transparent 1px);
  background-size: 80px 80px;
}

.pipeline-inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 80px 48px;
  position: relative;
  z-index: 1;
}

.pipeline-header {
  margin-bottom: 80px;
}

/* ── Core element ── */
.core-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 72px;
}

.neural-core {
  position: relative;
  width: 180px; height: 180px;
  margin-bottom: 32px;
}

.nc-ring {
  position: absolute; border-radius: 50%;
}
.nc-ring-1 {
  inset: 0;
  border: 1px solid rgba(14,165,233,0.35);
  animation: spin 10s linear infinite;
}
.nc-ring-1::before, .nc-ring-1::after {
  content: '';
  position: absolute;
  width: 8px; height: 8px;
  background: var(--cyan);
  border-radius: 50%;
  box-shadow: 0 0 12px var(--cyan), 0 0 24px var(--cyan);
  top: -4px; left: 50%; transform: translateX(-50%);
}
.nc-ring-1::after {
  bottom: -4px; top: auto;
  background: var(--blue);
  box-shadow: 0 0 10px var(--blue);
}
.nc-ring-2 {
  inset: 20px;
  border: 1px solid rgba(139,92,246,0.3);
  animation: spinRev 6s linear infinite;
}
.nc-ring-2::before {
  content: '';
  position: absolute;
  width: 6px; height: 6px;
  background: var(--purple);
  border-radius: 50%;
  box-shadow: 0 0 10px var(--purple);
  right: -3px; top: 50%; transform: translateY(-50%);
}
.nc-ring-3 {
  inset: 40px;
  border: 1px solid rgba(14,165,233,0.15);
  animation: spin 3s linear infinite;
}
.nc-core {
  position: absolute;
  inset: 60px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(14,165,233,0.25) 0%, rgba(139,92,246,0.1) 50%, transparent 100%);
  border: 1px solid rgba(14,165,233,0.3);
  display: flex; align-items: center; justify-content: center;
  flex-direction: column; gap: 2px;
}
.nc-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.52rem; letter-spacing: 0.12em;
  color: var(--cyan); text-transform: uppercase;
  text-align: center; line-height: 1.5;
}

/* ── Steps grid ── */
.steps-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 2px;
  position: relative;
}

/* Connector line */
.steps-grid::before {
  content: '';
  position: absolute;
  top: 40px; left: 10%; right: 10%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--blue), var(--purple), transparent);
  opacity: 0.3;
  pointer-events: none;
  z-index: 0;
}

.step-card {
  position: relative;
  z-index: 1;
  padding: 28px 20px;
  background: rgba(6,9,16,0.8);
  border: 1px solid rgba(14,165,233,0.1);
  border-radius: 8px;
  transition: all 0.45s cubic-bezier(0.23,1,0.32,1);
  cursor: default;
  margin: 0 1px;
}

.step-card:hover,
.step-card.active {
  background: rgba(14,165,233,0.06);
  border-color: rgba(14,165,233,0.4);
  box-shadow: 0 0 40px rgba(14,165,233,0.1), 0 0 0 1px rgba(14,165,233,0.05);
  transform: translateY(-4px);
}

.step-card.active .step-orb { background: var(--cyan); box-shadow: 0 0 16px var(--cyan); }

.step-idx {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.58rem; letter-spacing: 0.15em;
  color: var(--dim); margin-bottom: 16px;
}
.step-orb {
  width: 36px; height: 36px; border-radius: 50%;
  border: 1px solid rgba(14,165,233,0.35);
  background: rgba(14,165,233,0.08);
  display: flex; align-items: center; justify-content: center;
  font-size: 1rem;
  margin-bottom: 16px;
  transition: all 0.4s ease;
}
.step-title-sm {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.62rem; font-weight: 600;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--text); margin-bottom: 10px; line-height: 1.4;
}
.step-body {
  font-size: 0.78rem; color: var(--muted); line-height: 1.65;
}
.step-tech {
  margin-top: 14px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.58rem; color: var(--cyan); opacity: 0.7;
  letter-spacing: 0.06em;
}

/* ── Detail panel ── */
.pipeline-detail {
  margin-top: 56px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.detail-card {
  padding: 32px;
  background: rgba(13,18,32,0.7);
  border: 1px solid rgba(14,165,233,0.1);
  border-radius: 10px;
  backdrop-filter: blur(16px);
  transition: border-color 0.3s ease;
}
.detail-card:hover { border-color: rgba(14,165,233,0.3); }
.detail-card-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.68rem; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--cyan);
  margin-bottom: 16px;
}
.detail-card-body {
  font-size: 0.88rem; color: var(--muted); line-height: 1.75;
}
.detail-card-body strong { color: var(--text); font-weight: 600; }

/* Metrics */
.metrics-row {
  display: flex; gap: 24px; margin-top: 20px;
}
.metric {
  flex: 1; text-align: center;
  padding: 16px;
  background: rgba(14,165,233,0.04);
  border: 1px solid rgba(14,165,233,0.1);
  border-radius: 6px;
}
.metric-val {
  font-family: 'Orbitron', sans-serif;
  font-size: 1.1rem; font-weight: 700;
  background: linear-gradient(135deg, var(--cyan), var(--blue));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
.metric-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.58rem; letter-spacing: 0.1em;
  color: var(--dim); text-transform: uppercase; margin-top: 4px;
}

.cta-row {
  margin-top: 56px;
  display: flex; align-items: center; justify-content: center;
}
`;

const STEPS = [
  {
    icon: "⬆",
    title: "Upload Video",
    body: "Any real-world footage — MP4, MOV, AVI. Indoor, outdoor, structured or unstructured environments.",
    tech: "Input: 720p–4K · up to 2GB",
  },
  {
    icon: "◈",
    title: "Depth Estimation",
    body: "Per-frame monocular depth via transformer-based neural networks trained on large-scale datasets.",
    tech: "Model: DepthAnything v2",
  },
  {
    icon: "⬡",
    title: "3D Reconstruction",
    body: "Multi-view stereo reconstruction generating dense point clouds and surface meshes.",
    tech: "Method: COLMAP + Gaussian",
  },
  {
    icon: "⊕",
    title: "Global Alignment",
    body: "Camera pose estimation and scene-level fusion for spatially consistent 3D geometry.",
    tech: "Accuracy: ±0.2cm",
  },
  {
    icon: "▣",
    title: "RL Environment",
    body: "Physics-ready simulation exported with collision meshes, material properties, and agent spawn points.",
    tech: "Export: USD, MuJoCo, IsaacGym",
  },
];

export default function PipelinePage({ setPage }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive(a => (a + 1) % STEPS.length), 2500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="pipeline-page">
      <style>{css}</style>
      <div className="pipeline-page-bg" />
      <div className="pipeline-grid" />

      <div className="pipeline-inner">
        <div className="pipeline-header">
          <div className="section-tag">02 — Architecture</div>
          <h1 className="display" style={{ fontSize: "clamp(2rem,4vw,3.2rem)", marginBottom: 16 }}>
            <span className="gradient-text">Automated</span> Pipeline
          </h1>
          <p style={{ color: "var(--muted)", fontSize: "1rem", maxWidth: 500, lineHeight: 1.75 }}>
            Five stages. Zero manual work. From raw video to a physics-aware simulation environment in seconds.
          </p>
        </div>

        {/* Neural core */}
        <div className="core-section">
          <div className="neural-core">
            <div className="nc-ring nc-ring-1" />
            <div className="nc-ring nc-ring-2" />
            <div className="nc-ring nc-ring-3" />
            <div className="nc-core">
              <div className="nc-label">NEURAL<br />CORE</div>
            </div>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.62rem", color: "var(--muted)", letterSpacing: "0.12em" }}>
            PROCESSING ENGINE ACTIVE
          </div>
        </div>

        {/* Steps */}
        <div className="steps-grid">
          {STEPS.map((s, i) => (
            <div
              key={i}
              className={`step-card ${i === active ? "active" : ""}`}
              onMouseEnter={() => setActive(i)}
            >
              <div className="step-idx">0{i + 1}</div>
              <div className="step-orb">{s.icon}</div>
              <div className="step-title-sm">{s.title}</div>
              <div className="step-body">{s.body}</div>
              <div className="step-tech">{s.tech}</div>
            </div>
          ))}
        </div>

        {/* Detail cards */}
        <div className="pipeline-detail">
          <div className="detail-card">
            <div className="detail-card-title">Technical Approach</div>
            <div className="detail-card-body">
              SimCraft uses <strong>monocular depth estimation</strong> combined with <strong>multi-view stereo geometry</strong> to reconstruct 3D scenes from standard video. No special hardware required — a smartphone is enough.
              <br /><br />
              The pipeline runs on <strong>CUDA-accelerated GPUs</strong>, achieving real-time inference for depth maps and sub-second point cloud generation.
            </div>
            <div className="metrics-row">
              {[
                { val: "47ms",  label: "Per Frame" },
                { val: "12x",   label: "GPU Speedup" },
                { val: "99.3%", label: "Accuracy" },
              ].map((m, i) => (
                <div className="metric" key={i}>
                  <div className="metric-val">{m.val}</div>
                  <div className="metric-label">{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="detail-card">
            <div className="detail-card-title">Simulation Output</div>
            <div className="detail-card-body">
              The final environment is exported as a <strong>physics-ready simulation</strong> compatible with major RL frameworks including MuJoCo, IsaacGym, and PyBullet.
              <br /><br />
              Collision meshes are automatically generated from the reconstructed geometry. Material properties are inferred from visual appearance. Agent spawn zones are detected from open floor area.
            </div>
            <div className="metrics-row">
              {[
                { val: "3",    label: "Export Formats" },
                { val: "< 5s", label: "Total Time" },
                { val: "Auto", label: "Collision Mesh" },
              ].map((m, i) => (
                <div className="metric" key={i}>
                  <div className="metric-val">{m.val}</div>
                  <div className="metric-label">{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="cta-row">
          <button
            className="btn-primary"
            onClick={() => setPage("upload")}
            style={{
              background: "linear-gradient(135deg, rgba(14,165,233,0.18), rgba(139,92,246,0.14))",
              border: "1px solid rgba(14,165,233,0.45)",
              borderRadius: "6px",
              padding: "16px 40px",
              fontFamily: "'Orbitron', sans-serif",
              fontSize: "0.68rem", fontWeight: 700,
              letterSpacing: "0.14em", textTransform: "uppercase",
              color: "var(--text)",
              transition: "all 0.3s ease",
              display: "inline-flex", alignItems: "center", gap: 12,
            }}
          >
            Try It Now →
          </button>
        </div>
      </div>
    </div>
  );
}
