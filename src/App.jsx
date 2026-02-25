import { useState, useRef } from "react";
import HeroPage from "./components/HeroPage";
import PipelinePage from "./components/PipelinePage";
import UploadPage from "./components/UploadPage";
import ViewerPage from "./components/ViewerPage";
import WhyPage from "./components/WhyPage";
import ResearchPage from "./components/ResearchPage";
import { StunningCursor } from "./components/StunningCursor";

/* ─── Global Styles ─────────────────────────────────────────────────────── */
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;900&family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500;600&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:       #060910;
  --bg2:      #0A0E1A;
  --bg3:      #0D1220;
  --blue:     #0EA5E9;
  --purple:   #8B5CF6;
  --cyan:     #22D3EE;
  --red:      #EF4444;
  --glass:    rgba(14,165,233,0.05);
  --glass2:   rgba(14,165,233,0.09);
  --gb:       rgba(14,165,233,0.15);
  --text:     #E8EDF5;
  --muted:    rgba(232,237,245,0.42);
  --dim:      rgba(232,237,245,0.18);
}

html { scroll-behavior: smooth; height: 100%; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Syne', sans-serif;
  overflow-x: hidden;
  cursor: none;
  min-height: 100vh;
}

/* Hide default cursor everywhere */
*, button, a, input { cursor: none !important; }

::-webkit-scrollbar { width: 2px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: linear-gradient(180deg, var(--blue), var(--purple)); }

/* ── Custom Cursor — Crosshair/Targeting Reticle ── */
/* Cursor styles live in HeroPage.jsx for #cur-cross */
/* This ensures none of the old circular elements show */
#cursor-dot, #cursor-outer { display: none !important; }

/* ── Nav ── */
nav.main-nav {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 1000;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 48px;
  background: rgba(6,9,16,0.75);
  border-bottom: 1px solid rgba(14,165,233,0.08);
  backdrop-filter: blur(24px) saturate(1.8);
  -webkit-backdrop-filter: blur(24px) saturate(1.8);
}

.nav-logo {
  display: flex; align-items: center; gap: 10px;
  font-family: 'Orbitron', sans-serif;
  font-size: 0.72rem; font-weight: 700;
  letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--text);
  cursor: none;
}
.nav-logo-mark {
  width: 28px; height: 28px;
  border: 1px solid rgba(14,165,233,0.4);
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  position: relative;
  overflow: hidden;
}
.nav-logo-mark::before {
  content: '';
  position: absolute; inset: 4px;
  background: linear-gradient(135deg, var(--blue), var(--purple));
  border-radius: 3px;
  opacity: 0.7;
}

.nav-links {
  display: flex; align-items: center; gap: 4px;
  list-style: none;
}

.nav-links button {
  background: none; border: none;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.68rem; letter-spacing: 0.08em;
  color: var(--muted);
  padding: 8px 16px; border-radius: 4px;
  transition: color 0.2s, background 0.2s;
  position: relative;
}
.nav-links button:hover { color: var(--text); background: rgba(14,165,233,0.06); }
.nav-links button.active {
  color: var(--cyan);
  background: rgba(14,165,233,0.08);
}
.nav-links button.active::after {
  content: '';
  position: absolute;
  bottom: 0; left: 50%; transform: translateX(-50%);
  width: 16px; height: 1px;
  background: var(--cyan);
  box-shadow: 0 0 6px var(--cyan);
}

.nav-actions { display: flex; align-items: center; gap: 12px; }

.nav-status {
  display: flex; align-items: center; gap: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.62rem; color: var(--muted);
  letter-spacing: 0.1em;
}
.status-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #22C55E;
  box-shadow: 0 0 8px #22C55E;
  animation: statusPulse 2s ease infinite;
}
@keyframes statusPulse { 0%,100%{opacity:1;} 50%{opacity:0.4;} }

.btn-ghost {
  background: none;
  border: 1px solid rgba(14,165,233,0.25);
  border-radius: 4px;
  padding: 8px 20px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.67rem; letter-spacing: 0.1em;
  color: var(--cyan);
  transition: all 0.25s ease;
}
.btn-ghost:hover {
  border-color: var(--cyan);
  background: rgba(14,165,233,0.08);
  box-shadow: 0 0 20px rgba(14,165,233,0.15);
}

/* ── Page transition ── */
.page-wrap {
  min-height: 100vh;
  animation: pageIn 0.5s cubic-bezier(0.23,1,0.32,1) both;
}
@keyframes pageIn {
  from { opacity:0; transform:translateY(16px); }
  to   { opacity:1; transform:translateY(0); }
}

/* ── Shared utilities ── */
.glass-card {
  background: var(--glass);
  border: 1px solid rgba(14,165,233,0.14);
  border-radius: 10px;
  backdrop-filter: blur(20px);
}

.glow-line {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--blue), var(--purple), transparent);
  opacity: 0.3;
}

.section-tag {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.62rem; letter-spacing: 0.22em;
  text-transform: uppercase; color: var(--cyan);
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 14px;
}
.section-tag::before {
  content: '';
  width: 24px; height: 1px;
  background: var(--cyan);
  box-shadow: 0 0 6px var(--cyan);
}

h1.display {
  font-family: 'Orbitron', sans-serif;
  font-weight: 900; line-height: 1.04;
  letter-spacing: -0.02em;
}

.gradient-text {
  background: linear-gradient(130deg, #fff 20%, var(--blue) 55%, var(--purple) 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ── Corners ── */
.corners::before, .corners::after {
  content: '';
  position: absolute;
  width: 14px; height: 14px;
}
.corners::before { top: 0; left: 0; border-top: 1px solid var(--cyan); border-left: 1px solid var(--cyan); }
.corners::after  { top: 0; right: 0; border-top: 1px solid var(--cyan); border-right: 1px solid var(--cyan); }

@keyframes fadeUp {
  from { opacity:0; transform:translateY(28px); }
  to   { opacity:1; transform:translateY(0); }
}
@keyframes fadeIn {
  from { opacity:0; } to { opacity:1; }
}
@keyframes spin { from{transform:rotate(0deg);} to{transform:rotate(360deg);} }
@keyframes spinRev { from{transform:rotate(0deg);} to{transform:rotate(-360deg);} }
@keyframes pulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.5;transform:scale(0.85);} }
@keyframes shimmer {
  from{background-position:-200% 0;} to{background-position:200% 0;}
}
@keyframes scanDown {
  0%{transform:translateY(-100%);opacity:0;}
  10%{opacity:0.6;}
  90%{opacity:0.6;}
  100%{transform:translateY(500%);opacity:0;}
}
@keyframes borderGlow {
  0%,100%{border-color:rgba(14,165,233,0.2);}
  50%{border-color:rgba(14,165,233,0.5);}
}
@keyframes float {
  0%,100%{transform:translateY(0);} 50%{transform:translateY(-10px);}
}
`;

/* ─── Cursor — handled by StunningCursor (canvas-based) ─────────────────── */
function Cursor() { return null; }

/* ─── Nav ───────────────────────────────────────────────────────────────── */
const PAGES = [
  { id: "hero",     label: "Home" },
  { id: "pipeline", label: "Pipeline" },
  { id: "upload",   label: "Upload" },
  { id: "viewer",   label: "Viewer" },
  { id: "why",      label: "Why Us" },
  { id: "research", label: "Research" },
];

function Nav({ page, setPage }) {
  return (
    <nav className="main-nav">
      <div className="nav-logo" onClick={() => setPage("hero")} style={{ cursor: "pointer" }}>
        <div className="nav-logo-mark" />
        SIMCRAFT
      </div>

      <ul className="nav-links">
        {PAGES.map(p => (
          <li key={p.id}>
            <button
              className={page === p.id ? "active" : ""}
              onClick={() => setPage(p.id)}
            >
              {p.label}
            </button>
          </li>
        ))}
      </ul>

      <div className="nav-actions">
        <div className="nav-status">
          <div className="status-dot" /> SYSTEM ONLINE
        </div>
        <button className="btn-ghost" onClick={() => setPage("upload")}>
          Launch Engine
        </button>
      </div>
    </nav>
  );
}

/* ─── App Shell ─────────────────────────────────────────────────────────── */
export default function App() {
  const [page, setPage] = useState("hero");

  const renderPage = () => {
    switch (page) {
      case "hero":     return <HeroPage setPage={setPage} />;
      case "pipeline": return <PipelinePage setPage={setPage} />;
      case "upload":   return <UploadPage setPage={setPage} />;
      case "viewer":   return <ViewerPage setPage={setPage} />;
      case "why":      return <WhyPage setPage={setPage} />;
      case "research": return <ResearchPage setPage={setPage} />;
      default:         return <HeroPage setPage={setPage} />;
    }
  };

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <StunningCursor />
      <Nav page={page} setPage={setPage} />
      <div className="page-wrap" key={page}>
        {renderPage()}
      </div>
    </>
  );
}
