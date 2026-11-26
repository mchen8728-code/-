import { NextRequest, NextResponse } from "next/server";
import { wereadApi, connectionFailure } from "@/lib/weread";
import { WEREAD_KEY_COOKIE } from "@/lib/weread-key";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await wereadApi("/shelf/sync");
    return NextResponse.json({ connected: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const failure = connectionFailure(error);
    console.warn("[weread] connection check failed", { code: failure.code, upstreamStatus: failure.upstreamStatus, upstreamCode: failure.upstreamCode });
    return NextResponse.json({ connected: false, ...failure }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  // This public Site accepts only a browser-local credential, never changes the shared server key.
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "请在小屋页面内重新接入" }, { status: 403 });
  }
  if (Number(request.headers.get("content-length") || 0) > 4096) {
    return NextResponse.json({ error: "API Key 过长" }, { status: 400 });
  }
  let apiKey: unknown;
  try { apiKey = (await request.json() as { apiKey?: unknown }).apiKey; } catch {
    return NextResponse.json({ error: "请填写有效的 API Key" }, { status: 400 });
  }
  if (typeof apiKey === "string") apiKey = apiKey.trim().replace(/^Bearer\s+/i, "");
  if (typeof apiKey !== "string" || !apiKey.trim() || apiKey.length > 2048 || /[\s\x00-\x1f\x7f]/.test(apiKey.trim())) {
    return NextResponse.json({ error: "请填写有效的 API Key（无需 Bearer 前缀）" }, { status: 400 });
  }
  try {
    await wereadApi("/shelf/sync", {}, apiKey.trim());
    const response = NextResponse.json({ connected: true }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(WEREAD_KEY_COOKIE, apiKey.trim(), { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return response;
  } catch (error) {
    const failure = connectionFailure(error);
    console.warn("[weread] credential verification failed", { code: failure.code, upstreamStatus: failure.upstreamStatus, upstreamCode: failure.upstreamCode });
    return NextResponse.json({ ...failure, error: `${failure.error} 原连接设置已保留。` }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
