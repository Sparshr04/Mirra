const css = `
.research-page {
  min-height: 100vh;
  padding-top: 64px;
  background: var(--bg);
  position: relative; overflow: hidden;
}

.research-bg {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 50% 45% at 70% 15%, rgba(14,165,233,0.07) 0%, transparent 55%),
    radial-gradient(ellipse 35% 30% at 25% 85%, rgba(139,92,246,0.06) 0%, transparent 50%);
}
.research-grid {
  position: absolute; inset: 0; pointer-events: none;
  background-image:
    linear-gradient(rgba(14,165,233,0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(14,165,233,0.02) 1px, transparent 1px);
  background-size: 80px 80px;
}

.research-inner {
  max-width: 1100px; margin: 0 auto;
  padding: 72px 48px;
  position: relative; z-index: 1;
}

.research-layout {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 40px;
  margin-top: 64px;
}

/* ── Papers ── */
.papers-section { }

.paper-card {
  padding: 28px 28px 24px;
  background: rgba(10,14,26,0.75);
  border: 1px solid rgba(14,165,233,0.1);
  border-radius: 8px;
  margin-bottom: 10px;
  transition: all 0.3s ease;
  position: relative; overflow: hidden;
  cursor: default;
}
.paper-card:hover {
  border-color: rgba(14,165,233,0.3);
  background: rgba(14,165,233,0.04);
  transform: translateX(4px);
}
.paper-card::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0; width: 2px;
  background: linear-gradient(180deg, var(--blue), var(--purple));
  opacity: 0;
  transition: opacity 0.3s ease;
}
.paper-card:hover::before { opacity: 1; }

.paper-meta {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 10px;
}
.paper-tag {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.58rem; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--cyan);
  border: 1px solid rgba(14,165,233,0.2);
  border-radius: 100px; padding: 3px 10px;
}
.paper-year {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.6rem; color: var(--dim);
}
.paper-venue {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.58rem; color: var(--muted);
  border: 1px solid rgba(232,237,245,0.1);
  border-radius: 100px; padding: 3px 10px;
}

.paper-title {
  font-family: 'Syne', sans-serif;
  font-size: 0.95rem; font-weight: 700;
  color: var(--text); line-height: 1.4; margin-bottom: 8px;
}
.paper-authors {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem; color: var(--muted); letter-spacing: 0.02em;
  margin-bottom: 10px;
}
.paper-abstract {
  font-size: 0.8rem; color: var(--muted); line-height: 1.65;
  margin-bottom: 14px;
}
.paper-links {
  display: flex; gap: 8px;
}
.paper-link {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.6rem; letter-spacing: 0.08em;
  color: var(--muted);
  border: 1px solid rgba(14,165,233,0.12);
  border-radius: 4px; padding: 5px 12px;
  transition: all 0.2s ease; text-decoration: none;
  display: inline-flex; align-items: center; gap: 5px;
}
.paper-link:hover { border-color: var(--cyan); color: var(--cyan); }

/* ── Sidebar ── */
.sidebar { display: flex; flex-direction: column; gap: 16px; }

/* Team */
.sidebar-card {
  padding: 24px;
  background: rgba(10,14,26,0.75);
  border: 1px solid rgba(14,165,233,0.1);
  border-radius: 8px;
}
.sidebar-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.6rem; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--cyan); margin-bottom: 20px;
  display: flex; align-items: center; gap: 8px;
}
.sidebar-title::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, rgba(14,165,233,0.3), transparent); }

.team-member {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(14,165,233,0.05);
}
.team-member:last-child { border-bottom: none; }
.member-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: linear-gradient(135deg, rgba(14,165,233,0.2), rgba(139,92,246,0.2));
  border: 1px solid rgba(14,165,233,0.25);
  display: flex; align-items: center; justify-content: center;
  font-family: 'Orbitron', sans-serif;
  font-size: 0.62rem; font-weight: 700; color: var(--cyan);
  flex-shrink: 0;
}
.member-name {
  font-size: 0.82rem; font-weight: 600; color: var(--text);
}
.member-role {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.58rem; color: var(--muted); letter-spacing: 0.04em;
}

/* Tech stack */
.tech-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
}
.tech-item {
  padding: 8px 12px;
  background: rgba(14,165,233,0.04);
  border: 1px solid rgba(14,165,233,0.1);
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.62rem; letter-spacing: 0.05em; color: var(--muted);
  transition: all 0.2s ease;
}
.tech-item:hover { border-color: rgba(14,165,233,0.3); color: var(--text); }

/* Links */
.link-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(14,165,233,0.08);
  border-radius: 5px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.68rem; letter-spacing: 0.04em; color: var(--muted);
  margin-bottom: 6px;
  transition: all 0.2s ease;
}
.link-item:hover { border-color: rgba(14,165,233,0.25); color: var(--text); background: rgba(14,165,233,0.04); }
.link-icon { font-size: 0.85rem; opacity: 0.6; }
`;

const PAPERS = [
  {
    tag: "Depth Estimation",
    year: "2024",
    venue: "CVPR 2024",
    title: "DepthAnything: Unleashing the Power of Large-Scale Unlabeled Data",
    authors: "Yang, L., Kang, B., Huang, Z., et al.",
    abstract: "We present DepthAnything, a highly practical solution for robust monocular depth estimation by training on a combination of 1.5M labeled images and 62M unlabeled images via a data engine.",
  },
  {
    tag: "3D Reconstruction",
    year: "2023",
    venue: "ICCV 2023",
    title: "3D Gaussian Splatting for Real-Time Novel View Synthesis",
    authors: "Kerbl, B., Kopanas, G., Leimkühler, T., Drettakis, G.",
    abstract: "We introduce 3D Gaussian Splatting as a radiance field representation enabling real-time rendering of novel views while achieving state-of-the-art visual quality.",
  },
  {
    tag: "Robotic RL",
    year: "2024",
    venue: "CoRL 2024",
    title: "Learning to Act from Real-World Video: Closing the Sim-to-Real Gap",
    authors: "SimCraft Research Team",
    abstract: "We demonstrate that physics-aware environments reconstructed from real-world video enable reinforcement learning agents to transfer policies with significantly reduced sim-to-real gap.",
  },
];

export default function ResearchPage({ setPage }) {
  return (
    <div className="research-page">
      <style>{css}</style>
      <div className="research-bg" />
      <div className="research-grid" />

      <div className="research-inner">
        <div className="section-tag">06 — Research</div>
        <h1 className="display" style={{ fontSize: "clamp(2rem, 4vw, 3rem)", marginBottom: 12 }}>
          Scientific <span className="gradient-text">Foundation</span>
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "0.95rem", lineHeight: 1.75, maxWidth: 500 }}>
          SimCraft is built on cutting-edge research in depth estimation, neural rendering, and robotic reinforcement learning.
        </p>

        <div className="research-layout">
          {/* Papers */}
          <div className="papers-section">
            {PAPERS.map((p, i) => (
              <div className="paper-card" key={i}>
                <div className="paper-meta">
                  <div className="paper-tag">{p.tag}</div>
                  <div className="paper-year">{p.year}</div>
                  <div className="paper-venue">{p.venue}</div>
                </div>
                <div className="paper-title">{p.title}</div>
                <div className="paper-authors">{p.authors}</div>
                <div className="paper-abstract">{p.abstract}</div>
                <div className="paper-links">
                  {["PDF", "arXiv", "Code"].map(l => (
                    <div key={l} className="paper-link">
                      <span style={{ opacity: 0.5 }}>↗</span> {l}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Sidebar */}
          <div className="sidebar">
            {/* Team */}
            <div className="sidebar-card">
              <div className="sidebar-title">Team</div>
              {[
                { init: "RG", name: "R. Gankaikar", role: "Lead Engineer" },
                { init: "AI", name: "AI Systems", role: "Depth Estimation" },
                { init: "RL", name: "RL Research", role: "Policy Training" },
              ].map((m, i) => (
                <div key={i} className="team-member">
                  <div className="member-avatar">{m.init}</div>
                  <div>
                    <div className="member-name">{m.name}</div>
                    <div className="member-role">{m.role}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tech Stack */}
            <div className="sidebar-card">
              <div className="sidebar-title">Tech Stack</div>
              <div className="tech-grid">
                {["PyTorch", "CUDA 12", "COLMAP", "MuJoCo", "React", "Three.js", "FastAPI", "Docker"].map(t => (
                  <div key={t} className="tech-item">{t}</div>
                ))}
              </div>
            </div>

            {/* Links */}
            <div className="sidebar-card">
              <div className="sidebar-title">Resources</div>
              {[
                { icon: "⬡", label: "GitHub Repository" },
                { icon: "◈", label: "Technical Report" },
                { icon: "▣", label: "Demo Dataset" },
                { icon: "⊕", label: "API Docs" },
              ].map(l => (
                <div key={l.label} className="link-item">
                  <span className="link-icon">{l.icon}</span>
                  {l.label}
                  <span style={{ marginLeft: "auto", opacity: 0.4, fontSize: "0.7rem" }}>↗</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
