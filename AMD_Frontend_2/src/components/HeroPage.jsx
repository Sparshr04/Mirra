import { useEffect, useRef, useState, useCallback } from "react";
import Spline from "@splinetool/react-spline";

/* ─── Model data ─────────────────────────────── */
const MODELS = [
  {
    id: "office", label: "Office Scene", tag: "MODEL 01", accent: "#0ea5e9",
    palette: {
      geo: ["#0a0a1a", "#0d1f3c", "#0a3060", "#1a5276", "#2980b9", "#5dade2"],
      heat: ["#000080", "#0000ff", "#00ffff", "#00ff00", "#ffff00", "#ff6600", "#ff0000"],
      sem: { bg: "#0c0c14", objects: [{ c: "#e74c3c", x: 18, y: 55, w: 14, h: 24 }, { c: "#2ecc71", x: 38, y: 45, w: 20, h: 35 }, { c: "#3498db", x: 65, y: 48, w: 16, h: 30 }, { c: "#f39c12", x: 80, y: 60, w: 12, h: 18 }] },
    },
  },
  {
    id: "street", label: "Street Scene", tag: "MODEL 02", accent: "#8b5cf6",
    palette: {
      geo: ["#0a0a0a", "#111120", "#182040", "#1e3a5f", "#2e5e8e", "#4a88c0"],
      heat: ["#000060", "#0000cc", "#0099ff", "#00ffaa", "#aaff00", "#ffaa00", "#ff2200"],
      sem: { bg: "#0c0c10", objects: [{ c: "#e74c3c", x: 12, y: 40, w: 8, h: 40 }, { c: "#2ecc71", x: 25, y: 50, w: 25, h: 30 }, { c: "#3498db", x: 58, y: 35, w: 10, h: 45 }, { c: "#f39c12", x: 75, y: 52, w: 18, h: 28 }, { c: "#9b59b6", x: 88, y: 45, w: 8, h: 35 }] },
    },
  },
  {
    id: "lab", label: "Lab Environment", tag: "MODEL 03", accent: "#22c55e",
    palette: {
      geo: ["#080c0a", "#0c1f12", "#0e3020", "#145c30", "#1e8040", "#2db560"],
      heat: ["#001a00", "#003300", "#006600", "#00cc00", "#99ff00", "#ffee00", "#ff7700"],
      sem: { bg: "#080c08", objects: [{ c: "#e74c3c", x: 8, y: 30, w: 12, h: 30 }, { c: "#2ecc71", x: 28, y: 55, w: 22, h: 20 }, { c: "#3498db", x: 52, y: 25, w: 18, h: 45 }, { c: "#f39c12", x: 72, y: 42, w: 15, h: 28 }, { c: "#1abc9c", x: 85, y: 55, w: 10, h: 25 }] },
    },
  },
  {
    id: "warehouse", label: "Warehouse", tag: "MODEL 04", accent: "#f97316",
    palette: {
      geo: ["#0d0a06", "#1c1408", "#2e2010", "#4a3418", "#6a4c22", "#8a6c3a"],
      heat: ["#1a0000", "#440000", "#880000", "#cc4400", "#ff8800", "#ffcc00", "#ffffff"],
      sem: { bg: "#100c08", objects: [{ c: "#e74c3c", x: 5, y: 38, w: 20, h: 32 }, { c: "#2ecc71", x: 30, y: 55, w: 28, h: 22 }, { c: "#3498db", x: 60, y: 30, w: 14, h: 50 }, { c: "#f39c12", x: 78, y: 48, w: 16, h: 30 }] },
    },
  },
  {
    id: "garden", label: "Garden Scene", tag: "MODEL 05", accent: "#ec4899",
    palette: {
      geo: ["#060c06", "#0c1a0c", "#142a14", "#1c4020", "#286030", "#3a8844"],
      heat: ["#000820", "#001060", "#0050c0", "#00b0e0", "#40e080", "#c0f000", "#ff8000"],
      sem: { bg: "#060c06", objects: [{ c: "#e74c3c", x: 10, y: 60, w: 18, h: 20 }, { c: "#2ecc71", x: 32, y: 35, w: 24, h: 45 }, { c: "#3498db", x: 60, y: 42, w: 12, h: 38 }, { c: "#f39c12", x: 76, y: 55, w: 14, h: 25 }, { c: "#9b59b6", x: 88, y: 38, w: 10, h: 42 }] },
    },
  },
];
const ITERS_PER_MODEL = 3;
const ITER_MS = 2800;

/* ─── CSS ────────────────────────────────────── */
const css = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=DM+Serif+Display:ital@0;1&display=swap');

:root{
  --bg:#f9f8f6; --ink:#111;
  --s-50:#f8f8f8; --s-100:#f0f0f0; --s-200:#e8e8e8; --s-300:#c8c8c8;
  --s-400:#888;   --s-500:#666;     --s-600:#444;     --s-800:#222;
  --sky:#0ea5e9;  --violet:#8b5cf6; --green:#22c55e;
  --r-md:12px; --r-lg:18px;
  --sh-xs:0 1px 3px rgba(0,0,0,0.06),0 2px 8px rgba(0,0,0,0.04);
  --sh-sm:0 2px 8px rgba(0,0,0,0.07),0 6px 24px rgba(0,0,0,0.05);
  --ease-spring:cubic-bezier(0.34,1.56,0.64,1);
  --ease-out:cubic-bezier(0.22,1,0.36,1);
}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--ink);}

/* ════════════════════════════════════════
   HERO
════════════════════════════════════════ */
.hero-wrap{
  position:relative; height:100vh; overflow:hidden; background:var(--bg);
  will-change:transform;
}
.hero-bg-grid{
  position:absolute; inset:0; z-index:0;
  background-image:
    linear-gradient(rgba(0,0,0,0.032) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,0,0,0.032) 1px, transparent 1px);
  background-size:64px 64px;
  -webkit-mask-image:radial-gradient(ellipse 110% 80% at 55% 42%, black 10%, transparent 100%);
  mask-image:radial-gradient(ellipse 110% 80% at 55% 42%, black 10%, transparent 100%);
  will-change:transform; transform:translateZ(0);
}
.hero-glow{
  position:absolute; inset:0; z-index:1; pointer-events:none;
  background:radial-gradient(ellipse 65% 70% at 72% 46%, rgba(14,165,233,0.055) 0%, rgba(139,92,246,0.028) 40%, transparent 72%);
}
.hero-main{
  position:absolute; inset:0; z-index:5;
  display:grid; grid-template-columns:44% 56%;
}
.hero-left{
  display:flex; align-items:center;
  padding:0 0 60px 80px; will-change:transform;
}
.hero-content{ max-width:500px; }
.hero-badge{
  display:inline-flex; align-items:center; gap:9px;
  border:1px solid rgba(0,0,0,0.08); background:rgba(255,255,255,0.82); backdrop-filter:blur(16px);
  -webkit-backdrop-filter:blur(16px); border-radius:100px; padding:6px 16px 6px 10px;
  font-size:0.72rem; font-weight:500; color:var(--s-500); margin-bottom:28px; box-shadow:var(--sh-xs);
  animation:fadeUp 0.8s var(--ease-spring) 0.1s both;
}
.badge-pulse{ width:7px; height:7px; border-radius:50%; background:var(--green); box-shadow:0 0 9px rgba(34,197,94,0.7); animation:pulseRing 2.4s ease infinite; flex-shrink:0; }
.badge-sep{ width:1px; height:10px; background:rgba(0,0,0,0.1); }
.badge-version{ font-family:'DM Mono',monospace; font-size:0.64rem; color:var(--s-400); }
.hero-title{
  font-family:'DM Serif Display',serif; font-size:clamp(3rem,5.4vw,5.2rem);
  font-weight:400; line-height:1.02; letter-spacing:-0.035em; color:var(--ink); margin-bottom:18px;
  animation:fadeUp 0.85s var(--ease-spring) 0.22s both;
}
.ht-l1{ display:block; }
.ht-l2{ display:block; font-style:italic; color:var(--s-400); }
.hero-desc{
  font-size:1.0rem; color:var(--s-500); line-height:1.84; max-width:380px; margin-bottom:32px;
  animation:fadeUp 0.85s var(--ease-spring) 0.34s both;
}
.hero-ctas{ display:flex; align-items:center; gap:10px; animation:fadeUp 0.85s var(--ease-spring) 0.46s both; }
.btn-primary{
  padding:12px 28px; background:var(--ink); color:white; border:none; border-radius:9px;
  font-size:0.88rem; font-weight:600; cursor:pointer; transition:transform 0.2s var(--ease-out),box-shadow 0.2s; letter-spacing:0.01em;
}
.btn-primary:hover{ transform:translateY(-2px); box-shadow:0 10px 28px rgba(0,0,0,0.22); }
.btn-primary:active{ transform:translateY(0); }
.btn-secondary{
  padding:12px 28px; background:rgba(255,255,255,0.7); color:var(--ink); border:1px solid var(--s-200);
  border-radius:9px; font-size:0.88rem; backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);
  cursor:pointer; transition:all 0.2s var(--ease-out);
}
.btn-secondary:hover{ border-color:var(--s-400); transform:translateY(-2px); box-shadow:0 4px 16px rgba(0,0,0,0.08); }
.hero-right{ position:relative; overflow:visible; will-change:transform; }
.hero-spline{ position:absolute; inset:-5% -3%; z-index:5; }
.hero-spline canvas{ width:100%!important; height:100%!important; }
.hero-cinema-fade{
  position:absolute; left:0; right:0; bottom:0; z-index:30; height:44%; pointer-events:none;
  background:linear-gradient(to bottom, transparent 0%, rgba(249,248,246,0.06) 18%, rgba(249,248,246,0.22) 36%, rgba(249,248,246,0.55) 55%, rgba(249,248,246,0.84) 72%, var(--bg) 100%);
}
.hero-wm-kill{
  position:absolute; right:0; bottom:0; z-index:50; width:380px; height:88px; pointer-events:none;
  background:linear-gradient(to bottom, transparent 0%, var(--bg) 52%);
}
.ftag{
  position:absolute; display:inline-flex; align-items:center; gap:7px; padding:7px 14px;
  background:rgba(255,255,255,0.86); border:1px solid rgba(0,0,0,0.07); border-radius:8px;
  backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px);
  font-family:'DM Mono',monospace; font-size:0.67rem; font-weight:500; color:var(--s-500);
  white-space:nowrap; z-index:22; pointer-events:none; box-shadow:var(--sh-sm);
  animation:floatTag var(--dur,4.2s) ease-in-out infinite; animation-delay:var(--del,0s);
}
.ftag-dot{ width:5px; height:5px; border-radius:50%; flex-shrink:0; animation:pulseRing 2.2s ease infinite; }
.ftag-dot.sky   { background:var(--sky);    box-shadow:0 0 8px rgba(14,165,233,0.7); }
.ftag-dot.violet{ background:var(--violet); box-shadow:0 0 8px rgba(139,92,246,0.7); }
.ftag-dot.green { background:var(--green);  box-shadow:0 0 8px rgba(34,197,94,0.7);  }
.hero-cursor{
  position:absolute; left:80px; z-index:28; pointer-events:none;
  font-family:'DM Mono',monospace; font-size:0.6rem; color:var(--s-300);
  display:flex; gap:16px; letter-spacing:0.04em;
  animation:fadeUp 1.6s ease 1.4s both; bottom:calc(60px + 2px);
}
.hc-val{ color:var(--s-400); }
.hero-stats{
  position:absolute; left:0; right:0; bottom:0; z-index:35;
  display:grid; grid-template-columns:repeat(4,1fr);
  border-top:1px solid rgba(0,0,0,0.07);
  background:rgba(249,248,246,0.82); backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px);
  animation:fadeUp 1s var(--ease-spring) 0.6s both;
}
.stat-cell{ padding:16px 30px; border-right:1px solid rgba(0,0,0,0.055); transition:background 0.22s; }
.stat-cell:last-child{ border-right:none; }
.stat-cell:hover{ background:rgba(255,255,255,0.95); }
.stat-val{ font-family:'DM Serif Display',serif; font-size:1.38rem; color:var(--ink); line-height:1; margin-bottom:4px; }
.stat-lbl{ font-family:'DM Mono',monospace; font-size:0.6rem; color:var(--s-400); letter-spacing:0.07em; text-transform:uppercase; }
.scroll-cue{
  position:absolute; left:80px; bottom:calc(60px + 44px); z-index:36;
  display:flex; align-items:center; gap:14px; cursor:pointer; user-select:none;
  animation:fadeUp 1s var(--ease-spring) 1.9s both; text-decoration:none;
}
.scroll-cue-pill{
  display:inline-flex; align-items:center; gap:9px; padding:10px 20px 10px 12px;
  background:rgba(255,255,255,0.9); border:1px solid rgba(0,0,0,0.1); border-radius:100px;
  backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px);
  box-shadow:0 2px 12px rgba(0,0,0,0.09),0 6px 26px rgba(0,0,0,0.06);
  transition:all 0.26s var(--ease-out); white-space:nowrap;
}
.scroll-cue:hover .scroll-cue-pill{ transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,0.13),0 12px 36px rgba(0,0,0,0.08); border-color:rgba(0,0,0,0.18); }
.scroll-cue-icon{ width:28px; height:28px; border-radius:50%; background:var(--ink); display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:transform 0.26s var(--ease-spring); }
.scroll-cue:hover .scroll-cue-icon{ transform:translateY(2px); }
.scroll-cue-arrow{ display:block; width:8px; height:8px; border-right:1.5px solid white; border-bottom:1.5px solid white; transform:rotate(45deg) translateY(-1px); }
.scroll-cue-text{ font-family:'DM Sans',sans-serif; font-size:0.82rem; font-weight:600; color:var(--ink); letter-spacing:0.01em; }
.scroll-cue-sub{ font-family:'DM Mono',monospace; font-size:0.58rem; color:var(--s-400); letter-spacing:0.1em; text-transform:uppercase; }

/* ════════════════════════════════════════
   DEMO SECTION
════════════════════════════════════════ */
.demo-section{
  padding:96px 0 96px; background:#0c0c10; position:relative; overflow:visible;
}
.demo-section::before{
  content:''; position:absolute; inset:0;
  background-image: linear-gradient(rgba(14,165,233,0.022) 1px,transparent 1px), linear-gradient(90deg,rgba(14,165,233,0.022) 1px,transparent 1px);
  background-size:52px 52px; pointer-events:none;
}
.demo-inner{ max-width:1160px; margin:0 auto; padding:0 48px; position:relative; z-index:1; overflow:visible; }
.demo-header{ text-align:center; margin-bottom:52px; }
.demo-eyebrow{
  font-family:'DM Mono',monospace; font-size:0.62rem; letter-spacing:0.18em;
  text-transform:uppercase; color:rgba(14,165,233,0.52); margin-bottom:14px;
  display:flex; align-items:center; justify-content:center; gap:12px;
}
.demo-eyebrow-line{ width:28px; height:1px; background:rgba(14,165,233,0.18); }
.demo-title{ font-family:'DM Serif Display',serif; font-size:clamp(1.9rem,3.2vw,2.8rem); color:#f0f0ec; line-height:1.1; letter-spacing:-0.024em; margin-bottom:12px; }
.demo-title em{ font-style:italic; color:rgba(255,255,255,0.28); }
.demo-sub{ font-size:0.9rem; color:rgba(255,255,255,0.33); line-height:1.76; max-width:440px; margin:0 auto; }

/* ── New layout wrapper with floating PiP panels ── */
.demo-stage{
  position:relative;
  margin:0 212px; /* reserve space on both sides for the PiP windows */
}

/* Carousel */
.carousel-wrap{
  position:relative; width:100%; padding-bottom:57%; height:0;
  overflow:visible;
}
.model-slide{
  position:absolute; inset:0; opacity:0;
  transition:opacity 0.9s cubic-bezier(0.4,0,0.2,1);
  pointer-events:none; will-change:opacity;
}
.model-slide.active{ opacity:1; pointer-events:auto; }

/* ── New 2x2 grid: flythrough + geometry ── */
.four-grid{
  display:grid;
  grid-template-columns:1fr 1fr;
  grid-template-rows:1fr 1fr;
  gap:8px; width:100%; height:100%;
  border-radius:14px; overflow:hidden;
}
.panel-flythrough-raw { grid-column:1; grid-row:1; }
.panel-flythrough-sem { grid-column:2; grid-row:1; }
.panel-geo-raw        { grid-column:1; grid-row:2; }
.panel-geo-sem        { grid-column:2; grid-row:2; }

.vid-panel{
  position:relative; overflow:hidden;
  background:#080810; border-radius:8px;
  border:1px solid rgba(255,255,255,0.04);
}
.panel-canvas{ display:block; width:100%; height:100%; }
.panel-scan{
  position:absolute; inset:0; pointer-events:none; z-index:20;
  background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.07) 2px,rgba(0,0,0,0.07) 4px);
}
.panel-label{
  position:absolute; top:9px; left:9px; z-index:30;
  display:inline-flex; align-items:center; gap:6px; padding:3px 9px;
  background:rgba(0,0,0,0.58); backdrop-filter:blur(10px);
  border:1px solid rgba(255,255,255,0.08); border-radius:5px;
  font-family:'DM Mono',monospace; font-size:0.56rem; letter-spacing:0.1em;
  color:rgba(255,255,255,0.65); text-transform:uppercase;
}
.panel-dot{ width:4px; height:4px; border-radius:50%; animation:pulseRing 2s ease infinite; }
.panel-dot.sky   { background:#0ea5e9; box-shadow:0 0 5px rgba(14,165,233,0.9); }
.panel-dot.violet{ background:#8b5cf6; box-shadow:0 0 5px rgba(139,92,246,0.9); }
.panel-dot.green { background:#22c55e; box-shadow:0 0 5px rgba(34,197,94,0.9);  }
.panel-dot.orange{ background:#f97316; box-shadow:0 0 5px rgba(249,115,22,0.9); }
.panel-dot.pink  { background:#ec4899; box-shadow:0 0 5px rgba(236,72,153,0.9); }

.model-name-badge{
  position:absolute; top:10px; right:10px; z-index:40;
  display:inline-flex; align-items:center; gap:7px; padding:5px 12px;
  background:rgba(0,0,0,0.62); backdrop-filter:blur(12px);
  border:1px solid rgba(255,255,255,0.09); border-radius:6px;
  font-family:'DM Mono',monospace; font-size:0.6rem; color:rgba(255,255,255,0.52);
}
.mnb-accent{ width:6px; height:6px; border-radius:50%; flex-shrink:0; }

/* ── Floating PiP windows ── */
.pip-container{
  position:absolute;
  width:188px;
  z-index:60;
  pointer-events:auto;
  animation:fadeUp 0.9s var(--ease-spring) 0.3s both;
}
.pip-container.pip-left{
  left:-204px;
  bottom:0px;
}
.pip-container.pip-right{
  right:-204px;
  bottom:0px;
}

.pip-window{
  background:rgba(6,6,14,0.94);
  border:1px solid rgba(255,255,255,0.08);
  border-radius:10px;
  overflow:hidden;
  box-shadow:0 8px 32px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04);
  backdrop-filter:blur(16px);
  -webkit-backdrop-filter:blur(16px);
  transition:transform 0.26s var(--ease-out), box-shadow 0.26s;
}
.pip-window:hover{
  transform:translateY(-3px) scale(1.02);
  box-shadow:0 16px 48px rgba(0,0,0,0.8), 0 4px 14px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06);
}

.pip-header{
  display:flex; align-items:center; gap:6px;
  padding:6px 10px;
  border-bottom:1px solid rgba(255,255,255,0.05);
  background:rgba(255,255,255,0.025);
}
.pip-dot{ width:4px; height:4px; border-radius:50%; flex-shrink:0; animation:pulseRing 2s ease infinite; }
.pip-title{
  font-family:'DM Mono',monospace; font-size:0.52rem; letter-spacing:0.1em;
  text-transform:uppercase; color:rgba(255,255,255,0.45); flex:1;
}
.pip-live{
  font-family:'DM Mono',monospace; font-size:0.46rem; letter-spacing:0.08em;
  color:rgba(255,255,255,0.22); text-transform:uppercase;
}

.pip-canvas-wrap{
  position:relative; width:100%; padding-bottom:62%; height:0;
}
.pip-canvas-wrap canvas{
  position:absolute; inset:0; width:100%!important; height:100%!important; display:block;
}
.pip-scan{
  position:absolute; inset:0; pointer-events:none; z-index:5;
  background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.06) 2px,rgba(0,0,0,0.06) 4px);
}

.pip-footer{
  padding:5px 10px;
  display:flex; align-items:center; justify-content:space-between;
  background:rgba(0,0,0,0.25);
}
.pip-stat{
  font-family:'DM Mono',monospace; font-size:0.48rem; color:rgba(255,255,255,0.22);
  letter-spacing:0.06em;
}
.pip-stat span{ color:rgba(255,255,255,0.44); }

/* PiP corner decorators */
.pip-corner{
  position:absolute; width:8px; height:8px; pointer-events:none; z-index:10;
}
.pip-corner.tl{ top:0; left:0; border-top:1.5px solid rgba(255,255,255,0.18); border-left:1.5px solid rgba(255,255,255,0.18); border-radius:2px 0 0 0; }
.pip-corner.tr{ top:0; right:0; border-top:1.5px solid rgba(255,255,255,0.18); border-right:1.5px solid rgba(255,255,255,0.18); border-radius:0 2px 0 0; }
.pip-corner.bl{ bottom:0; left:0; border-bottom:1.5px solid rgba(255,255,255,0.18); border-left:1.5px solid rgba(255,255,255,0.18); border-radius:0 0 0 2px; }
.pip-corner.br{ bottom:0; right:0; border-bottom:1.5px solid rgba(255,255,255,0.18); border-right:1.5px solid rgba(255,255,255,0.18); border-radius:0 0 2px 0; }

.progress-wrap{ display:flex; align-items:center; gap:14px; margin-top:13px; }
.progress-track{ flex:1; height:2px; background:rgba(255,255,255,0.07); border-radius:2px; overflow:hidden; }
.progress-fill{ height:100%; border-radius:2px; transition:width 0.22s linear; }
.progress-meta{ font-family:'DM Mono',monospace; font-size:0.58rem; color:rgba(255,255,255,0.26); white-space:nowrap; flex-shrink:0; }

.dots-nav{ display:flex; justify-content:center; align-items:center; gap:8px; margin-top:18px; }
.dot-btn{ width:6px; height:6px; border-radius:50%; border:none; cursor:pointer; background:rgba(255,255,255,0.14); transition:all 0.3s; padding:0; }
.dot-btn.on{ width:22px; border-radius:3px; background:rgba(255,255,255,0.52); }

.demo-methods{
  display:flex; align-items:center; justify-content:center; gap:0; margin-top:26px; flex-wrap:wrap;
}
.dm-item{ display:flex; align-items:center; gap:7px; padding:0 20px; font-size:0.74rem; color:rgba(255,255,255,0.25); }
.dm-dot{ width:3px; height:3px; border-radius:50%; background:rgba(255,255,255,0.16); flex-shrink:0; }
.dm-sep{ width:1px; height:12px; background:rgba(255,255,255,0.07); }

/* ════════════════════════════════════════
   KEYFRAMES
════════════════════════════════════════ */
@keyframes fadeUp{ from{opacity:0;transform:translateY(20px);} to{opacity:1;transform:translateY(0);} }
@keyframes pulseRing{ 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.55;transform:scale(0.88);} }
@keyframes floatTag{ 0%,100%{transform:translateY(0px);} 50%{transform:translateY(-6px);} }
@keyframes pipFloat{ 0%,100%{transform:translateY(0px);} 50%{transform:translateY(-4px);} }
`;

/* ─── Canvas Panels ──────────────────────────── */

// Non-semantic flythrough — warm photo-realistic feel, no color labels
function FlythroughRawPanel({ model, tick }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * dpr; c.height = c.offsetHeight * dpr;
    const W = c.width, H = c.height, ctx = c.getContext("2d");
    // Natural video gradient — warm tones
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#0a0c14"); grad.addColorStop(0.5, "#141828"); grad.addColorStop(1, "#0d1020");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    // Depth-based point cloud — monochrome
    const seed = tick * 137 + model.id.charCodeAt(0);
    for (let i = 0; i < 2400; i++) {
      const rx = (Math.sin(i * seed * 0.0013) * 0.5 + 0.5) * W;
      const ry = (Math.cos(i * seed * 0.0017) * 0.5 + 0.5) * H;
      const depth = ry / H;
      const rb = 60 + depth * 130 + Math.sin(i * 0.4 + tick * 0.05) * 30;
      const alpha = 0.08 + depth * 0.18;
      ctx.fillStyle = `rgba(${rb},${rb + 8},${rb + 22},${alpha})`;
      ctx.fillRect(rx, ry, 1.2 + depth, 1.2 + depth);
    }
    // Environmental silhouette shapes
    ctx.fillStyle = "rgba(255,255,255,0.018)";
    ctx.beginPath(); ctx.moveTo(W * 0.08, H * 0.92); ctx.lineTo(W * 0.2, H * 0.42);
    ctx.lineTo(W * 0.34, H * 0.52); ctx.lineTo(W * 0.52, H * 0.35); ctx.lineTo(W * 0.7, H * 0.48);
    ctx.lineTo(W * 0.86, H * 0.32); ctx.lineTo(W * 0.97, H * 0.92); ctx.closePath(); ctx.fill();
    // Scanlines for video feel
    ctx.fillStyle = "rgba(255,255,255,0.012)";
    for (let y = 0; y < H; y += 3) { ctx.fillRect(0, y, W, 1); }
    // Timecode
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.font = `bold ${W * 0.038}px DM Mono,monospace`;
    ctx.fillText(`${String(Math.floor(tick / 60)).padStart(2, "0")}:${String(tick % 60 * 4 % 60).padStart(2, "0")}:${String(tick % 30 * 3).padStart(2, "0")}`, W * 0.04, H * 0.91);
    // Vignette
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.12, W / 2, H / 2, H * 0.85);
    vig.addColorStop(0, "transparent"); vig.addColorStop(1, "rgba(0,0,0,0.72)");
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
    // Camera path indicator
    const pathProgress = (tick % 120) / 120;
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
    ctx.beginPath(); ctx.moveTo(W * 0.1, H * 0.7); ctx.bezierCurveTo(W * 0.3, H * 0.3, W * 0.7, H * 0.6, W * 0.9, H * 0.2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    const pt = pathProgress;
    const bx = W * (0.1 + pt * (0.9 - 0.1)); // simplified linear approx
    const by = H * (0.7 + pt * (0.2 - 0.7));
    ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fill();
  }, [tick, model]);
  return <canvas ref={ref} className="panel-canvas" style={{ width: "100%", height: "100%" }} />;
}

// Semantic flythrough — same path but with color-coded object overlays
function FlythroughSemPanel({ model, tick }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * dpr; c.height = c.offsetHeight * dpr;
    const W = c.width, H = c.height, ctx = c.getContext("2d");
    ctx.fillStyle = model.palette.sem.bg; ctx.fillRect(0, 0, W, H);
    // Ground plane gradient
    const gp = ctx.createLinearGradient(0, H * 0.6, 0, H);
    gp.addColorStop(0, "rgba(255,255,255,0.018)"); gp.addColorStop(1, "rgba(255,255,255,0.055)");
    ctx.fillStyle = gp; ctx.fillRect(0, H * 0.6, W, H * 0.4);
    // Perspective grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 0.5;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath(); ctx.moveTo(W * 0.5, H * 0.55); ctx.lineTo(W * (i / 7), H); ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const y = H * (0.6 + i * 0.1);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // Semantic objects with perspective scaling
    model.palette.sem.objects.forEach((obj, i) => {
      const perspScale = 0.5 + (obj.y / 100) * 0.7;
      const pulse = Math.sin(tick * 0.12 + i * 1.1) * 2.5;
      const x = W * (obj.x / 100), y = H * (obj.y / 100);
      const w = W * (obj.w / 100) * perspScale, h = H * (obj.h / 100) * perspScale;
      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(x + w * 0.1, y + h - 4, w * 0.8, 5);
      // Object fill
      ctx.shadowBlur = 14 + pulse; ctx.shadowColor = obj.c + "77";
      ctx.fillStyle = obj.c + "44"; ctx.fillRect(x, y, w, h);
      ctx.shadowBlur = 0;
      // Object outline
      ctx.strokeStyle = obj.c + "cc"; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
      // Label chip
      ctx.fillStyle = obj.c;
      ctx.fillRect(x, y - 14, W * 0.055, 13);
      ctx.fillStyle = "rgba(0,0,0,0.9)";
      ctx.font = `${W * 0.018}px DM Mono,monospace`;
      ctx.fillText(`OBJ_${String(i + 1).padStart(2, "0")}`, x + 2, y - 3);
    });
    // Camera scan line
    const sv = (tick % 80) / 80 * H;
    const sg = ctx.createLinearGradient(0, sv - 10, 0, sv + 10);
    sg.addColorStop(0, "transparent"); sg.addColorStop(0.5, "rgba(139,92,246,0.25)"); sg.addColorStop(1, "transparent");
    ctx.fillStyle = sg; ctx.fillRect(0, sv - 10, W, 20);
    // Vignette
    const depth = ctx.createLinearGradient(0, 0, 0, H);
    depth.addColorStop(0, "rgba(0,0,0,0.4)"); depth.addColorStop(0.45, "transparent"); depth.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = depth; ctx.fillRect(0, 0, W, H);
  }, [tick, model]);
  return <canvas ref={ref} className="panel-canvas" style={{ width: "100%", height: "100%" }} />;
}

// Geometry panel — 3D structure, point cloud + depth layers
function GeoPanel({ model, tick }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * dpr; c.height = c.offsetHeight * dpr;
    const W = c.width, H = c.height, ctx = c.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, model.palette.geo[0]); grad.addColorStop(1, model.palette.geo[2]);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    const cols = 34, rows = 20;
    for (let r = 0; r < rows; r++) for (let co = 0; co < cols; co++) {
      const nx = co / cols, ny = r / rows;
      let d = 0.1 + ny * 0.8 + Math.sin(nx * 6 + tick * 0.06) * 0.05;
      if (Math.sqrt((nx - 0.5) ** 2 + (ny - 0.55) ** 2) < 0.18) d *= 0.34;
      ctx.fillStyle = model.palette.geo[Math.min(5, Math.floor(d * 5))] + "cc";
      ctx.fillRect(co * (W / cols), r * (H / rows), W / cols - 1, H / rows - 1);
    }
    for (let i = 0; i < 130; i++) {
      const a = i / 130 * Math.PI * 2, r2 = 0.24 + Math.sin(i * 0.7 + tick * 0.04) * 0.17;
      ctx.beginPath(); ctx.arc(W * (0.5 + Math.cos(a) * r2 * 0.78), H * (0.5 + Math.sin(a) * r2 * 0.48), 1.6, 0, Math.PI * 2);
      ctx.fillStyle = model.palette.geo[3] + "99"; ctx.fill();
    }
    const sx = (tick % 100) / 100 * W;
    const sg = ctx.createLinearGradient(sx - 22, 0, sx + 22, 0);
    sg.addColorStop(0, "transparent"); sg.addColorStop(0.5, "rgba(14,165,233,0.38)"); sg.addColorStop(1, "transparent");
    ctx.fillStyle = sg; ctx.fillRect(sx - 22, 0, 44, H);
    ctx.strokeStyle = "rgba(14,165,233,0.1)"; ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath(); ctx.moveTo(W * 0.08, H * (0.28 + i * 0.09));
      ctx.lineTo(W * 0.92, H * (0.32 + i * 0.076 + Math.sin(i + tick * 0.03) * 0.03)); ctx.stroke();
    }
  }, [tick, model]);
  return <canvas ref={ref} className="panel-canvas" style={{ width: "100%", height: "100%" }} />;
}

// Geometry + Semantic overlay — geo base with sem labels fused
function GeoSemPanel({ model, tick }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * dpr; c.height = c.offsetHeight * dpr;
    const W = c.width, H = c.height, ctx = c.getContext("2d");
    // Draw geo base
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, model.palette.geo[0]); grad.addColorStop(1, model.palette.geo[1]);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    const cols = 28, rows = 16;
    for (let r = 0; r < rows; r++) for (let co = 0; co < cols; co++) {
      const nx = co / cols, ny = r / rows;
      let d = 0.1 + ny * 0.8 + Math.sin(nx * 6 + tick * 0.06) * 0.05;
      if (Math.sqrt((nx - 0.5) ** 2 + (ny - 0.55) ** 2) < 0.18) d *= 0.34;
      ctx.fillStyle = model.palette.geo[Math.min(5, Math.floor(d * 5))] + "88";
      ctx.fillRect(co * (W / cols), r * (H / rows), W / cols - 1, H / rows - 1);
    }
    // Overlay semantic labels with geo-tinted transparency
    model.palette.sem.objects.forEach((obj, i) => {
      const pulse = Math.sin(tick * 0.1 + i * 1.3) * 2;
      const x = W * (obj.x / 100), y = H * (obj.y / 100), w = W * (obj.w / 100), h = H * (obj.h / 100);
      ctx.shadowBlur = 12 + pulse; ctx.shadowColor = obj.c + "88";
      ctx.fillStyle = obj.c + "55"; ctx.fillRect(x + pulse / 2, y + pulse / 2, w - pulse, h - pulse);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = obj.c; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
      // Geo wireframe inside label
      ctx.strokeStyle = obj.c + "33"; ctx.lineWidth = 0.5;
      for (let g = 1; g < 3; g++) {
        ctx.beginPath(); ctx.moveTo(x, y + h * g / 3); ctx.lineTo(x + w, y + h * g / 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + w * g / 3, y); ctx.lineTo(x + w * g / 3, y + h); ctx.stroke();
      }
      ctx.fillStyle = obj.c + "dd"; ctx.font = `${W * 0.022}px DM Mono,monospace`;
      ctx.fillText(`GEO_${String(i + 1).padStart(2, "0")}`, x + 3, y + W * 0.022 + 3);
    });
    // Scan sweep
    const sx = (tick % 100) / 100 * W;
    const sg = ctx.createLinearGradient(sx - 18, 0, sx + 18, 0);
    sg.addColorStop(0, "transparent"); sg.addColorStop(0.5, "rgba(139,92,246,0.22)"); sg.addColorStop(1, "transparent");
    ctx.fillStyle = sg; ctx.fillRect(sx - 18, 0, 36, H);
    // Vignette
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, H * 0.75);
    vig.addColorStop(0, "transparent"); vig.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
  }, [tick, model]);
  return <canvas ref={ref} className="panel-canvas" style={{ width: "100%", height: "100%" }} />;
}

// Original video — PiP floating window
function OriginalPiP({ model, tick }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * dpr; c.height = c.offsetHeight * dpr;
    const W = c.width, H = c.height, ctx = c.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#0a0c14"); grad.addColorStop(1, "#141828");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    const seed = tick * 137 + model.id.charCodeAt(0);
    for (let i = 0; i < 900; i++) {
      const rx = (Math.sin(i * seed * 0.0013) * 0.5 + 0.5) * W;
      const ry = (Math.cos(i * seed * 0.0017) * 0.5 + 0.5) * H;
      const rb = 70 + Math.sin(i * 0.4 + tick * 0.05) * 50;
      ctx.fillStyle = `rgba(${rb},${rb + 14},${rb + 32},${0.12 + Math.sin(i * 0.3) * 0.06})`;
      ctx.fillRect(rx, ry, 1.2, 1.2);
    }
    ctx.fillStyle = "rgba(255,255,255,0.015)";
    ctx.beginPath(); ctx.moveTo(W * 0.1, H * 0.9); ctx.lineTo(W * 0.22, H * 0.45);
    ctx.lineTo(W * 0.36, H * 0.54); ctx.lineTo(W * 0.55, H * 0.37); ctx.lineTo(W * 0.72, H * 0.5);
    ctx.lineTo(W * 0.88, H * 0.34); ctx.lineTo(W * 0.96, H * 0.9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.38)";
    ctx.font = `bold ${W * 0.072}px DM Mono,monospace`;
    ctx.fillText(`${String(Math.floor(tick / 60)).padStart(2, "0")}:${String(tick % 60 * 4 % 60).padStart(2, "0")}`, W * 0.06, H * 0.88);
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, H * 0.78);
    vig.addColorStop(0, "transparent"); vig.addColorStop(1, "rgba(0,0,0,0.68)");
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
    // REC indicator
    ctx.fillStyle = `rgba(249,115,22,${0.7 + Math.sin(tick * 0.15) * 0.3})`;
    ctx.beginPath(); ctx.arc(W * 0.88, H * 0.12, W * 0.025, 0, Math.PI * 2); ctx.fill();
  }, [tick, model]);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />;
}

// Heatmap — PiP floating window
function HeatPiP({ model, tick }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * dpr; c.height = c.offsetHeight * dpr;
    const W = c.width, H = c.height, ctx = c.getContext("2d");
    const cols = 22, rows = 14;
    for (let r = 0; r < rows; r++) for (let co = 0; co < cols; co++) {
      let d = 0.1 + r / rows * 0.75;
      d += Math.sin(co / cols * 5 + tick * 0.07) * 0.1 + Math.cos(r / rows * 4 - tick * 0.05) * 0.08;
      const blob = (co / cols - 0.35) ** 2 + (r / rows - 0.5) ** 2;
      if (blob < 0.025) d = 0.08 + blob * 10;
      ctx.fillStyle = model.palette.heat[Math.min(6, Math.floor(Math.max(0, Math.min(1, d)) * 7))] + "e0";
      ctx.fillRect(co * (W / cols), r * (H / rows), W / cols + 1, H / rows + 1);
    }
    const pr = (tick % 40) / 40;
    ctx.beginPath(); ctx.arc(W * 0.36, H * 0.52, H * (0.06 + pr * 0.18), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,0,${0.4 * (1 - pr)})`; ctx.lineWidth = 1.5; ctx.stroke();
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.06, W / 2, H / 2, H * 0.65);
    vig.addColorStop(0, "transparent"); vig.addColorStop(1, "rgba(0,0,0,0.38)");
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
  }, [tick, model]);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />;
}

/* ─── DemoSection ────────────────────────────── */
function DemoSection({ demoRef }) {
  const [modelIdx, setModelIdx] = useState(0);
  const [iter, setIter] = useState(0);
  const [tick, setTick] = useState(0);
  const busy = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setTick(k => k + 1), 80);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      if (busy.current) return;
      setIter(prev => {
        if (prev + 1 >= ITERS_PER_MODEL) {
          busy.current = true;
          setTimeout(() => { setModelIdx(m => (m + 1) % MODELS.length); busy.current = false; }, 900);
          return 0;
        }
        return prev + 1;
      });
    }, ITER_MS);
    return () => clearInterval(t);
  }, []);

  const model = MODELS[modelIdx];
  const progress = ((iter + (tick % (ITER_MS / 80)) / (ITER_MS / 80)) / ITERS_PER_MODEL) * 100;
  const fps = (24 + Math.sin(tick * 0.07) * 2).toFixed(1);

  return (
    <section className="demo-section" ref={demoRef} id="demo">
      <div className="demo-inner">
        <div className="demo-header">
          <div className="demo-eyebrow">
            <div className="demo-eyebrow-line" />Live Reconstruction<div className="demo-eyebrow-line" />
          </div>
          <h2 className="demo-title">Feed-Forward <em>Semantic Reconstruction</em></h2>
          <p className="demo-sub">
            Mirra's three-engine pipeline turns raw video into a fully labeled semantic 3D world.
            No LiDAR. No manual annotation. Any phone, any scene.
          </p>
        </div>

        {/* Stage with PiP floating windows */}
        <div className="demo-stage">

          {/* Main carousel — PiPs are positioned inside here */}
          <div className="carousel-wrap" style={{ position: "relative" }}>
            {MODELS.map((m, i) => (
              <div key={m.id} className={`model-slide ${i === modelIdx ? "active" : ""}`}>
                <div className="model-name-badge">
                  <div className="mnb-accent" style={{ background: m.accent, boxShadow: `0 0 6px ${m.accent}88` }} />
                  {m.tag} · {m.label}
                </div>
                <div className="four-grid">
                  {/* Top Left — Non-semantic flythrough */}
                  <div className="vid-panel panel-flythrough-raw">
                    <FlythroughRawPanel model={m} tick={tick} />
                    <div className="panel-scan" />
                    <div className="panel-label"><span className="panel-dot orange" />Flythrough · Raw</div>
                  </div>
                  {/* Top Right — Semantic flythrough */}
                  <div className="vid-panel panel-flythrough-sem">
                    <FlythroughSemPanel model={m} tick={tick} />
                    <div className="panel-scan" />
                    <div className="panel-label"><span className="panel-dot violet" />Flythrough · Semantic</div>
                  </div>
                  {/* Bottom Left — Geometry */}
                  <div className="vid-panel panel-geo-raw">
                    <GeoPanel model={m} tick={tick} />
                    <div className="panel-scan" />
                    <div className="panel-label"><span className="panel-dot sky" />Geometry · 3D Structure</div>
                  </div>
                  {/* Bottom Right — Geometry + Semantic */}
                  <div className="vid-panel panel-geo-sem">
                    <GeoSemPanel model={m} tick={tick} />
                    <div className="panel-scan" />
                    <div className="panel-label"><span className="panel-dot pink" />Geometry · Semantic Fusion</div>
                  </div>
                </div>
              </div>
            ))}
            {/* PiP — Original Video (bottom-left, inside grid) */}
            <div className="pip-container pip-left">
              <div className="pip-window" style={{ border: `1px solid rgba(249,115,22,0.22)` }}>
                <div className="pip-corner tl" /><div className="pip-corner tr" />
                <div className="pip-corner bl" /><div className="pip-corner br" />
                <div className="pip-header">
                  <div className="pip-dot" style={{ background: "#f97316", boxShadow: "0 0 5px rgba(249,115,22,0.8)" }} />
                  <span className="pip-title">Original Video</span>
                  <span className="pip-live">● REC</span>
                </div>
                <div className="pip-canvas-wrap">
                  <OriginalPiP model={model} tick={tick} />
                  <div className="pip-scan" />
                </div>
                <div className="pip-footer">
                  <span className="pip-stat">FPS <span>{fps}</span></span>
                  <span className="pip-stat">RAW <span>INPUT</span></span>
                </div>
              </div>
            </div>

            {/* PiP — Depth Heatmap (bottom-right, inside grid) */}
            <div className="pip-container pip-right">
              <div className="pip-window" style={{ border: `1px solid rgba(34,197,94,0.22)` }}>
                <div className="pip-corner tl" /><div className="pip-corner tr" />
                <div className="pip-corner bl" /><div className="pip-corner br" />
                <div className="pip-header">
                  <div className="pip-dot" style={{ background: "#22c55e", boxShadow: "0 0 5px rgba(34,197,94,0.8)" }} />
                  <span className="pip-title">Depth Heatmap</span>
                  <span className="pip-live">LIVE</span>
                </div>
                <div className="pip-canvas-wrap">
                  <HeatPiP model={model} tick={tick} />
                  <div className="pip-scan" />
                </div>
                <div className="pip-footer">
                  <span className="pip-stat">DEPTH <span>MAP</span></span>
                  <span className="pip-stat">RES <span>512px</span></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="progress-wrap">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%`, background: `linear-gradient(90deg,${model.accent}55,${model.accent})` }} />
          </div>
          <span className="progress-meta">{model.tag} · {model.label} · iter {iter + 1}/{ITERS_PER_MODEL}</span>
        </div>

        <div className="dots-nav">
          {MODELS.map((m, i) => (
            <button key={m.id} className={`dot-btn ${i === modelIdx ? "on" : ""}`}
              onClick={() => { setModelIdx(i); setIter(0); }} title={m.label} />
          ))}
        </div>

        <div className="demo-methods">
          {["DUSt3R ViT-Large", "SAM 2 Temporal", "Multi-View Fusion", "MuJoCo Export", "IsaacGym Ready"].map((label, i, arr) => (
            <span key={label} style={{ display: "flex", alignItems: "center" }}>
              <span className="dm-item"><span className="dm-dot" />{label}</span>
              {i < arr.length - 1 && <span className="dm-sep" />}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── HeroPage ───────────────────────────────── */
export default function HeroPage({ setPage }) {
  const wrapRef = useRef(null);
  const gridRef = useRef(null);
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const statsRef = useRef(null);
  const cueRef = useRef(null);
  const demoRef = useRef(null);
  const splineRef = useRef(null);
  const robotRef = useRef(null);
  const targetRot = useRef({ x: 0, y: 0 });
  const currentRot = useRef({ x: 0, y: 0 });
  const rafRef = useRef(null);
  const scrollRaf = useRef(null);
  const [coords, setCoords] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const ease = (a, b, t) => a + (b - a) * t;
    let currentY = 0, targetY = 0;
    const onScroll = () => { targetY = window.scrollY; };
    window.addEventListener("scroll", onScroll, { passive: true });
    const tick = () => {
      currentY = ease(currentY, targetY, 0.09);
      const vh = window.innerHeight, p = Math.min(1, currentY / vh);
      if (p > 0.001) {
        if (gridRef.current) { gridRef.current.style.transform = `translate3d(0, ${currentY * 0.20}px, 0)`; gridRef.current.style.opacity = `${Math.max(0, 1 - p * 1.8)}`; }
        if (leftRef.current) { leftRef.current.style.transform = `translate3d(0, ${currentY * 0.55}px, 0)`; leftRef.current.style.opacity = `${Math.max(0, 1 - p * 2.2)}`; }
        if (rightRef.current) { const floatUp = currentY * -0.18; const scaleUp = 1 + p * 0.06; rightRef.current.style.transform = `translate3d(0, ${floatUp}px, 0) scale(${scaleUp})`; rightRef.current.style.opacity = `${Math.max(0, 1 - p * 1.6)}`; }
        if (statsRef.current) { statsRef.current.style.transform = `translate3d(0, ${currentY * 0.72}px, 0)`; statsRef.current.style.opacity = `${Math.max(0, 1 - p * 3)}`; }
        if (cueRef.current) { cueRef.current.style.transform = `translate3d(-50%, ${currentY * 0.85}px, 0)`; cueRef.current.style.opacity = `${Math.max(0, 1 - p * 4)}`; }
      } else {
        if (gridRef.current) { gridRef.current.style.transform = ""; gridRef.current.style.opacity = ""; }
        if (leftRef.current) { leftRef.current.style.transform = ""; leftRef.current.style.opacity = ""; }
        if (rightRef.current) { rightRef.current.style.transform = ""; rightRef.current.style.opacity = ""; }
        if (statsRef.current) { statsRef.current.style.transform = ""; statsRef.current.style.opacity = ""; }
        if (cueRef.current) { cueRef.current.style.transform = ""; cueRef.current.style.opacity = ""; }
      }
      scrollRaf.current = requestAnimationFrame(tick);
    };
    scrollRaf.current = requestAnimationFrame(tick);
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(scrollRaf.current); };
  }, []);

  const onSplineLoad = useCallback((spline) => {
    splineRef.current = spline;
    const names = ["Robot", "robot", "Character", "character", "Head", "Armature", "Root", "Scene", "Mesh", "Body", "NEXBOT", "Bot"];
    let found = null;
    for (const name of names) { try { const o = spline.findObjectByName(name); if (o) { found = o; break; } } catch (_) { } }
    if (!found) { try { const all = spline.getAllObjects?.() || []; if (all.length) found = all[0]; } catch (_) { } }
    if (found) robotRef.current = found;
    const lerp = (a, b, t) => a + (b - a) * t;
    const anim = () => {
      currentRot.current.x = lerp(currentRot.current.x, targetRot.current.x, 0.055);
      currentRot.current.y = lerp(currentRot.current.y, targetRot.current.y, 0.055);
      if (robotRef.current) { try { robotRef.current.rotation.y = currentRot.current.y; robotRef.current.rotation.x = currentRot.current.x; } catch (_) { } }
      rafRef.current = requestAnimationFrame(anim);
    };
    rafRef.current = requestAnimationFrame(anim);
  }, []);

  const onMouseMove = useCallback((e) => {
    const nx = (e.clientX / window.innerWidth - 0.5) * 2;
    const ny = (e.clientY / window.innerHeight - 0.5) * 2;
    targetRot.current.y = nx * 0.36; targetRot.current.x = ny * 0.20;
    setCoords({ x: Math.round(e.clientX), y: Math.round(e.clientY) });
  }, []);

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); cancelAnimationFrame(scrollRaf.current); }, []);

  const scrollToDemo = useCallback(() => { demoRef.current?.scrollIntoView({ behavior: "smooth" }); }, []);

  return (
    <>
      <style>{css}</style>
      <div className="hero-wrap" ref={wrapRef} onMouseMove={onMouseMove}>
        <div className="hero-bg-grid" ref={gridRef} />
        <div className="hero-glow" />
        <div className="hero-main">
          <div className="hero-left" ref={leftRef}>
            <div className="hero-content">
              <div className="hero-badge">
                <div className="badge-pulse" />Spatial Intelligence
                <div className="badge-sep" />
                <span className="badge-version">AMD Hackathon</span>
              </div>
              <h1 className="hero-title">
                <span className="ht-l1">Video to</span>
                <span className="ht-l2">Semantic 3D</span>
              </h1>
              <p className="hero-desc">
                Mirra converts ordinary 2D video into a semantically labeled 3D world —
                geometry, object understanding, and simulation export in under 5 seconds.
              </p>
              <div className="hero-ctas">
                <button className="btn-primary" onClick={() => setPage?.("upload")}>Launch Mirra →</button>
                <button className="btn-secondary" onClick={() => setPage?.("pipeline")}>View Pipeline</button>
              </div>
            </div>
          </div>
          <div className="hero-right" ref={rightRef}>
            <div className="hero-spline">
              <Spline scene="https://prod.spline.design/QZ3SIjVtdoEgkUWa/scene.splinecode" onLoad={onSplineLoad} />
            </div>
            {[
              { cls: "sky", top: "19%", right: "9%", dur: "3.9s", del: "0s", label: "DUSt3R · Active" },
              { cls: "violet", top: "44%", right: "3%", dur: "4.6s", del: "1.1s", label: "SAM 2 · Tracking" },
              { cls: "green", top: "54%", right: "11%", dur: "4.3s", del: "0.65s", label: "Fusion · semantic_world.ply" },
            ].map(t => (
              <div key={t.label} className="ftag" style={{ top: t.top, right: t.right, "--dur": t.dur, "--del": t.del }}>
                <div className={`ftag-dot ${t.cls}`} />{t.label}
              </div>
            ))}
            <div className="hero-wm-kill" />
          </div>
        </div>
        <div className="hero-cinema-fade" />
        <div className="hero-cursor">
          <span>X <span className="hc-val">{String(coords.x).padStart(4, "0")}</span></span>
          <span>Y <span className="hc-val">{String(coords.y).padStart(4, "0")}</span></span>
          <span style={{ color: "rgba(0,0,0,0.14)" }}>· POINTER TRACK</span>
        </div>
        <div className="scroll-cue" ref={cueRef} onClick={scrollToDemo} role="button" aria-label="See demo">
          <div className="scroll-cue-pill">
            <div className="scroll-cue-icon"><span className="scroll-cue-arrow" /></div>
            <div>
              <div className="scroll-cue-text">See Demo</div>
              <div className="scroll-cue-sub">Scroll to live reconstruction</div>
            </div>
          </div>
        </div>
        <div className="hero-stats" ref={statsRef}>
          {[{ v: "< 5s", l: "End-to-End" }, { v: "3", l: "AI Engines" }, { v: "Zero", l: "Manual Steps" }, { v: "ROCm", l: "AMD Compatible" }].map((s, i) => (
            <div className="stat-cell" key={i}>
              <div className="stat-val">{s.v}</div>
              <div className="stat-lbl">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
      <DemoSection demoRef={demoRef} />
    </>
  );
}