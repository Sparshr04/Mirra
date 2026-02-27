import { useState } from "react";
import HeroPage from "./components/HeroPage";
import PipelinePage from "./components/PipelinePage";
import UploadPage from "./components/UploadPage";
import ViewerPage from "./components/ViewerPage";
import WhyPage from "./components/WhyPage";
import ResearchPage from "./components/ResearchPage";

const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Serif+Display:ital@0;1&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --white:      #ffffff;
  --stone-50:   #fafaf9;
  --stone-100:  #f5f5f4;
  --stone-200:  #e7e5e4;
  --stone-300:  #d6d3d1;
  --stone-400:  #a8a29e;
  --stone-500:  #78716c;
  --stone-600:  #57534e;
  --stone-700:  #44403c;
  --stone-800:  #292524;
  --stone-900:  #1c1917;
  --shadow-xs:  0 1px 2px rgba(0,0,0,0.04);
  --shadow-sm:  0 1px 3px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04);
  --shadow-md:  0 4px 16px rgba(0,0,0,0.06),0 2px 4px rgba(0,0,0,0.04);
  --shadow-lg:  0 8px 32px rgba(0,0,0,0.08),0 4px 8px rgba(0,0,0,0.04);
  --shadow-xl:  0 16px 48px rgba(0,0,0,0.1),0 8px 16px rgba(0,0,0,0.06);
  --ease-out:   cubic-bezier(0.25,0.46,0.45,0.94);
  --ease-spring:cubic-bezier(0.23,1,0.32,1);
  --r-sm: 8px; --r-md: 14px; --r-lg: 20px; --r-xl: 28px;
}

html { scroll-behavior: smooth; -webkit-font-smoothing: antialiased; }

body {
  background: var(--white);
  color: var(--stone-900);
  font-family: 'DM Sans', sans-serif;
  font-size: 16px; line-height: 1.5;
  overflow-x: hidden; min-height: 100vh; cursor: auto;
}

::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: var(--stone-100); }
::-webkit-scrollbar-thumb { background: var(--stone-300); border-radius: 2px; }

/* Ambient orbs */
.ambient-bg { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
.amb-orb { position: absolute; border-radius: 50%; filter: blur(120px); will-change: transform; }
.amb-1 {
  width: 900px; height: 700px;
  background: radial-gradient(circle,#c4b5fd 0%,transparent 70%);
  top: -280px; right: -180px; opacity: 0.07;
  animation: drift1 22s ease-in-out infinite;
}
.amb-2 {
  width: 700px; height: 600px;
  background: radial-gradient(circle,#93c5fd 0%,transparent 70%);
  bottom: -200px; left: -180px; opacity: 0.06;
  animation: drift2 28s ease-in-out infinite;
}
.amb-3 {
  width: 500px; height: 500px;
  background: radial-gradient(circle,#fda4af 0%,transparent 70%);
  top: 45%; right: 10%; opacity: 0.05;
  animation: drift3 18s ease-in-out infinite;
}
@keyframes drift1 { 0%,100%{transform:translate(0,0) scale(1);} 33%{transform:translate(-70px,90px) scale(1.08);} 66%{transform:translate(50px,-50px) scale(0.94);} }
@keyframes drift2 { 0%,100%{transform:translate(0,0);} 50%{transform:translate(90px,-70px) scale(1.12);} }
@keyframes drift3 { 0%,100%{transform:translate(0,0);} 33%{transform:translate(50px,70px);} 66%{transform:translate(-70px,20px);} }

/* Nav */
nav.main-nav {
  position: fixed; top: 0; left: 0; right: 0;
  z-index: 1000; height: 60px;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 40px;
  background: rgba(255,255,255,0.88);
  border-bottom: 1px solid var(--stone-200);
  backdrop-filter: blur(20px) saturate(1.8);
  -webkit-backdrop-filter: blur(20px) saturate(1.8);
}
.nav-logo {
  display: flex; align-items: center; gap: 10px;
  font-family: 'DM Serif Display', serif;
  font-size: 1.1rem; letter-spacing: -0.01em;
  color: var(--stone-900); cursor: pointer; user-select: none;
}
.nav-logo-mark {
  width: 28px; height: 28px;
  background: var(--stone-900); border-radius: 7px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.nav-logo-mark svg { width: 14px; height: 14px; fill: white; }
.nav-links { display: flex; align-items: center; gap: 2px; list-style: none; }
.nav-links button {
  background: none; border: none;
  font-family: 'DM Sans', sans-serif; font-size: 0.875rem; font-weight: 400;
  color: var(--stone-500); padding: 6px 14px; border-radius: 7px;
  transition: color 0.18s ease, background 0.18s ease; cursor: pointer;
}
.nav-links button:hover  { color: var(--stone-900); background: var(--stone-100); }
.nav-links button.active { color: var(--stone-900); background: var(--stone-100); font-weight: 500; }
.nav-actions { display: flex; align-items: center; gap: 8px; }
.btn-nav-ghost {
  background: none; border: 1px solid var(--stone-200); border-radius: 8px; padding: 7px 18px;
  font-family: 'DM Sans', sans-serif; font-size: 0.84rem; font-weight: 500; color: var(--stone-600);
  cursor: pointer; transition: border-color 0.18s, color 0.18s;
}
.btn-nav-ghost:hover { border-color: var(--stone-400); color: var(--stone-900); }
.btn-nav-primary {
  background: var(--stone-900); border: 1px solid var(--stone-900); border-radius: 8px; padding: 7px 18px;
  font-family: 'DM Sans', sans-serif; font-size: 0.84rem; font-weight: 500; color: white;
  cursor: pointer; transition: background 0.18s;
}
.btn-nav-primary:hover { background: var(--stone-800); }

/* Page wrap */
.page-wrap { position: relative; z-index: 1; min-height: 100vh; animation: pageIn 0.5s var(--ease-spring) both; }
@keyframes pageIn { from{opacity:0;transform:translateY(14px);} to{opacity:1;transform:translateY(0);} }

/* Scroll reveal */
.reveal { opacity: 0; transform: translateY(20px); transition: opacity 0.7s ease-out, transform 0.7s ease-out; }
.reveal.in { opacity: 1; transform: translateY(0); }

/* Shared card */
.card {
  background: var(--white); border: 1px solid var(--stone-200);
  border-radius: var(--r-lg); box-shadow: var(--shadow-md);
  transition: box-shadow 0.3s ease, border-color 0.3s ease, transform 0.3s ease;
}
.card:hover { box-shadow: var(--shadow-lg); border-color: var(--stone-300); transform: translateY(-2px); }

/* Shared layout */
.section-inner { max-width: 1100px; margin: 0 auto; padding: 96px 48px; }
.eyebrow { font-size: 0.73rem; letter-spacing: 0.11em; text-transform: uppercase; font-weight: 600; color: var(--stone-400); margin-bottom: 14px; }
.display-title { font-family: 'DM Serif Display', serif; font-size: clamp(2.6rem,5vw,4.2rem); line-height: 1.08; letter-spacing: -0.025em; color: var(--stone-900); }
.display-title em { font-style: italic; color: var(--stone-500); }
.section-title { font-family: 'DM Serif Display', serif; font-size: clamp(1.9rem,3.2vw,2.9rem); line-height: 1.12; letter-spacing: -0.022em; color: var(--stone-900); }
.section-title em { font-style: italic; color: var(--stone-500); }
.body-lg { font-size: 1.05rem; color: var(--stone-500); line-height: 1.78; }

/* Shared buttons */
.btn-primary {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--stone-900); color: white; border: 1px solid var(--stone-900);
  border-radius: 10px; padding: 13px 26px;
  font-family: 'DM Sans', sans-serif; font-size: 0.92rem; font-weight: 500; cursor: pointer;
  transition: background 0.18s, transform 0.2s, box-shadow 0.2s;
}
.btn-primary:hover { background: var(--stone-800); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,0.18); }
.btn-secondary {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--white); color: var(--stone-700); border: 1px solid var(--stone-200);
  border-radius: 10px; padding: 12px 22px;
  font-family: 'DM Sans', sans-serif; font-size: 0.92rem; font-weight: 500; cursor: pointer;
  box-shadow: var(--shadow-xs); transition: border-color 0.18s, color 0.18s, box-shadow 0.2s;
}
.btn-secondary:hover { border-color: var(--stone-400); color: var(--stone-900); box-shadow: var(--shadow-sm); }

/* Keyframes */
@keyframes fadeInUp { from{opacity:0;transform:translateY(22px);} to{opacity:1;transform:translateY(0);} }
@keyframes spinSlow { from{transform:rotate(0deg);} to{transform:rotate(360deg);} }
@keyframes float { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-8px);} }
@keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.45;} }
`;

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
      <div className="nav-logo" onClick={() => setPage("hero")}>
        <div className="nav-logo-mark">
          <svg viewBox="0 0 16 16"><path d="M8 1L15 5V11L8 15L1 11V5L8 1Z" /></svg>
        </div>
        SimCraft
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
        <button className="btn-nav-primary" onClick={() => setPage("upload")}>Launch Engine</button>
      </div>
    </nav>
  );
}

export default function App() {
  const [page, setPage] = useState("hero");
  const [jobResult, setJobResult] = useState(null);

  const renderPage = () => {
    switch (page) {
      case "hero":     return <HeroPage setPage={setPage} />;
      case "pipeline": return <PipelinePage setPage={setPage} />;
      case "upload":   return <UploadPage setPage={setPage} onComplete={setJobResult} />;
      case "viewer":   return <ViewerPage setPage={setPage} jobResult={jobResult} />;
      case "why":      return <WhyPage setPage={setPage} />;
      case "research": return <ResearchPage setPage={setPage} />;
      default:         return <HeroPage setPage={setPage} />;
    }
  };

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div className="ambient-bg">
        <div className="amb-orb amb-1" />
        <div className="amb-orb amb-2" />
        <div className="amb-orb amb-3" />
      </div>
      <Nav page={page} setPage={setPage} />
      <div className="page-wrap" key={page}>{renderPage()}</div>
    </>
  );
}
