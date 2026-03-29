import { tokenActual } from "./auth.js";

const base = "";

export async function apiJson(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const t = tokenActual();
  if (t) headers["Authorization"] = "Bearer " + t;
  if (options.body && typeof options.body === "object" && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(base + path, { ...options, headers });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data?.error || res.statusText || "Error API");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function wsSyncUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return proto + "//" + window.location.host + "/ws/sync";
}
