import { useState, useRef } from "react";

const css = `
.upload-page {
  min-height: 100vh;
  padding-top: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.upload-bg {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 50% 50% at 50% 60%, rgba(14,165,233,0.08) 0%, transparent 60%),
    radial-gradient(ellipse 30% 30% at 15% 20%, rgba(139,92,246,0.06) 0%, transparent 55%),
    var(--bg);
}
.upload-grid {
  position: absolute; inset: 0; pointer-events: none;
  background-image:
    linear-gradient(rgba(14,165,233,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(14,165,233,0.025) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: radial-gradient(ellipse 60% 60% at 50% 50%, black, transparent);
}

.upload-center {
  position: relative; z-index: 1;
  width: 100%; max-width: 620px;
  padding: 0 24px;
}

/* ── Upload card ── */
.upload-card {
  background: rgba(10,14,26,0.85);
  border: 1px solid rgba(14,165,233,0.2);
  border-radius: 14px;
  padding: 48px;
  backdrop-filter: blur(32px);
  position: relative;
  overflow: hidden;
  animation: borderGlow 4s ease infinite;
}

.upload-card::before {
  content: '';
  position: absolute;
  top: -1px; left: -1px; right: -1px; bottom: -1px;
  border-radius: 14px;
  background: linear-gradient(135deg,
    rgba(14,165,233,0.25) 0%,
    transparent 40%,
    transparent 60%,
    rgba(139,92,246,0.2) 100%
  );
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  padding: 1px; pointer-events: none;
  animation: spin 8s linear infinite;
}

.upload-scan {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--cyan), transparent);
  animation: scanDown 4s ease-in-out infinite;
  pointer-events: none;
}

.card-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 32px;
}
.card-title {
  font-family: 'Orbitron', monospace;
  font-size: 0.65rem; letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--cyan);
  display: flex; align-items: center; gap: 8px;
}
.card-title::before {
  content: '';
  width: 20px; height: 1px;
  background: var(--cyan); box-shadow: 0 0 6px var(--cyan);
}
.card-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.58rem; letter-spacing: 0.1em;
  color: var(--muted);
  border: 1px solid rgba(14,165,233,0.15);
  border-radius: 100px; padding: 4px 12px;
}

.upload-heading {
  font-family: 'Orbitron', sans-serif;
  font-size: 1.5rem; font-weight: 700;
  margin-bottom: 10px; line-height: 1.3;
}
.upload-sub {
  font-size: 0.88rem; color: var(--muted);
  line-height: 1.7; margin-bottom: 32px;
}

/* ── Drop zone ── */
.drop-zone {
  border: 1px dashed rgba(14,165,233,0.28);
  border-radius: 10px;
  padding: 56px 24px;
  text-align: center;
  transition: all 0.3s ease;
  position: relative; overflow: hidden;
}
.drop-zone.drag { border-color: var(--cyan); background: rgba(14,165,233,0.05); }
.drop-zone:hover { border-color: rgba(14,165,233,0.45); background: rgba(14,165,233,0.03); }

.drop-zone::after {
  content: '';
  position: absolute;
  top: -50%; left: -50%; right: -50%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--cyan), transparent);
  animation: scanDown 5s ease-in-out infinite;
  opacity: 0.3;
}

.dz-icon {
  width: 64px; height: 64px;
  border: 1px solid rgba(14,165,233,0.25);
  border-radius: 16px;
  background: rgba(14,165,233,0.06);
  display: flex; align-items: center; justify-content: center;
  font-size: 1.6rem;
  margin: 0 auto 20px;
  animation: float 3s ease infinite;
}
.dz-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.75rem; font-weight: 600; letter-spacing: 0.1em;
  text-transform: uppercase; margin-bottom: 8px;
}
.dz-hint {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem; color: var(--muted); margin-bottom: 24px;
}
.dz-btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 24px;
  background: rgba(14,165,233,0.1);
  border: 1px solid rgba(14,165,233,0.3);
  border-radius: 5px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem; letter-spacing: 0.08em;
  color: var(--cyan);
  transition: all 0.2s ease;
}
.dz-btn:hover { background: rgba(14,165,233,0.18); border-color: var(--cyan); }

/* ── Format tags ── */
.format-row {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  margin-top: 20px;
}
.fmt-tag {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.58rem; letter-spacing: 0.08em;
  color: var(--dim); border: 1px solid rgba(14,165,233,0.1);
  border-radius: 4px; padding: 3px 8px;
}

/* ── Processing view ── */
.proc-view { animation: fadeIn 0.4s ease; }

.proc-header {
  margin-bottom: 32px;
}
.proc-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 1rem; font-weight: 700; letter-spacing: 0.04em;
}
.proc-status {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem; color: var(--cyan); margin-top: 6px;
  display: flex; align-items: center; gap: 8px;
}
.proc-blink {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--cyan); box-shadow: 0 0 8px var(--cyan);
  animation: pulse 1s ease infinite;
}

.proc-steps { display: flex; flex-direction: column; gap: 2px; }

.proc-row {
  display: flex; align-items: center; gap: 16px;
  padding: 14px 16px;
  border-radius: 6px;
  transition: background 0.3s ease;
}
.proc-row.active { background: rgba(14,165,233,0.06); }
.proc-row.done   { background: rgba(34,211,238,0.04); }

.proc-indicator {
  width: 10px; height: 10px; border-radius: 50%;
  border: 1px solid rgba(14,165,233,0.2);
  flex-shrink: 0;
  transition: all 0.3s ease;
}
.proc-indicator.active {
  border-color: var(--blue);
  background: var(--blue);
  box-shadow: 0 0 12px var(--blue);
  animation: pulse 1s ease infinite;
}
.proc-indicator.done {
  border-color: var(--cyan);
  background: var(--cyan);
  box-shadow: 0 0 10px var(--cyan);
}

.proc-label {
  flex: 1;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.78rem; letter-spacing: 0.04em;
  color: var(--muted);
  transition: color 0.3s ease;
}
.proc-label.active, .proc-label.done { color: var(--text); }

.proc-progress {
  width: 100px; height: 2px;
  background: rgba(14,165,233,0.12);
  border-radius: 1px; overflow: hidden;
}
.proc-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--blue), var(--cyan));
  border-radius: 1px;
  animation: shimmer 1.5s ease infinite;
  background-size: 200% 100%;
}

.proc-check {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem; color: var(--cyan);
  width: 20px; text-align: center;
}

/* Complete state */
.proc-complete {
  margin-top: 28px;
  padding: 20px 24px;
  background: rgba(34,211,238,0.06);
  border: 1px solid rgba(34,211,238,0.2);
  border-radius: 8px;
  display: flex; align-items: center; justify-content: space-between;
  animation: fadeUp 0.5s ease both;
}
.complete-info {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem; color: var(--cyan); letter-spacing: 0.06em;
}
.complete-sub {
  font-size: 0.62rem; color: var(--muted); margin-top: 4px;
}
.btn-complete {
  padding: 10px 24px;
  background: linear-gradient(135deg, rgba(14,165,233,0.2), rgba(139,92,246,0.15));
  border: 1px solid rgba(14,165,233,0.4);
  border-radius: 5px;
  font-family: 'Orbitron', sans-serif;
  font-size: 0.62rem; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--text);
  transition: all 0.25s ease;
}
.btn-complete:hover { border-color: var(--cyan); box-shadow: 0 0 20px rgba(14,165,233,0.2); }
`;

const PROC_STEPS = [
  { label: "Extracting frames",        dur: 1200 },
  { label: "Estimating depth maps",    dur: 1800 },
  { label: "Generating 3D geometry",   dur: 2000 },
  { label: "Global alignment",         dur: 1500 },
  { label: "Rendering interactive scene", dur: 1400 },
];

function useProcessing(onDone) {
  const [step, setStep] = useState(-1);
  const [running, setRunning] = useState(false);

  const start = () => {
    setRunning(true);
    setStep(0);
    let i = 0;
    const advance = () => {
      i++;
      if (i < PROC_STEPS.length) {
        setStep(i);
        setTimeout(advance, PROC_STEPS[i].dur);
      } else {
        setStep(PROC_STEPS.length);
      }
    };
    setTimeout(advance, PROC_STEPS[0].dur);
  };

  return { step, running, start };
}

export default function UploadPage({ setPage }) {
  const [drag, setDrag] = useState(false);
  const [started, setStarted] = useState(false);
  const { step, start } = useProcessing();

  const handleStart = () => { setStarted(true); start(); };
  const isComplete = step >= PROC_STEPS.length;

  return (
    <div className="upload-page">
      <style>{css}</style>
      <div className="upload-bg" />
      <div className="upload-grid" />

      <div className="upload-center">
        <div className="section-tag" style={{ marginBottom: 20 }}>03 — Engine</div>

        <div className="upload-card">
          <div className="upload-scan" />

          <div className="card-header">
            <div className="card-title">Reconstruction Engine</div>
            <div className="card-badge">v2.4.1 · CUDA</div>
          </div>

          {!started ? (
            <>
              <div className="upload-heading">
                <span className="gradient-text">Upload</span> Source Video
              </div>
              <div className="upload-sub">
                Provide any real-world footage. The system extracts geometry, estimates depth, and generates an interactive 3D simulation automatically.
              </div>

              <div
                className={`drop-zone ${drag ? "drag" : ""}`}
                onDragOver={e => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={e => { e.preventDefault(); setDrag(false); handleStart(); }}
                onClick={handleStart}
              >
                <div className="dz-icon">⬡</div>
                <div className="dz-title">Drop video file here</div>
                <div className="dz-hint">or click anywhere in this zone</div>
                <div className="dz-btn">
                  <span>↑</span> Browse files
                </div>
                <div className="format-row">
                  {["MP4", "MOV", "AVI", "MKV"].map(f => <div key={f} className="fmt-tag">{f}</div>)}
                  <div className="fmt-tag" style={{ borderStyle: "dashed" }}>MAX 2GB</div>
                </div>
              </div>
            </>
          ) : (
            <div className="proc-view">
              <div className="proc-header">
                <div className="proc-title">
                  {isComplete ? "Reconstruction Complete" : "Processing Pipeline"}
                </div>
                <div className="proc-status">
                  <div className="proc-blink" />
                  {isComplete ? "Environment ready" : `Stage ${Math.min(step + 1, PROC_STEPS.length)} of ${PROC_STEPS.length}`}
                </div>
              </div>

              <div className="proc-steps">
                {PROC_STEPS.map((s, i) => {
                  const state = i < step ? "done" : i === step ? "active" : "pending";
                  return (
                    <div key={i} className={`proc-row ${state}`}>
                      <div className={`proc-indicator ${state}`} />
                      <div className={`proc-label ${state}`}>{s.label}</div>
                      {state === "active" && (
                        <div className="proc-progress">
                          <div className="proc-fill" />
                        </div>
                      )}
                      {state === "done" && <div className="proc-check">✓</div>}
                    </div>
                  );
                })}
              </div>

              {isComplete && (
                <div className="proc-complete">
                  <div>
                    <div className="complete-info">✓ Scene ready · 1.2M points</div>
                    <div className="complete-sub">Reconstruction completed in 4.3s · GPU accelerated</div>
                  </div>
                  <button className="btn-complete" onClick={() => setPage("viewer")}>
                    Open Viewer →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
