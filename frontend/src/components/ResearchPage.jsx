import { useEffect, useRef } from "react";

const css = `
.research-page {
  min-height: 100vh; padding-top: 58px;
  background: var(--bg); position: relative; overflow: hidden;
}
.research-page::before {
  content: '';
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(0,0,0,0.024) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,0,0,0.024) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: radial-gradient(ellipse 76% 58% at 50% 22%, black 8%, transparent 100%);
  pointer-events: none;
}

.research-inner {
  max-width: 1120px; margin: 0 auto; padding: 80px 48px 104px;
  position: relative; z-index: 1;
}

/*
  Simple 2-col layout.
  .research-left  — continuous flow: heading → papers → apps
  .research-sidebar — sticky right column, starts at the top
*/
.research-grid {
  display: grid;
  grid-template-columns: 1fr 296px;
  gap: 0 26px;
  align-items: start;
}

/* Left column: single continuous wrapper, no row gaps */
.research-left {
  min-width: 0;
}

.research-head {
  padding-bottom: 40px;
}

/* Sidebar — right col, sticky so it stays in view while papers scroll */
.research-sidebar {
  display: flex; flex-direction: column; gap: 13px;
  position: sticky; top: 74px;
}

/* Papers section */
.research-papers { }

/* Apps section */
.research-apps { }

/* ── Paper cards ── */
.paper-card {
  padding: 26px; background: white;
  border: 1px solid var(--s-200); border-radius: var(--r-lg);
  margin-bottom: 11px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06), 0 6px 22px rgba(0,0,0,0.05);
  transition: all 0.28s var(--ease-spring);
  position: relative; overflow: hidden; cursor: default;
}
.paper-card::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
  opacity: 0; transition: opacity 0.24s;
}
.paper-card.geo::before { background: linear-gradient(180deg, var(--sky), #38bdf8); }
.paper-card.sem::before { background: linear-gradient(180deg, var(--violet), #a78bfa); }
.paper-card.fus::before { background: linear-gradient(180deg, var(--green), #4ade80); }

/* Persistent colored top strip */
.paper-card.geo { border-top: 2px solid rgba(14,165,233,0.3); }
.paper-card.sem { border-top: 2px solid rgba(139,92,246,0.3); }
.paper-card.fus { border-top: 2px solid rgba(34,197,94,0.3); }

.paper-card:hover {
  border-color: var(--s-300);
  box-shadow: 0 4px 16px rgba(0,0,0,0.09), 0 16px 40px rgba(0,0,0,0.07);
  transform: translateX(4px);
}
.paper-card:hover::before { opacity: 1; }

.paper-meta { display: flex; align-items: center; gap: 6px; margin-bottom: 9px; flex-wrap: wrap; }
.paper-tag {
  font-family: 'DM Mono', monospace; font-size: 0.6rem; letter-spacing: 0.06em;
  text-transform: uppercase; font-weight: 500;
  border: 1px solid var(--s-200); border-radius: 100px; padding: 2px 10px; background: var(--s-50);
  color: var(--s-500);
}
.paper-card.geo .paper-tag { color: #0284c7; border-color: rgba(14,165,233,0.3); background: rgba(14,165,233,0.06); }
.paper-card.sem .paper-tag { color: #7c3aed; border-color: rgba(139,92,246,0.3); background: rgba(139,92,246,0.06); }
.paper-card.fus .paper-tag { color: #15803d; border-color: rgba(34,197,94,0.3); background: rgba(34,197,94,0.06); }

.paper-year, .paper-venue { font-family: 'DM Mono', monospace; font-size: 0.6rem; color: var(--s-400); }
.paper-venue { border: 1px solid var(--s-200); border-radius: 100px; padding: 2px 10px; background: var(--s-50); }
.paper-title { font-family: 'DM Sans', sans-serif; font-size: 0.96rem; font-weight: 600; color: var(--ink); line-height: 1.4; margin-bottom: 4px; }
.paper-authors { font-size: 0.73rem; color: var(--s-400); margin-bottom: 8px; }
.paper-abstract { font-size: 0.8rem; color: var(--s-500); line-height: 1.72; margin-bottom: 12px; }
.paper-links { display: flex; gap: 6px; }
.paper-link {
  display: inline-flex; align-items: center; gap: 4px;
  font-family: 'DM Mono', monospace; font-size: 0.62rem; font-weight: 500;
  color: var(--s-500); border: 1px solid var(--s-200); border-radius: 6px;
  padding: 4px 11px; transition: all 0.16s; text-decoration: none; background: var(--s-50); cursor: pointer;
}
.paper-link:hover { border-color: var(--s-400); color: var(--ink); background: var(--s-100); }

/* ── Mirra contribution card ── */
.mirra-card {
  padding: 24px;
  background: linear-gradient(135deg, rgba(14,165,233,0.05) 0%, rgba(139,92,246,0.05) 60%, rgba(34,197,94,0.05) 100%);
  border: 1px solid rgba(139,92,246,0.22); border-radius: var(--r-lg);
  margin-bottom: 0; position: relative; overflow: hidden;
  box-shadow: 0 2px 12px rgba(139,92,246,0.08), 0 6px 24px rgba(14,165,233,0.06);
}
.mirra-card::before {
  content: '';
  position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
  background: linear-gradient(180deg, var(--sky), var(--violet), var(--green));
}
.mirra-badge {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: 'DM Mono', monospace; font-size: 0.58rem; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--s-500); border: 1px solid var(--s-200); border-radius: 100px;
  padding: 2px 10px; background: white; margin-bottom: 11px;
}
.mirra-badge-star { color: var(--amber); }
.mirra-title { font-family: 'DM Sans', sans-serif; font-size: 0.96rem; font-weight: 600; color: var(--ink); margin-bottom: 6px; }
.mirra-body { font-size: 0.8rem; color: var(--s-600); line-height: 1.76; }
.mirra-body strong { color: var(--ink); font-weight: 600; }
.mirra-body code { font-family: 'DM Mono', monospace; font-size: 0.78em; background: rgba(255,255,255,0.8); padding: 1px 5px; border-radius: 3px; border: 1px solid rgba(0,0,0,0.06); }

/* ── Sidebar cards ── */
.sb-card {
  padding: 20px; background: white;
  border: 1px solid var(--s-200); border-radius: var(--r-lg);
  box-shadow: 0 2px 8px rgba(0,0,0,0.06), 0 6px 22px rgba(0,0,0,0.05);
  transition: border-color 0.22s, box-shadow 0.22s;
  position: relative; overflow: hidden;
}
.sb-card::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, var(--s-300), transparent);
  opacity: 0; transition: opacity 0.24s;
}
.sb-card:hover { border-color: var(--s-300); box-shadow: 0 4px 14px rgba(0,0,0,0.08), 0 12px 32px rgba(0,0,0,0.06); }
.sb-card:hover::before { opacity: 1; }

.sb-title {
  font-family: 'DM Mono', monospace; font-size: 0.58rem; letter-spacing: 0.13em; text-transform: uppercase;
  color: var(--s-400); margin-bottom: 16px; display: flex; align-items: center; gap: 8px;
}
.sb-title::after { content: ''; flex: 1; height: 1px; background: var(--s-200); }

.member-row { display: flex; align-items: center; gap: 11px; padding: 9px 0; border-bottom: 1px solid var(--s-100); }
.member-row:last-child { border-bottom: none; }
.member-av {
  width: 34px; height: 34px; border-radius: 9px;
  background: var(--s-100); border: 1px solid var(--s-200);
  display: flex; align-items: center; justify-content: center;
  font-family: 'DM Mono', monospace; font-size: 0.6rem; font-weight: 600; color: var(--s-600); flex-shrink: 0;
}
.member-name { font-family: 'DM Sans', sans-serif; font-size: 0.82rem; font-weight: 600; color: var(--ink); }
.member-role { font-size: 0.67rem; color: var(--s-400); margin-top: 1px; }

.tech-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
.tech-item {
  padding: 6px 9px; background: var(--s-50); border: 1px solid var(--s-200);
  border-radius: 6px; font-family: 'DM Mono', monospace; font-size: 0.63rem; color: var(--s-500);
  text-align: center; transition: all 0.15s; font-weight: 500;
}
.tech-item:hover { border-color: var(--s-300); color: var(--ink); background: white; }

.link-item {
  display: flex; align-items: center; gap: 9px; padding: 8px 11px;
  border: 1px solid var(--s-200); border-radius: 7px;
  font-family: 'DM Sans', sans-serif; font-size: 0.75rem; color: var(--s-500);
  margin-bottom: 5px; transition: all 0.15s; cursor: pointer; background: white;
}
.link-item:hover { border-color: var(--s-300); color: var(--ink); background: var(--s-50); }
.link-icon { font-size: 0.78rem; opacity: 0.48; }
.link-arrow { margin-left: auto; opacity: 0.32; font-size: 0.68rem; }

.amd-row {
  display: flex; align-items: center; gap: 8px; padding: 8px 0;
  border-bottom: 1px solid var(--s-100); font-family: 'DM Sans', sans-serif; font-size: 0.74rem; color: var(--s-500);
}
.amd-row:last-child { border-bottom: none; }
.amd-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--green); flex-shrink: 0; box-shadow: 0 0 5px rgba(34,197,94,0.5); }

/* ── Application cards ── */
.apps-eyebrow {
  font-family: 'DM Mono', monospace; font-size: 0.62rem; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--s-400); display: flex; align-items: center; gap: 12px; margin-top: 40px; margin-bottom: 14px;
}
.apps-eyebrow::after { content: ''; flex: 1; height: 1px; background: var(--s-200); }

.apps-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 9px; }
.app-card {
  padding: 16px; background: white;
  border: 1px solid var(--s-200); border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05), 0 4px 14px rgba(0,0,0,0.04);
  transition: all 0.22s var(--ease-spring);
  position: relative; overflow: hidden;
}
.app-card::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, var(--sky), var(--violet), var(--green));
  opacity: 0; transition: opacity 0.22s;
}
.app-card:hover { border-color: var(--s-300); box-shadow: 0 4px 14px rgba(0,0,0,0.09), 0 12px 32px rgba(0,0,0,0.07); transform: translateY(-3px); }
.app-card:hover::before { opacity: 1; }

.app-icon-sym {
  width: 28px; height: 28px; border-radius: 7px;
  background: var(--s-100); border: 1px solid var(--s-200);
  display: flex; align-items: center; justify-content: center;
  font-family: 'DM Mono', monospace; font-size: 0.72rem;
  color: var(--s-500); margin-bottom: 9px; font-weight: 500;
}
.app-title { font-family: 'DM Sans', sans-serif; font-size: 0.76rem; font-weight: 600; color: var(--s-800); }
.app-desc  { font-size: 0.68rem; color: var(--s-500); margin-top: 2px; line-height: 1.5; }

.reveal { opacity:0; transform:translateY(18px); transition:opacity 0.65s ease,transform 0.65s ease; }
.reveal.in { opacity:1; transform:none; }
`;

function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add("in"); obs.unobserve(el); } },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );
    obs.observe(el); return () => obs.disconnect();
  }, []);
  return ref;
}

const PAPERS = [
  {
    v: "geo", tag: "Geometry", year: "2024", venue: "CVPR 2024",
    title: "DUSt3R: Geometric 3D Vision Made Easy",
    authors: "Wang, S., Leroy, V., Cabon, Y., Chidlovskii, B., Revaud, J. — Naver Labs Europe",
    abstract: "DUSt3R introduces a novel paradigm for 3D reconstruction by directly regressing point maps from image pairs using a ViT-Large encoder-decoder. Mirra's Geometry Engine uses DUSt3R for dense monocular depth estimation and global camera-pose alignment across all extracted frames.",
  },
  {
    v: "sem", tag: "Segmentation", year: "2024", venue: "ECCV 2024",
    title: "SAM 2: Segment Anything in Images and Videos",
    authors: "Ravi, N., Gabeur, V., Hu, Y., et al. — Meta AI Research",
    abstract: "SAM 2 extends the Segment Anything Model to video via a streaming memory architecture for real-time promptable object segmentation. Mirra's Semantic Engine uses SAM 2 for zero-shot object detection in the first frame and temporal mask propagation across all subsequent frames without per-frame reprocessing.",
  },
  {
    v: "fus", tag: "3D Rendering", year: "2023", venue: "ICCV 2023",
    title: "3D Gaussian Splatting for Real-Time Novel View Synthesis",
    authors: "Kerbl, B., Kopanas, G., Leimkühler, T., Drettakis, G.",
    abstract: "Gaussian Splatting represents scenes as 3D Gaussian primitives enabling real-time novel-view rendering. Mirra's Fusion Engine builds on multi-view projection techniques from this research lineage to associate semantic labels with reconstructed 3D points via cross-view majority voting.",
  },
];

const TEAM = [
  { init: "SR", name: "Sparsh Ranaware", role: "AI Engineer · Backend" },
  { init: "RA", name: "Rushikesh Ankaikar", role: "Frontend · AI Engineer" },
  { init: "SM", name: "Shreyash Mandlapure", role: "Frontend · Research" },
];

const TECH = ["PyTorch 2.x", "DUSt3R", "SAM 2", "FastAPI", "Open3D", "OpenCV", "React 18", "Three.js", "SciPy", "Trimesh", "NumPy", "Hydra"];

const APPS = [
  { sym: "RB", title: "Robotics Sim", desc: "RL training from real footage" },
  { sym: "AD", title: "Autonomous Driving", desc: "Scene generation at scale" },
  { sym: "DT", title: "Digital Twins", desc: "Factory / warehouse mapping" },
  { sym: "AR", title: "AR / VR", desc: "Contextual spatial overlays" },
  { sym: "DS", title: "Synthetic Datasets", desc: "Labeled 3D training data" },
  { sym: "AI", title: "Spatial AI", desc: "Real-world environment encoding" },
];

export default function ResearchPage({ setPage }) {
  const hRef = useReveal();
  const bodyRef = useReveal();
  const appRef = useReveal();

  return (
    <div className="research-page">
      <style>{css}</style>
      <div className="research-inner">

        {/* Single 2-col grid: left = heading+papers+apps, right = sticky sidebar */}
        <div className="research-grid">

          {/* ── LEFT COLUMN: continuous flow ── */}
          <div className="research-left">

            {/* Heading */}
            <div className="research-head reveal" ref={hRef}>
              <div className="eyebrow">06 — Research</div>
              <h1 className="section-title" style={{ marginBottom: 12 }}>
                Scientific <em>Foundation</em>
              </h1>
              <p className="body-lg" style={{ maxWidth: 480 }}>
                Mirra is built on three peer-reviewed research pillars — DUSt3R geometry, SAM 2 semantics, and Gaussian-inspired multi-view fusion — unified into a single end-to-end spatial intelligence pipeline.
              </p>
            </div>

            {/* Papers + Mirra card */}
            <div className="research-papers reveal" ref={bodyRef}>
              {PAPERS.map((p, i) => (
                <div key={i} className={`paper-card ${p.v}`}>
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
                        <span style={{ opacity: 0.42 }}>↗</span>{l}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="mirra-card">
                <div className="mirra-badge">
                  <span className="mirra-badge-star">★</span>Mirra Contribution
                </div>
                <div className="mirra-title">Multi-View Semantic Projection — Fusion Engine</div>
                <div className="mirra-body">
                  Mirra's key innovation is the <strong>Fusion Engine</strong> — a custom algorithm that projects
                  each reconstructed 3D point into all available camera views, queries SAM 2's per-frame segmentation
                  masks to determine object membership, and applies <strong>majority voting across views</strong> to
                  assign a final semantic label to each point. The result is <code>semantic_world.ply</code> — a
                  point cloud where every point carries both its spatial position and its object-class identity,
                  plus a <code>label_map.json</code> mapping numeric IDs to human-readable class names.
                </div>
              </div>
            </div>

            {/* Applications */}
            <div className="research-apps reveal" ref={appRef}>
              <div className="apps-eyebrow">Applications</div>
              <div className="apps-grid">
                {APPS.map((a, i) => (
                  <div key={i} className="app-card">
                    <div className="app-icon-sym">{a.sym}</div>
                    <div className="app-title">{a.title}</div>
                    <div className="app-desc">{a.desc}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>{/* end research-left */}

          {/* ── RIGHT COLUMN: sticky sidebar ── */}
          <div className="research-sidebar">
            <div className="sb-card">
              <div className="sb-title">Team</div>
              {TEAM.map((m, i) => (
                <div key={i} className="member-row">
                  <div className="member-av">{m.init}</div>
                  <div>
                    <div className="member-name">{m.name}</div>
                    <div className="member-role">{m.role}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="sb-card">
              <div className="sb-title">Tech Stack</div>
              <div className="tech-grid">
                {TECH.map(t => <div key={t} className="tech-item">{t}</div>)}
              </div>
            </div>

            <div className="sb-card">
              <div className="sb-title">Resources</div>
              {[
                { icon: "⬡", label: "GitHub Repository" },
                { icon: "◈", label: "Technical Report" },
                { icon: "▣", label: "Demo Dataset" },
                { icon: "⊕", label: "API Docs" },
              ].map(l => (
                <div key={l.label} className="link-item">
                  <span className="link-icon">{l.icon}</span>
                  {l.label}
                  <span className="link-arrow">↗</span>
                </div>
              ))}
            </div>

            <div className="sb-card">
              <div className="sb-title">AMD Alignment</div>
              {["ROCm · PyTorch", "Instinct-class GPUs", "High-VRAM Batching", "EPYC Concurrency", "Auto OOM Fallback"].map(t => (
                <div key={t} className="amd-row">
                  <div className="amd-dot" />{t}
                </div>
              ))}
            </div>
          </div>{/* end research-sidebar */}

        </div>{/* end research-grid */}
      </div>
    </div>
  );
}