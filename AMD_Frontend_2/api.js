/**
 * src/api.js
 * Thin wrapper for all Mirra Backend REST calls.
 */

const BASE_URL = "http://localhost:8000";

export async function uploadVideo(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE_URL}/api/v1/upload`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Upload failed");
  }
  return res.json();
}

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
  return res.json();
}

export async function pollStatus(jobId) {
  const res = await fetch(`${BASE_URL}/api/v1/status/${jobId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to fetch job status");
  }
  return res.json();
}

export async function healthCheck() {
  const res = await fetch(`${BASE_URL}/`);
  if (!res.ok) throw new Error("Backend unreachable");
  return res.json();
}

export async function listPlyFiles() {
  const res = await fetch(`${BASE_URL}/api/v1/files`);
  if (!res.ok) throw new Error("Failed to list output files");
  return res.json();
}

export { BASE_URL };
