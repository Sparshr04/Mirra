# Fusion Engine — Projection Math

> **TL;DR:** DUSt3R outputs camera poses in **OpenCV convention** (X-right, Y-down, Z-forward).
> The Fusion Engine uses a standard pinhole model with correctly sourced intrinsics (`focal`, `cx`, `cy`)
> to project 3D world points into each camera's 2D frame and sample semantic masks.

---

## 1. The Problem We Solved

The original projection code in `fusion_engine.py` had several bugs that caused semantic labels to
land in completely wrong physical locations in 3D space:

| Bug | Impact |
|-----|--------|
| Hardcoded principal point as `(W/2, H/2)` | Fragile — breaks if `optimize_pp=True` or if DUSt3R's optimized principal point drifts from image center. |
| `u.astype(int)` truncation | Systematic ±1px error at all object boundaries. `5.9 → 5` instead of `5.9 → 6`. |
| No minimum depth guard | Points at `Z ≈ 0` produce `u, v → ±∞`, which could wrap around and cause phantom labels. |
| Per-point Python loop | O(P × V × M) in pure Python. For 100K points × 10 views × 20 masks, this took minutes. |

---

## 2. Coordinate Conventions

### DUSt3R uses OpenCV convention

This was confirmed by tracing through DUSt3R's source code (`dust3r/cloud_opt/optimizer.py`):

```python
# DUSt3R's _fast_depthmap_to_pts3d (line 204-211 of optimizer.py):
# Generates camera-space points as:
#   X = depth * (u - cx) / f
#   Y = depth * (v - cy) / f
#   Z = depth
return torch.cat((depth * (pixel_grid - pp) / focal, depth), dim=-1)
```

This means:

```
Camera Frame (OpenCV)          Image Plane
                               ┌──────────────── u (column) ──→
    X (right)                  │ (0,0)
    │                          │
    │                          v (row)
    │                          │
    ╳───── Y (down)            ↓
    │
    Z (forward, into scene)
```

- **X** increases to the right
- **Y** increases downward
- **Z** increases forward (into the scene = positive depth)
- Points in front of the camera have **Z > 0**

### This is NOT OpenGL/PyTorch3D convention

OpenGL uses Y-**up** and Z-**backward** (toward the viewer). If we had mistakenly treated DUSt3R's
output as OpenGL, we would have needed to negate Y and Z before projection — which would cause
exactly the kind of "mirrored/inverted labels" bug we observed.

---

## 3. The Pinhole Camera Model

### Forward Projection (3D → 2D)

Given a 3D world-space point $\mathbf{P}_w = (X_w, Y_w, Z_w, 1)$ and camera parameters:

**Step 1 — World to Camera transform:**

$$\mathbf{P}_{cam} = \mathbf{T}_{w2c} \cdot \mathbf{P}_w$$

where $\mathbf{T}_{w2c} = \mathbf{T}_{c2w}^{-1}$ is the inverse of the camera-to-world matrix from DUSt3R's `get_im_poses()`.

**Step 2 — Perspective division (pinhole projection):**

$$u = f \cdot \frac{X_{cam}}{Z_{cam}} + c_x$$

$$v = f \cdot \frac{Y_{cam}}{Z_{cam}} + c_y$$

where:
- $f$ is the focal length in pixels (from `get_focals()`)
- $(c_x, c_y)$ is the principal point in pixels (from `get_principal_points()`)

**Step 3 — Validity checks:**

A projection is valid if and only if:
1. $Z_{cam} > \epsilon_{min}$ (point is in front of camera, with minimum depth threshold)
2. $0 \leq u < W$ and $0 \leq v < H$ (point projects within image bounds)

### Inverse Projection (2D → 3D)

Given pixel $(u, v)$ and depth $d$:

$$X_{cam} = d \cdot \frac{u - c_x}{f}, \quad Y_{cam} = d \cdot \frac{v - c_y}{f}, \quad Z_{cam} = d$$

This is exactly what DUSt3R's `_fast_depthmap_to_pts3d` does internally.

---

## 4. The `c2w` → `w2c` Inversion

DUSt3R's `get_im_poses()` returns **camera-to-world** (c2w) matrices of shape `(N, 4, 4)`:

$$\mathbf{T}_{c2w} = \begin{bmatrix} \mathbf{R} & \mathbf{t} \\ \mathbf{0}^T & 1 \end{bmatrix}$$

To project world points into a camera's frame, we need the **world-to-camera** (w2c) transform:

$$\mathbf{T}_{w2c} = \mathbf{T}_{c2w}^{-1} = \begin{bmatrix} \mathbf{R}^T & -\mathbf{R}^T \mathbf{t} \\ \mathbf{0}^T & 1 \end{bmatrix}$$

In code, this is simply `np.linalg.inv(c2w)`.

---

## 5. Principal Point: Why `(W/2, H/2)` Is Not Always Correct

DUSt3R optimizes the principal point during global alignment. The default initializer is:

```python
# dust3r/cloud_opt/optimizer.py, line 45:
self.register_buffer('_pp', torch.tensor([(w/2, h/2) for h, w in self.imshapes]))
```

But the *actual* principal point is:

```python
# dust3r/cloud_opt/optimizer.py, line 141-142:
def get_principal_points(self):
    return self._pp + 10 * self.im_pp  # im_pp is a learned offset!
```

When `optimize_pp=False` (our current config), `im_pp` stays at zero and the principal point
equals `(W/2, H/2)`. But this is a **config-dependent coincidence**, not a mathematical certainty.

The fixed code saves the actual principal points in `poses.npz` and uses them directly:

```python
# geometry_engine.py — saves DUSt3R's actual principal points
pp = _to_numpy(scene.get_principal_points())  # (N, 2)
np.savez_compressed(poses_path, ..., principal_points=pp, ...)

# fusion_engine.py — uses them for projection
u = focal * x_cam * inv_z + cx  # cx from principal_points, NOT W/2
v = focal * y_cam * inv_z + cy  # cy from principal_points, NOT H/2
```

---

## 6. Vectorized Voting Strategy

Instead of a per-point Python loop, the corrected implementation:

1. **Projects all P points** to 2D in one vectorized operation → `(P,)` arrays `u, v, valid`
2. **Filters** to valid indices → `valid_indices = np.where(valid)[0]`
3. **Samples each mask** at all valid pixels simultaneously → `mask[v_valid, u_valid]` (NumPy fancy indexing)
4. **Accumulates votes** in a `(P, num_labels)` integer matrix

This reduces the inner loop from O(P) Python iterations to O(M) mask lookups per view,
where each mask lookup is a single vectorized NumPy operation.

---

## 7. File Reference

| File | Role |
|------|------|
| `src/geometry_engine.py` | Saves `c2w`, `focals`, `principal_points`, `image_shapes` into `poses.npz` |
| `src/fusion_engine.py` | Loads poses, projects 3D→2D, samples masks, votes on labels |
| `tests/test_fusion.py` | Synthetic roundtrip tests for the projection math |
| `outputs/geometry/poses.npz` | Archive containing all camera parameters |
| `outputs/final/semantic_world.ply` | Output: labeled point cloud with `label_id` field |
