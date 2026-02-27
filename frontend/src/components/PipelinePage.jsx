import { useState, useEffect, useRef } from "react";

const css = `
:root {
  --bg:#fafafa;
  --ink:#111;
  --s-50:#f8f8f8;
  --s-100:#f0f0f0;
  --s-200:#e8e8e8;
  --s-300:#c8c8c8;
  --s-400:#888;
  --s-500:#666;
  --s-600:#444;
  --s-800:#222;
  --sky:#0ea5e9;
  --violet:#8b5cf6;
  --green:#22c55e;
  --r-md:12px;
  --r-lg:18px;
  --sh-xs:0 2px 8px rgba(0,0,0,0.06);
  --ease-spring:cubic-bezier(0.34,1.56,0.64,1);
}

/* ================= PAGE ================= */
.pipeline-page {
  min-height:100vh;
  padding-top:80px;
  background:var(--bg);
  position:relative;
  overflow:hidden;
  font-family:'DM Sans',system-ui,sans-serif;
}

/* Grid background */
.pipeline-page::before {
  content:"";
  position:absolute;
  inset:0;
  background-image:
    linear-gradient(rgba(0,0,0,0.024) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,0,0,0.024) 1px, transparent 1px);
  background-size:64px 64px;
  mask-image: radial-gradient(ellipse 78% 62% at 50% 24%, black 8%, transparent 100%);
  pointer-events:none;
}

.pipeline-inner {
  max-width:1120px;
  margin:0 auto;
  padding:80px 48px 120px;
  position:relative;
  z-index:1;
}

/* ── Header ── */
.pipe-header { margin-bottom:72px; max-width:580px; }

.eyebrow {
  font-family:'DM Mono',monospace;
  font-size:.75rem;
  letter-spacing:.15em;
  text-transform:uppercase;
  color:var(--s-400);
  margin-bottom:20px;
}

.section-title {
  font-size:2.8rem;
  font-weight:600;
  color:var(--ink);
  margin-bottom:14px;
  line-height:1.15;
}

.section-title em { font-style:italic; }

.body-lg {
  font-size:1rem;
  color:var(--s-500);
  line-height:1.8;
  max-width:490px;
}

/* ── Neural Core ── */
.core-wrap {
  display:flex;
  flex-direction:column;
  align-items:center;
  margin:80px 0 72px;
}

.neural-core {
  position:relative;
  width:180px;
  height:180px;
  margin-bottom:16px;
}

.nc-ring {
  position:absolute;
  border-radius:50%;
  border:1px solid rgba(0,0,0,0.08);
}

.nc-r1 { inset:0; animation:spinSlow 12s linear infinite; }
.nc-r1::before, .nc-r1::after {
  content:''; position:absolute; width:9px; height:9px; border-radius:50%;
  top:-4.5px; left:50%; transform:translateX(-50%);
  background:var(--sky); box-shadow:0 0 12px rgba(14,165,233,0.7);
}
.nc-r1::after {
  bottom:-4.5px; top:auto;
  background:var(--violet); box-shadow:0 0 12px rgba(139,92,246,0.7);
}

.nc-r2 { inset:28px; animation:spinSlow 8s linear infinite reverse; }
.nc-r2::before {
  content:''; position:absolute; width:7px; height:7px; border-radius:50%;
  right:-3.5px; top:50%; transform:translateY(-50%);
  background:var(--green); box-shadow:0 0 10px rgba(34,197,94,0.7);
}

.nc-r3 { inset:54px; animation:spinSlow 5s linear infinite; }
.nc-r3::before {
  content:''; position:absolute; width:6px; height:6px; border-radius:50%;
  top:-3px; left:50%; transform:translateX(-50%);
  background:var(--sky); box-shadow:0 0 8px rgba(14,165,233,0.6);
}

.nc-core {
  position:absolute;
  inset:72px;
  border-radius:50%;
  background:white;
  border:1px solid var(--s-200);
  display:flex;
  align-items:center;
  justify-content:center;
  box-shadow:0 20px 60px rgba(0,0,0,0.08);
}

.nc-lbl {
  font-family:'DM Mono',monospace;
  font-size:0.48rem;
  letter-spacing:.12em;
  color:var(--s-500);
  text-align:center;
  text-transform:uppercase;
  line-height:1.6;
}

.core-caption {
  font-family:'DM Mono',monospace;
  font-size:.65rem;
  letter-spacing:.1em;
  text-transform:uppercase;
  color:var(--s-400);
}

/* ── Eyebrows ── */
.engines-eyebrow, .steps-eyebrow {
  font-family:'DM Mono',monospace;
  font-size:0.62rem;
  letter-spacing:0.14em;
  text-transform:uppercase;
  color:var(--s-400);
  margin-bottom:26px;
  display:flex;
  align-items:center;
  gap:12px;
}
.engines-eyebrow::after, .steps-eyebrow::after {
  content:''; flex:1; height:1px; background:var(--s-200);
}

/* ── Engine Cards ── */
.engines-row {
  display:grid;
  grid-template-columns:1fr 44px 1fr 44px 1fr;
  align-items:stretch;
  margin-bottom:64px;
}

.eng-arrow { display:flex; align-items:center; justify-content:center; }
.eng-arrow-inner { display:flex; flex-direction:column; align-items:center; gap:4px; }
.eng-arrow-line { width:1px; flex:1; min-height:20px; background:linear-gradient(180deg,transparent,var(--s-300),transparent); }
.eng-arrow-dot { width:5px; height:5px; border-radius:50%; background:var(--s-300); }

.eng-card {
  background:white;
  border:1px solid var(--s-200);
  border-radius:var(--r-lg);
  padding:28px 24px;
  box-shadow:0 2px 8px rgba(0,0,0,0.06), 0 6px 22px rgba(0,0,0,0.05);
  transition:all 0.32s var(--ease-spring);
  position:relative;
  overflow:hidden;
  cursor:default;
}

/* Persistent colored top strip */
.eng-card.geo { border-top:2px solid rgba(14,165,233,0.35); }
.eng-card.sem { border-top:2px solid rgba(139,92,246,0.35); }
.eng-card.fus { border-top:2px solid rgba(34,197,94,0.35); }

/* Full-width accent on hover */
.eng-card::before {
  content:''; position:absolute; top:0; left:0; right:0; height:2px;
  opacity:0; transition:opacity 0.28s;
}
.eng-card.geo::before { background:linear-gradient(90deg,var(--sky),#38bdf8); }
.eng-card.sem::before { background:linear-gradient(90deg,var(--violet),#a78bfa); }
.eng-card.fus::before { background:linear-gradient(90deg,var(--green),#4ade80); }

.eng-card:hover {
  box-shadow:0 4px 16px rgba(0,0,0,0.09), 0 16px 44px rgba(0,0,0,0.08);
  transform:translateY(-6px);
}
.eng-card.geo:hover { border-color:rgba(14,165,233,0.4); }
.eng-card.sem:hover { border-color:rgba(139,92,246,0.4); }
.eng-card.fus:hover { border-color:rgba(34,197,94,0.4); }
.eng-card:hover::before { opacity:1; }

.eng-num {
  font-family:'DM Mono',monospace;
  font-size:0.58rem;
  letter-spacing:0.12em;
  color:var(--s-300);
  margin-bottom:14px;
}

.eng-icon {
  width:44px; height:44px; border-radius:11px; border:1px solid var(--s-200);
  background:var(--s-50); display:flex; align-items:center; justify-content:center;
  font-size:1.15rem; margin-bottom:14px; transition:all 0.24s;
}
.eng-card.geo .eng-icon { border-color:rgba(14,165,233,0.3); background:rgba(14,165,233,0.07); }
.eng-card.sem .eng-icon { border-color:rgba(139,92,246,0.3); background:rgba(139,92,246,0.07); }
.eng-card.fus .eng-icon { border-color:rgba(34,197,94,0.3); background:rgba(34,197,94,0.07); }
.eng-card:hover .eng-icon { transform:scale(1.06); }

.eng-title {
  font-size:1rem;
  font-weight:600;
  color:var(--ink);
  margin-bottom:8px;
}

.eng-sub {
  font-size:0.78rem;
  color:var(--s-500);
  line-height:1.68;
  margin-bottom:16px;
}

.eng-output {
  display:inline-flex; align-items:center; gap:6px;
  padding:4px 11px;
  background:var(--s-50); border:1px solid var(--s-200); border-radius:100px;
  font-family:'DM Mono',monospace; font-size:0.62rem; color:var(--s-500);
  margin-bottom:16px;
}
.eng-out-dot { width:5px; height:5px; border-radius:50%; flex-shrink:0; }
.eng-card.geo .eng-out-dot { background:var(--sky); box-shadow:0 0 5px rgba(14,165,233,0.5); }
.eng-card.sem .eng-out-dot { background:var(--violet); box-shadow:0 0 5px rgba(139,92,246,0.5); }
.eng-card.fus .eng-out-dot { background:var(--green); box-shadow:0 0 5px rgba(34,197,94,0.5); }

.eng-pills { display:flex; flex-wrap:wrap; gap:5px; padding-top:14px; border-top:1px solid var(--s-100); }
.eng-pill {
  font-family:'DM Mono',monospace; font-size:0.6rem; color:var(--s-400);
  padding:3px 9px; border:1px solid var(--s-200); border-radius:4px;
  background:var(--s-50); transition:all 0.14s;
}
.eng-pill:hover { border-color:var(--s-300); color:var(--ink); background:white; }

/* ── Step Cards ── */
.steps-row {
  display:grid;
  grid-template-columns:repeat(6,1fr);
  gap:8px;
  position:relative;
  margin-bottom:64px;
}
.steps-row::before {
  content:'';
  position:absolute; top:42px; left:8%; right:8%; height:1px;
  background:linear-gradient(90deg, transparent, var(--s-200) 15%, var(--s-200) 85%, transparent);
  pointer-events:none; z-index:0;
}

.step-card {
  position:relative; z-index:1; padding:18px 13px;
  background:white; border:1px solid var(--s-200); border-radius:var(--r-md);
  transition:all 0.3s var(--ease-spring); cursor:default;
  box-shadow:0 2px 6px rgba(0,0,0,0.05), 0 4px 14px rgba(0,0,0,0.04);
}
.step-card:hover {
  border-color:var(--s-300);
  box-shadow:0 4px 12px rgba(0,0,0,0.08), 0 10px 28px rgba(0,0,0,0.06);
  transform:translateY(-4px);
}
.step-card.on {
  border-color:var(--ink);
  box-shadow:0 6px 18px rgba(0,0,0,0.11), 0 14px 36px rgba(0,0,0,0.08);
  transform:translateY(-4px);
}
.step-card.on .step-orb { background:var(--ink); color:white; border-color:var(--ink); }

/* Animated progress bar on active step */
.step-card.on::after {
  content:'';
  position:absolute; bottom:0; left:0; right:0; height:2px;
  background:linear-gradient(90deg, var(--sky), var(--violet), var(--green));
  border-radius:0 0 var(--r-md) var(--r-md);
  animation:shimmer 2.4s ease infinite;
  background-size:200% 100%;
}

.step-idx { font-family:'DM Mono',monospace; font-size:0.58rem; color:var(--s-300); margin-bottom:11px; }
.step-orb {
  width:30px; height:30px; border-radius:8px; border:1px solid var(--s-200);
  background:var(--s-50); display:flex; align-items:center; justify-content:center;
  font-size:0.85rem; margin-bottom:11px; transition:all 0.28s;
}
.step-title { font-size:0.78rem; font-weight:600; color:var(--s-800); margin-bottom:5px; line-height:1.3; }
.step-body  { font-size:0.71rem; color:var(--s-500); line-height:1.62; }
.step-tech  { margin-top:9px; font-family:'DM Mono',monospace; font-size:0.58rem; color:var(--s-400); }

/* ── Detail Cards ── */
.detail-grid {
  display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:64px;
}
.detail-card {
  padding:28px; background:white;
  border:1px solid var(--s-200); border-radius:var(--r-lg);
  box-shadow:0 2px 8px rgba(0,0,0,0.06), 0 6px 22px rgba(0,0,0,0.05);
  transition:all 0.26s var(--ease-spring);
  position:relative; overflow:hidden;
}
.detail-card::before {
  content:'';
  position:absolute; top:0; left:0; right:0; height:2px;
  opacity:0; transition:opacity 0.24s;
  background:linear-gradient(90deg,var(--s-200),var(--s-500),var(--s-200));
}
.detail-card:hover {
  border-color:var(--s-300);
  box-shadow:0 4px 16px rgba(0,0,0,0.09), 0 14px 38px rgba(0,0,0,0.07);
  transform:translateY(-3px);
}
.detail-card:hover::before { opacity:1; }

.detail-eyebrow {
  font-family:'DM Mono',monospace; font-size:0.6rem; letter-spacing:0.12em;
  text-transform:uppercase; color:var(--s-400); margin-bottom:12px;
}
.detail-body { font-size:0.87rem; color:var(--s-600); line-height:1.8; }
.detail-body strong { color:var(--ink); font-weight:600; }
.detail-body code {
  font-family:'DM Mono',monospace; font-size:0.8em;
  background:var(--s-100); padding:1px 6px; border-radius:4px;
  border:1px solid var(--s-200);
}

.metric-row { display:flex; gap:9px; margin-top:18px; padding-top:18px; border-top:1px solid var(--s-100); }
.metric-box {
  flex:1; text-align:center; padding:14px 6px;
  background:var(--s-50); border:1px solid var(--s-200); border-radius:9px;
  transition:all 0.18s;
}
.metric-box:hover { background:white; border-color:var(--s-300); box-shadow:0 2px 8px rgba(0,0,0,0.06); }
.mbox-val { font-size:1.25rem; font-weight:700; color:var(--ink); line-height:1; }
.mbox-lbl {
  font-family:'DM Mono',monospace; font-size:0.56rem; color:var(--s-400);
  text-transform:uppercase; letter-spacing:0.08em; margin-top:4px;
}

/* ── CTA ── */
.cta-row { display:flex; align-items:center; justify-content:center; gap:11px; }

.btn-primary {
  padding:11px 26px; background:var(--ink); color:white;
  border:none; border-radius:8px; font-size:0.9rem; font-weight:600;
  cursor:pointer; transition:all 0.2s;
}
.btn-primary:hover { background:#333; transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,0.18); }

.btn-secondary {
  padding:11px 26px; background:white; color:var(--ink);
  border:1px solid var(--s-200); border-radius:8px; font-size:0.9rem;
  cursor:pointer; transition:all 0.2s;
}
.btn-secondary:hover { border-color:var(--s-400); transform:translateY(-2px); box-shadow:0 4px 14px rgba(0,0,0,0.08); }

/* ── Animations ── */
@keyframes spinSlow {
  from { transform:rotate(0deg); }
  to   { transform:rotate(360deg); }
}
@keyframes shimmer {
  0%   { background-position:100% 0; }
  100% { background-position:-100% 0; }
}

/* ── Reveal ── */
.reveal {
  opacity:0;
  transform:translateY(18px);
  transition:opacity 0.65s ease, transform 0.65s ease;
}
.reveal.in {
  opacity:1;
  transform:none;
}
`;

function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add("in"); obs.unobserve(el); } },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

const ENGINES = [
  {
    id: "geo", num: "ENGINE 01", icon: "◈", title: "Geometry Engine",
    sub: "Reconstructs dense 3D structure from 2D video frames using DUSt3R ViT-Large. Generates point clouds and camera poses from unconstrained footage.",
    output: "reconstruction.ply + poses.npz",
    pills: ["DUSt3R ViT-L", "PyTorch 2.x", "OpenCV", "Open3D", "Depth Est."],
  },
  {
    id: "sem", num: "ENGINE 02", icon: "⬡", title: "Semantic Engine",
    sub: "Identifies and tracks every object across all frames. Zero-shot detection in the first frame, then SAM 2 propagates masks temporally with no per-frame reprocessing.",
    output: "per-frame segmentation masks",
    pills: ["SAM 2", "Auto Mask Gen.", "Temporal Prop.", "PyTorch"],
  },
  {
    id: "fus", num: "ENGINE 03", icon: "⊕", title: "Fusion Engine",
    sub: "Mirra's core innovation. Projects 3D points into every camera view, determines object membership via the segmentation masks, and assigns labels by majority vote.",
    output: "semantic_world.ply + label_map.json",
    pills: ["Multi-View Proj.", "Majority Vote", "Custom Algorithm", "Open3D", "Trimesh"],
  },
];

const STEPS = [
  { icon: "⬆", title: "Upload Video", body: "Any real-world footage — MP4, MOV, AVI. From any phone or camera.", tech: "Max 2GB · 720p–4K" },
  { icon: "◉", title: "Frame Extraction", body: "Decode and sample into RGB frame sequences for pipeline input.", tech: "OpenCV · multi-core" },
  { icon: "◈", title: "Depth Estimation", body: "DUSt3R ViT-Large generates dense depth maps and global alignment.", tech: "DUSt3R · ViT-Large" },
  { icon: "⬡", title: "Segmentation", body: "SAM 2 zero-shot detection + temporal mask propagation across frames.", tech: "SAM 2 · Auto Mask" },
  { icon: "⊕", title: "3D Fusion", body: "Multi-view semantic projection with majority-vote label assignment.", tech: "Mirra FusionEngine" },
  { icon: "▣", title: "Export", body: "Physics-ready semantic .ply + label map for major RL frameworks.", tech: "MuJoCo · IsaacGym" },
];

export default function PipelinePage({ setPage }) {
  const [active, setActive] = useState(0);

  const headerRef = useReveal();
  const coreRef = useReveal();
  const engRef = useReveal();
  const stepsRef = useReveal();
  const detailRef = useReveal();

  useEffect(() => {
    const t = setInterval(() => setActive(a => (a + 1) % STEPS.length), 2400);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="pipeline-page">
      <style>{css}</style>

      <div className="pipeline-inner">

        {/* ── Header ── */}
        <div className="pipe-header reveal" ref={headerRef}>
          <div className="eyebrow">02 — Architecture</div>
          <h1 className="section-title">
            The <em>Three-Engine</em> Pipeline
          </h1>
          <p className="body-lg">
            Mirra chains DUSt3R geometry reconstruction, SAM 2 semantic
            segmentation, and a custom Fusion Engine into a single automated
            pipeline — from raw video to a simulation-ready semantic 3D world.
          </p>
        </div>

        {/* ── Neural Core ── */}
        <div className="core-wrap reveal" ref={coreRef}>
          <div className="neural-core">
            <div className="nc-ring nc-r1" />
            <div className="nc-ring nc-r2" />
            <div className="nc-ring nc-r3" />
            <div className="nc-core">
              <div className="nc-lbl">MIRRA<br />CORE</div>
            </div>
          </div>
          <div className="core-caption">Spatial Intelligence Engine · Active</div>
        </div>

        {/* ── Three Engines ── */}
        <div className="reveal" ref={engRef}>
          <div className="engines-eyebrow">Three AI Engines</div>
          <div className="engines-row">
            {ENGINES.map((e, i) => (
              <>
                <div key={e.id} className={`eng-card ${e.id}`}>
                  <div className="eng-num">{e.num}</div>
                  <div className="eng-icon">{e.icon}</div>
                  <div className="eng-title">{e.title}</div>
                  <div className="eng-sub">{e.sub}</div>
                  <div className="eng-output">
                    <div className="eng-out-dot" />{e.output}
                  </div>
                  <div className="eng-pills">
                    {e.pills.map(p => (
                      <div key={p} className="eng-pill">{p}</div>
                    ))}
                  </div>
                </div>
                {i < ENGINES.length - 1 && (
                  <div key={`arr${i}`} className="eng-arrow">
                    <div className="eng-arrow-inner">
                      <div className="eng-arrow-line" />
                      <div className="eng-arrow-dot" />
                      <div className="eng-arrow-line" />
                    </div>
                  </div>
                )}
              </>
            ))}
          </div>
        </div>

        {/* ── Processing Steps ── */}
        <div className="reveal" ref={stepsRef}>
          <div className="steps-eyebrow">Processing Stages</div>
          <div className="steps-row">
            {STEPS.map((s, i) => (
              <div
                key={i}
                className={`step-card ${i === active ? "on" : ""}`}
                onMouseEnter={() => setActive(i)}
              >
                <div className="step-idx">0{i + 1}</div>
                <div className="step-orb">{s.icon}</div>
                <div className="step-title">{s.title}</div>
                <div className="step-body">{s.body}</div>
                <div className="step-tech">{s.tech}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Detail Cards ── */}
        <div className="detail-grid reveal" ref={detailRef}>
          <div className="detail-card">
            <div className="detail-eyebrow">Technical Approach</div>
            <div className="detail-body">
              Mirra uses <strong>DUSt3R ViT-Large</strong> for dense monocular depth
              estimation, paired with <strong>SAM 2's streaming memory architecture</strong> to
              segment and track objects without reprocessing every frame independently.
              <br /><br />
              The custom <strong>Fusion Engine</strong> projects each reconstructed 3D point
              back into every camera view, queries the SAM 2 mask stack, and assigns a
              semantic class via majority voting — producing a{" "}
              <code>semantic_world.ply</code> where every point is spatially positioned and
              object-labeled.
            </div>
            <div className="metric-row">
              {[{ v: "47ms", l: "Per Frame" }, { v: "3", l: "AI Engines" }, { v: "Multi", l: "View Vote" }].map((m, i) => (
                <div className="metric-box" key={i}>
                  <div className="mbox-val">{m.v}</div>
                  <div className="mbox-lbl">{m.l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="detail-card">
            <div className="detail-eyebrow">Simulation Output</div>
            <div className="detail-body">
              The pipeline produces a <strong>physics-ready semantic 3D point cloud</strong> with
              per-point object labels and a <code>label_map.json</code> mapping IDs to class names.
              <br /><br />
              Compatible with <strong>MuJoCo</strong>, <strong>IsaacGym</strong>, and{" "}
              <strong>PyBullet</strong>. No LiDAR, no RGB-D cameras, no special hardware required
              — just any smartphone video and a GPU.
            </div>
            <div className="metric-row">
              {[{ v: "3", l: "Export Formats" }, { v: "< 5s", l: "Total Time" }, { v: "0", l: "Manual Steps" }].map((m, i) => (
                <div className="metric-box" key={i}>
                  <div className="mbox-val">{m.v}</div>
                  <div className="mbox-lbl">{m.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── CTA ── */}
        {setPage && (
          <div className="cta-row">
            <button className="btn-primary" onClick={() => setPage("upload")}>Try Mirra →</button>
            <button className="btn-secondary" onClick={() => setPage("why")}>Why Mirra?</button>
          </div>
        )}

      </div>
    </div>
  );
}