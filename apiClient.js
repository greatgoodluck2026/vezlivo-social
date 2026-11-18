// File: src/apiClient.js

// Replace "192.168.43.150" below with your HP EliteBook's actual IPv4 address from ipconfig
const LAPTOP_LOCAL_IP = "192.168.43.150";

const API_BASE_URL =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : `http://${LAPTOP_LOCAL_IP}:3000`;

async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      ...options,
      headers,
    }
  );

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text ? text.slice(0, 150) : `API request failed: ${response.status}` };
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      `API request failed: ${response.status}`
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

// Custom direct Velox sync function matching your SDK snippet
export async function veloxSync(userData) {
  return apiPost("/identity/sync", userData);
}

export async function apiUpload(path, formData) {
  const headers = {};

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      method: "POST",
      headers,
      body: formData,
    }
  );

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text ? text.slice(0, 150) : `API upload failed: ${response.status}` };
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      `API upload failed: ${response.status}`
    );
  }

  return data;
}

export { API_BASE_URL };