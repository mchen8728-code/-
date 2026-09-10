"use client";

import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { isNativeApp } from "@/lib/platform";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function PwaInstallButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const announcedWorker = useRef<ServiceWorker | null>(null);
  const updateRequested = useRef(false);

  useEffect(() => {
    if (isNativeApp()) return;
    const savePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setInstalled(false);
    };
    const markInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    const applyUpdate = () => {
      const waiting = registration.current?.waiting;
      if (!waiting) return;
      updateRequested.current = true;
      waiting.postMessage({ type: "SKIP_WAITING" });
    };
    const reloadForUpdate = () => {
      if (!updateRequested.current) return;
      updateRequested.current = false;
      window.location.reload();
    };
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void registration.current?.update();
    };

    window.addEventListener("beforeinstallprompt", savePrompt);
    window.addEventListener("appinstalled", markInstalled);
    if ("serviceWorker" in navigator) {
      const announceUpdate = (worker: ServiceWorker | null) => {
        if (!worker || !navigator.serviceWorker.controller || announcedWorker.current === worker) return;
        announcedWorker.current = worker;
        window.dispatchEvent(new Event("reading-room:update-available"));
      };
      navigator.serviceWorker.register("/sw.js?v=5", { scope: "/" }).then((registered) => {
        registration.current = registered;
        announceUpdate(registered.waiting);
        registered.addEventListener("updatefound", () => {
          const worker = registered.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed") announceUpdate(registered.waiting || worker);
          });
        });
      }).catch(() => undefined);

      window.addEventListener("reading-room:apply-update", applyUpdate);
      document.addEventListener("visibilitychange", checkWhenVisible);
      navigator.serviceWorker.addEventListener("controllerchange", reloadForUpdate);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", savePrompt);
      window.removeEventListener("appinstalled", markInstalled);
      window.removeEventListener("reading-room:apply-update", applyUpdate);
      document.removeEventListener("visibilitychange", checkWhenVisible);
      navigator.serviceWorker?.removeEventListener("controllerchange", reloadForUpdate);
    };
  }, []);

  if (isNativeApp()) return null;
  if (installed || !installPrompt) return null;

  return (
    <button
      className="pwa-install"
      type="button"
      onClick={async () => {
        await installPrompt.prompt();
        await installPrompt.userChoice;
        setInstallPrompt(null);
      }}
      aria-label="安装璟璟的共读小屋"
    >
      <Download size={15} />
      <span>安装应用</span>
    </button>
  );
}
