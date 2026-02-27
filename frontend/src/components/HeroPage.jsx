import { useEffect, useRef, useState, useCallback } from "react";
import Spline from "@splinetool/react-spline";

/* ─── Model data & Video Paths ─────────────────── */
const MODELS = [
  {
    id: "classroom", label: "Classroom", tag: "SCENE 01", accent: "#0ea5e9",
    videos: {
      rawFlythrough: "/assets/classroom/non_semantic_flythrough .mp4",
      semFlythrough: "/assets/classroom/semantic_flythrough .mp4",
      geoRaw: "/assets/classroom/classroom without semantic vedio.mp4",
      geoSem: "/assets/classroom/classroom with semantic.mp4",
      original: "/assets/classroom/Classroom camera vedio.mp4", // Newly added
      heatmap: "/assets/classroom/heatmap_flythrough .mp4",
    }
  },
  {
    id: "coridoor", label: "Corridor Alpha", tag: "SCENE 02", accent: "#8b5cf6",
    videos: {
      rawFlythrough: "/assets/coridoor/non_semantic_flythrough.mp4",
      semFlythrough: "/assets/coridoor/semantic_flythrough.mp4",
      geoRaw: "/assets/coridoor/Coridoor without semantic vedio.mov", // Newly added
      geoSem: "/assets/coridoor/Coridoor with semantic video.mp4",
      original: "/assets/coridoor/Coridoor camera vedio.mov", // Newly added
      heatmap: "/assets/coridoor/Coridoor with heatmap.mp4", // Newly added
    }
  },
  {
    id: "coridoor 2", label: "Corridor Beta", tag: "SCENE 03", accent: "#22c55e",
    videos: {
      rawFlythrough: "/assets/coridoor 2/non_semantic_flythrough.mp4",
      semFlythrough: "/assets/coridoor 2/semantic_flythrough .mp4",
      geoRaw: "/assets/coridoor 2/without semantic.mp4",
      geoSem: "/assets/coridoor 2/with Semantic.mp4",
      original: "/assets/coridoor 2/coridoor 2 camera vedio.mp4",
      heatmap: "/assets/coridoor 2/heatmap_flythrough.mp4",
    }
  }
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

/* ─── Video Panels ─────────────────────────────── */

function VideoPanel({ src, className = "panel-canvas", style = {} }) {
  return (
    <video
      key={src}
      src={src}
      className={className}
      autoPlay
      loop
      muted
      playsInline
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", ...style }}
    />
  );
}

function FlythroughRawPanel({ model }) { return <VideoPanel src={model.videos.rawFlythrough} />; }
function FlythroughSemPanel({ model }) { return <VideoPanel src={model.videos.semFlythrough} />; }
function GeoPanel({ model }) { return <VideoPanel src={model.videos.geoRaw} />; }
function GeoSemPanel({ model }) { return <VideoPanel src={model.videos.geoSem} />; }

function OriginalPiP({ model }) {
  return <VideoPanel src={model.videos.original} className="" style={{ position: "absolute", inset: 0 }} />;
}
function HeatPiP({ model }) {
  return <VideoPanel src={model.videos.heatmap} className="" style={{ position: "absolute", inset: 0 }} />;
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