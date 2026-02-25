import { useState } from "react";

const css = `
.why-page {
  min-height: 100vh;
  padding-top: 64px;
  background: var(--bg);
  position: relative; overflow: hidden;
}

.why-bg {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 50% 40% at 80% 30%, rgba(139,92,246,0.07) 0%, transparent 55%),
    radial-gradient(ellipse 40% 30% at 20% 70%, rgba(14,165,233,0.06) 0%, transparent 50%);
}
.why-grid {
  position: absolute; inset: 0; pointer-events: none;
  background-image:
    linear-gradient(rgba(14,165,233,0.022) 1px, transparent 1px),
    linear-gradient(90deg, rgba(14,165,233,0.022) 1px, transparent 1px);
  background-size: 72px 72px;
}

.why-inner {
  max-width: 1100px; margin: 0 auto;
  padding: 72px 48px;
  position: relative; z-index: 1;
}

.why-header { margin-bottom: 72px; max-width: 600px; }
.why-sub {
  font-size: 1rem; color: var(--muted);
  line-height: 1.75; margin-top: 16px;
}

/* ── Compare columns ── */
.compare-wrap {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 0; align-items: start;
}

.compare-col-hd {
  padding: 28px 32px;
  border-radius: 8px 8px 0 0;
  display: flex; align-items: center; gap: 12px;
}
.compare-col-hd.old {
  background: rgba(30,10,10,0.5);
  border: 1px solid rgba(239,68,68,0.1);
  border-bottom: none;
}
.compare-col-hd.new {
  background: rgba(10,20,30,0.6);
  border: 1px solid rgba(14,165,233,0.15);
  border-bottom: none;
}

.col-icon {
  width: 36px; height: 36px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.85rem; flex-shrink: 0;
}
.col-icon.red { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); }
.col-icon.blue { background: rgba(14,165,233,0.1); border: 1px solid rgba(14,165,233,0.2); }

.col-heading {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.7rem; font-weight: 600; letter-spacing: 0.12em;
  text-transform: uppercase;
}
.col-heading.old { color: rgba(239,68,68,0.7); }
.col-heading.new { color: var(--cyan); }

.compare-col-body {
  border-radius: 0 0 8px 8px;
  overflow: hidden;
}
.compare-col-body.old { border: 1px solid rgba(239,68,68,0.1); border-top: none; }
.compare-col-body.new { border: 1px solid rgba(14,165,233,0.15); border-top: none; }

.cmp-item {
  display: flex; align-items: flex-start; gap: 14px;
  padding: 18px 24px;
  border-bottom: 1px solid rgba(14,165,233,0.04);
  transition: background 0.25s ease;
}
.cmp-item:last-child { border-bottom: none; }
.cmp-item.old-item:hover { background: rgba(239,68,68,0.03); }
.cmp-item.new-item:hover { background: rgba(14,165,233,0.04); }

.cmp-bullet {
  width: 22px; height: 22px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem; flex-shrink: 0; margin-top: 1px;
}
.cmp-bullet.bad  { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: #EF4444; }
.cmp-bullet.good { background: rgba(14,165,233,0.1); border: 1px solid rgba(14,165,233,0.2); color: var(--cyan); }

.cmp-content {}
.cmp-title { font-size: 0.85rem; font-weight: 600; color: var(--text); margin-bottom: 3px; }
.cmp-desc  { font-size: 0.78rem; color: var(--muted); line-height: 1.6; }

/* Divider */
.compare-divider-col {
  width: 1px;
  align-self: stretch;
  display: flex; flex-direction: column; align-items: center;
  justify-content: center;
  margin: 0 16px; padding: 28px 0;
  position: relative;
}
.compare-divider-line {
  width: 1px; height: 100%;
  background: linear-gradient(180deg, transparent, var(--blue), var(--purple), transparent);
  opacity: 0.35;
}
.vs-badge {
  position: absolute; top: 50%; transform: translateY(-50%);
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--bg3);
  border: 1px solid rgba(14,165,233,0.2);
  display: flex; align-items: center; justify-content: center;
  font-family: 'Orbitron', sans-serif;
  font-size: 0.6rem; letter-spacing: 0.1em; color: var(--muted);
  z-index: 1;
}

/* ── Bottom metrics ── */
.impact-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-top: 64px;
}

.impact-card {
  padding: 28px 20px;
  background: rgba(10,14,26,0.7);
  border: 1px solid rgba(14,165,233,0.1);
  border-radius: 8px;
  text-align: center;
  transition: all 0.3s ease;
  position: relative; overflow: hidden;
}
.impact-card:hover {
  border-color: rgba(14,165,233,0.35);
  background: rgba(14,165,233,0.04);
  transform: translateY(-2px);
}
.impact-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, var(--cyan), transparent);
  opacity: 0;
  transition: opacity 0.3s ease;
}
.impact-card:hover::before { opacity: 0.5; }

.impact-num {
  font-family: 'Orbitron', sans-serif;
  font-size: 1.8rem; font-weight: 900;
  background: linear-gradient(135deg, var(--cyan), var(--blue));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
}
.impact-unit {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.9rem; font-weight: 700; color: var(--muted);
}
.impact-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.62rem; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--dim); margin-top: 8px;
}
`;

const OLD = [
  { title: "Manual 3D Modeling", desc: "Weeks of skilled labor by specialized artists at $150–300/hr." },
  { title: "Synthetic Environments Only", desc: "Handcrafted scenes miss real-world complexity and distribution." },
  { title: "No Depth Awareness", desc: "Manually authored geometry often lacks physical accuracy." },
  { title: "Weeks of Setup Time", desc: "Slow iteration cycles block RL research progress entirely." },
  { title: "Prohibitive Cost", desc: "Only well-funded labs can afford high-quality simulation environments." },
];

const NEW = [
  { title: "Upload Any Video", desc: "Any real-world footage becomes a training environment in seconds." },
  { title: "Real-World Fidelity", desc: "Depth-estimated geometry preserves actual environmental complexity." },
  { title: "Physics-Aware Depth", desc: "Monocular depth + multi-view stereo creates accurate 3D geometry." },
  { title: "< 5 Seconds Total", desc: "GPU-accelerated pipeline generates RL-ready environments instantly." },
  { title: "Zero Marginal Cost", desc: "One upload generates a full simulation — no specialized labor needed." },
];

export default function WhyPage({ setPage }) {
  return (
    <div className="why-page">
      <style>{css}</style>
      <div className="why-bg" />
      <div className="why-grid" />

      <div className="why-inner">
        <div className="why-header">
          <div className="section-tag">05 — Impact</div>
          <h1 className="display" style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}>
            Why <span className="gradient-text">SimCraft</span>
          </h1>
          <p className="why-sub">
            Traditional robot simulation requires weeks of manual work. SimCraft eliminates every manual step. Here's the difference.
          </p>
        </div>

        {/* Compare */}
        <div className="compare-wrap">
          {/* Old */}
          <div>
            <div className="compare-col-hd old">
              <div className="col-icon red">✕</div>
              <div className="col-heading old">Traditional Approach</div>
            </div>
            <div className="compare-col-body old">
              {OLD.map((item, i) => (
                <div key={i} className="cmp-item old-item">
                  <div className="cmp-bullet bad">✕</div>
                  <div className="cmp-content">
                    <div className="cmp-title">{item.title}</div>
                    <div className="cmp-desc">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="compare-divider-col">
            <div className="compare-divider-line" />
            <div className="vs-badge">VS</div>
          </div>

          {/* New */}
          <div>
            <div className="compare-col-hd new">
              <div className="col-icon blue">◈</div>
              <div className="col-heading new">SimCraft Engine</div>
            </div>
            <div className="compare-col-body new">
              {NEW.map((item, i) => (
                <div key={i} className="cmp-item new-item">
                  <div className="cmp-bullet good">◈</div>
                  <div className="cmp-content">
                    <div className="cmp-title">{item.title}</div>
                    <div className="cmp-desc">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Impact numbers */}
        <div className="impact-grid">
          {[
            { num: "100", unit: "×", label: "Faster Setup" },
            { num: "< 5", unit: "s",  label: "Reconstruction" },
            { num: "0",   unit: "$",  label: "Manual Labor" },
            { num: "99",  unit: "%",  label: "Depth Accuracy" },
          ].map((m, i) => (
            <div className="impact-card" key={i}>
              <div>
                <span className="impact-num">{m.num}</span>
                <span className="impact-unit">{m.unit}</span>
              </div>
              <div className="impact-label">{m.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
