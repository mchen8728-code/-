import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Network } from "@capacitor/network";
import { StatusBar, Style } from "@capacitor/status-bar";
import RoomPage from "@/app/room/page";
import ReadingRoom from "@/app/reading-room";
import SecondaryPageShell from "@/components/SecondaryPageShell";
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

function NativeNetworkBanner() {
  const [offline, setOffline] = useState(false);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ online?: boolean; stale?: boolean }>).detail;
      setOffline(detail?.online === false);
      if (typeof detail?.stale === "boolean") setStale(detail.stale);
    };
    window.addEventListener("reading-room:network-status", update);
    void Network.getStatus().then((status) => setOffline(!status.connected));
    return () => window.removeEventListener("reading-room:network-status", update);
  }, []);
  if (!offline) return null;
  return <div className="native-offline-banner" role="status">当前离线{stale ? " · 显示上次同步内容" : ""}</div>;
}

createRoot(document.getElementById("root")!).render(<><NativeNetworkBanner /><NativeApp /></>);
