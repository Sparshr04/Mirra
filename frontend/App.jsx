import { useState } from "react";
import HeroPage from "./components/HeroPage";
import PipelinePage from "./components/PipelinePage";
import UploadPage from "./components/UploadPage";
import ViewerPage from "./components/ViewerPage";
import WhyPage from "./components/WhyPage";
import ResearchPage from "./components/ResearchPage";

/* ─────────────────────────────────────────
   GLOBAL CSS — Mirra Design System
   Aesthetic: Stanford AI Lab × Apple × NeurIPS
   Fonts: DM Serif Display (headings) + DM Sans (body) + DM Mono (data/labels)
───────────────────────────────────────── */
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  /* Core palette */
  --bg:         #f9f8f6;
  --white:      #ffffff;
  --ink:        #18181b;

  /* Stone scale */
  --s-50:   #fafaf9;
  --s-100:  #f5f5f4;
  --s-150:  #eeece9;
  --s-200:  #e7e5e4;
  --s-300:  #d6d3d1;
  --s-400:  #a8a29e;
  --s-500:  #78716c;
  --s-600:  #57534e;
  --s-700:  #44403c;
  --s-800:  #292524;
  --s-900:  #1c1917;

  /* Accent colours (subtle, never neon) */
  --sky:    #0ea5e9;
  --violet: #8b5cf6;
  --green:  #22c55e;
  --amber:  #f59e0b;

  /* Shadows */
  --sh-xs: 0 1px 2px rgba(0,0,0,0.04);
  --sh-sm: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  --sh-md: 0 4px 16px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04);
  --sh-lg: 0 8px 32px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.04);
  --sh-xl: 0 16px 48px rgba(0,0,0,0.10), 0 8px 16px rgba(0,0,0,0.05);

  /* Radii */
  --r-sm: 7px; --r-md: 12px; --r-lg: 18px; --r-xl: 26px;

  /* Easing */
  --ease-spring: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-out:    cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

html { scroll-behavior: smooth; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }

body {
  background: var(--bg);
  color: var(--ink);
  font-family: 'DM Sans', sans-serif;
  font-size: 16px; line-height: 1.55;
  overflow-x: hidden; min-height: 100vh;
}

/* Scrollbar */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--s-300); border-radius: 2px; }

/* ── Ambient background orbs (fixed, non-interactive) ── */
.ambient-bg {
  position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden;
}
.amb {
  position: absolute; border-radius: 50%;
  filter: blur(110px); will-change: transform;
}
.amb-1 {
  width: 900px; height: 700px;
  background: radial-gradient(circle, rgba(196,181,253,0.45) 0%, transparent 70%);
  top: -300px; right: -200px; opacity: 0.09;
  animation: driftA 24s ease-in-out infinite;
}
.amb-2 {
  width: 650px; height: 600px;
  background: radial-gradient(circle, rgba(147,197,253,0.45) 0%, transparent 70%);
  bottom: -220px; left: -180px; opacity: 0.08;
  animation: driftB 30s ease-in-out infinite;
}
.amb-3 {
  width: 480px; height: 480px;
  background: radial-gradient(circle, rgba(253,164,175,0.4) 0%, transparent 70%);
  top: 42%; right: 6%; opacity: 0.055;
  animation: driftC 19s ease-in-out infinite;
}
@keyframes driftA { 0%,100%{transform:translate(0,0) scale(1);} 33%{transform:translate(-65px,85px) scale(1.07);} 66%{transform:translate(45px,-42px) scale(0.95);} }
@keyframes driftB { 0%,100%{transform:translate(0,0);} 50%{transform:translate(85px,-65px) scale(1.1);} }
@keyframes driftC { 0%,100%{transform:translate(0,0);} 33%{transform:translate(45px,62px);} 66%{transform:translate(-62px,18px);} }

/* ── Navigation ── */
nav.main-nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
  height: 58px;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 40px;
  background: rgba(249,248,246,0.87);
  border-bottom: 1px solid rgba(0,0,0,0.07);
  backdrop-filter: blur(24px) saturate(1.8);
  -webkit-backdrop-filter: blur(24px) saturate(1.8);
}

.nav-logo {
  display: flex; align-items: center; gap: 10px;
  cursor: pointer; user-select: none; text-decoration: none;
}
.nav-logo-mark {
  width: 28px; height: 28px; border-radius: 8px;
  background: var(--ink); flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.nav-logo-mark svg { width: 14px; height: 14px; fill: white; }
.nav-logo-text {
  font-family: 'DM Serif Display', serif;
  font-size: 1.05rem; color: var(--ink); letter-spacing: -0.01em;
}
.nav-logo-sub {
  font-family: 'DM Mono', monospace;
  font-size: 0.58rem; color: var(--s-400); letter-spacing: 0.06em;
  margin-top: -3px;
}

.nav-links { display: flex; align-items: center; gap: 1px; list-style: none; }
.nav-links button {
  background: none; border: none;
  font-family: 'DM Sans', sans-serif; font-size: 0.84rem; font-weight: 400;
  color: var(--s-500); padding: 6px 13px; border-radius: var(--r-sm);
  transition: color 0.15s, background 0.15s; cursor: pointer;
}
.nav-links button:hover { color: var(--ink); background: var(--s-100); }
.nav-links button.active { color: var(--ink); background: var(--s-100); font-weight: 500; }

.nav-actions { display: flex; align-items: center; gap: 8px; }
.btn-nav-ghost {
  background: none; border: 1px solid var(--s-200); border-radius: var(--r-sm); padding: 6px 15px;
  font-family: 'DM Sans', sans-serif; font-size: 0.81rem; font-weight: 500; color: var(--s-600);
  cursor: pointer; transition: border-color 0.15s, color 0.15s;
}
.btn-nav-ghost:hover { border-color: var(--s-400); color: var(--ink); }
.btn-nav-cta {
  background: var(--ink); border: 1px solid var(--ink); border-radius: var(--r-sm); padding: 6px 16px;
  font-family: 'DM Sans', sans-serif; font-size: 0.81rem; font-weight: 500; color: white;
  cursor: pointer; transition: background 0.15s, transform 0.2s;
}
.btn-nav-cta:hover { background: var(--s-800); transform: translateY(-1px); }

/* ── Page wrapper ── */
.page-wrap {
  position: relative; z-index: 1; min-height: 100vh;
  animation: pageReveal 0.42s var(--ease-spring) both;
}
@keyframes pageReveal { from{opacity:0;transform:translateY(13px);} to{opacity:1;transform:none;} }

/* ── Scroll reveal utility ── */
.reveal { opacity: 0; transform: translateY(20px); transition: opacity 0.68s ease, transform 0.68s ease; }
.reveal.in { opacity: 1; transform: none; }

/* ── Shared typography ── */
.eyebrow {
  font-family: 'DM Mono', monospace;
  font-size: 0.68rem; letter-spacing: 0.13em; text-transform: uppercase;
  font-weight: 500; color: var(--s-400); margin-bottom: 14px;
}
.section-title {
  font-family: 'DM Serif Display', serif;
  font-size: clamp(2rem, 3.4vw, 3rem); line-height: 1.1;
  letter-spacing: -0.024em; color: var(--ink);
}
.section-title em { font-style: italic; color: var(--s-400); }
.body-lg { font-size: 1.02rem; color: var(--s-500); line-height: 1.8; }

/* ── Shared buttons ── */
.btn-primary {
  display: inline-flex; align-items: center; gap: 7px;
  background: var(--ink); color: white; border: 1px solid var(--ink);
  border-radius: 10px; padding: 12px 24px;
  font-family: 'DM Sans', sans-serif; font-size: 0.9rem; font-weight: 500; cursor: pointer;
  transition: background 0.15s, transform 0.2s, box-shadow 0.2s;
}
.btn-primary:hover { background: var(--s-800); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,0.14); }

.btn-secondary {
  display: inline-flex; align-items: center; gap: 7px;
  background: white; color: var(--s-700); border: 1px solid var(--s-200);
  border-radius: 10px; padding: 11px 20px;
  font-family: 'DM Sans', sans-serif; font-size: 0.9rem; font-weight: 500; cursor: pointer;
  box-shadow: var(--sh-xs); transition: border-color 0.15s, color 0.15s, box-shadow 0.2s;
}
.btn-secondary:hover { border-color: var(--s-400); color: var(--ink); box-shadow: var(--sh-sm); }

/* ── Shared card ── */
.card {
  background: white; border: 1px solid var(--s-200);
  border-radius: var(--r-lg); box-shadow: var(--sh-md);
  transition: box-shadow 0.28s ease, border-color 0.28s ease, transform 0.28s ease;
}
.card:hover { box-shadow: var(--sh-lg); border-color: var(--s-300); transform: translateY(-2px); }

/* ── Keyframes ── */
@keyframes spinSlow  { to { transform: rotate(360deg); } }
@keyframes floatY    { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-7px);} }
@keyframes pulseGlow { 0%,100%{opacity:1;} 50%{opacity:0.38;} }
@keyframes fadeUp    { from{opacity:0;transform:translateY(20px);} to{opacity:1;transform:none;} }
@keyframes scanMove  { 0%,100%{left:6%;opacity:0;} 5%,95%{opacity:1;} 50%{left:94%;} }
@keyframes dashDraw  { to { stroke-dashoffset: -40; } }
`;

const PAGES = [
  { id:"hero",     label:"Home" },
  { id:"pipeline", label:"Pipeline" },
  { id:"upload",   label:"Upload" },
  { id:"viewer",   label:"Viewer" },
  { id:"why",      label:"Why Mirra" },
  { id:"research", label:"Research" },
];

function Nav({ page, setPage }) {
  return (
    <nav className="main-nav">
      <div className="nav-logo" onClick={() => setPage("hero")}>
        <div className="nav-logo-mark">
          <svg viewBox="0 0 16 16"><path d="M8 1L15 5V11L8 15L1 11V5L8 1Z" /></svg>
        </div>
        <div>
          <div className="nav-logo-text">Mirra</div>
          <div className="nav-logo-sub">SPATIAL INTELLIGENCE</div>
        </div>
      </div>

      <ul className="nav-links">
        {PAGES.map(p => (
          <li key={p.id}>
            <button className={page === p.id ? "active" : ""} onClick={() => setPage(p.id)}>
              {p.label}
            </button>
          </li>
        ))}
      </ul>

      <div className="nav-actions">
        <button className="btn-nav-ghost" onClick={() => setPage("research")}>Docs</button>
        <button className="btn-nav-cta"   onClick={() => setPage("upload")}>Launch Mirra</button>
      </div>
    </nav>
  );
}

export default function App() {
  const [page, setPage]           = useState("hero");
  const [jobResult, setJobResult] = useState(null);

  const renderPage = () => {
    switch (page) {
      case "hero":     return <HeroPage     setPage={setPage} />;
      case "pipeline": return <PipelinePage setPage={setPage} />;
      case "upload":   return <UploadPage   setPage={setPage} onComplete={setJobResult} />;
      case "viewer":   return <ViewerPage   setPage={setPage} jobResult={jobResult} />;
      case "why":      return <WhyPage      setPage={setPage} />;
      case "research": return <ResearchPage setPage={setPage} />;
      default:         return <HeroPage     setPage={setPage} />;
    }
  };

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div className="ambient-bg">
        <div className="amb amb-1" />
        <div className="amb amb-2" />
        <div className="amb amb-3" />
      </div>
      <Nav page={page} setPage={setPage} />
      <div className="page-wrap" key={page}>{renderPage()}</div>
    </>
  );
}
