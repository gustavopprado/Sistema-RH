// frontend/src/services/apiClient.js
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export async function apiRequest(path, options = {}) {
  const url = `${API_URL}${path}`;
  const resp = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status} - ${text || resp.statusText}`);
  }

  return resp.json();
}
