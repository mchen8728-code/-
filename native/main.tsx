import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { RefreshCw } from "lucide-react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Network } from "@capacitor/network";
import { StatusBar, Style } from "@capacitor/status-bar";
import RoomPage from "@/app/room/page";
import ReadingRoom from "@/app/reading-room";
import SecondaryPageShell from "@/components/SecondaryPageShell";
import { appFetch } from "@/lib/platform";
import "@/app/globals.css";

const screens = {
  "/library": ["我的书架", "library"],
  "/notes": ["我的笔记", "notes"],
  "/reading": ["阅读", "reading"],
  "/timeline": ["共读时间轴", "timeline"],
  "/aftertaste": ["书后余味", "aftertaste"],
  "/bookplates": ["藏书票", "bookplates"],
  "/relations": ["阅读地图", "relations"],
  "/year": ["年度阅读长卷", "year"],
  "/old-notes": ["翻旧笔记", "old"],
} as const;

function NativeApp() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    window.history.replaceState({ nativeRoot: path === "/" }, "", path);
    const updatePath = () => setPath(window.location.pathname);
    window.addEventListener("popstate", updatePath);

    const click = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest("a");
      if (!anchor?.href) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin === window.location.origin) {
        event.preventDefault();
        window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
        setPath(url.pathname);
        window.scrollTo(0, 0);
      } else {
        event.preventDefault();
        void Browser.open({ url: url.toString() });
      }
    };
    document.addEventListener("click", click);

    const backListener = App.addListener("backButton", () => {
      const detail = { handled: false };
      window.dispatchEvent(new CustomEvent("reading-room:native-back", { detail }));
      if (detail.handled) return;
      if (window.location.pathname !== "/" || window.history.state?.roomSheet) window.history.back();
      else void App.exitApp();
    });
    void StatusBar.setStyle({ style: Style.Light });
    void StatusBar.setBackgroundColor({ color: "#eef0ec" });
    void Network.getStatus().then((status) => window.dispatchEvent(new CustomEvent("reading-room:network-status", { detail: { online: status.connected } })));
    const networkListener = Network.addListener("networkStatusChange", (status) => window.dispatchEvent(new CustomEvent("reading-room:network-status", { detail: { online: status.connected } })));

    return () => {
      window.removeEventListener("popstate", updatePath);
      document.removeEventListener("click", click);
      void backListener.then((listener) => listener.remove());
      void networkListener.then((listener) => listener.remove());
    };
  }, []);

  if (path === "/" || path === "/room") return <RoomPage />;
  const screen = screens[path as keyof typeof screens];
  if (!screen) return <RoomPage />;
  return <SecondaryPageShell title={screen[0]}><ReadingRoom section={screen[1]} /></SecondaryPageShell>;
}

function NativeSyncStatus() {
  const [online, setOnline] = useState(true);
  const [stale, setStale] = useState(false);
  const [state, setState] = useState<"idle" | "offline" | "restored" | "syncing" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const wasOnline = useRef(true);

  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ online?: boolean; reachable?: boolean; stale?: boolean; error?: string }>).detail;
      if (typeof detail?.online === "boolean") {
        const restored = !wasOnline.current && detail.online;
        wasOnline.current = detail.online;
        setOnline(detail.online);
        if (!detail.online) setState("offline");
        else if (restored) {
          setState("restored");
          setMessage("网络已恢复");
        }
      }
      if (typeof detail?.stale === "boolean") setStale(detail.stale);
    };
    const syncing = () => { setState("syncing"); setMessage("正在同步…"); };
    const success = () => {
      const syncedAt = new Date().toISOString();
      window.localStorage.setItem("reading-room:v1:last-sync-at", syncedAt);
      setStale(false);
      setState("success");
      setMessage("同步完成");
      window.setTimeout(() => setState((current) => current === "success" ? "idle" : current), 2400);
    };
    const failed = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setState("error");
      setMessage(detail?.message || "同步失败，请重试");
    };
    window.addEventListener("reading-room:network-status", update);
    window.addEventListener("reading-room:sync-start", syncing);
    window.addEventListener("reading-room:sync-success", success);
    window.addEventListener("reading-room:sync-error", failed);
    void Network.getStatus().then((status) => {
      wasOnline.current = status.connected;
      setOnline(status.connected);
      if (!status.connected) setState("offline");
    });
    return () => {
      window.removeEventListener("reading-room:network-status", update);
      window.removeEventListener("reading-room:sync-start", syncing);
      window.removeEventListener("reading-room:sync-success", success);
      window.removeEventListener("reading-room:sync-error", failed);
    };
  }, []);

  const retrySync = async () => {
    if (!online) return;
    if (window.location.pathname !== "/" && window.location.pathname !== "/room") {
      window.dispatchEvent(new Event("reading-room:retry-sync"));
      return;
    }
    setState("syncing");
    setMessage("正在同步…");
    try {
      const responses = await Promise.all([
        appFetch("/api/weread/shelf", { cache: "no-store" }),
        appFetch("/api/weread/notebooks", { cache: "no-store" }),
        appFetch("/api/weread/recent", { cache: "no-store" }),
      ]);
      if (responses.some((response) => !response.ok || response.headers.get("X-Reading-Room-Cache") === "stale")) {
        throw new Error("同步失败，请重试");
      }
      window.dispatchEvent(new Event("reading-room:sync-success"));
    } catch (error) {
      window.dispatchEvent(new CustomEvent("reading-room:sync-error", {
        detail: { message: error instanceof Error ? error.message : "同步失败，请重试" },
      }));
    }
  };

  if (state === "idle") return null;
  const label = state === "offline"
    ? `当前离线${stale ? " · 显示上次同步内容" : ""}`
    : message;
  return (
    <div className={`native-sync-status is-${state}`} role="status">
      <span>{label}</span>
      {(state === "offline" || state === "restored" || state === "error") && (
        <button
          type="button"
          disabled={!online}
          onClick={() => { void retrySync(); }}
        >
          <RefreshCw size={13} />重新同步
        </button>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<><NativeSyncStatus /><NativeApp /></>);
