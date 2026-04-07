/**
 * src/api.js
 * ──────────
 * Thin wrapper for all AMD Backend REST calls.
 * Base URL defaults to the local FastAPI server.
 */

const BASE_URL = "http://localhost:8000";

/**
 * Upload a video file to the backend.
 * @param {File} file - The video file to upload
 * @returns {Promise<{filename: string, url: string, size_bytes: number}>}
 */
export async function uploadVideo(file) {
    const form = new FormData();
    form.append("file", file);

    const res = await fetch(`${BASE_URL}/api/v1/upload`, {
        method: "POST",
        body: form,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Upload failed");
    }

    return res.json(); // { filename, url, size_bytes }
}

/**
 * Upload multiple photo files to the backend.
 * @param {File[]} files - Array of photo files (jpg, png)
 * @returns {Promise<{filename: string, url: string, size_bytes: number}>}
 */
export async function uploadPhotos(files) {
    const form = new FormData();
    for (const file of files) {
        form.append("files", file);
    }

    const res = await fetch(`${BASE_URL}/api/v1/upload/photos`, {
        method: "POST",
        body: form,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Photo upload failed");
    }

    return res.json();
}

/**
 * Enqueue the ML processing pipeline for an uploaded video.
 * @param {string} filename - The unique filename returned by uploadVideo()
 * @returns {Promise<{job_id: string, status: string, message: string}>}
 */
export async function processVideo(filename) {
    const res = await fetch(`${BASE_URL}/api/v1/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Failed to start processing");
    }

    return res.json(); // { job_id, status, message }
}

/**
 * Poll the status of a running pipeline job.
 * @param {string} jobId
 * @returns {Promise<{job_id, status, filename, started_at, finished_at, error, ply_url, label_map_url}>}
 */
export async function pollStatus(jobId) {
    const res = await fetch(`${BASE_URL}/api/v1/status/${jobId}`);

    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Failed to fetch job status");
    }

    return res.json();
}

/**
 * Check backend health.
 * @returns {Promise<{status: string, project: string, version: string, timestamp: string}>}
 */
export async function healthCheck() {
    const res = await fetch(`${BASE_URL}/`);
    if (!res.ok) throw new Error("Backend unreachable");
    return res.json();
}


/**
 * List all .ply files available in outputs/final/.
 * @returns {Promise<{files: Array<{filename, url, size_bytes, modified_at}>, count: number}>}
 */
export async function listPlyFiles() {
    const res = await fetch(`${BASE_URL}/api/v1/files`);
    if (!res.ok) throw new Error("Failed to list output files");
    return res.json(); // { files: [...], count }
}

/** Full backend base URL (for building download links) */
export { BASE_URL };
