// apiClient.js
// Vezlivo API client
// Connects the app to the Cloudflare Worker backend.

import { auth } from "./firebase.js";

const API_BASE_URL =
  "https://vezlivo-api.vezlivo-api.workers.dev";

async function apiRequest(path, options = {}) {
  const user = auth.currentUser;

  let token = null;

  if (user) {
    token = await user.getIdToken();
  }

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error || `API request failed: ${response.status}`
    );
  }

  return data;
}

export async function apiGet(path) {
  return apiRequest(path, {
    method: "GET",
  });
}

export async function apiPost(path, body = {}) {
  return apiRequest(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiPut(path, body = {}) {
  return apiRequest(path, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function apiDelete(path) {
  return apiRequest(path, {
    method: "DELETE",
  });
}

export { API_BASE_URL };