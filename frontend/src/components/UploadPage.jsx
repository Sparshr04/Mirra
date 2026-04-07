import { uploadVideo, processVideo, pollStatus, listPlyFiles, BASE_URL, uploadPhotos } from "../api";

/* ─────────────────────────────────────────────────────────────
   CSS — matches Mirra HeroPage design system exactly
───────────────────────────────────────────────────────────── */
const css = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700&family=DM+Serif+Display:ital@0;1&display=swap');

:root {
  --bg:     #f9f8f6;
  --ink:    #111;
  --s-50:   #f8f7f5;
  --s-100:  #f1efec;
  --s-200:  #e6e2de;
  --s-300:  #cdc8c2;
  --s-400:  #9a938c;
  --s-500:  #6e6760;
  --s-600:  #4a443e;
  --sky:    #0ea5e9;
  --violet: #8b5cf6;
  --green:  #22c55e;
  --amber:  #f59e0b;
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-out:    cubic-bezier(0.22, 1, 0.36, 1);
  --sh-xs: 0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04);
  --sh-sm: 0 2px 8px rgba(0,0,0,0.06), 0 8px 28px rgba(0,0,0,0.05);
  --sh-md: 0 4px 16px rgba(0,0,0,0.07), 0 20px 56px rgba(0,0,0,0.06);
}

/* ── Page shell ── */
.up-page {
  min-height: 100vh;
  padding: 120px 0 160px;
  background: var(--bg);
  position: relative;
  overflow: hidden;
  font-family: 'DM Sans', sans-serif;
  color: var(--ink);
}

/* ── Continuous background grid (same as hero) ── */
.up-bg-grid {
  position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background-image:
    linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: radial-gradient(
    ellipse 100% 85% at 50% 28%,
    black 0%,
    transparent 100%
  );
  -webkit-mask-image: radial-gradient(
    ellipse 100% 85% at 50% 28%,
    black 0%,
    transparent 100%
  );
}

/* ── Ambient glow — depth behind left column ── */
.up-glow {
  position: absolute;
  width: 800px; height: 600px;
  top: -80px; left: -160px;
  z-index: 0; pointer-events: none;
  background: radial-gradient(
    ellipse at 40% 40%,
    rgba(14,165,233,0.042) 0%,
    rgba(139,92,246,0.02)  45%,
    transparent 72%
  );
}
/* Second glow — behind right panel */
.up-glow-r {
  position: absolute;
  width: 600px; height: 500px;
  top: 60px; right: -80px;
  z-index: 0; pointer-events: none;
  background: radial-gradient(
    ellipse at 60% 40%,
    rgba(34,197,94,0.028) 0%,
    transparent 68%
  );
}

/* ── Inner container ── */
.up-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 72px;
  position: relative;
  z-index: 1;
}

/* ── Page header ── */
.up-header {
  margin-bottom: 64px;
  animation: upIn 0.9s var(--ease-spring) 0.05s both;
}
.up-eyebrow {
  display: inline-flex; align-items: center; gap: 10px;
  font-family: 'DM Mono', monospace;
  font-size: 0.68rem; letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--s-400); margin-bottom: 20px;
}
.up-eyebrow-line { width: 22px; height: 1px; background: var(--s-300); }

.up-title {
  font-family: 'DM Serif Display', serif;
  font-size: clamp(2.6rem, 4.2vw, 4.2rem);
  font-weight: 400; line-height: 1.03; letter-spacing: -0.032em;
  color: var(--ink); margin-bottom: 16px;
}
.up-title em { font-style: italic; color: var(--s-400); }

.up-sub {
  font-size: 1.02rem; line-height: 1.86; color: var(--s-500);
  max-width: 560px;
}

/* ── Two-column grid ── */
.up-cols {
  display: grid;
  grid-template-columns: 1.22fr 0.78fr;
  gap: 36px;
  align-items: start;
}
@media (max-width: 1060px) {
  .up-cols { grid-template-columns: 1fr; gap: 28px; }
  .up-inner { padding: 0 32px; }
}

/* ═══════════════════════════════════════
   LEFT COLUMN
═══════════════════════════════════════ */
.up-left {
  display: flex; flex-direction: column; gap: 14px;
  animation: upIn 0.9s var(--ease-spring) 0.12s both;
}

/* ── Drop zone card ── */
.dz-card {
  background: white;
  border: 1.5px dashed var(--s-200);
  border-radius: 22px;
  position: relative; overflow: hidden;
  cursor: pointer;
  transition:
    border-color  0.3s var(--ease-out),
    box-shadow    0.3s var(--ease-out),
    transform     0.3s var(--ease-out);
}
.dz-card:hover {
  border-color: var(--s-300);
  box-shadow: var(--sh-md);
  transform: translateY(-3px);
}
.dz-card.drag-over {
  border-style: solid;
  border-color: var(--sky);
  box-shadow: 0 0 0 4px rgba(14,165,233,0.1), var(--sh-md);
  transform: translateY(-3px);
}
.dz-card.has-file {
  border-style: solid;
  border-color: rgba(34,197,94,0.45);
  box-shadow: 0 0 0 4px rgba(34,197,94,0.08), var(--sh-sm);
}

/* hairline corner brackets */
.dz-bracket {
  position: absolute; width: 16px; height: 16px;
  border-color: var(--s-200); border-style: solid;
  pointer-events: none; z-index: 2;
  transition: border-color 0.3s, transform 0.3s var(--ease-spring);
}
.dz-card:hover   .dz-bracket { border-color: var(--s-300); }
.dz-card.drag-over .dz-bracket { border-color: rgba(14,165,233,0.5); transform: scale(1.15); }
.dz-card.has-file  .dz-bracket { border-color: rgba(34,197,94,0.45); }
.dz-bracket.tl { top:12px; left:12px;  border-width:1.5px 0 0 1.5px; border-radius:3px 0 0 0; }
.dz-bracket.tr { top:12px; right:12px; border-width:1.5px 1.5px 0 0; border-radius:0 3px 0 0; }
.dz-bracket.bl { bottom:12px; left:12px;  border-width:0 0 1.5px 1.5px; border-radius:0 0 0 3px; }
.dz-bracket.br { bottom:12px; right:12px; border-width:0 1.5px 1.5px 0; border-radius:0 0 3px 0; }

/* inner body */
.dz-body {
  padding: 56px 40px 48px;
  display: flex; flex-direction: column; align-items: center;
  text-align: center; gap: 0;
}

/* icon orbit */
.dz-orbit {
  position: relative;
  width: 82px; height: 82px;
  margin-bottom: 26px;
}
.dz-orbit-ring {
  position: absolute; inset: 0; border-radius: 50%;
  border: 1px solid var(--s-200);
  transition: border-color 0.3s, transform 0.6s var(--ease-spring);
}
.dz-card:hover   .dz-orbit-ring { border-color: var(--s-300); transform: scale(1.08); }
.dz-card.drag-over .dz-orbit-ring { border-color: rgba(14,165,233,0.4); transform: scale(1.12); }
.dz-card.has-file  .dz-orbit-ring { border-color: rgba(34,197,94,0.4); }
.dz-orbit-ring.outer { inset: -10px; border-style: dashed; opacity: 0.5; }

.dz-icon-box {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%; overflow: hidden;
  background: var(--s-50);
  border: 1px solid var(--s-200);
  transition: all 0.3s var(--ease-spring);
}
.dz-card:hover   .dz-icon-box { background: white; box-shadow: 0 6px 20px rgba(0,0,0,0.1); }
.dz-card.drag-over .dz-icon-box { background: rgba(14,165,233,0.06); border-color: rgba(14,165,233,0.3); }
.dz-card.has-file  .dz-icon-box { background: rgba(34,197,94,0.06); border-color: rgba(34,197,94,0.35); }

.dz-icon {
  font-size: 1.5rem; line-height: 1;
  transition: transform 0.4s var(--ease-spring);
}
.dz-card:hover .dz-icon { transform: translateY(-2px) scale(1.1); }

.dz-heading {
  font-size: 1.0rem; font-weight: 600; letter-spacing: -0.01em;
  color: var(--ink); margin-bottom: 6px;
}
.dz-hint {
  font-family: 'DM Mono', monospace; font-size: 0.66rem;
  color: var(--s-400); letter-spacing: 0.05em;
}

/* format tags */
.dz-formats {
  display: flex; gap: 5px; flex-wrap: wrap; justify-content: center;
  margin-top: 20px;
}
.fmt-tag {
  font-family: 'DM Mono', monospace; font-size: 0.58rem; letter-spacing: 0.07em;
  padding: 3px 9px; border-radius: 100px;
  background: var(--s-50); border: 1px solid var(--s-200);
  color: var(--s-400); text-transform: uppercase;
}

/* selected file chip */
.dz-file-chip {
  display: flex; align-items: center; gap: 10px;
  margin-top: 20px; padding: 11px 16px;
  background: rgba(34,197,94,0.06);
  border: 1px solid rgba(34,197,94,0.22);
  border-radius: 10px;
  animation: upIn 0.4s var(--ease-spring) both;
}
.dz-file-chip-dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  background: var(--green); box-shadow: 0 0 8px rgba(34,197,94,0.6);
  animation: fcPulse 2s ease infinite;
}
.dz-file-chip-name {
  font-family: 'DM Mono', monospace; font-size: 0.7rem;
  color: var(--ink); flex: 1; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; text-align: left;
}
.dz-file-chip-size {
  font-family: 'DM Mono', monospace; font-size: 0.62rem;
  color: var(--s-400); flex-shrink: 0;
}
.dz-file-chip-x {
  flex-shrink: 0; width: 18px; height: 18px; border-radius: 4px;
  background: rgba(0,0,0,0.06); border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.6rem; color: var(--s-400);
  transition: background 0.18s, color 0.18s;
}
.dz-file-chip-x:hover { background: rgba(0,0,0,0.12); color: var(--ink); }

/* ── Pipeline steps ── */
.pipe-row {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.pipe-card {
  background: white; border: 1px solid var(--s-200); border-radius: 14px;
  padding: 18px 16px 16px;
  transition: all 0.22s var(--ease-out);
  position: relative; overflow: hidden;
}
.pipe-card::after {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 2.5px;
  border-radius: 14px 14px 0 0;
  background: var(--c, #ccc);
  opacity: 0.7;
  transition: opacity 0.22s;
}
.pipe-card:hover { transform: translateY(-2px); box-shadow: var(--sh-sm); }
.pipe-card:hover::after { opacity: 1; }

.pipe-step-num {
  font-family: 'DM Mono', monospace; font-size: 0.58rem;
  letter-spacing: 0.12em; color: var(--s-400);
  margin-bottom: 8px;
}
.pipe-step-name {
  font-size: 0.82rem; font-weight: 600; color: var(--ink);
  margin-bottom: 3px; line-height: 1.2;
}
.pipe-step-model {
  font-family: 'DM Mono', monospace; font-size: 0.6rem;
  color: var(--s-400);
}
.pipe-step-glyph {
  margin-top: 12px;
  font-family: 'DM Mono', monospace; font-size: 0.7rem;
  letter-spacing: -0.04em;
}

/* ── Launch button ── */
.btn-launch {
  width: 100%; display: flex; align-items: center; justify-content: space-between;
  padding: 18px 22px;
  background: var(--ink); color: white;
  border: none; border-radius: 16px; cursor: pointer;
  transition: transform 0.28s var(--ease-out), box-shadow 0.28s var(--ease-out);
  animation: upIn 0.5s var(--ease-spring) 0.05s both;
}
.btn-launch:hover {
  transform: translateY(-3px);
  box-shadow: 0 14px 40px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.1);
}
.btn-launch:active { transform: translateY(0); transition-duration: 0.1s; }
.btn-launch-left { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.btn-launch-label { font-size: 0.9rem; font-weight: 600; letter-spacing: 0.01em; }
.btn-launch-sub { font-family: 'DM Mono', monospace; font-size: 0.6rem; opacity: 0.42; letter-spacing: 0.04em; }
.btn-launch-icon {
  width: 36px; height: 36px; border-radius: 50%;
  background: rgba(255,255,255,0.11); border: 1px solid rgba(255,255,255,0.16);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  transition: transform 0.28s var(--ease-spring);
}
.btn-launch:hover .btn-launch-icon { transform: translateX(4px); }
.btn-launch-arrow {
  display: block; width: 7px; height: 7px;
  border-top: 1.5px solid white; border-right: 1.5px solid white;
  transform: rotate(45deg) translateX(-1px);
}

/* ── Specs strip ── */
.specs-strip {
  display: grid; grid-template-columns: repeat(3, 1fr);
  border: 1px solid var(--s-200); border-radius: 14px;
  overflow: hidden; background: var(--s-200);
  gap: 1px;
}
.spec-cell {
  background: white; padding: 16px 18px;
  transition: background 0.2s;
}
.spec-cell:hover { background: var(--s-50); }
.spec-val {
  font-family: 'DM Serif Display', serif;
  font-size: 1.28rem; color: var(--ink);
  line-height: 1; margin-bottom: 4px;
}
.spec-lbl {
  font-family: 'DM Mono', monospace; font-size: 0.57rem;
  color: var(--s-400); letter-spacing: 0.09em; text-transform: uppercase;
}

/* ═══════════════════════════════════════
   RIGHT COLUMN
═══════════════════════════════════════ */
.up-right {
  animation: upIn 0.9s var(--ease-spring) 0.22s both;
  position: sticky; top: 100px;
}

.scenes-panel {
  background: white;
  border: 1px solid var(--s-200);
  border-radius: 22px;
  overflow: hidden;
  box-shadow: var(--sh-md);
}

/* panel top bar */
.sp-topbar {
  padding: 22px 28px;
  border-bottom: 1px solid var(--s-100);
  display: flex; align-items: center; justify-content: space-between;
}
.sp-topbar-left { display: flex; align-items: center; gap: 10px; }
.sp-status-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--green); box-shadow: 0 0 7px rgba(34,197,94,0.55);
  animation: fcPulse 2.2s ease infinite;
}
.sp-topbar-title {
  font-family: 'DM Mono', monospace; font-size: 0.66rem;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--s-400);
}
.sp-count {
  font-family: 'DM Mono', monospace; font-size: 0.62rem; color: var(--s-400);
  background: var(--s-100); border: 1px solid var(--s-200);
  padding: 3px 9px; border-radius: 100px;
}

/* scene list scroll area */
.sp-list {
  max-height: 420px; overflow-y: auto;
  padding: 6px 0;
}
.sp-list::-webkit-scrollbar { width: 3px; }
.sp-list::-webkit-scrollbar-track { background: transparent; }
.sp-list::-webkit-scrollbar-thumb { background: var(--s-200); border-radius: 2px; }

/* empty state */
.sp-empty {
  padding: 52px 28px; text-align: center;
}
.sp-empty-glyph {
  width: 54px; height: 54px; border-radius: 14px;
  background: var(--s-50); border: 1px solid var(--s-200);
  display: flex; align-items: center; justify-content: center;
  font-size: 1.4rem; margin: 0 auto 18px;
}
.sp-empty-msg {
  font-size: 0.88rem; color: var(--s-500); line-height: 1.7;
  margin-bottom: 8px;
}
.sp-empty-hint {
  font-family: 'DM Mono', monospace; font-size: 0.6rem;
  color: var(--s-400); letter-spacing: 0.05em;
}

/* loading skeleton */
.sp-skeleton { padding: 8px 0; }
.sk-row {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 24px;
}
.sk-thumb {
  width: 44px; height: 34px; border-radius: 8px;
  background: linear-gradient(90deg, var(--s-100) 25%, var(--s-50) 50%, var(--s-100) 75%);
  background-size: 200% 100%;
  animation: skShimmer 1.6s ease infinite; flex-shrink: 0;
}
.sk-lines { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.sk-line {
  height: 9px; border-radius: 4px;
  background: linear-gradient(90deg, var(--s-100) 25%, var(--s-50) 50%, var(--s-100) 75%);
  background-size: 200% 100%;
  animation: skShimmer 1.6s ease infinite;
}
.sk-line.short { width: 55%; }

/* scene rows */
.scene-row {
  display: flex; align-items: center; gap: 14px;
  padding: 13px 24px;
  border-bottom: 1px solid var(--s-50);
  cursor: pointer;
  transition: background 0.18s;
  position: relative;
}
.scene-row:last-child { border-bottom: none; }
.scene-row:hover { background: var(--s-50); }

/* thumb */
.scene-thumb {
  width: 46px; height: 34px; border-radius: 8px; flex-shrink: 0;
  background: var(--s-100); border: 1px solid var(--s-200);
  display: flex; align-items: center; justify-content: center;
  font-size: 1.05rem; position: relative; overflow: hidden;
}
.scene-thumb-bar {
  position: absolute; bottom: 0; left: 0; right: 0;
  height: 3px; border-radius: 0 0 8px 8px;
}

/* meta */
.scene-meta { flex: 1; min-width: 0; }
.scene-name {
  font-size: 0.83rem; font-weight: 600; color: var(--ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-bottom: 4px;
}
.scene-tags { display: flex; gap: 4px; }
.scene-tag {
  font-family: 'DM Mono', monospace; font-size: 0.55rem; letter-spacing: 0.07em;
  padding: 2px 7px; border-radius: 3px;
  background: var(--s-100); border: 1px solid var(--s-200);
  color: var(--s-400); text-transform: uppercase;
}

/* open arrow */
.scene-chevron {
  flex-shrink: 0; width: 28px; height: 28px; border-radius: 7px;
  background: var(--s-100); border: 1px solid var(--s-200);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.22s var(--ease-spring);
}
.scene-chevron-arrow {
  width: 6px; height: 6px;
  border-top: 1.5px solid var(--s-400); border-right: 1.5px solid var(--s-400);
  transform: rotate(45deg) translateX(-1px);
  transition: border-color 0.2s;
}
.scene-row:hover .scene-chevron {
  background: var(--ink); border-color: var(--ink);
  transform: translateX(2px);
}
.scene-row:hover .scene-chevron-arrow {
  border-color: white;
}

/* panel footer */
.sp-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--s-100);
  background: var(--s-50);
  display: flex; align-items: center; justify-content: space-between;
}
.sp-footer-info {
  font-family: 'DM Mono', monospace; font-size: 0.6rem;
  color: var(--s-400); letter-spacing: 0.04em;
}
.sp-footer-badge {
  font-family: 'DM Mono', monospace; font-size: 0.58rem;
  color: rgba(14,165,233,0.7);
  background: rgba(14,165,233,0.07); border: 1px solid rgba(14,165,233,0.18);
  padding: 2px 9px; border-radius: 100px; letter-spacing: 0.06em;
}

/* ══ KEYFRAMES ══ */
@keyframes upIn {
  from { opacity: 0; transform: translateY(22px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fcPulse {
  0%,100% { opacity: 1; }
  50%      { opacity: 0.4; }
}
@keyframes skShimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@keyframes spinSlow {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* ═══════════════════════════════════════
   PROCESSING OVERLAY
═══════════════════════════════════════ */
.proc-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(249,248,246,0.96);
  backdrop-filter: blur(16px);
  display: flex; align-items: center; justify-content: center;
  animation: upIn 0.35s var(--ease-out) both;
}
.proc-card {
  background: white;
  border: 1px solid var(--s-200);
  border-radius: 24px;
  padding: 52px 56px 48px;
  width: 480px; max-width: 92vw;
  box-shadow: var(--sh-md);
}
.proc-icon {
  width: 56px; height: 56px; border-radius: 16px;
  background: var(--s-50); border: 1px solid var(--s-200);
  display: flex; align-items: center; justify-content: center;
  font-size: 1.5rem; margin-bottom: 28px;
  position: relative;
}
.proc-spinner {
  position: absolute; inset: -6px;
  border: 1.5px solid transparent;
  border-top-color: var(--sky);
  border-right-color: rgba(14,165,233,0.3);
  border-radius: 50%;
  animation: spinSlow 0.9s linear infinite;
}
.proc-title {
  font-family: 'DM Serif Display', serif;
  font-size: 1.6rem; font-weight: 400; letter-spacing: -0.02em;
  color: var(--ink); margin-bottom: 6px;
}
.proc-sub {
  font-family: 'DM Mono', monospace; font-size: 0.65rem;
  color: var(--s-400); letter-spacing: 0.08em; margin-bottom: 36px;
}
.proc-stages { display: flex; flex-direction: column; gap: 10px; margin-bottom: 36px; }
.proc-stage {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 16px; border-radius: 12px;
  border: 1px solid var(--s-100);
  background: var(--s-50);
  transition: all 0.3s var(--ease-out);
}
.proc-stage.active {
  border-color: rgba(14,165,233,0.25);
  background: rgba(14,165,233,0.04);
}
.proc-stage.done {
  border-color: rgba(34,197,94,0.2);
  background: rgba(34,197,94,0.04);
}
.stage-dot {
  width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.75rem;
  background: var(--s-100); border: 1px solid var(--s-200);
  transition: all 0.25s;
}
.proc-stage.active .stage-dot {
  background: rgba(14,165,233,0.1); border-color: rgba(14,165,233,0.3);
  animation: fcPulse 1s ease infinite;
}
.proc-stage.done .stage-dot {
  background: rgba(34,197,94,0.1); border-color: rgba(34,197,94,0.3);
}
.stage-info { flex: 1; }
.stage-name {
  font-size: 0.82rem; font-weight: 600; color: var(--ink); margin-bottom: 2px;
  transition: color 0.25s;
}
.proc-stage.active .stage-name { color: var(--sky); }
.proc-stage.done  .stage-name { color: var(--green); }
.stage-model {
  font-family: 'DM Mono', monospace; font-size: 0.58rem; color: var(--s-400);
}
.stage-badge {
  font-family: 'DM Mono', monospace; font-size: 0.55rem; letter-spacing: 0.06em;
  padding: 3px 9px; border-radius: 100px;
  border: 1px solid var(--s-200); color: var(--s-400); background: white;
  transition: all 0.25s;
}
.proc-stage.active .stage-badge { border-color: rgba(14,165,233,0.25); color: var(--sky); background: rgba(14,165,233,0.05); }
.proc-stage.done  .stage-badge { border-color: rgba(34,197,94,0.25); color: var(--green); background: rgba(34,197,94,0.05); }

/* Progress bar */
.proc-progress { margin-bottom: 20px; }
.proc-bar-track { height: 3px; border-radius: 2px; background: var(--s-100); overflow: hidden; }
.proc-bar-fill {
  height: 100%; border-radius: 2px;
  background: linear-gradient(90deg, var(--sky), var(--violet));
  transition: width 0.6s var(--ease-out);
}
.proc-bar-lbl {
  display: flex; justify-content: space-between;
  font-family: 'DM Mono', monospace; font-size: 0.58rem;
  color: var(--s-400); margin-top: 8px;
}

/* Error state */
.proc-error {
  padding: 14px 16px; border-radius: 12px;
  border: 1px solid rgba(239,68,68,0.2);
  background: rgba(239,68,68,0.04);
  margin-bottom: 28px;
}
.proc-error-title {
  font-size: 0.8rem; font-weight: 600; color: #ef4444; margin-bottom: 4px;
}
.proc-error-msg {
  font-family: 'DM Mono', monospace; font-size: 0.62rem; color: var(--s-500);
  line-height: 1.55;
}
.btn-retry {
  width: 100%; padding: 14px; border: 1px solid var(--s-200);
  border-radius: 12px; font-family: 'DM Sans', sans-serif;
  font-size: 0.85rem; font-weight: 600; color: var(--ink);
  background: white; cursor: pointer;
  transition: all 0.22s var(--ease-out);
}
.btn-retry:hover { background: var(--s-50); transform: translateY(-1px); box-shadow: var(--sh-xs); }
`;

/* ─── Helpers ──────────────────────────────────── */
const PALETTE = [
  "#0ea5e9", "#8b5cf6", "#22c55e", "#f59e0b",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316",
];
const GLYPHS = ["◈", "⬡", "⊕", "▣", "◉", "◆", "⬢", "◐"];

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
const sceneColor = (n) => PALETTE[hashStr(n) % PALETTE.length];
const sceneGlyph = (n) => GLYPHS[hashStr(n * 7) % GLYPHS.length];

function fmtBytes(b) {
  if (!b) return null;
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 ** 2).toFixed(1)} MB`;
}
function stripExt(s) { return s.replace(/\.[^.]+$/, ""); }

const PIPE_STEPS = [
  { num: "01", name: "Geometry", model: "DUSt3R ViT-L", glyph: "▒▓█", c: "#0ea5e9" },
  { num: "02", name: "Segmentation", model: "SAM 2", glyph: "▓█▒", c: "#8b5cf6" },
  { num: "03", name: "Fusion", model: "Mirra Engine", glyph: "█▒▓", c: "#22c55e" },
];
const SPECS = [
  { v: "< 5s", l: "Pipeline" },
  { v: "4K", l: "Max Res" },
  { v: "ROCm", l: "Backend" },
];

/* ─── Processing overlay stages definition ── */
const PROC_STAGES = [
  { id: "upload", label: "Uploading Video", model: "FastAPI", glyph: "⬆", apiTrigger: "upload" },
  { id: "frames", label: "Extracting Frames", model: "OpenCV", glyph: "◈", apiTrigger: "pending" },
  { id: "geometry", label: "Depth Estimation", model: "DUSt3R ViT-L", glyph: "▒", apiTrigger: "processing" },
  { id: "semantic", label: "Semantic Fusion", model: "SAM 2 + Mirra", glyph: "▓", apiTrigger: "processing" },
  { id: "finalise", label: "Finalising Scene", model: "FusionEngine", glyph: "█", apiTrigger: "processing" },
];

/* Maps backend status → active stage index */
function stageFromStatus(uploadDone, apiStatus) {
  if (!uploadDone) return 0;
  if (apiStatus === "PENDING") return 1;
  if (apiStatus === "PROCESSING") return 3; // show mid-processing
  return 4;
}

/* ─── Main component ──────────────────────────── */
export default function UploadPage({ setPage, onComplete }) {
  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  const [selectedInputs, setSelectedInputs] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  /* Pipeline state machine */
  const [phase, setPhase] = useState("IDLE"); // IDLE | UPLOADING | PROCESSING | DONE | ERROR
  const [stageIdx, setStageIdx] = useState(0);       // 0-4 active stage
  const [jobId, setJobId] = useState(null);
  const [jobResult, setJobResult] = useState(null);
  const [errMsg, setErrMsg] = useState(null);

  /* ── Load existing scenes ─────────────────────── */
  const refreshFiles = useCallback(async () => {
    try {
      const d = await listPlyFiles();
      setFiles(d.files || []);
    } catch (_) {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshFiles(); }, [refreshFiles]);

  /* ── Drag / file pick ────────────────────────── */
  const pickFiles = useCallback((fList) => {
    if (!fList || fList.length === 0) return;
    const arr = Array.from(fList);
    if (arr.length > 15) {
      setErrMsg("Maximum 15 photos allowed for high-accuracy 3D processing.");
      setPhase("ERROR");
      return;
    }
    setSelectedInputs(arr);
  }, []);
  const clearFile = useCallback((e) => { e.stopPropagation(); setSelectedInputs([]); }, []);
  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    pickFiles(e.dataTransfer.files);
  }, [pickFiles]);

  /* ── Open existing scene ─────────────────────── */
  const openScene = useCallback((f) => {
    if (onComplete) onComplete(f);
    if (setPage) setPage("viewer");
  }, [onComplete, setPage]);

  /* ── Stop polling ────────────────────────────── */
  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => stopPoll, [stopPoll]); // cleanup on unmount

  /* ── Poll job status ─────────────────────────── */
  const startPolling = useCallback((id) => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const data = await pollStatus(id);
        const s = data.status;

        if (s === "PENDING") {
          setStageIdx(1);
        } else if (s === "PROCESSING") {
          // Animate through stages 2-4 smoothly
          setStageIdx((prev) => Math.min(prev + 1, 4));
        } else if (s === "COMPLETED") {
          stopPoll();
          setStageIdx(4);
          setJobResult(data);
          setPhase("DONE");
          await refreshFiles();
          // Small delay so user sees "Done" briefly
          setTimeout(() => {
            if (onComplete) onComplete(data);
            if (setPage) setPage("viewer");
          }, 900);
        } else if (s === "FAILED") {
          stopPoll();
          setErrMsg(data.error || "Pipeline failed. Check backend logs.");
          setPhase("ERROR");
        }
      } catch (e) {
        stopPoll();
        setErrMsg(e.message || "Network error while polling status.");
        setPhase("ERROR");
      }
    }, 2000);
  }, [stopPoll, refreshFiles, onComplete, setPage]);

  /* ── Main launch handler ─────────────────────── */
  const handleLaunch = useCallback(async () => {
    if (selectedInputs.length === 0) return;
    setPhase("UPLOADING");
    setStageIdx(0);
    setErrMsg(null);
    setJobResult(null);

    try {
      /* 1. Upload */
      const isPhotos = selectedInputs.length > 1 || selectedInputs[0].type.startsWith("image/");
      const uploadData = isPhotos 
        ? await uploadPhotos(selectedInputs) 
        : await uploadVideo(selectedInputs[0]);
        
      setStageIdx(1);
      setPhase("PROCESSING");

      /* 2. Start pipeline */
      const procData = await processVideo(uploadData.filename);
      const id = procData.job_id;
      setJobId(id);
      setStageIdx(1);

      /* 3. Poll status */
      startPolling(id);

    } catch (e) {
      stopPoll();
      setErrMsg(e.message || "An unexpected error occurred.");
      setPhase("ERROR");
    }
  }, [file, startPolling, stopPoll]);

  /* ── Retry (reset to IDLE) ───────────────────── */
  const handleRetry = useCallback(() => {
    setPhase("IDLE");
    setStageIdx(0);
    setJobId(null);
    setJobResult(null);
    setErrMsg(null);
    setSelectedInputs([]);
    stopPoll();
  }, [stopPoll]);

  /* ── Progress % ──────────────────────────────── */
  const progress = Math.round((stageIdx / (PROC_STAGES.length - 1)) * 100);

  const hasFiles = selectedInputs.length > 0;
  const dzClass = ["dz-card", dragOver ? "drag-over" : "", hasFiles ? "has-file" : ""].filter(Boolean).join(" ");
  const isRunning = phase === "UPLOADING" || phase === "PROCESSING" || phase === "DONE";

  return (
    <div className="up-page">
      <style>{css}</style>

      {/* ── Background layers ── */}
      <div className="up-bg-grid" />
      <div className="up-glow" />
      <div className="up-glow-r" />

      {/* ════════════════════════════════
          PROCESSING OVERLAY
      ════════════════════════════════ */}
      {isRunning && (
        <div className="proc-overlay">
          <div className="proc-card">
            {/* Icon + spinner */}
            <div className="proc-icon">
              {phase === "DONE" ? "✓" : "⬡"}
              {phase !== "DONE" && <div className="proc-spinner" />}
            </div>

            <div className="proc-title">
              {phase === "DONE" ? "Scene Ready" : "Processing…"}
            </div>
            <div className="proc-sub">
              {phase === "DONE"
                ? "REDIRECTING TO VIEWER"
                : phase === "UPLOADING"
                  ? "UPLOADING · PLEASE WAIT"
                  : `JOB · ${jobId?.slice(0, 8).toUpperCase() ?? "…"}`}
            </div>

            {/* Stage rows */}
            <div className="proc-stages">
              {PROC_STAGES.map((s, i) => {
                const isDone = i < stageIdx;
                const isActive = i === stageIdx;
                return (
                  <div
                    key={s.id}
                    className={`proc-stage ${isDone ? "done" : ""} ${isActive ? "active" : ""}`}
                  >
                    <div className="stage-dot">
                      {isDone ? "✓" : isActive ? s.glyph : s.glyph}
                    </div>
                    <div className="stage-info">
                      <div className="stage-name">{s.label}</div>
                      <div className="stage-model">{s.model}</div>
                    </div>
                    <div className="stage-badge">
                      {isDone ? "done" : isActive ? "running" : "queued"}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Progress bar */}
            <div className="proc-progress">
              <div className="proc-bar-track">
                <div className="proc-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="proc-bar-lbl">
                <span>{PROC_STAGES[stageIdx]?.label}</span>
                <span>{progress}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ERROR OVERLAY */}
      {phase === "ERROR" && (
        <div className="proc-overlay">
          <div className="proc-card">
            <div className="proc-icon" style={{ fontSize: "1.3rem" }}>✗</div>
            <div className="proc-title">Pipeline Failed</div>
            <div className="proc-sub">SOMETHING WENT WRONG</div>
            <div className="proc-error">
              <div className="proc-error-title">Error</div>
              <div className="proc-error-msg">{errMsg}</div>
            </div>
            <button className="btn-retry" onClick={handleRetry}>↩ Try Again</button>
          </div>
        </div>
      )}

      <div className="up-inner">

        {/* ── Page header ── */}
        <div className="up-header">
          <div className="up-eyebrow">
            <div className="up-eyebrow-line" />
            03 — Reconstruct
            <div className="up-eyebrow-line" />
          </div>
          <h1 className="up-title">
            Upload <em>Source</em> Video
          </h1>
          <p className="up-sub">
            Mirra extracts geometry via DUSt3R, segments objects with SAM&nbsp;2,
            and fuses everything into a labeled semantic 3D world — automatically,
            in under 5&nbsp;minutes.
          </p>
        </div>

        {/* ── Columns ── */}
        <div className="up-cols">

          {/* ════ LEFT ════ */}
          <div className="up-left">

            {/* hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".mp4,.mov,.avi,.mkv,video/*,image/jpeg,image/png,image/*"
              style={{ display: "none" }}
              onChange={(e) => pickFiles(e.target.files)}
            />

            {/* ── Drop zone ── */}
            <div
              className={dzClass}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              {/* corner brackets */}
              {["tl", "tr", "bl", "br"].map(p => (
                <div key={p} className={`dz-bracket ${p}`} />
              ))}

              <div className="dz-body">
                {/* icon orbit */}
                <div className="dz-orbit">
                  <div className="dz-orbit-ring outer" />
                  <div className="dz-orbit-ring" />
                  <div className="dz-icon-box">
                    <span className="dz-icon">
                      {hasFiles ? "✓"
                        : dragOver ? "↓"
                          : "⬆"}
                    </span>
                  </div>
                </div>

                <div className="dz-heading">
                  {hasFiles ? `${selectedInputs.length} file(s) ready to process`
                    : dragOver ? "Release to upload"
                      : "Drop video or photos here"}
                </div>
                <div className="dz-hint">
                  {hasFiles ? "Click to swap files" : "or click to browse"}
                </div>

                {/* format chips */}
                {!hasFiles && (
                  <div className="dz-formats">
                    {["MP4", "MOV", "JPG", "PNG", "Max 2GB"].map(f => (
                      <span key={f} className="fmt-tag">{f}</span>
                    ))}
                  </div>
                )}

                {/* selected file chip */}
                {hasFiles && (
                  <div
                    className="dz-file-chip"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="dz-file-chip-dot" />
                    <span className="dz-file-chip-name">
                      {selectedInputs.length === 1 ? selectedInputs[0].name : `${selectedInputs.length} images selected`}
                    </span>
                    {selectedInputs.length === 1 && selectedInputs[0].size && (
                      <span className="dz-file-chip-size">{fmtBytes(selectedInputs[0].size)}</span>
                    )}
                    <button className="dz-file-chip-x" onClick={clearFile} title="Remove file">
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Pipeline steps ── */}
            <div className="pipe-row">
              {PIPE_STEPS.map(s => (
                <div
                  className="pipe-card"
                  key={s.num}
                  style={{ "--c": s.c }}
                >
                  <div className="pipe-step-num">{s.num}</div>
                  <div className="pipe-step-name">{s.name}</div>
                  <div className="pipe-step-model">{s.model}</div>
                  <div className="pipe-step-glyph" style={{ color: s.c }}>{s.glyph}</div>
                </div>
              ))}
            </div>

            {/* ── Launch button (only when file selected) ── */}
            {hasFiles && (
              <button className="btn-launch" onClick={handleLaunch}>
                <div className="btn-launch-left">
                  <span className="btn-launch-label">Run Mirra Pipeline</span>
                  <span className="btn-launch-sub">DUSt3R → SAM 2 → Fusion</span>
                </div>
                <div className="btn-launch-icon">
                  <span className="btn-launch-arrow" />
                </div>
              </button>
            )}

            {/* ── Specs strip ── */}
            <div className="specs-strip">
              {SPECS.map(s => (
                <div className="spec-cell" key={s.l}>
                  <div className="spec-val">{s.v}</div>
                  <div className="spec-lbl">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ════ RIGHT ════ */}
          <div className="up-right">
            <div className="scenes-panel">

              {/* top bar */}
              <div className="sp-topbar">
                <div className="sp-topbar-left">
                  <div className="sp-status-dot" />
                  <span className="sp-topbar-title">Existing Scenes</span>
                </div>
                {!loading && (
                  <span className="sp-count">
                    {files.length} scene{files.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* list area */}
              <div className="sp-list">
                {loading ? (
                  /* ── Skeleton ── */
                  <div className="sp-skeleton">
                    {[0, 1, 2].map(i => (
                      <div className="sk-row" key={i}>
                        <div className="sk-thumb" style={{ animationDelay: `${i * 0.18}s` }} />
                        <div className="sk-lines">
                          <div className="sk-line" style={{ animationDelay: `${i * 0.18}s` }} />
                          <div className="sk-line short" style={{ animationDelay: `${i * 0.18 + 0.08}s` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : files.length === 0 ? (
                  /* ── Empty state ── */
                  <div className="sp-empty">
                    <div className="sp-empty-glyph">◈</div>
                    <div className="sp-empty-msg">
                      No scenes yet.<br />
                      Upload a video to generate your first 3D scene.
                    </div>
                    <div className="sp-empty-hint">Processed scenes appear here automatically</div>
                  </div>
                ) : (
                  /* ── Scene rows ── */
                  files.map((f) => {
                    const color = sceneColor(f.filename);
                    const glyph = sceneGlyph(f.filename);
                    const name = stripExt(f.filename);
                    const size = fmtBytes(f.size_bytes ?? f.size);
                    return (
                      <div
                        key={f.filename}
                        className="scene-row"
                        onClick={() => openScene(f)}
                      >
                        {/* thumb */}
                        <div className="scene-thumb">
                          <span style={{ color, fontSize: "1.05rem" }}>{glyph}</span>
                          <div className="scene-thumb-bar" style={{ background: color + "88" }} />
                        </div>

                        {/* meta */}
                        <div className="scene-meta">
                          <div className="scene-name">{name}</div>
                          <div className="scene-tags">
                            <span className="scene-tag">PLY</span>
                            <span className="scene-tag">Semantic</span>
                            {size && <span className="scene-tag">{size}</span>}
                          </div>
                        </div>

                        {/* open arrow */}
                        <div className="scene-chevron">
                          <span className="scene-chevron-arrow" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* footer */}
              <div className="sp-footer">
                <span className="sp-footer-info">
                  Pipeline active · MPS backend
                </span>
                <span className="sp-footer-badge">Mirra</span>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
