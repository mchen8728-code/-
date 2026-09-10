"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./PetWidget.module.css";

type PetAnimation =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review"
  | "look"
  | "sleeping"
  | "annoyed"
  | "happy"
  | "roll"
  | "eat"
  | "book-sleep"
  | "belly-up"
  | "yawn-stretch"
  | "enter-bed";

export type PetAnchor = "floor" | "desk" | "bookshelf" | "window" | "bed";

type Props = {
  bookId?: string;
  progress?: number;
  hasError?: boolean;
  initialAnchor?: PetAnchor;
};

type BubbleState = { id: number; text: string } | null;

const animations: Record<PetAnimation, { asset: string; frames: number; fps: number; label: string }> = {
  idle: { asset: "idle", frames: 6, fps: 4, label: "安静陪读" },
  "running-right": { asset: "running-right", frames: 8, fps: 9, label: "向右跑" },
  "running-left": { asset: "running-left", frames: 8, fps: 9, label: "向左跑" },
  waving: { asset: "waving", frames: 4, fps: 4, label: "挥手欢迎" },
  jumping: { asset: "jumping", frames: 5, fps: 7, label: "开心跳跃" },
  failed: { asset: "failed", frames: 8, fps: 4, label: "连接异常" },
  waiting: { asset: "waiting", frames: 6, fps: 3, label: "等你回来" },
  running: { asset: "running", frames: 6, fps: 7, label: "努力跟上" },
  review: { asset: "review", frames: 6, fps: 4, label: "认真读笔记" },
  look: { asset: "look", frames: 16, fps: 8, label: "看看新章节" },
  sleeping: { asset: "sleep", frames: 6, fps: 3, label: "睡着了" },
  annoyed: { asset: "failed", frames: 1, fps: 1, label: "有点不耐烦" },
  happy: { asset: "waving", frames: 1, fps: 1, label: "开心" },
  roll: { asset: "roll", frames: 6, fps: 5, label: "撒娇打滚" },
  eat: { asset: "eat", frames: 6, fps: 4, label: "吃东西" },
  "book-sleep": { asset: "book-sleep", frames: 6, fps: 3, label: "抱着书睡着" },
  "belly-up": { asset: "belly-up", frames: 6, fps: 4, label: "翻身露肚皮" },
  "yawn-stretch": { asset: "yawn-stretch", frames: 6, fps: 4, label: "打哈欠伸懒腰" },
  "enter-bed": { asset: "enter-bed", frames: 6, fps: 3, label: "钻进小窝" },
};

const inactivityDelay = 75_000;
const speechDuration = 4_000;
const anchorOffsets: Record<PetAnchor, { x: number; y: number }> = {
  floor: { x: 0, y: 0 },
  bed: { x: 0, y: 0 },
  desk: { x: -115, y: -76 },
  bookshelf: { x: -215, y: -38 },
  window: { x: -120, y: -165 },
};
const speechPools: Partial<Record<PetAnimation, string[]>> = {
  idle: ["干嘛呢", "偷偷看你。", "摸一下。", "哼哼。", "🐷", "这里暖和。", "我没有偷看。"],
  waiting: ["……", "有一点困。", "你是不是忘记我了", "我等一小会儿。"],
  look: ["翻到哪啦？", "我也要看。", "在看什么呀", "让我瞧瞧。"],
  waving: ["嗨。", "看到我啦？", "过来一点。"],
  sleeping: ["……", "困。", "别吵。"],
  annoyed: ["。", "你很闲吗", "哼。"],
  happy: ["嘿嘿。", "再摸一下。"],
  roll: ["看我打滚。", "再摸一下。"],
  eat: ["分你一口。", "好吃。"],
  "book-sleep": ["书先替我看着……", "困。"],
  "belly-up": ["肚皮给你摸一下。", "只许一下。"],
  "yawn-stretch": ["哈——欠。", "伸个懒腰。"],
  "enter-bed": ["回窝啦。", "这里暖和。"],
};

export default function PetWidget({ bookId, progress = 0, hasError = false, initialAnchor = "floor" }: Props) {
  const [animation, setAnimation] = useState<PetAnimation>("waving");
  const [frame, setFrame] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [speech, setSpeech] = useState<BubbleState>(null);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [anchor, setAnchor] = useState<PetAnchor>(initialAnchor);
  const animationRef = useRef<PetAnimation>("waving");
  const initialBook = useRef(true);
  const previousProgress = useRef(progress);
  const temporaryUntil = useRef(0);
  const temporaryTimer = useRef<number | null>(null);
  const speechCount = useRef(0);
  const clickTimes = useRef<number[]>([]);
  const speechHideTimer = useRef<number | null>(null);
  const controlsHideTimer = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressTriggered = useRef(false);
  const bubbleId = useRef(0);
  const dragStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const didDrag = useRef(false);
  const lastTapHandled = useRef(0);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const playTemporary = useCallback((next: PetAnimation, duration = 2400) => {
    if (hasError) return;
    temporaryUntil.current = Date.now() + duration;
    setAnimation(next);
    if (temporaryTimer.current) window.clearTimeout(temporaryTimer.current);
    temporaryTimer.current = window.setTimeout(() => {
      temporaryUntil.current = 0;
      setAnimation("idle");
    }, duration);
  }, [hasError]);

  const showSpeech = useCallback((line: string) => {
    if (speechHideTimer.current) window.clearTimeout(speechHideTimer.current);
    bubbleId.current += 1;
    setSpeech({ id: bubbleId.current, text: line });
    speechHideTimer.current = window.setTimeout(() => setSpeech(null), speechDuration);
  }, []);

  useEffect(() => {
    animationRef.current = animation;
    window.dispatchEvent(new CustomEvent("reading-room:pet-state", { detail: { state: animation } }));
  }, [animation]);

  useEffect(() => {
    const setState = (event: Event) => {
      const next = (event as CustomEvent<{ state?: PetAnimation }>).detail?.state;
      if (!next || !(next in animations)) return;
      if (temporaryTimer.current) window.clearTimeout(temporaryTimer.current);
      temporaryUntil.current = next === "sleeping" ? Number.MAX_SAFE_INTEGER : Date.now() + 2800;
      setAnimation(next);
      if (next !== "sleeping") {
        temporaryTimer.current = window.setTimeout(() => {
          temporaryUntil.current = 0;
          setAnimation("idle");
        }, 2800);
      }
    };
    const speak = () => interactRef.current?.();
    window.addEventListener("reading-room:pet-set-state", setState);
    window.addEventListener("reading-room:pet-speak", speak);
    return () => { window.removeEventListener("reading-room:pet-set-state", setState); window.removeEventListener("reading-room:pet-speak", speak); };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    const frame = window.requestAnimationFrame(() => {
      setCollapsed(window.localStorage.getItem("reading-room:v1:pet-collapsed") === "true");
      setSpeechEnabled(window.localStorage.getItem("reading-room:v1:pet-speech") !== "false");
      const savedAnchor = window.localStorage.getItem("reading-room:v1:pet-anchor") as PetAnchor | null;
      if (savedAnchor && ["floor", "desk", "bookshelf", "window", "bed"].includes(savedAnchor)) {
        setAnchor(savedAnchor);
        setDragOffset(anchorOffsets[savedAnchor]);
      }
      update();
    });
    media.addEventListener("change", update);
    return () => {
      window.cancelAnimationFrame(frame);
      media.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    const moveToAnchor = (event: Event) => {
      const next = (event as CustomEvent<{ anchor?: PetAnchor }>).detail?.anchor;
      if (!next || !["floor", "desk", "bookshelf", "window", "bed"].includes(next)) return;
      setAnchor(next);
      setDragOffset(anchorOffsets[next]);
      window.localStorage.setItem("reading-room:v1:pet-anchor", next);
    };
    window.addEventListener("reading-room:pet-anchor", moveToAnchor);
    return () => window.removeEventListener("reading-room:pet-anchor", moveToAnchor);
  }, []);

  useEffect(() => {
    const dismissSpeech = () => {
      setSpeech(null);
      setControlsVisible(false);
    };
    window.addEventListener("reading-room:pet-dismiss-speech", dismissSpeech);
    return () => window.removeEventListener("reading-room:pet-dismiss-speech", dismissSpeech);
  }, []);

  useEffect(() => {
    const welcome = window.setTimeout(() => {
      temporaryUntil.current = 0;
      setAnimation("idle");
    }, 2800);
    return () => window.clearTimeout(welcome);
  }, []);

  useEffect(() => {
    if (!bookId) return;
    if (initialBook.current) {
      initialBook.current = false;
      return;
    }
    playTemporary("look", 2300);
  }, [bookId, playTemporary]);

  useEffect(() => {
    if (previousProgress.current < 100 && progress >= 100) {
      playTemporary("jumping", 2800);
    }
    previousProgress.current = progress;
  }, [playTemporary, progress]);

  useEffect(() => {
    let inactivityTimer = window.setTimeout(() => {
      if (!hasError && Date.now() >= temporaryUntil.current) setAnimation("sleeping");
    }, inactivityDelay);
    let lastActivity = 0;

    const markReading = () => {
      const now = Date.now();
      if (now - lastActivity < 800) return;
      lastActivity = now;
      if (!hasError && now >= temporaryUntil.current && animation === "look") {
        setAnimation("idle");
      }
      window.clearTimeout(inactivityTimer);
      inactivityTimer = window.setTimeout(() => {
        if (!hasError && Date.now() >= temporaryUntil.current) setAnimation("sleeping");
      }, inactivityDelay);
    };

    const activityEvents: Array<keyof WindowEventMap> = ["scroll", "pointerdown", "keydown", "touchstart"];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, markReading, { passive: true }));
    return () => {
      window.clearTimeout(inactivityTimer);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, markReading));
    };
  }, [animation, hasError]);

  useEffect(() => {
    const review = () => playTemporary("review", 2500);
    const navigate = () => playTemporary("look", 2300);
    const complete = () => playTemporary("jumping", 2800);
    const fail = () => playTemporary("failed", 3000);
    const syncStart = () => {
      if (temporaryTimer.current) window.clearTimeout(temporaryTimer.current);
      temporaryUntil.current = Number.MAX_SAFE_INTEGER;
      setAnimation("waiting");
    };
    const syncSuccess = () => playTemporary("waving", 2400);
    const syncHappy = () => playTemporary("happy", 2200);
    const roomInteraction = () => playTemporary("look", 1800);
    const showUpdate = () => {
      setCollapsed(false);
      setUpdateAvailable(true);
    };
    window.addEventListener("reading-room:share-to-chatgpt", review);
    window.addEventListener("reading-room:review", review);
    window.addEventListener("reading-room:navigate", navigate);
    window.addEventListener("reading-room:chapter-complete", complete);
    window.addEventListener("reading-room:data-error", fail);
    window.addEventListener("reading-room:mcp-error", fail);
    window.addEventListener("reading-room:sync-start", syncStart);
    window.addEventListener("reading-room:sync-success", syncSuccess);
    window.addEventListener("reading-room:sync-happy", syncHappy);
    window.addEventListener("reading-room:pet-room-interaction", roomInteraction);
    window.addEventListener("reading-room:update-available", showUpdate);
    return () => {
      window.removeEventListener("reading-room:share-to-chatgpt", review);
      window.removeEventListener("reading-room:review", review);
      window.removeEventListener("reading-room:navigate", navigate);
      window.removeEventListener("reading-room:chapter-complete", complete);
      window.removeEventListener("reading-room:data-error", fail);
      window.removeEventListener("reading-room:mcp-error", fail);
      window.removeEventListener("reading-room:sync-start", syncStart);
      window.removeEventListener("reading-room:sync-success", syncSuccess);
      window.removeEventListener("reading-room:sync-happy", syncHappy);
      window.removeEventListener("reading-room:pet-room-interaction", roomInteraction);
      window.removeEventListener("reading-room:update-available", showUpdate);
    };
  }, [playTemporary]);

  useEffect(() => {
    if (!speechEnabled || collapsed || updateAvailable || speechCount.current >= 2) return;
    let timer = 0;
    let hideTimer = 0;
    const schedule = (delay = 65_000 + Math.floor(Math.random() * 85_000)) => {
      timer = window.setTimeout(() => {
        const active = document.activeElement;
        const isTyping = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
        const busy = Boolean(document.querySelector('[aria-modal="true"]'));
        if (isTyping || busy || document.hidden) {
          schedule(35_000 + Math.floor(Math.random() * 35_000));
          return;
        }
        const pool = speechPools[animationRef.current] || speechPools.idle!;
        showSpeech(pool[Math.floor(Math.random() * pool.length)]);
        speechCount.current += 1;
        hideTimer = window.setTimeout(() => {
          if (speechCount.current < 2) schedule();
        }, speechDuration);
      }, delay);
    };
    schedule();
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(hideTimer);
    };
  }, [collapsed, showSpeech, speechEnabled, updateAvailable]);

  useEffect(() => {
    const config = animations[hasError ? "failed" : animation];
    if (collapsed || reduceMotion) return;
    let request = 0;
    let lastFrame = performance.now();
    const frameDuration = 1000 / config.fps;

    const tick = (now: number) => {
      if (!document.hidden && now - lastFrame >= frameDuration) {
        const steps = Math.floor((now - lastFrame) / frameDuration);
        lastFrame += steps * frameDuration;
        setFrame((current) => (current + steps) % config.frames);
      }
      request = window.requestAnimationFrame(tick);
    };
    request = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(request);
  }, [animation, collapsed, hasError, reduceMotion]);

  useEffect(() => setFrame(0), [animation]);

  useEffect(() => () => {
    if (temporaryTimer.current) window.clearTimeout(temporaryTimer.current);
    if (speechHideTimer.current) window.clearTimeout(speechHideTimer.current);
    if (controlsHideTimer.current) window.clearTimeout(controlsHideTimer.current);
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
  }, []);

  const visibleAnimation: PetAnimation = hasError ? "failed" : animation;
  const config = animations[visibleAnimation];
  const visibleFrame = frame % config.frames;
  const spriteStyle: CSSProperties = { width: "96px", height: "104px" };
  const frameName = String(visibleFrame).padStart(2, "0");
  const spriteSrc = `/pet/frames/${config.asset}/${frameName}.png`;
  const widgetStyle: CSSProperties = {
    transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`,
  };

  const finishDrag = () => {
    const current = dragStart.current;
    if (!current) return;
    const candidates = Object.entries(anchorOffsets) as Array<[PetAnchor, { x: number; y: number }]>;
    const nearest = candidates.sort((a, b) => {
      const da = Math.hypot(current.offsetX - a[1].x, current.offsetY - a[1].y);
      const db = Math.hypot(current.offsetX - b[1].x, current.offsetY - b[1].y);
      return da - db;
    })[0];
    setDragOffset(nearest[1]);
    setAnchor(nearest[0]);
    window.localStorage.setItem("reading-room:v1:pet-anchor", nearest[0]);
    dragStart.current = null;
  };

  const interact = () => {
    const now = Date.now();
    if (now - lastTapHandled.current < 350) return;
    lastTapHandled.current = now;
    console.log("[Pet] clicked");
    clickTimes.current = [...clickTimes.current.filter((time) => now - time < 7000), now];
    const clickActions: PetAnimation[] = ["waving", "jumping", "look", "roll", "belly-up"];
    const next = clickTimes.current.length >= 4 ? "annoyed" : clickActions[Math.floor(Math.random() * clickActions.length)];
    const pool = speechPools[next] || speechPools.idle!;
    showSpeech(pool[Math.floor(Math.random() * pool.length)]);
    playTemporary(next, next === "annoyed" ? 1800 : 2400);
    if (next === "annoyed") clickTimes.current = [];
  };
  const interactRef = useRef(interact);
  interactRef.current = interact;

  const revealControls = () => {
    setControlsVisible(true);
    if (controlsHideTimer.current) window.clearTimeout(controlsHideTimer.current);
    controlsHideTimer.current = window.setTimeout(() => setControlsVisible(false), 5_000);
  };

  if (collapsed) {
    return (
      <button className={styles.collapsed} type="button" onClick={() => { setCollapsed(false); window.localStorage.setItem("reading-room:v1:pet-collapsed", "false"); playTemporary("waving"); }} aria-label="展开阿砚">
        <span aria-hidden="true" />
      </button>
    );
  }

  return (
    <aside className={styles.widget} style={widgetStyle} aria-label={`砚猪：${config.label}`} data-pet-animation={visibleAnimation} data-pet-anchor={anchor}>
      {updateAvailable && (
        <div className={styles.updateBubble} role="status">
          <button className={styles.dismissUpdate} type="button" onClick={() => setUpdateAvailable(false)} aria-label="暂不更新">×</button>
          <strong>🐷 阿砚发现小屋装修好了！</strong>
          <button type="button" onClick={() => window.dispatchEvent(new Event("reading-room:apply-update"))}>立即更新</button>
        </div>
      )}
      {!updateAvailable && speech && (
        <button key={speech.id} className={styles.speechBubble} type="button" onClick={() => { setSpeech(null); playTemporary("waving", 2200); }} aria-label="阿砚说的话，点击回应">
          {speech.text}
        </button>
      )}
      <button className={`${styles.speechToggle} ${controlsVisible ? styles.controlVisible : ""}`} type="button" onClick={() => {
        const next = !speechEnabled;
        setSpeechEnabled(next);
        setSpeech(null);
        window.localStorage.setItem("reading-room:v1:pet-speech", String(next));
      }} aria-label={`阿砚主动搭话：${speechEnabled ? "开" : "关"}`} title={`阿砚主动搭话：${speechEnabled ? "开" : "关"}`}>{speechEnabled ? "💬" : "…"}</button>
      <button className={`${styles.collapseControl} ${controlsVisible ? styles.controlVisible : ""}`} type="button" onClick={() => { setCollapsed(true); window.localStorage.setItem("reading-room:v1:pet-collapsed", "true"); }} aria-label="收起阿砚">−</button>
      <button className={styles.petButton} type="button" onPointerDown={(event) => {
        dragStart.current = { x: event.clientX, y: event.clientY, offsetX: dragOffset.x, offsetY: dragOffset.y };
        didDrag.current = false;
        longPressTriggered.current = false;
        if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
        longPressTimer.current = window.setTimeout(() => {
          longPressTriggered.current = true;
          revealControls();
        }, 560);
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }} onPointerMove={(event) => {
        const start = dragStart.current;
        if (!start) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.hypot(dx, dy) < 6) return;
        didDrag.current = true;
        if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
        const nextX = Math.max(-250, Math.min(20, start.offsetX + dx));
        const nextY = Math.max(-210, Math.min(20, start.offsetY + dy));
        setDragOffset({ x: nextX, y: nextY });
        dragStart.current = { ...start, offsetX: nextX, offsetY: nextY };
      }} onPointerUp={() => {
        if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
        const wasDrag = didDrag.current;
        if (dragStart.current) finishDrag();
        if (!wasDrag && !longPressTriggered.current) interact();
      }} onPointerCancel={() => {
        if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
        if (dragStart.current) finishDrag();
      }} onClick={() => {
        if (!longPressTriggered.current) interact();
        longPressTriggered.current = false;
      }} aria-label="和阿砚打招呼，长按打开控制">
          <img className={styles.sprite} style={spriteStyle} src={spriteSrc} alt="" draggable={false} aria-hidden="true" />
      </button>
    </aside>
  );
}
