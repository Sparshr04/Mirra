# Visual Diagnosis: Semantic Projection Failure

## The Image

The `semantic_world.ply` shows long, slanted streaks of colored points radiating from
several convergence points, rather than semantic labels adhering to object surfaces.
This is **not** a projection math error. The evidence points to a **degenerate point cloud**.

---

## Forensic Evidence

### Finding 1: The Point Cloud is 1-Dimensional

PCA on a 5000-point sample reveals the reconstruction is essentially **flat**:

| Axis | Variance Ratio |
|------|---------------|
| PC1  | **91.73%**    |
| PC2  | 7.35%         |
| PC3  | **0.92%**     |

> [!CAUTION]
> A healthy 3D reconstruction of an indoor scene should have variance distributed
> roughly 50/30/20 across three axes. Having 91.7% in one axis means the point cloud
> is a **thin line/ribbon**, not a volumetric 3D scene.

This is the "streaky" pattern you see — it's not caused by bad projection math.
The point cloud *itself* is streak-shaped.

### Finding 2: ~50% of Points Are Behind Each Camera

```
cam 0:  z>0= 1,340,834  behind= 1,261,849   (48% behind)
cam 1:  z>0= 1,360,620  behind= 1,253,667   (48% behind)
cam 2:  z>0=   635,344  behind= 1,947,314   (74% behind)  ← worst
cam 6:  z>0=   504,300  behind= 2,069,795   (79% behind)  ← worst
cam 7:  z>0= 2,621,440  behind=         0   (0% behind)   ← best
cam 8:  z>0= 2,434,442  behind=   178,075   (7% behind)
```

In a **healthy** reconstruction where cameras observe the scene from outside,
you'd expect **>95%** of points in front of each camera. Having 50–79% behind
means the cameras are *inside or at the edge* of a degenerate point cloud.

### Finding 3: Camera Positions vs. Point Cloud Bounds

```
Points X:  [-1.243, 0.379]     Cameras X:  [-1.367 to 0.210]
Points Y:  [-0.304, 0.163]     Cameras Y:  [-0.009 to 0.064]
Points Z:  [-1.181, 0.471]     Cameras Z:  [-0.384 to 0.171]
```

The cameras are **inside the point cloud bounding box**. This confirms a degenerate
DUSt3R global alignment where the scene collapsed into a flat structure.

---

## Root Cause Thesis

### The projection math is correct. The DUSt3R reconstruction is degenerate.

The "streaky planar sheets" artifact has a precise mathematical explanation:

```
   Camera (inside cloud)
        ╳
       /|\
      / | \  ← projection rays pass through thin sheet
     /  |  \
    ●───●───●  ← degenerate 1D point cloud
```

1. DUSt3R's global alignment collapsed the scene into a ~1D ribbon (91.7% variance
   along one axis). This happens when there is **insufficient parallax** between views —
   i.e., the camera motion is nearly pure rotation, or all views are too similar.

2. Because the cameras are *inside* this ribbon, projection rays pass through
   the thin structure at various angles. Points along each ray all project
   to the same pixel on the mask → they all get the same label → colored streaks.

3. The multiple convergence points in the visualization correspond to **camera origins**.
   Rays emanate from each camera, passing through the degenerate cloud.

### Why DUSt3R Failed

| Factor | Value | Assessment |
|--------|-------|------------|
| Frames | 10 | Borderline (DUSt3R likes 20–50) |
| Stride | 250 | Very aggressive — frames may be too similar |
| Resolution | 512 | Fine |
| Scene graph | `swin-5-2` | May not create enough cross-pairs for 10 frames |

With stride 250 on a typical 30fps video, you're sampling every ~8.3 seconds.
If the camera barely moved between samples, DUSt3R has no baseline for triangulation.

### What This Means for the Fusion Engine

Even with **mathematically perfect** projection code, you cannot semantically label
a degenerate point cloud. The fix is upstream:

1. **Reduce stride** (try `stride: 30–60`) to give DUSt3R more frames with actual parallax
2. **Verify the input video** has translational camera motion (not just rotation)
3. **Add a quality check** in the fusion engine that rejects clouds with PCA ratio > 0.8

---

## Summary

| Hypothesis | Status |
|------------|--------|
| OpenCV vs OpenGL axis mismatch | ❌ Ruled out — DUSt3R is OpenCV throughout |
| Focal length scaling error | ❌ Ruled out — focals ~560px for 512px images is plausible |
| c2w → w2c inversion failure | ❌ Ruled out — `np.linalg.inv` is correct |
| Principal point hardcoding | ✅ Fixed (but was `(256,256)` = correct for this run) |
| **Degenerate DUSt3R reconstruction** | **✅ ROOT CAUSE** — PCA 91.7% uniaxial |
| Insufficient video parallax | **✅ UPSTREAM CAUSE** — stride 250 likely too aggressive |
