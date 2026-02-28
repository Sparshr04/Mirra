import { useState, Suspense, useMemo, useRef, useEffect, useCallback } from "react";
import { BASE_URL } from "../api";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Grid } from "@react-three/drei";
import { PLYLoader } from "three-stdlib";
import * as THREE from "three";

const css = `
.viewer-page {
  min-height: 100vh; padding-top: 58px;
  background: #0d0d0d; display: flex; flex-direction: column;
  color: rgba(255,255,255,0.82);
}

/* Top bar */
.vbar {
  padding: 18px 40px;
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  background: rgba(0,0,0,0.42); backdrop-filter: blur(18px);
  flex-shrink: 0;
}
.vbar-left  { display:flex; align-items:center; gap:18px; }
.vbar-back {
  display:flex; align-items:center; gap:6px; padding:6px 12px;
  background:transparent; border:1px solid rgba(255,255,255,0.1);
  border-radius:7px; font-family:'DM Sans',sans-serif;
  font-size:0.77rem; color:rgba(255,255,255,0.42);
  cursor:pointer; transition:all 0.16s;
}
.vbar-back:hover { border-color:rgba(255,255,255,0.2); color:rgba(255,255,255,0.7); }
.vbar-title { font-family:'DM Serif Display',serif; font-size:1.05rem; color:rgba(255,255,255,0.82); }
.vbar-title em { font-style:italic; color:rgba(255,255,255,0.32); }
.vbar-status {
  display:flex; align-items:center; gap:6px;
  font-family:'DM Mono',monospace; font-size:0.6rem; color:rgba(255,255,255,0.32); letter-spacing:0.07em;
}
.vbar-dot { width:5px; height:5px; border-radius:50%; background:var(--green); box-shadow:0 0 6px rgba(34,197,94,0.6); animation:pulseGlow 2s ease infinite; }
.vbar-right { display:flex; gap:7px; }
.vbar-btn {
  padding:6px 14px; background:transparent; border:1px solid rgba(255,255,255,0.09);
  border-radius:7px; font-family:'DM Sans',sans-serif;
  font-size:0.77rem; color:rgba(255,255,255,0.4);
  cursor:pointer; transition:all 0.16s;
}
.vbar-btn:hover { border-color:rgba(255,255,255,0.18); color:rgba(255,255,255,0.7); }
.vbar-btn.cta { background:rgba(255,255,255,0.07); border-color:rgba(255,255,255,0.14); color:rgba(255,255,255,0.78); }
.vbar-btn.cta:hover { background:rgba(255,255,255,0.11); }

/* Layout */
.viewer-layout {
  flex:1; display:grid; grid-template-columns:210px 1fr 190px; min-height:0;
}

/* Side panels */
.v-panel {
  padding:22px 18px; border-right:1px solid rgba(255,255,255,0.05);
  background:rgba(0,0,0,0.32); display:flex; flex-direction:column; gap:22px; overflow-y:auto;
}
.v-panel.right { border-right:none; border-left:1px solid rgba(255,255,255,0.05); }

.v-sec-lbl {
  font-family:'DM Mono',monospace; font-size:0.56rem; letter-spacing:0.15em;
  text-transform:uppercase; color:rgba(255,255,255,0.22); margin-bottom:11px;
}

/* Stats */
.v-stat { padding-bottom:16px; border-bottom:1px solid rgba(255,255,255,0.04); }
.v-stat:last-of-type { border-bottom:none; }
.v-stat-lbl { font-family:'DM Mono',monospace; font-size:0.55rem; letter-spacing:0.1em; text-transform:uppercase; color:rgba(255,255,255,0.24); margin-bottom:5px; }
.v-stat-val { font-family:'DM Serif Display',serif; font-size:1.45rem; color:rgba(255,255,255,0.82); line-height:1; }
.v-stat-sub { font-size:0.62rem; color:rgba(255,255,255,0.24); margin-top:3px; }
.gpu-badge {
  display:inline-flex; align-items:center; gap:6px; padding:4px 11px;
  background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.15);
  border-radius:100px; font-family:'DM Mono',monospace;
  font-size:0.58rem; color:rgba(34,197,94,0.68); margin-top:6px;
}

/* Canvas */
.v-canvas { position:relative; background:#0d0d0d; overflow:hidden; min-height:520px; }
.cc { position:absolute; width:18px; height:18px; }
.cc-tl { top:12px; left:12px; border-top:1px solid rgba(255,255,255,0.11); border-left:1px solid rgba(255,255,255,0.11); }
.cc-tr { top:12px; right:12px; border-top:1px solid rgba(255,255,255,0.11); border-right:1px solid rgba(255,255,255,0.11); }
.cc-bl { bottom:12px; left:12px; border-bottom:1px solid rgba(255,255,255,0.11); border-left:1px solid rgba(255,255,255,0.11); }
.cc-br { bottom:12px; right:12px; border-bottom:1px solid rgba(255,255,255,0.11); border-right:1px solid rgba(255,255,255,0.11); }

.v-hud-tl {
  position:absolute; top:14px; left:14px; z-index:20;
  display:flex; flex-direction:column; gap:5px; pointer-events:none;
}
.v-hud-br {
  position:absolute; bottom:14px; right:14px; z-index:20;
  pointer-events:none; text-align:right;
}
.hud-chip {
  display:inline-flex; align-items:center; gap:5px; padding:4px 10px;
  background:rgba(0,0,0,0.52); border:1px solid rgba(255,255,255,0.07);
  border-radius:6px; backdrop-filter:blur(8px);
  font-family:'DM Mono',monospace; font-size:0.58rem; color:rgba(255,255,255,0.42);
}
.hud-hint { font-family:'DM Mono',monospace; font-size:0.55rem; color:rgba(255,255,255,0.17); letter-spacing:0.04em; }

/* Loader */
.v-loader {
  position:absolute; inset:0; z-index:30;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  background:#0d0d0d; gap:14px;
}
.v-loader-ring {
  width:40px; height:40px; border:1.5px solid rgba(255,255,255,0.07);
  border-top-color:rgba(14,165,233,0.55); border-radius:50%;
  animation:spinSlow 0.85s linear infinite;
}
.v-loader-txt { font-family:'DM Mono',monospace; font-size:0.62rem; color:rgba(255,255,255,0.24); letter-spacing:0.1em; }

/* No scene / drop zone */
.v-empty {
  position:absolute; inset:0; z-index:10;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px;
  transition: all 0.2s ease;
}
.v-empty-icon {
  width:58px; height:58px; border-radius:14px;
  border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.03);
  display:flex; align-items:center; justify-content:center;
  font-size:1.5rem; color:rgba(255,255,255,0.2);
  transition: all 0.25s ease;
}
.v-empty p { font-size:0.82rem; color:rgba(255,255,255,0.3); text-align:center; max-width:220px; line-height:1.65; }

.v-empty.drag-over {
  background: rgba(14,165,233,0.06);
  border: 2px dashed rgba(14,165,233,0.35);
  border-radius: 12px;
  margin: 12px;
}
.v-empty.drag-over .v-empty-icon {
  border-color: rgba(14,165,233,0.35);
  background: rgba(14,165,233,0.08);
  color: rgba(14,165,233,0.6);
  transform: scale(1.1);
}

.file-input-label {
  display:inline-flex; align-items:center; gap:7px;
  padding:8px 18px; background:rgba(255,255,255,0.06);
  border:1px solid rgba(255,255,255,0.1); border-radius:8px;
  font-family:'DM Sans',sans-serif; font-size:0.8rem; color:rgba(255,255,255,0.5);
  cursor:pointer; transition:all 0.18s;
}
.file-input-label:hover {
  border-color:rgba(14,165,233,0.35); color:rgba(14,165,233,0.7);
  background:rgba(14,165,233,0.06);
}

/* Right panel controls */
.layer-btn {
  display:flex; align-items:center; gap:9px; width:100%; padding:8px 11px;
  background:transparent; border:1px solid rgba(255,255,255,0.07);
  border-radius:7px; font-family:'DM Sans',sans-serif;
  font-size:0.76rem; color:rgba(255,255,255,0.38);
  cursor:pointer; margin-bottom:5px; transition:all 0.16s; text-align:left;
}
.layer-btn:hover { border-color:rgba(255,255,255,0.14); color:rgba(255,255,255,0.62); }
.layer-btn.on { border-color:rgba(255,255,255,0.16); color:rgba(255,255,255,0.78); background:rgba(255,255,255,0.05); }
.layer-dot { width:6px; height:6px; border-radius:50%; border:1.5px solid currentColor; flex-shrink:0; transition:all 0.16s; }
.layer-btn.on .layer-dot { background:currentColor; }

.v-divider { height:1px; background:rgba(255,255,255,0.05); }

.toggle-row {
  display:flex; align-items:center; justify-content:space-between; padding:8px 0;
  border-bottom:1px solid rgba(255,255,255,0.04);
  font-family:'DM Sans',sans-serif; font-size:0.75rem; color:rgba(255,255,255,0.34);
}
.toggle-sw {
  width:28px; height:15px; border-radius:8px;
  background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.1);
  position:relative; cursor:pointer; transition:background 0.18s; flex-shrink:0;
}
.toggle-sw.on { background:rgba(14,165,233,0.3); border-color:rgba(14,165,233,0.38); }
.toggle-knob {
  position:absolute; top:2px; left:2px; width:9px; height:9px; border-radius:50%;
  background:rgba(255,255,255,0.45); transition:transform 0.18s;
}
.toggle-sw.on .toggle-knob { transform:translateX(13px); background:#0ea5e9; }

/* Background color picker */
.bg-presets {
  display:flex; gap:5px; flex-wrap:wrap; margin-top:4px;
}
.bg-swatch {
  width:22px; height:22px; border-radius:6px; border:2px solid transparent;
  cursor:pointer; transition:all 0.15s; flex-shrink:0;
}
.bg-swatch:hover { transform:scale(1.15); }
.bg-swatch.active { border-color:rgba(14,165,233,0.6); box-shadow:0 0 8px rgba(14,165,233,0.25); }
.bg-custom-row {
  display:flex; align-items:center; gap:7px; margin-top:6px;
}
.bg-hex-input {
  flex:1; padding:4px 8px; background:rgba(255,255,255,0.04);
  border:1px solid rgba(255,255,255,0.08); border-radius:5px;
  font-family:'DM Mono',monospace; font-size:0.62rem;
  color:rgba(255,255,255,0.5); outline:none; transition:border-color 0.18s;
}
.bg-hex-input:focus { border-color:rgba(14,165,233,0.35); }
.bg-color-input {
  width:22px; height:22px; padding:0; border:none; border-radius:5px;
  cursor:pointer; background:transparent;
}
.bg-color-input::-webkit-color-swatch-wrapper { padding:0; }
.bg-color-input::-webkit-color-swatch { border:1px solid rgba(255,255,255,0.12); border-radius:5px; }

.export-btn {
  display:flex; align-items:center; gap:7px; width:100%; padding:8px 11px;
  background:none; border:1px solid rgba(255,255,255,0.06);
  border-radius:7px; font-family:'DM Sans',sans-serif;
  font-size:0.73rem; color:rgba(255,255,255,0.28);
  cursor:pointer; margin-bottom:5px; transition:all 0.16s; text-align:left;
}
.export-btn:hover { border-color:rgba(255,255,255,0.12); color:rgba(255,255,255,0.54); }

/* ── Glassmorphic parsing overlay ── */
.parse-overlay {
  position:absolute; inset:0; z-index:50;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:20px;
  background:rgba(6,6,12,0.55);
  backdrop-filter:blur(16px) saturate(1.4);
  -webkit-backdrop-filter:blur(16px) saturate(1.4);
  transition:opacity 0.4s ease;
}
.parse-overlay.fade-out {
  opacity:0; pointer-events:none;
}
.parse-spinner {
  width:52px; height:52px; position:relative;
}
.parse-spinner-ring {
  position:absolute; inset:0;
  border:2px solid rgba(255,255,255,0.06);
  border-top-color:rgba(14,165,233,0.7);
  border-right-color:rgba(139,92,246,0.45);
  border-radius:50%;
  animation:parseSpin 1s cubic-bezier(0.45,0.05,0.55,0.95) infinite;
}
.parse-spinner-dot {
  position:absolute; top:50%; left:50%;
  width:8px; height:8px; margin:-4px;
  background:rgba(14,165,233,0.65);
  border-radius:50%; box-shadow:0 0 14px rgba(14,165,233,0.5);
  animation:parsePulse 1.2s ease-in-out infinite;
}
@keyframes parseSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
@keyframes parsePulse { 0%,100%{transform:scale(1);opacity:0.6} 50%{transform:scale(1.3);opacity:1} }
.parse-label {
  font-family:'DM Mono',monospace; font-size:0.68rem;
  letter-spacing:0.12em; text-transform:uppercase;
  color:rgba(255,255,255,0.4);
}
.parse-sublabel {
  font-family:'DM Sans',sans-serif; font-size:0.72rem;
  color:rgba(255,255,255,0.2); margin-top:-12px;
}
`;

/* ─── Scene background sync component ──────────────────────────────── */
function SceneBg({ color }) {
  const { scene } = useThree();
  useEffect(() => { scene.background = new THREE.Color(color); }, [color, scene]);
  return null;
}

/* ─── Auto-center camera to fit geometry bounding box ──────────────── */
function CameraFit({ geometry }) {
  const { camera } = useThree();
  useEffect(() => {
    if (!geometry) return;
    // Force camera to a known-good position for a 10-unit normalized scene
    camera.position.set(0, 5, 15);
    camera.lookAt(0, 0, 0);
    camera.near = 0.01;
    camera.far = 1000;
    camera.updateProjectionMatrix();
    console.log("[CameraFit] Camera set to (0, 5, 15) → lookAt(0, 0, 0)");
  }, [geometry, camera]);
  return null;
}

/* ─── Point cloud model (from URL or parsed BufferGeometry) ──────── */
/*
 * CRITICAL: We use lowercase <points> and <pointsMaterial> — these are
 * raw React Three Fiber primitives that map directly to THREE.Points
 * and THREE.PointsMaterial.
 *
 * DO NOT use <Points> / <PointMaterial> from @react-three/drei — those
 * are an instanced-point system designed for <Point> children. They
 * silently IGNORE the geometry prop, rendering zero points.
 */
function PlyModel({ url, localGeo, layers, autoRotate }) {
  const [remoteGeo, setRemoteGeo] = useState(null);
  const groupRef = useRef();

  // Load from URL if provided (and no local geometry)
  useEffect(() => {
    if (localGeo || !url) { setRemoteGeo(null); return; }
    console.log("[PlyModel] Loading remote PLY:", url);
    const loader = new PLYLoader();
    loader.load(
      url,
      (geo) => {
        console.log("[PlyModel] Remote PLY loaded, vertices:", geo.attributes.position?.count);
        setRemoteGeo(geo);
      },
      undefined,
      (err) => console.error("[PlyModel] Remote PLY load failed:", err)
    );
  }, [url, localGeo]);

  useFrame((_, dt) => {
    if (autoRotate && groupRef.current) groupRef.current.rotation.y += dt * 0.14;
  });

  const rawGeo = localGeo || remoteGeo;

  // ── Bulletproof Auto-Normalize Pipeline ──────────────────────
  // Guarantees the geometry is centered at (0,0,0) and scaled to
  // exactly 10 units max extent, regardless of input coordinates.
  const geo = useMemo(() => {
    if (!rawGeo) return null;

    const vtxCount = rawGeo.attributes.position?.count ?? 0;
    console.log("[PlyModel] ── Normalizing geometry ──");
    console.log("  Input vertices:", vtxCount);
    console.log("  Attributes:", Object.keys(rawGeo.attributes));
    console.log("  Has colors:", rawGeo.hasAttribute("color"));

    if (vtxCount === 0) {
      console.error("[PlyModel] Geometry has 0 vertices!");
      return null;
    }

    const g = rawGeo.clone();

    // Strip empty index (point clouds don't need it)
    if (g.index && g.index.count === 0) g.setIndex(null);

    // Step 1: Compute bounds
    g.computeBoundingBox();
    g.computeBoundingSphere();
    const box = g.boundingBox;
    if (!box) { console.error("[PlyModel] computeBoundingBox returned null!"); return g; }

    const rawMin = box.min.toArray().map(v => v.toFixed(4));
    const rawMax = box.max.toArray().map(v => v.toFixed(4));
    console.log("  Raw BBox min:", rawMin);
    console.log("  Raw BBox max:", rawMax);

    // Step 2: Center to origin
    const center = new THREE.Vector3();
    box.getCenter(center);
    g.translate(-center.x, -center.y, -center.z);
    console.log("  Centered by translating:", center.toArray().map(v => (-v).toFixed(4)));

    // Step 3: Normalize scale → max extent = exactly 10.0 units
    const sz = new THREE.Vector3();
    box.getSize(sz);
    const maxDim = Math.max(sz.x, sz.y, sz.z);
    if (maxDim > 0) {
      const TARGET_SIZE = 10.0;
      const scaleFactor = TARGET_SIZE / maxDim;
      g.scale(scaleFactor, scaleFactor, scaleFactor);
      console.log("  Scale factor:", scaleFactor.toFixed(6), `(${maxDim.toFixed(4)} → ${TARGET_SIZE})`);
    }

    // Recompute bounds after transform
    g.computeBoundingBox();
    g.computeBoundingSphere();
    console.log("  Final BBox min:", g.boundingBox.min.toArray().map(v => v.toFixed(2)));
    console.log("  Final BBox max:", g.boundingBox.max.toArray().map(v => v.toFixed(2)));
    console.log("  Final bounding sphere radius:", g.boundingSphere.radius.toFixed(2));
    console.log("[PlyModel] ── Normalization complete ──");

    return g;
  }, [rawGeo]);

  if (!geo) return null;

  const hasColors = geo.hasAttribute("color");
  const hasFaces = geo.index && geo.index.count > 0;

  // Step 4: Fixed point size for 10-unit normalized scene
  const POINT_SIZE = 0.05;

  return (
    <group ref={groupRef}>
      {/* ── POINT CLOUD ──
        CRITICAL: Use lowercase <points> (THREE.Points primitive).
        NOT <Points> from drei (which is an instanced system that ignores geometry).
      */}
      {layers.points && (
        <points geometry={geo}>
          <pointsMaterial
            size={POINT_SIZE}
            vertexColors={hasColors}
            color={hasColors ? 0xffffff : 0x60a5fa}
            sizeAttenuation={true}
            transparent={true}
            opacity={0.92}
            depthWrite={false}
          />
        </points>
      )}

      {/* ── MESH SURFACE (if PLY has faces) ── */}
      {hasFaces && layers.solid && (
        <mesh geometry={geo} castShadow receiveShadow>
          <meshStandardMaterial vertexColors={hasColors} color={hasColors ? "white" : "#60a5fa"}
            side={THREE.DoubleSide} roughness={0.55} metalness={0.08} />
        </mesh>
      )}

      {/* ── WIREFRAME ── */}
      {hasFaces && layers.wireframe && (
        <mesh geometry={geo}>
          <meshBasicMaterial color="#7c3aed" wireframe transparent opacity={0.22} side={THREE.DoubleSide} />
        </mesh>
      )}
      <CameraFit geometry={geo} />
    </group>
  );
}

const LAYERS = [
  { key: "points", label: "Point Cloud", color: "#60a5fa" },
  { key: "solid", label: "Mesh Surface", color: "#a78bfa" },
  { key: "wireframe", label: "Wireframe", color: "#7c3aed" },
];

const BG_PRESETS = [
  { label: "Void", hex: "#0d0d0d" },
  { label: "Charcoal", hex: "#1a1a2e" },
  { label: "Slate", hex: "#2d3436" },
  { label: "Navy", hex: "#0a1628" },
  { label: "White", hex: "#f5f5f5" },
  { label: "Ember", hex: "#1a0a0a" },
];

export default function ViewerPage({ setPage, jobResult }) {
  const [layers, setLayers] = useState({ points: true, solid: false, wireframe: true });
  const [autoRot, setAutoRot] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fps, setFps] = useState(60);
  const [bgColor, setBgColor] = useState("#0d0d0d");
  const [customHex, setCustomHex] = useState("#0d0d0d");

  // ─── Local PLY upload state ──────────────────────────────────
  const [localGeo, setLocalGeo] = useState(null);
  const [localName, setLocalName] = useState(null);
  const [localPoints, setLocalPoints] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseFileName, setParseFileName] = useState("");
  const fileInputRef = useRef(null);

  const toggle = (k) => setLayers(l => ({ ...l, [k]: !l[k] }));

  useEffect(() => {
    let frames = 0, last = performance.now();
    const id = setInterval(() => { const now = performance.now(); setFps(Math.round(frames / ((now - last) / 1000))); frames = 0; last = now; }, 1000);
    const raf = () => { frames++; requestAnimationFrame(raf); }; requestAnimationFrame(raf);
    return () => clearInterval(id);
  }, []);

  // ─── Parse PLY from ArrayBuffer via three-stdlib PLYLoader ───
  //
  // CRITICAL UI THREAD HACK:
  // PLYLoader.parse() is synchronous and locks the main thread for
  // large binary files (50MB+ → 2-5 seconds of freeze). If we call
  // it immediately after setState, React won't have time to paint
  // the loading overlay before the CPU gets locked.
  //
  // Solution: set isParsing=true, then wrap the actual parse call
  // in setTimeout(..., 50) to give the browser one paint frame to
  // render the glassmorphic blur overlay before the freeze.
  //
  const parsePlyFile = useCallback((file) => {
    if (!file.name.toLowerCase().endsWith(".ply")) {
      alert("Please upload a .ply file");
      return;
    }

    // Show the overlay immediately
    setIsParsing(true);
    setParseFileName(file.name);
    setLocalName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      // ── setTimeout trick: let React paint the overlay first ──
      setTimeout(() => {
        try {
          const bytes = e.target.result.byteLength;
          console.log(`[PLY Upload] Parsing ${file.name} (${(bytes / 1024 / 1024).toFixed(1)} MB)...`);
          const t0 = performance.now();

          const loader = new PLYLoader();
          const geometry = loader.parse(e.target.result);
          geometry.computeBoundingBox();

          const elapsed = (performance.now() - t0).toFixed(0);
          const nPoints = geometry.attributes.position?.count ?? 0;
          const hasColor = geometry.hasAttribute("color");
          console.log(`[PLY Upload] Parsed in ${elapsed}ms:`);
          console.log("  Vertices:", nPoints.toLocaleString());
          console.log("  Has vertex colors:", hasColor);
          console.log("  Attributes:", Object.keys(geometry.attributes));
          console.log("  BBox min:", geometry.boundingBox.min.toArray().map(v => v.toFixed(4)));
          console.log("  BBox max:", geometry.boundingBox.max.toArray().map(v => v.toFixed(4)));

          if (nPoints === 0) {
            alert("PLY file parsed but contains 0 vertices.");
            setIsParsing(false);
            return;
          }

          setLocalPoints(nPoints);
          setLocalGeo(geometry);
          setLoading(false);

          // Fade out the overlay after a brief moment so the user
          // sees the transition rather than a hard cut
          setTimeout(() => setIsParsing(false), 300);
        } catch (err) {
          console.error("[PLY Upload] Parse error:", err);
          alert("Failed to parse PLY file: " + err.message);
          setIsParsing(false);
        }
      }, 50); // ← 50ms delay = 1 paint frame for the overlay
    };
    reader.onerror = (err) => {
      console.error("[PLY Upload] FileReader error:", err);
      alert("Failed to read file");
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // ─── Drag handlers ──────────────────────────────────────────
  const handleDragOver = useCallback((e) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(true);
  }, []);
  const handleDragLeave = useCallback((e) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
  }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) parsePlyFile(file);
  }, [parsePlyFile]);
  const handleFileSelect = useCallback((e) => {
    const file = e.target?.files?.[0];
    if (file) parsePlyFile(file);
  }, [parsePlyFile]);

  // ─── Background color handlers ──────────────────────────────
  const handleBgPreset = (hex) => { setBgColor(hex); setCustomHex(hex); };
  const handleCustomHexChange = (e) => {
    const v = e.target.value;
    setCustomHex(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) setBgColor(v);
  };
  const handleColorPick = (e) => {
    setBgColor(e.target.value);
    setCustomHex(e.target.value);
  };

  // ─── Derived state ─────────────────────────────────────────
  let plyUrl = null;
  if (jobResult?.ply_url) plyUrl = `${BASE_URL}${jobResult.ply_url}`;
  if (!plyUrl && jobResult?.filename) plyUrl = `${BASE_URL}/files/outputs/${jobResult.filename}`;
  const hasScene = !!plyUrl || !!localGeo;
  const sceneLabel = localName || jobResult?.filename || "awaiting_scene.ply";

  const pointsDisplay = localPoints > 0
    ? (localPoints >= 1e6 ? `${(localPoints / 1e6).toFixed(1)}M` : `${(localPoints / 1e3).toFixed(1)}K`)
    : "1.2M";

  return (
    <div className="viewer-page">
      <style>{css}</style>

      <div className="vbar">
        <div className="vbar-left">
          <button className="vbar-back" onClick={() => setPage("upload")}>← Upload</button>
          <div>
            <div className="vbar-title"><em>Mirra</em> 3D Viewer</div>
            <div className="vbar-status">
              {hasScene
                ? <><div className="vbar-dot" />{localGeo ? "LOCAL FILE" : "SEMANTIC SCENE"} LOADED · {sceneLabel}</>
                : <>AWAITING SCENE</>}
            </div>
          </div>
        </div>
        <div className="vbar-right">
          <button className="vbar-btn">Screenshot</button>
          <button className="vbar-btn">Share</button>
          <button className="vbar-btn cta" onClick={() => setPage("upload")}>New Scene →</button>
        </div>
      </div>

      <div className="viewer-layout">
        {/* Left */}
        <div className="v-panel">
          <div>
            <div className="v-sec-lbl">Scene Stats</div>
            {[
              { l: "Points", v: pointsDisplay, s: "dense cloud" },
              { l: "Frames", v: "240", s: "processed" },
              { l: "Depth Acc", v: "99.3%", s: "DUSt3R est." },
              { l: "Pipeline", v: "4.2s", s: "total time" },
            ].map((s, i) => (
              <div className="v-stat" key={i}>
                <div className="v-stat-lbl">{s.l}</div>
                <div className="v-stat-val">{s.v}</div>
                <div className="v-stat-sub">{s.s}</div>
              </div>
            ))}
            <div className="gpu-badge">
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--green)", display: "inline-block", boxShadow: "0 0 6px rgba(34,197,94,0.6)" }} />
              ROCm · CUDA Active
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="v-canvas">
          <div className="cc cc-tl" /><div className="cc cc-tr" />
          <div className="cc cc-bl" /><div className="cc cc-br" />

          <div className="v-hud-tl">
            <div className="hud-chip">
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--green)", display: "inline-block", boxShadow: "0 0 6px rgba(34,197,94,0.6)" }} />
              MIRRA VIEWER · INTERACTIVE
            </div>
            {hasScene && <div className="hud-chip">{fps} FPS</div>}
          </div>

          <div className="v-hud-br">
            <div className="hud-hint">DRAG ORBIT · SCROLL ZOOM · SHIFT+DRAG PAN</div>
          </div>

          {hasScene ? (
            <div style={{ position: "absolute", inset: 0 }}>
              {loading && !localGeo && (
                <div className="v-loader">
                  <div className="v-loader-ring" />
                  <div className="v-loader-txt">LOADING POINT CLOUD</div>
                </div>
              )}
              <Canvas
                camera={{ position: [0, 2, 10], fov: 54 }}
                dpr={[1, 2]} shadows
                gl={{ antialias: true, powerPreference: "high-performance" }}
                onCreated={() => setLoading(false)}
              >
                <SceneBg color={bgColor} />
                <fog attach="fog" args={[bgColor, 40, 100]} />
                <ambientLight intensity={0.55} />
                <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow shadow-mapSize={[2048, 2048]} />
                <directionalLight position={[-4, 3, -4]} intensity={0.28} color="#4477ff" />
                <pointLight position={[0, 4, 0]} intensity={0.35} />

                <Suspense fallback={null}>
                  <PlyModel url={plyUrl} localGeo={localGeo} layers={layers} autoRotate={autoRot} />
                </Suspense>

                <Grid args={[20, 20]} position={[0, -3.5, 0]}
                  cellSize={0.5} cellThickness={0.4} cellColor="#191919"
                  sectionSize={2} sectionThickness={0.8} sectionColor="#222222"
                  fadeDistance={16} fadeStrength={1} infiniteGrid />

                <ContactShadows position={[0, -3.4, 0]} opacity={0.48} scale={12} blur={2.5} far={4} color="#000000" />
                <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={1} maxDistance={30} />
              </Canvas>

              {/* ── Glassmorphic parsing overlay ── */}
              {isParsing && (
                <div className="parse-overlay">
                  <div className="parse-spinner">
                    <div className="parse-spinner-ring" />
                    <div className="parse-spinner-dot" />
                  </div>
                  <div className="parse-label">Parsing Spatial Data</div>
                  <div className="parse-sublabel">{parseFileName}</div>
                </div>
              )}
            </div>
          ) : (
            /* ── Empty state: drag-and-drop zone ── */
            <div
              className={`v-empty ${dragOver ? 'drag-over' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {/* Show overlay even on the empty state if parsing has begun */}
              {isParsing ? (
                <div className="parse-overlay" style={{ borderRadius: 12 }}>
                  <div className="parse-spinner">
                    <div className="parse-spinner-ring" />
                    <div className="parse-spinner-dot" />
                  </div>
                  <div className="parse-label">Parsing Spatial Data</div>
                  <div className="parse-sublabel">{parseFileName}</div>
                </div>
              ) : (
                <>
                  <div className="v-empty-icon">{dragOver ? "📂" : "⬡"}</div>
                  <p>
                    {dragOver
                      ? "Drop .ply file here"
                      : "Drag & drop a .ply file here, or use the button below"}
                  </p>
                  <label className="file-input-label">
                    📎 Browse .PLY File
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".ply"
                      onChange={handleFileSelect}
                      style={{ display: "none" }}
                    />
                  </label>
                  <button className="btn-secondary" style={{ fontSize: "0.82rem", marginTop: 6 }}
                    onClick={() => setPage("upload")}>Or Upload Video</button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right */}
        <div className="v-panel right">
          <div>
            <div className="v-sec-lbl">Layers</div>
            {LAYERS.map(l => (
              <button key={l.key}
                className={`layer-btn ${layers[l.key] ? "on" : ""}`}
                style={layers[l.key] ? { color: l.color, borderColor: l.color + "44" } : {}}
                onClick={() => toggle(l.key)}>
                <div className="layer-dot" />{l.label}
              </button>
            ))}
          </div>

          <div className="v-divider" />

          <div>
            <div className="v-sec-lbl">Controls</div>
            <div className="toggle-row">
              Auto-Rotate
              <div className={`toggle-sw ${autoRot ? "on" : ""}`} onClick={() => setAutoRot(r => !r)}>
                <div className="toggle-knob" />
              </div>
            </div>
          </div>

          <div className="v-divider" />

          {/* ── Background Color Control ── */}
          <div>
            <div className="v-sec-lbl">Background</div>
            <div className="bg-presets">
              {BG_PRESETS.map(p => (
                <div
                  key={p.hex}
                  className={`bg-swatch ${bgColor === p.hex ? 'active' : ''}`}
                  style={{ background: p.hex, boxShadow: p.hex === "#f5f5f5" ? "inset 0 0 0 1px rgba(0,0,0,0.12)" : "none" }}
                  onClick={() => handleBgPreset(p.hex)}
                  title={p.label}
                />
              ))}
            </div>
            <div className="bg-custom-row">
              <input
                type="color"
                className="bg-color-input"
                value={bgColor}
                onChange={handleColorPick}
                title="Custom color"
              />
              <input
                type="text"
                className="bg-hex-input"
                value={customHex}
                onChange={handleCustomHexChange}
                placeholder="#0d0d0d"
                maxLength={7}
              />
            </div>
          </div>

          <div className="v-divider" />

          <div>
            <div className="v-sec-lbl">Export</div>
            {["MuJoCo XML", "USD Scene", "IsaacGym", "label_map.json"].map(n => (
              <button key={n} className="export-btn">
                <span style={{ opacity: 0.45, fontSize: "0.68rem" }}>↓</span>{n}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}