"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/platform";
import { PlugZap, RefreshCw, X } from "lucide-react";

export default function WeReadConnection() {
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const statusRef = useRef(status);
  statusRef.current = status;
  const dialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(false);

  const check = useCallback(async () => {
    const response = await apiFetch("/api/weread/connection", { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    const data = await response.json() as { connected?: boolean; error?: string };
    if (!response.ok || !data.connected) throw new Error(data.error || "连接未恢复，请检查网络或更新 API Key。");
  }, []);

  const sync = useCallback(async (reconnect = false) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true); setError(""); setMessage(""); setStatus("checking");
    window.dispatchEvent(new Event("reading-room:sync-start"));
    try {
      await check();
      setStatus("online");
      setMessage("连接正常，正在更新阅读数据。");
      window.dispatchEvent(new Event("reading-room:retry-sync"));
    } catch (cause) {
      const reason = cause instanceof Error && cause.name === "Error" ? cause.message : "连接超时，请检查网络后重试。";
      setStatus("offline");
      setMessage(reason);
      setError(reason);
      if (reconnect) setOpen(true);
    } finally { locked.current = false; setBusy(false); }
  }, [check]);

  useEffect(() => {
    let active = true;
    void check().then(() => { if (active) setStatus("online"); }).catch(() => { if (active) setStatus("offline"); });
    const failed = () => { setStatus("offline"); setMessage("同步未完成，可能正在显示上次缓存。请刷新或重联。"); };
    const online = () => { void sync(); };
    const offline = () => { setStatus("offline"); setMessage("当前离线，联网后会自动尝试重联。"); };
    window.addEventListener("reading-room:sync-error", failed);
    const network = (event: Event) => {
      const detail = (event as CustomEvent<{ online?: boolean }>).detail;
      if (detail?.online === true && statusRef.current === "offline") online();
      else if (detail?.online === false) offline();
    };
    window.addEventListener("reading-room:network-status", network);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      active = false;
      window.removeEventListener("reading-room:sync-error", failed);
      window.removeEventListener("reading-room:network-status", network);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [check, sync]);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else { dialog.current?.close(); setKey(""); setError(""); }
  }, [open]);

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true; setBusy(true); setError("");
    try {
      const response = await apiFetch("/api/weread/connection", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key.trim() }), signal: AbortSignal.timeout(12_000),
      });
      const data = await response.json() as { connected?: boolean; error?: string };
      if (!response.ok || !data.connected) throw new Error(data.error || "接入失败，请重试。");
      // Discard old-account network caches only after the replacement is verified.
      try {
        for (const item of Object.keys(localStorage)) {
          if (item.startsWith("reading-room:v1:api-cache:")) localStorage.removeItem(item);
        }
      } catch { /* Storage restrictions must not turn a verified connection into a failure. */ }
      setKey(""); setOpen(false); setStatus("online"); setMessage("已重新接入，正在更新阅读数据。");
      window.dispatchEvent(new Event("reading-room:retry-sync"));
    } catch (cause) {
      setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "验证超时，请检查网络后重试。");
    } finally { locked.current = false; setBusy(false); }
  }

  return <>
    <section className="weread-connection" aria-label="微信读书连接">
      <span className={`weread-state is-${status}`} role="status">{status === "checking" ? "正在检查连接…" : status === "online" ? "微信读书已连接" : "微信读书待重联"}</span>
      <div className="weread-actions">
        <button type="button" disabled={busy} onClick={() => void sync()}><RefreshCw size={16} className={busy ? "spin" : ""} />刷新</button>
        <button type="button" disabled={busy} onClick={() => void sync(true)}><PlugZap size={16} />重联</button>
        <button type="button" disabled={busy} onClick={() => { setError(""); setOpen(true); }}>重新接入</button>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
    <dialog ref={dialog} className="weread-dialog" onCancel={(event) => { if (busy) event.preventDefault(); else setOpen(false); }} onClose={() => setOpen(false)} aria-labelledby="weread-connect-title">
      <header><h2 id="weread-connect-title">重新接入微信读书</h2><button type="button" disabled={busy} aria-label="关闭重新接入" onClick={() => setOpen(false)}><X size={20} /></button></header>
      <p>如果重联后仍无法同步，请填写微信读书提供的新 API Key。</p>
      <p><a href="https://weread.qq.com/r/weread-skills" target="_blank" rel="noreferrer">打开微信读书官方页面获取 API Key</a></p>
      <p className="weread-key-hint">复制完整的 wrk- 开头 Key。也支持带 Bearer 前缀的粘贴内容。</p>
      <form onSubmit={connect}>
        <label htmlFor="weread-api-key">微信读书 API Key</label>
        <input id="weread-api-key" autoFocus type="password" autoComplete="off" placeholder="粘贴完整的 wrk- 开头 API Key" value={key} onChange={(event) => setKey(event.target.value)} required maxLength={2048} disabled={busy} />
        <p className="weread-key-hint">验证成功后用于本设备的小屋同步，有效期 30 天。不会更改服务器及其他设备、ChatGPT MCP 的连接。</p>
        {error && <p className="weread-connect-error" role="alert">{error}</p>}
        <button className="weread-connect-submit" type="submit" disabled={busy || !key.trim()}>{busy ? "正在验证…" : "验证并重新接入"}</button>
      </form>
    </dialog>
  </>;
}
