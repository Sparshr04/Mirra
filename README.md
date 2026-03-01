<div align="center">

# Mirra
**Reality-to-Simulation via 3D Semantic Reconstruction**

[![Python 3.11](https://img.shields.io/badge/python-3.11-blue.svg)](https://python.org)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://react.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()
[![Hackathon Winner](https://img.shields.io/badge/%F0%9F%8F%86-Hackathon%20Winner-gold.svg)]()

A state-of-the-art pipeline extracting real-world video into metric-semantic 3D environments using DUSt3R geometry and SAM 2 segmentation.

</div>

<br>

## Visual Results

<table align="center" width="100%">
  <tr>
    <td width="50%">
      <video autoplay loop muted playsinline width="100%">
        <source src="frontend/assets/classroom/classroom with semantic.mp4" type="video/mp4">
      </video>
    </td>
    <td width="50%">
      <video autoplay loop muted playsinline width="100%">
        <source src="frontend/assets/classroom/classroom without semantic vedio.mp4" type="video/mp4">
      </video>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <video autoplay loop muted playsinline width="100%">
        <source src="frontend/assets/classroom/heatmap_flythrough .mp4" type="video/mp4">
      </video>
    </td>
    <td width="50%">
      <video autoplay loop muted playsinline width="100%">
        <source src="frontend/assets/classroom/non_semantic_flythrough .mp4" type="video/mp4">
      </video>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <video autoplay loop muted playsinline width="100%">
        <source src="frontend/assets/coridoor 2/heatmap_flythrough.mp4" type="video/mp4">
      </video>
    </td>
    <td width="50%">
      <video autoplay loop muted playsinline width="100%">
        <source src="frontend/assets/coridoor/non_semantic_flythrough.mp4" type="video/mp4">
      </video>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <video autoplay loop muted playsinline width="100%">
        <source src="frontend/assets/coridoor 2/non_semantic_flythrough.mp4" type="video/mp4">
      </video>
    </td>
    <td width="50%">
      <video autoplay loop muted playsinline width="100%">
        <source src="frontend/assets/coridoor 2/semantic_flythrough .mp4" type="video/mp4">
      </video>
    </td>
  </tr>
</table>

## Quick Start

### 1. Clone
```bash
git clone https://github.com/your-org/mirra.git
cd mirra
```

### 2. Backend (FastAPI ML Pipeline)
Powered by `uv` for seamless dependency resolution.
```bash
# Sync environment and start the REST API
pip install uv
uv sync

# For AMD ROCm/HIP acceleration (ROCm 6.1):
# uv pip install torch torchvision --index-url https://download.pytorch.org/whl/rocm6.1

# Run the REST API
uv run uvicorn src.api.server:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend (React/Three.js Viewer)
Powered by `bun` for blazingly fast execution.
```bash
cd frontend
bun install
bun run dev
```

## Repository Structure

```text
├── data/                    # Raw inputs and processed staging
│   ├── processed/
│   └── raw/
├── frontend/                # React / Three.js structural viewer
│   ├── public/
│   └── src/
├── outputs/                 # Final generated semantic clouds (.ply)
│   └── final/
└── src/                     # Core ML reconstruction pipeline
    ├── api/                 # FastAPI REST framework
    ├── fusion_engine.py     # 3D projection & label voting
    ├── geometry_engine.py   # DUSt3R depth and pose estimation
    └── semantic_engine.py   # SAM 2 video segmentation
```
