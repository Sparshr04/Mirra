import { useState, Suspense, useMemo, useRef, useEffect } from "react";
import { BASE_URL } from "../api";
import { Canvas, useLoader, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Points, PointMaterial, ContactShadows, Grid } from "@react-three/drei";
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

/* No scene */
.v-empty {
  position:absolute; inset:0; z-index:10;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px;
}
.v-empty-icon {
  width:58px; height:58px; border-radius:14px;
  border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.03);
  display:flex; align-items:center; justify-content:center;
  font-size:1.5rem; color:rgba(255,255,255,0.2);
}
.v-empty p { font-size:0.82rem; color:rgba(255,255,255,0.3); text-align:center; max-width:190px; line-height:1.65; }

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

.export-btn {
  display:flex; align-items:center; gap:7px; width:100%; padding:8px 11px;
  background:none; border:1px solid rgba(255,255,255,0.06);
  border-radius:7px; font-family:'DM Sans',sans-serif;
  font-size:0.73rem; color:rgba(255,255,255,0.28);
  cursor:pointer; margin-bottom:5px; transition:all 0.16s; text-align:left;
}
.export-btn:hover { border-color:rgba(255,255,255,0.12); color:rgba(255,255,255,0.54); }
`;

function CameraFit({ geometry }) {
  const { camera } = useThree();
  useEffect(() => {
    if (!geometry) return;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox; if (!box) return;
    const size = new THREE.Vector3(); box.getSize(size);
    const mx = Math.max(size.x, size.y, size.z);
    camera.position.set(0, mx * 0.35, mx * 1.55);
    camera.near = mx * 0.01; camera.far = mx * 12;
    camera.updateProjectionMatrix();
  }, [geometry, camera]);
  return null;
}

function PlyModel({ url, layers, autoRotate }) {
  const geometry = useLoader(PLYLoader, url);
  const groupRef = useRef();
  useFrame((_, dt) => { if (autoRotate && groupRef.current) groupRef.current.rotation.y += dt * 0.14; });

  const geo = useMemo(() => {
    if (!geometry) return null;
    const g = geometry.clone();
    if (g.index && g.index.count === 0) g.setIndex(null);
    g.computeBoundingBox();
    const box = g.boundingBox; if (!box) return g;
    const c = new THREE.Vector3(); box.getCenter(c); g.translate(-c.x, -c.y, -c.z);
    const sz = new THREE.Vector3(); box.getSize(sz);
    const mx = Math.max(sz.x, sz.y, sz.z);
    if (mx > 0) { const s = 6 / mx; g.scale(s, s, s); }
    if (g.index) g.computeVertexNormals();
    return g;
  }, [geometry]);

  if (!geo) return null;
  const hasColors = geo.hasAttribute("color");
  const hasFaces = geo.index && geo.index.count > 0;

  return (
    <group ref={groupRef}>
      {layers.points && (
        <Points geometry={geo}>
          <PointMaterial size={0.012} vertexColors={hasColors} color={hasColors ? "white" : "#60a5fa"}
            sizeAttenuation transparent opacity={0.88} />
        </Points>
      )}
      {hasFaces && layers.solid && (
        <mesh geometry={geo} castShadow receiveShadow>
          <meshStandardMaterial vertexColors={hasColors} color={hasColors ? "white" : "#60a5fa"}
            side={THREE.DoubleSide} roughness={0.55} metalness={0.08} />
        </mesh>
      )}
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

export default function ViewerPage({ setPage, jobResult }) {
  const [layers, setLayers] = useState({ points: true, solid: false, wireframe: true });
  const [autoRot, setAutoRot] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fps, setFps] = useState(60);
  const toggle = (k) => setLayers(l => ({ ...l, [k]: !l[k] }));

  useEffect(() => {
    let frames = 0, last = performance.now();
    const id = setInterval(() => { const now = performance.now(); setFps(Math.round(frames / ((now - last) / 1000))); frames = 0; last = now; }, 1000);
    const raf = () => { frames++; requestAnimationFrame(raf); }; requestAnimationFrame(raf);
    return () => clearInterval(id);
  }, []);

  let plyUrl = null;
  if (jobResult?.ply_url) plyUrl = `${BASE_URL}${jobResult.ply_url}`;
  if (!plyUrl && jobResult?.filename) plyUrl = `${BASE_URL}/files/outputs/${jobResult.filename}`;
  const sceneLabel = jobResult?.filename || "awaiting_scene.ply";

  return (
    <div className="viewer-page">
      <style>{css}</style>

      <div className="vbar">
        <div className="vbar-left">
          <button className="vbar-back" onClick={() => setPage("upload")}>← Upload</button>
          <div>
            <div className="vbar-title"><em>Mirra</em> 3D Viewer</div>
            <div className="vbar-status">
              {plyUrl
                ? <><div className="vbar-dot" />SEMANTIC SCENE LOADED · {sceneLabel}</>
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
              { l: "Points", v: "1.2M", s: "dense cloud" },
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
            {plyUrl && <div className="hud-chip">{fps} FPS</div>}
          </div>

          <div className="v-hud-br">
            <div className="hud-hint">DRAG ORBIT · SCROLL ZOOM · SHIFT+DRAG PAN</div>
          </div>

          {plyUrl ? (
            <div style={{ position: "absolute", inset: 0 }}>
              {loading && (
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
                style={{ background: "#0d0d0d" }}
              >
                <color attach="background" args={["#0d0d0d"]} />
                <fog attach="fog" args={["#0d0d0d", 18, 42]} />
                <ambientLight intensity={0.55} />
                <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow shadow-mapSize={[2048, 2048]} />
                <directionalLight position={[-4, 3, -4]} intensity={0.28} color="#4477ff" />
                <pointLight position={[0, 4, 0]} intensity={0.35} />

                <Suspense fallback={null}>
                  <PlyModel url={plyUrl} layers={layers} autoRotate={autoRot} />
                </Suspense>

                <Grid args={[20, 20]} position={[0, -3.5, 0]}
                  cellSize={0.5} cellThickness={0.4} cellColor="#191919"
                  sectionSize={2} sectionThickness={0.8} sectionColor="#222222"
                  fadeDistance={16} fadeStrength={1} infiniteGrid />

                <ContactShadows position={[0, -3.4, 0]} opacity={0.48} scale={12} blur={2.5} far={4} color="#000000" />
                <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={1} maxDistance={30} />
              </Canvas>
            </div>
          ) : (
            <div className="v-empty">
              <div className="v-empty-icon">⬡</div>
              <p>No scene loaded. Upload a video to generate a semantic 3D environment.</p>
              <button className="btn-secondary" style={{ fontSize: "0.82rem", marginTop: 6 }}
                onClick={() => setPage("upload")}>Go to Upload</button>
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