import { Capacitor } from "@capacitor/core";

const NATIVE_API_ORIGIN = "https://jingjing-weread-room.mchen8728.chatgpt.site";
const apiCachePrefix = "reading-room:v1:api-cache:";

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export function apiUrl(path: string) {
  return isNativeApp() && path.startsWith("/api/")
    ? new URL(path, NATIVE_API_ORIGIN).toString()
    : path;
}

export async function appFetch(input: string, init: RequestInit = {}) {
  const cacheable = input.startsWith("/api/weread/") && (!init.method || init.method === "GET");
  const cacheKey = `${apiCachePrefix}${input}`;
  const requestUrl = apiUrl(input);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  const abort = () => controller.abort();
  init.signal?.addEventListener("abort", abort, { once: true });

  try {
    const response = await fetch(requestUrl, { ...init, signal: controller.signal });
    const contentType = response.headers.get("content-type") ?? "";
    if (cacheable && response.ok && !contentType.includes("application/json")) {
      throw new Error(`同步接口返回了非 JSON 内容 (${contentType || "unknown"})`);
    }
    if (cacheable && response.ok) {
      const body = await response.clone().text();
      window.localStorage.setItem(cacheKey, JSON.stringify({ body, savedAt: new Date().toISOString() }));
    }
    if (cacheable && !response.ok) {
      reportSyncError(requestUrl, `HTTP ${response.status}`);
      const cached = cachedResponse(cacheKey);
      if (cached) return cached;
    }
    window.dispatchEvent(new CustomEvent("reading-room:network-status", { detail: { online: true, reachable: response.ok, stale: false } }));
    return response;
  } catch (error) {
    const message = error instanceof Error
      ? error.name === "AbortError" ? "请求超时" : error.message
      : "Network Error";
    reportSyncError(requestUrl, message, error);
    if (cacheable) {
      const cached = cachedResponse(cacheKey);
      if (cached) return cached;
    }
    window.dispatchEvent(new CustomEvent("reading-room:network-status", { detail: { reachable: false, stale: false, error: message } }));
    throw error;
  } finally {
    window.clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abort);
  }
}

function reportSyncError(url: string, message: string, cause?: unknown) {
  console.error("[reading-room] WeRead sync failed", { url, message, cause });
  window.dispatchEvent(new CustomEvent("reading-room:sync-error", { detail: { url, message } }));
}

function cachedResponse(cacheKey: string) {
  try {
    const stored = window.localStorage.getItem(cacheKey);
    if (!stored) return null;
    const cached = JSON.parse(stored) as { body: string; savedAt: string };
    window.dispatchEvent(new CustomEvent("reading-room:network-status", { detail: { reachable: false, stale: true, savedAt: cached.savedAt } }));
    return new Response(cached.body, { status: 200, headers: { "Content-Type": "application/json", "X-Reading-Room-Cache": "stale" } });
  } catch {
    return null;
  }
}
