#!/usr/bin/env python3
"""
src/api/server.py
─────────────────
FastAPI REST backend for the 3D Semantic Reconstruction Pipeline.

Design Decisions
────────────────
• All ML work runs inside FastAPI's BackgroundTasks so the caller gets an
  immediate UUID job_id while the heavy pipeline crunches asynchronously.
• A global dict (JOBS) tracks job state: PENDING → PROCESSING → COMPLETED | FAILED.
  For a multi-worker deployment swap this for Redis or a DB, but the API contract
  stays identical.
• The pipeline is invoked by importing and calling the same three engine classes
  that main.py uses, with a minimal Hydra-free DictConfig so the API stays
  independent of Hydra's opinionated launch mechanics.
• Static mounts at /files/outputs and /files/raw let the frontend fetch .ply
  and video files by URL without any additional proxy.

Usage
─────
    uvicorn src.api.server:app --host 0.0.0.0 --port 8000 --reload
"""

import sys
import uuid
import logging
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional

import aiofiles
from fastapi import (
    BackgroundTasks,
    FastAPI,
    File,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from omegaconf import OmegaConf
from pydantic import BaseModel, Field

#  Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("mirra.api")

# Project Root
# server.py lives at <root>/src/api/server.py  →  root is two levels up.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = PROJECT_ROOT / "data" / "raw"
FINAL_DIR = PROJECT_ROOT / "outputs" / "final"

# Ensure the directories exist at startup so static mounts never fail.
RAW_DIR.mkdir(parents=True, exist_ok=True)
FINAL_DIR.mkdir(parents=True, exist_ok=True)

# Sys-path so src.* imports work
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Job Store
# Keyed by job_id (str UUID).  Values are JobStatus dicts.
# Replace with a proper DB for production use.
JOBS: Dict[str, dict] = {}


class HealthResponse(BaseModel):
    """Returned by the root health-check endpoint."""

    status: str = "ok"
    project: str = "Mirra – 3D Semantic Reconstruction API"
    version: str = "1.0.0"
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class UploadResponse(BaseModel):
    """Returned after a video is uploaded successfully."""

    filename: str = Field(..., description="Unique filename stored under data/raw/")
    url: str = Field(..., description="Static URL to retrieve the file")
    size_bytes: int


class ProcessRequest(BaseModel):
    """Body for the /process endpoint."""

    filename: str = Field(
        ...,
        description="Filename (not full path) of the video in data/raw/ to process.",
        example="my_scene_abc123.mp4",
    )


class ProcessResponse(BaseModel):
    """Returned immediately after triggering the pipeline."""

    job_id: str = Field(..., description="UUID to poll for status.")
    status: str = "PENDING"
    message: str = "Pipeline enqueued. Poll /api/v1/status/{job_id} for updates."


class JobStatusResponse(BaseModel):
    """Full status snapshot of a single job."""

    job_id: str
    status: str = Field(..., description="PENDING | PROCESSING | COMPLETED | FAILED")
    filename: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    error: Optional[str] = Field(None, description="Set only when status == FAILED")
    # Output URLs, populated only when status == COMPLETED
    ply_url: Optional[str] = Field(None, description="URL to the semantic .ply file")
    mesh_url: Optional[str] = Field(None, description="URL to the watertight mesh .ply")
    gs_init_url: Optional[str] = Field(None, description="URL to 3DGS init .npz")
    label_map_url: Optional[str] = Field(None, description="URL to label_map.json")


from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Optimizing ASGI server for high-core-count AMD EPYC architecture.")
    yield


app = FastAPI(
    title="Mirra – 3D Semantic Reconstruction API",
    description=(
        "REST interface for the Semantic 3D Reconstruction pipeline. "
        "Upload a video, trigger processing, and poll for results."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ─── CORS (permissive for local React dev server) ────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten to ["http://localhost:3000"] in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static File Mounts
# /files/outputs → outputs/final/  (serves .ply, .json results)
# /files/raw     → data/raw/       (serves uploaded videos)
app.mount("/files/outputs", StaticFiles(directory=str(FINAL_DIR)), name="outputs")
app.mount("/files/raw", StaticFiles(directory=str(RAW_DIR)), name="raw")


def _build_cfg(video_filename: str) -> "OmegaConf":
    """
    Build a lightweight OmegaConf DictConfig that mirrors config.yaml.
    This avoids requiring a Hydra launch context inside the API process.
    Updated for VGGT + TSDF architecture.
    """
    raw = {
        # Hardware
        "device": "cuda",
        "resolution": 512,
        "stride": 45,
        "resume": True,
        # Architecture
        "geometry_backend": "vggt",
        "parallel_stages": False,  # Serial in API (single worker)
        "enable_denoiser": True,
        # Paths
        "data": {"raw": "data/raw", "processed": "data/processed"},
        "outputs": {
            "geometry": "outputs/geometry",
            "semantics": "outputs/semantics",
            "final": "outputs/final",
        },
        "checkpoints": "checkpoints",
        # Dataset
        "dataset": {
            "raw_video_dir": "data/raw",
            "processed_frames_dir": "data/processed/frames",
            "video_filename": video_filename,
            "force_reprocess": False,
        },
        # Semantics (SAM 2 with multi-keyframe)
        "semantics": {
            "model_type": "sam2_hiera_large",
            "min_mask_region_area": 100,
            "checkpoint_path": "checkpoints/sam2_hiera_large.pt",
            "config_path": "sam2_hiera_l.yaml",
            "keyframe_interval": 10,
        },
        "depth_model": {"type": "vggt"},
        # TSDF
        "tsdf": {
            "voxel_length": 0.004,
            "sdf_trunc": 0.02,
            "depth_trunc": 10.0,
        },
    }
    return OmegaConf.create(raw)


def _run_pipeline(job_id: str, video_filename: str) -> None:
    """
    Runs the full 3-stage ML pipeline synchronously in a background thread.
    Updates JOBS[job_id] throughout so the status endpoint can reflect progress.

    Architecture: VGGT + SAM 2 (multi-keyframe) + TSDF Fusion
    Stages:
        0. Shared frame extraction
        1. GeometryEngineV2 – VGGT depth/pose estimation + point cloud
        2. SemanticEngine   – SAM 2 multi-keyframe video segmentation
        3. FusionEngine     – TSDF volumetric fusion + denoiser → outputs
    """
    JOBS[job_id]["status"] = "PROCESSING"
    JOBS[job_id]["started_at"] = datetime.now(timezone.utc).isoformat()
    logger.info("[%s] Pipeline STARTED for '%s'", job_id, video_filename)

    try:
        import torch
        from src.video_utils import get_input_data, extract_frames, ingest_photos
        from src.geometry_engine_v2 import GeometryEngineV2
        from src.semantic_engine import SemanticEngine
        from src.fusion_engine import FusionEngine

        cfg = _build_cfg(video_filename)

        # ── Stage 0: Shared frame extraction/ingestion ──────────────────
        logger.info("[%s] Stage 0 – Frame extraction/ingestion", job_id)
        mode, data_path = get_input_data(cfg, str(PROJECT_ROOT))
        
        if mode == "photos":
            frames, frames_dir = ingest_photos(data_path, cfg, str(PROJECT_ROOT))
        else:
            frames, frames_dir = extract_frames(data_path, cfg, str(PROJECT_ROOT))
            
        if not frames:
            raise RuntimeError("No frames could be prepared.")
        logger.info("[%s] Prepared %d frames", job_id, len(frames))

        # ── Stage 1: Geometry (VGGT) ───────────────────────────────────────
        logger.info("[%s] Stage 1/3 – GeometryEngineV2 (VGGT)", job_id)
        geo_engine = GeometryEngineV2(cfg)
        result = geo_engine.run_inference(frames)
        geo_engine.save_outputs(result, frames)
        logger.info("[%s] Stage 1/3 – GeometryEngineV2 DONE", job_id)

        # Free VGGT model before loading SAM 2
        del geo_engine.model
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        del geo_engine

        # ── Stage 2: Semantics (SAM 2 multi-keyframe) ──────────────────────
        logger.info("[%s] Stage 2/3 – SemanticEngine (multi-keyframe)", job_id)
        sem_engine = SemanticEngine(cfg)
        output_masks, _ = sem_engine.process_input(mode, data_path)
        sem_engine.save_outputs(output_masks, frames_dir)
        logger.info("[%s] Stage 2/3 – SemanticEngine DONE", job_id)

        # Free SAM 2 models
        del sem_engine.video_predictor
        del sem_engine.image_model
        del sem_engine.mask_generator
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        del sem_engine

        # ── Stage 3: TSDF Fusion + Denoiser ────────────────────────────────
        logger.info("[%s] Stage 3/3 – FusionEngine (TSDF)", job_id)
        fusion_engine = FusionEngine(cfg)
        fusion_engine.run()
        logger.info("[%s] Stage 3/3 – FusionEngine DONE", job_id)

        # ── Mark completed ─────────────────────────────────────────────────
        JOBS[job_id]["status"] = "COMPLETED"
        JOBS[job_id]["finished_at"] = datetime.now(timezone.utc).isoformat()
        logger.info("[%s] Pipeline COMPLETED successfully.", job_id)

    except BaseException as exc:  # noqa: BLE001
        err_detail = traceback.format_exc()
        logger.error("[%s] Pipeline FAILED:\n%s", job_id, err_detail)
        JOBS[job_id]["status"] = "FAILED"
        JOBS[job_id]["error"] = str(exc)
        JOBS[job_id]["finished_at"] = datetime.now(timezone.utc).isoformat()


# 1. Health Check
@app.get(
    "/",
    response_model=HealthResponse,
    summary="Health Check",
    tags=["Meta"],
)
async def health_check() -> HealthResponse:
    """
    Returns a basic liveness payload.  The frontend can poll this to confirm
    the API is reachable before showing the upload UI.
    """
    return HealthResponse()


@app.post(
    "/api/v1/upload",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a video file",
    tags=["Pipeline"],
)
async def upload_video(file: UploadFile = File(...)) -> UploadResponse:
    """
    Accepts a multipart video upload.

    - Validates that the uploaded file has a recognised video extension.
    - Generates a UUID-prefixed filename to avoid collisions.
    - Streams the content to `data/raw/` asynchronously.
    - Returns the final filename and its static download URL.
    """
    ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}

    original_name = Path(file.filename or "upload")
    ext = original_name.suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Unsupported file type '{ext}'. "
                f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            ),
        )

    # Build a unique filename: <stem>_<uuid8>.<ext>
    unique_name = f"{original_name.stem}_{uuid.uuid4().hex[:8]}{ext}"
    dest_path = RAW_DIR / unique_name

    logger.info("Uploading '%s' → '%s'", file.filename, dest_path)

    try:
        async with aiofiles.open(dest_path, "wb") as out_file:
            # Stream in 1 MB chunks to keep memory flat for large videos.
            chunk_size = 1024 * 1024  # 1 MB
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                await out_file.write(chunk)
    except OSError as exc:
        logger.exception("Failed to write uploaded file.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not save file: {exc}",
        ) from exc

    file_size = dest_path.stat().st_size
    logger.info("Upload complete: '%s' (%d bytes)", unique_name, file_size)

    return UploadResponse(
        filename=unique_name,
        url=f"/files/raw/{unique_name}",
        size_bytes=file_size,
    )

@app.post(
    "/api/v1/upload/photos",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a directory of photos",
    tags=["Pipeline"],
)
async def upload_photos(files: list[UploadFile] = File(...)) -> UploadResponse:
    """
    Accepts multiple photos.
    Saves them to data/raw/images/.
    Maximum 15 photos allowed per request to prevent OOM in DUSt3R all-pairs logic.
    """
    if len(files) > 15:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 15 photos allowed for high-accuracy 3D processing."
        )

    import shutil
    ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}

    images_dir = RAW_DIR / "images"
    if images_dir.exists():
        shutil.rmtree(images_dir)
    images_dir.mkdir(parents=True, exist_ok=True)

    total_size = 0
    saved_files = []

    for file in files:
        original_name = Path(file.filename or "upload")
        ext = original_name.suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            continue
            
        dest_path = images_dir / original_name.name
        try:
            async with aiofiles.open(dest_path, "wb") as out_file:
                chunk_size = 1024 * 1024
                while True:
                    chunk = await file.read(chunk_size)
                    if not chunk:
                        break
                    await out_file.write(chunk)
            
            total_size += dest_path.stat().st_size
            saved_files.append(original_name.name)
        except OSError as exc:
            logger.exception("Failed to write uploaded photo.")
            
    if not saved_files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid photos were uploaded."
        )

    logger.info("Uploaded %d photos to %s", len(saved_files), images_dir)

    return UploadResponse(
        filename="__photos_dir__",
        url="/files/raw/images",
        size_bytes=total_size,
    )


@app.post(
    "/api/v1/process",
    response_model=ProcessResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Enqueue the ML pipeline for a video",
    tags=["Pipeline"],
)
async def process_video(
    body: ProcessRequest,
    background_tasks: BackgroundTasks,
) -> ProcessResponse:
    """
    Validates that the requested video exists in `data/raw/`, then enqueues
    the full 3-stage ML pipeline as a background task.

    Returns a `job_id` UUID immediately (HTTP 202 Accepted).
    The caller should poll `GET /api/v1/status/{job_id}` for updates.
    """
    if body.filename == "__photos_dir__":
        video_path = RAW_DIR / "images"
        if not video_path.is_dir():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Photo directory 'data/raw/images/' not found. Upload photos first."
            )
    else:
        video_path = RAW_DIR / body.filename
        if not video_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    f"Video '{body.filename}' not found in data/raw/. "
                    "Upload it first via POST /api/v1/upload."
                ),
            )

    job_id = str(uuid.uuid4())

    # Register the job in our in-memory store.
    JOBS[job_id] = {
        "status": "PENDING",
        "filename": body.filename,
        "started_at": None,
        "finished_at": None,
        "error": None,
    }

    background_tasks.add_task(_run_pipeline, job_id, body.filename)

    logger.info("Job %s enqueued for '%s'.", job_id, body.filename)
    return ProcessResponse(job_id=job_id)


@app.get(
    "/api/v1/status/{job_id}",
    response_model=JobStatusResponse,
    summary="Poll the status of an enqueued job",
    tags=["Pipeline"],
)
async def get_job_status(job_id: str) -> JobStatusResponse:
    """
    Returns the current state of a pipeline job.

    | status       | meaning                                          |
    |--------------|--------------------------------------------------|
    | PENDING      | Queued, not started yet                          |
    | PROCESSING   | One of the three pipeline stages is running      |
    | COMPLETED    | All stages finished; output URLs are populated   |
    | FAILED       | A stage raised an exception; `error` is set      |

    When `status == COMPLETED`, the response includes:
    - `ply_url`       – path to `semantic_world.ply` via the static mount
    - `label_map_url` – path to `label_map.json` via the static mount
    """
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found. It may have expired or never existed.",
        )

    # Build output URLs only when the job has finished successfully.
    ply_url: Optional[str] = None
    mesh_url: Optional[str] = None
    gs_init_url: Optional[str] = None
    label_map_url: Optional[str] = None

    if job["status"] == "COMPLETED":
        # Verify the files actually landed on disk before advertising the URL.
        ply_path = FINAL_DIR / "semantic_world.ply"
        mesh_path = FINAL_DIR / "semantic_mesh.ply"
        gs_init_path = FINAL_DIR / "3dgs_init.npz"
        label_map_path = FINAL_DIR / "label_map.json"

        ply_url = "/files/outputs/semantic_world.ply" if ply_path.is_file() else None
        mesh_url = "/files/outputs/semantic_mesh.ply" if mesh_path.is_file() else None
        gs_init_url = "/files/outputs/3dgs_init.npz" if gs_init_path.is_file() else None
        label_map_url = (
            "/files/outputs/label_map.json" if label_map_path.is_file() else None
        )

    return JobStatusResponse(
        job_id=job_id,
        status=job["status"],
        filename=job.get("filename"),
        started_at=job.get("started_at"),
        finished_at=job.get("finished_at"),
        error=job.get("error"),
        ply_url=ply_url,
        mesh_url=mesh_url,
        gs_init_url=gs_init_url,
        label_map_url=label_map_url,
    )


# ── 5. List Output Files ──────────────────────────────────────────────────────
@app.get(
    "/api/v1/files",
    summary="List output PLY files",
    tags=["Pipeline"],
)
async def list_output_files():
    """
    Lists all .ply and .json files in ``outputs/final/``.
    The frontend uses this to populate the 'Existing Scenes' panel.
    """
    files = []
    if FINAL_DIR.is_dir():
        for p in sorted(FINAL_DIR.iterdir()):
            if p.suffix in {".ply", ".json", ".npz"} and p.is_file():
                stat = p.stat()
                files.append(
                    {
                        "filename": p.name,
                        "url": f"/files/outputs/{p.name}",
                        "size_bytes": stat.st_size,
                        "modified_at": datetime.fromtimestamp(
                            stat.st_mtime, tz=timezone.utc
                        ).isoformat(),
                    }
                )
    return {"files": files, "count": len(files)}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.api.server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
