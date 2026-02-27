import { useEffect, useRef } from "react";

const css = `
.why-page {
  min-height: 100vh; padding-top: 58px;
  background: var(--bg); position: relative;
}
.why-page::before {
  content: '';
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(0,0,0,0.024) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,0,0,0.024) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: radial-gradient(ellipse 72% 55% at 50% 18%, black 8%, transparent 100%);
  pointer-events: none;
}

.why-inner {
  max-width: 1120px; margin: 0 auto; padding: 80px 48px 104px;
  position: relative; z-index: 1;
}

.why-header { margin-bottom: 62px; max-width: 620px; }

/* ── Compare ── */
.compare-grid {
  display: grid; grid-template-columns: 1fr 52px 1fr;
  margin-bottom: 72px;
}

/* Traditional column */
.col-hd {
  padding: 17px 22px; display: flex; align-items: center; gap: 11px;
  border-radius: var(--r-md) var(--r-md) 0 0;
}
.col-hd.old {
  background: #fef2f2;
  border: 1px solid #fecaca; border-bottom: none;
}
.col-hd.new {
  background: linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(34,197,94,0.04) 100%);
  border: 1.5px solid rgba(34,197,94,0.45); border-bottom: none;
  position: relative;
}
/* Green top accent bar on Mirra column header */
.col-hd.new::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 2.5px;
  background: linear-gradient(90deg, var(--green), #4ade80, var(--green));
  border-radius: var(--r-md) var(--r-md) 0 0;
}

.col-ico {
  width: 28px; height: 28px; border-radius: 7px;
  display: flex; align-items: center; justify-content: center; font-size: 0.75rem; flex-shrink: 0;
}
.col-ico.r { background: #fee2e2; border: 1px solid #fecaca; color: #ef4444; }
.col-ico.d {
  background: rgba(34,197,94,0.1);
  border: 1px solid rgba(34,197,94,0.3);
  color: #16a34a;
}

.col-heading { font-family:'DM Sans',sans-serif; font-size:0.82rem; font-weight:600; }
.col-heading.old { color: #ef4444; }
.col-heading.new { color: #15803d; }

/* Traditional body */
.col-body.old {
  border: 1px solid #fecaca; border-top: none;
  border-radius: 0 0 var(--r-md) var(--r-md); overflow: hidden;
  box-shadow: 0 4px 16px rgba(239,68,68,0.06);
}
/* Mirra Pipeline body — green border + subtle glow */
.col-body.new {
  border: 1.5px solid rgba(34,197,94,0.45); border-top: none;
  border-radius: 0 0 var(--r-md) var(--r-md); overflow: hidden;
  background: white;
  box-shadow: 0 4px 24px rgba(34,197,94,0.10), 0 2px 8px rgba(34,197,94,0.06);
}

.cmp-row {
  display: flex; align-items: flex-start; gap: 13px; padding: 17px 20px;
  border-bottom: 1px solid rgba(0,0,0,0.04); transition: background 0.16s;
}
.cmp-row:last-child { border-bottom: none; }
.cmp-row.old:hover { background: #fef9f9; }
.cmp-row.new:hover { background: rgba(34,197,94,0.03); }

.cmp-bul {
  width: 17px; height: 17px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.58rem; flex-shrink: 0; margin-top: 3px;
}
.cmp-bul.bad  { background: #fee2e2; border: 1px solid #fecaca; color: #ef4444; }
.cmp-bul.good {
  background: rgba(34,197,94,0.12);
  border: 1px solid rgba(34,197,94,0.35);
  color: #16a34a;
  box-shadow: 0 0 6px rgba(34,197,94,0.25);
}

.cmp-title { font-family:'DM Sans',sans-serif; font-size:0.84rem; font-weight:600; color:var(--s-800); margin-bottom:2px; }
.cmp-desc  { font-size:0.76rem; color:var(--s-500); line-height:1.65; }

/* VS divider */
.vs-col {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; position: relative; padding: 28px 0;
}
.vs-line { width: 1px; height: 100%; background: linear-gradient(180deg, transparent, var(--s-300), transparent); opacity: 0.7; }
.vs-badge {
  position: absolute; top: 50%; transform: translateY(-50%);
  width: 30px; height: 30px; border-radius: 50%;
  background: white; border: 1px solid var(--s-200);
  display: flex; align-items: center; justify-content: center;
  font-family: 'DM Mono', monospace; font-size: 0.55rem;
  font-weight: 600; color: var(--s-400); box-shadow: var(--sh-sm); z-index: 1;
}

/* ── Impact metrics ── */
.impact-eyebrow {
  font-family: 'DM Mono', monospace; font-size: 0.62rem; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--s-400); margin-bottom: 26px;
  display: flex; align-items: center; gap: 12px;
}
.impact-eyebrow::after { content: ''; flex: 1; height: 1px; background: var(--s-200); }

.impact-grid {
  display: grid; grid-template-columns: repeat(4,1fr); gap: 11px; margin-bottom: 72px;
}

/* Impact cards — highlighted with stronger shadow + hover lift */
.impact-card {
  padding: 28px 18px; text-align: center; background: white;
  border: 1px solid var(--s-200); border-radius: var(--r-lg);
  transition: all 0.28s var(--ease-spring);
  box-shadow: 0 2px 8px rgba(0,0,0,0.06), 0 6px 22px rgba(0,0,0,0.05);
  position: relative; overflow: hidden;
}
.impact-card::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, var(--s-300), transparent);
  opacity: 0; transition: opacity 0.28s;
}
.impact-card:hover {
  border-color: var(--s-300);
  box-shadow: 0 4px 16px rgba(0,0,0,0.09), 0 16px 40px rgba(0,0,0,0.07);
  transform: translateY(-4px);
}
.impact-card:hover::before { opacity: 1; }
.impact-num { font-family: 'DM Serif Display', serif; font-size: 2.3rem; color: var(--ink); line-height: 1; }
.impact-unit { font-family: 'DM Serif Display', serif; font-size: 1.1rem; color: var(--s-400); margin-left: 1px; }
.impact-lbl { font-family: 'DM Mono', monospace; font-size: 0.6rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--s-400); margin-top: 7px; }

/* ── AMD / Hardware cards — highlighted ── */
.hw-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 64px; }

.hw-card {
  padding: 28px; background: white;
  border: 1px solid var(--s-200); border-radius: var(--r-lg);
  transition: all 0.28s var(--ease-spring);
  box-shadow: 0 2px 8px rgba(0,0,0,0.06), 0 6px 22px rgba(0,0,0,0.05);
  position: relative; overflow: hidden;
}
.hw-card::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, var(--s-200), var(--s-400), var(--s-200));
  opacity: 0; transition: opacity 0.26s;
}
.hw-card:hover {
  border-color: var(--s-300);
  box-shadow: 0 4px 16px rgba(0,0,0,0.09), 0 16px 40px rgba(0,0,0,0.07);
  transform: translateY(-3px);
}
.hw-card:hover::before { opacity: 1; }
.hw-eyebrow { font-family: 'DM Mono', monospace; font-size: 0.6rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--s-400); margin-bottom: 11px; }
.hw-title { font-family: 'DM Sans', sans-serif; font-size: 1rem; font-weight: 600; color: var(--ink); margin-bottom: 10px; }
.hw-body { font-size: 0.86rem; color: var(--s-600); line-height: 1.8; }
.hw-body strong { color: var(--ink); font-weight: 600; }
.hw-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--s-100); }
.hw-tag { font-family: 'DM Mono', monospace; font-size: 0.62rem; color: var(--s-500); padding: 3px 10px; border: 1px solid var(--s-200); border-radius: 5px; background: var(--s-50); transition: all 0.14s; }
.hw-tag:hover { border-color: var(--s-300); color: var(--ink); background: white; }

.cta-row { display: flex; align-items: center; justify-content: center; gap: 11px; }

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

const OLD = [
  { title: "Manual 3D Modeling", desc: "Weeks of skilled labor by specialized artists at $150–300/hr — inaccessible to most researchers." },
  { title: "LiDAR Required", desc: "High-fidelity 3D capture requires expensive depth hardware most teams can't afford." },
  { title: "Geometry Only", desc: "Traditional pipelines produce raw point clouds with no object-level understanding or labels." },
  { title: "Weeks of Setup", desc: "Slow iteration cycles block robotics and RL research workflows entirely." },
  { title: "Synthetic Environments", desc: "Handcrafted scenes miss real-world complexity — policies fail to transfer." },
];

const NEW = [
  { title: "Any Smartphone Video", desc: "Upload any footage captured from any phone. Mirra handles everything automatically." },
  { title: "Zero Special Hardware", desc: "No LiDAR, no RGB-D cameras. A standard GPU server is all that's needed." },
  { title: "Semantic 3D World", desc: "Every point in the output cloud is labeled with an object class — geometry meets understanding." },
  { title: "Under 5 Seconds", desc: "DUSt3R + SAM 2 + Fusion Engine run end-to-end on GPU in under five seconds." },
  { title: "Real-World Fidelity", desc: "Scenes reconstructed from real video preserve actual geometry and environmental complexity." },
];

export default function WhyPage({ setPage }) {
  const hRef = useReveal();
  const cRef = useReveal();
  const iRef = useReveal();
  const hwRef = useReveal();

  return (
    <div className="why-page">
      <style>{css}</style>
      <div className="why-inner">

        {/* Header */}
        <div className="why-header reveal" ref={hRef}>
          <div className="eyebrow">05 — Impact</div>
          <h1 className="section-title" style={{ marginBottom: 14 }}>
            Why <em>Mirra</em> Exists
          </h1>
          <p className="body-lg">
            Building simulation environments for robot training has always demanded weeks of manual work, expensive hardware, and deep expertise. Mirra removes every single one of those barriers with three AI engines and a smartphone.
          </p>
        </div>

        {/* Compare grid */}
        <div className="compare-grid reveal" ref={cRef}>
          {/* Traditional */}
          <div>
            <div className="col-hd old">
              <div className="col-ico r">✕</div>
              <div className="col-heading old">Traditional Approach</div>
            </div>
            <div className="col-body old">
              {OLD.map((x, i) => (
                <div key={i} className="cmp-row old">
                  <div className="cmp-bul bad">✕</div>
                  <div>
                    <div className="cmp-title">{x.title}</div>
                    <div className="cmp-desc">{x.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* VS */}
          <div className="vs-col">
            <div className="vs-line" />
            <div className="vs-badge">VS</div>
          </div>

          {/* Mirra — green border */}
          <div>
            <div className="col-hd new">
              <div className="col-ico d">◈</div>
              <div className="col-heading new">Mirra Pipeline</div>
            </div>
            <div className="col-body new">
              {NEW.map((x, i) => (
                <div key={i} className="cmp-row new">
                  <div className="cmp-bul good">✓</div>
                  <div>
                    <div className="cmp-title">{x.title}</div>
                    <div className="cmp-desc">{x.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Impact metrics */}
        <div className="reveal" ref={iRef}>
          <div className="impact-eyebrow">Quantified Impact</div>
          <div className="impact-grid">
            {[
              { n: "100", u: "×", l: "Faster Setup" },
              { n: "< 5", u: "s", l: "End-to-End" },
              { n: "0", u: "$", l: "Manual Labor" },
              { n: "3", u: "", l: "AI Engines" },
            ].map((m, i) => (
              <div className="impact-card" key={i}>
                <div>
                  <span className="impact-num">{m.n}</span>
                  {m.u && <span className="impact-unit">{m.u}</span>}
                </div>
                <div className="impact-lbl">{m.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* AMD alignment */}
        <div className="reveal" ref={hwRef}>
          <div className="impact-eyebrow">AMD Hackathon Alignment</div>
          <div className="hw-grid">
            <div className="hw-card">
              <div className="hw-eyebrow">Compute Workload</div>
              <div className="hw-title">GPU-Native Architecture</div>
              <div className="hw-body">
                Mirra's core workloads — <strong>DUSt3R ViT-Large</strong> depth estimation and <strong>SAM 2</strong> temporal segmentation — are transformer-heavy operations benefiting directly from high-VRAM GPU-accelerated matrix multiplications.
                <br /><br />
                The async FastAPI backend leverages <strong>EPYC server-level concurrency</strong>, distributing frame extraction and preprocessing across all available cores with memory-aware batching and automatic OOM fallback.
              </div>
              <div className="hw-tags">
                {["ROCm Compatible", "GPU PyTorch", "High-VRAM", "Async FastAPI", "Multi-Core"].map(t => (
                  <div key={t} className="hw-tag">{t}</div>
                ))}
              </div>
            </div>

            <div className="hw-card">
              <div className="hw-eyebrow">Scalability</div>
              <div className="hw-title">Workstation to Data Center</div>
              <div className="hw-body">
                Memory-aware batching and <strong>automatic OOM fallback</strong> make Mirra portable across GPU tiers — from consumer cards to <strong>AMD Instinct-class accelerators</strong>.
                <br /><br />
                Larger batch sizes and higher-resolution inputs simply require more VRAM, benefiting directly from AMD's expanding GPU memory roadmap. The system demonstrates spatial AI on <strong>heterogeneous compute</strong>.
              </div>
              <div className="hw-tags">
                {["Instinct Compatible", "Auto OOM Fallback", "Memory-Aware", "Scalable Batch", "Heterogeneous"].map(t => (
                  <div key={t} className="hw-tag">{t}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="cta-row">
          <button className="btn-primary" onClick={() => setPage("upload")}>Launch Mirra →</button>
          <button className="btn-secondary" onClick={() => setPage("research")}>Research Basis</button>
        </div>
      </div>
    </div>
  );
}