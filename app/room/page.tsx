"use client";

import { Archive, BookHeart, CloudSun, Lamp, Library, Link2, RefreshCw, Sofa, Table2, TicketCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import PetWidget, { type PetAnchor } from "@/components/PetWidget";
import PwaInstallButton from "@/components/PwaInstallButton";
import { getOldItems, pickOldItem, type OldItem } from "@/components/journal/ReadingJournal";
import { readReadingMemory } from "@/lib/local-reading";
import { appFetch } from "@/lib/platform";

const anchors: Array<{ id: PetAnchor; label: string; icon: typeof Library }> = [
  { id: "bookshelf", label: "书架", icon: Library },
  { id: "desk", label: "书桌", icon: Table2 },
  { id: "window", label: "窗边", icon: CloudSun },
  { id: "bed", label: "猪窝", icon: Sofa },
];

const petNestActions = [
  { state: "roll", label: "撒娇打滚" },
  { state: "eat", label: "吃点东西" },
  { state: "book-sleep", label: "抱书打盹" },
  { state: "belly-up", label: "翻肚皮" },
  { state: "yawn-stretch", label: "伸懒腰" },
  { state: "enter-bed", label: "钻进小窝" },
] as const;

export default function RoomPage() {
  const [welcome, setWelcome] = useState(true);
  const [panel, setPanel] = useState<"recent" | "notes" | null>(null);
  const [nestOpen, setNestOpen] = useState(false);
  const [petState, setPetState] = useState("idle");
  const [showHotspotLabels, setShowHotspotLabels] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [littleThingsOpen, setLittleThingsOpen] = useState(false);
  const [oldThing, setOldThing] = useState<OldItem | null>(null);
  const [oldThingTried, setOldThingTried] = useState(false);
  useEffect(() => {
    if (!showHotspotLabels) return;
    const timer = window.setTimeout(() => setShowHotspotLabels(false), 3000);
    return () => window.clearTimeout(timer);
  }, [showHotspotLabels]);
  useEffect(() => { const onState = (e: Event) => setPetState((e as CustomEvent<{state?: string}>).detail?.state || "idle"); window.addEventListener("reading-room:pet-state", onState); return () => window.removeEventListener("reading-room:pet-state", onState); }, []);
  useEffect(() => {
    const onNativeBack = (event: Event) => {
      const detail = (event as CustomEvent<{ handled: boolean }>).detail;
      if (littleThingsOpen) { detail.handled = true; window.history.back(); return; }
      if (nestOpen) { detail.handled = true; setNestOpen(false); return; }
      if (panel) { detail.handled = true; setPanel(null); return; }
      if (menuOpen) { detail.handled = true; setMenuOpen(false); }
    };
    window.addEventListener("reading-room:native-back", onNativeBack);
    return () => window.removeEventListener("reading-room:native-back", onNativeBack);
  }, [littleThingsOpen, menuOpen, nestOpen, panel]);
  useEffect(() => {
    if (!littleThingsOpen) return;
    window.history.pushState({ roomSheet: "little-things" }, "");
    const onPopState = () => setLittleThingsOpen(false);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [littleThingsOpen]);
  const [recent, setRecent] = useState<Array<{ bookId: string; title: string; chapterTitle: string | null; progress: number }>>([]);
  const [notes, setNotes] = useState<Array<{ bookId: string; title: string; totalNotes: number; readingProgress: number }>>([]);
  const [panelLoading, setPanelLoading] = useState(false);

  const openPanel = (next: "recent" | "notes") => {
    setPanelLoading(true);
    setPanel(next);
  };

  useEffect(() => {
    if (!panel) return;
    const endpoint = panel === "recent" ? "/api/weread/recent" : "/api/weread/notebooks";
    appFetch(endpoint, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("暂时没同步好");
        return response.json() as Promise<{ books?: Array<{ bookId: string; title: string; chapterTitle?: string | null; progress?: number; totalNotes?: number; readingProgress?: number }> }>;
      })
      .then((data) => {
        if (panel === "recent") setRecent((data.books ?? []).map((book) => ({ bookId: book.bookId, title: book.title, chapterTitle: book.chapterTitle ?? null, progress: book.progress ?? 0 })));
        else setNotes((data.books ?? []).map((book) => ({ bookId: book.bookId, title: book.title, totalNotes: book.totalNotes ?? 0, readingProgress: book.readingProgress ?? 0 })));
      })
      .catch(() => { if (panel === "recent") setRecent([]); else setNotes([]); })
      .finally(() => setPanelLoading(false));
  }, [panel]);

  const movePet = (anchor: PetAnchor) => {
    window.dispatchEvent(new CustomEvent("reading-room:pet-anchor", { detail: { anchor } }));
    window.dispatchEvent(new CustomEvent("reading-room:pet-room-interaction", { detail: { anchor } }));
  };

  const closeLittleThings = () => {
    if (window.history.state?.roomSheet === "little-things") window.history.back();
    else setLittleThingsOpen(false);
  };

  const pullOldThing = () => {
    const candidates = getOldItems(readReadingMemory());
    setOldThingTried(true);
    setOldThing(pickOldItem(candidates, oldThing));
  };

  return (
    <main className="room-page">
      <header className="room-topbar">
        <span className="room-back-spacer" aria-hidden="true" />
        <div className="room-title"><span>🏠</span><div><h1>我的小屋</h1><p>阿砚在这里住着</p></div></div>
        <button className="room-menu" type="button" onClick={() => setMenuOpen(true)} aria-label="打开全部功能">☰</button>
      </header>

      {menuOpen && <div className="room-menu-backdrop" role="presentation" onClick={() => setMenuOpen(false)}><aside className="room-menu-panel" role="dialog" aria-modal="true" aria-label="全部功能" onClick={(event) => event.stopPropagation()}><header><strong>小屋目录</strong><button type="button" onClick={() => setMenuOpen(false)} aria-label="关闭">×</button></header><nav><section className="room-menu-group"><h2>阅读</h2><div><a href="/library">书架</a><a href="/reading">最近在读</a><a href="/notes">笔记</a><a href="/reading">共读</a></div></section><section className="room-menu-group"><h2>留下的东西</h2><div><a href="/timeline">时间轴</a><a href="/aftertaste">书后余味</a><a href="/bookplates">藏书票</a><a href="/relations">关系卡</a></div></section><section className="room-menu-group"><h2>其他</h2><div><a href="/year">年度阅读长卷</a><a href="/old-notes">翻旧笔记</a></div></section></nav></aside></div>}

      <section className={`room-stage ${showHotspotLabels ? "room-labels-visible" : ""}`} aria-label="璟璟的阅读小屋" onClick={() => { setShowHotspotLabels(true); window.dispatchEvent(new Event("reading-room:pet-dismiss-speech")); }}>
        <div className="room-layer room-wall" aria-hidden="true"><div className="wall-frame"><span>今天也在读</span><strong>慢一点，读进去。</strong></div><div className="wall-pictures"><i /><i /><i /></div></div>
        <div className="room-layer room-window-layer"><button className="window-anchor" type="button" onClick={() => movePet("window")} aria-label="把阿砚移到窗边"><div className="window-sky"><CloudSun size={24} /></div><span>窗外</span></button></div>
        <div className="room-layer room-furniture" aria-hidden="true"><div className="bookcase-art"><span /><span /><span /><span /><span /><span /></div><div className="desk-art"><div className="desk-lamp"><Lamp size={23} /></div><div className="desk-paper" /><div className="desk-cup" /></div><div className="rug-art" /><div className="bed-art"><span>🐷</span></div><div className="drawer-art"><Archive size={21} /></div></div>
        <div className="room-layer room-hotspots" aria-label="小屋互动区域"><button className="scene-hotspot shelf-hotspot" type="button" onClick={(e) => { e.stopPropagation(); movePet("bookshelf"); openPanel("recent"); }} aria-label="打开书架和最近在看"><Library size={18} /><span>书架</span></button><button className="scene-hotspot desk-hotspot" type="button" onClick={(e) => { e.stopPropagation(); movePet("desk"); openPanel("notes"); }} aria-label="打开书桌和我的笔记"><Table2 size={18} /><span>笔记</span></button><button className="scene-hotspot drawer-hotspot" type="button" onClick={(e) => { e.stopPropagation(); setLittleThingsOpen(true); }} aria-label="打开璟璟的小破烂"><Archive size={17} /><span>小破烂</span></button><button className="scene-hotspot bed-hotspot" type="button" onClick={(e) => { e.stopPropagation(); movePet("bed"); setNestOpen(true); }} aria-label="打开阿砚的窝"><Sofa size={18} /><span>阿砚的窝</span></button></div>
        <div className="room-floor-label">我的小屋 · 安静读一会儿</div>
      </section>

      <section className="room-controls" aria-label="小屋场景锚点"><div><span className="eyebrow">PET ANCHORS</span><h2>把阿砚拎到房间里</h2></div><div className="anchor-list">{anchors.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => movePet(id)}><Icon size={16} />{label}</button>)}</div></section>

      {panel && <div className="room-panel-backdrop" role="presentation" onClick={() => setPanel(null)}><section className="room-panel" role="dialog" aria-modal="true" aria-labelledby="room-panel-title" onClick={(event) => event.stopPropagation()}><header><div><span className="eyebrow">{panel === "recent" ? "RECENT READING" : "MY NOTES"}</span><h2 id="room-panel-title">{panel === "recent" ? "最近在看" : "我的笔记"}</h2></div><button type="button" onClick={() => setPanel(null)} aria-label="关闭"><X size={18} /></button></header>{panelLoading && <p className="room-panel-empty">阿砚正在翻找……</p>}{!panelLoading && panel === "recent" && (recent.length ? recent.map((book) => <button className="room-book-row" key={book.bookId} type="button" onClick={() => { window.localStorage.setItem("reading-room:v1:last-book", book.bookId); window.location.href = "/"; }}><span><strong>《{book.title}》</strong><small>{book.chapterTitle || "最近章节暂缺"}</small></span><b>{book.progress}%</b></button>) : <p className="room-panel-empty">微信读书暂时没有返回最近阅读记录。</p>)}{!panelLoading && panel === "notes" && (notes.length ? notes.map((book) => <button className="room-book-row" key={book.bookId} type="button" onClick={() => { window.localStorage.setItem("reading-room:v1:last-book", book.bookId); window.location.href = "/#my-notes"; }}><span><strong>《{book.title}》</strong><small>{book.totalNotes} 条笔记</small></span><b>{book.readingProgress}%</b></button>) : <p className="room-panel-empty">暂时没有可同步的笔记。</p>)}</section></div>}
      {nestOpen && <div className="room-panel-backdrop" onClick={() => setNestOpen(false)} role="presentation"><section className="room-panel nest-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true"><header><div><span className="eyebrow">PET NEST</span><h2>阿砚的窝</h2></div><button type="button" onClick={() => setNestOpen(false)}><X size={18}/></button></header><p className="nest-status">现在状态：<strong>{petState}</strong></p><button className="nest-action" type="button" onClick={() => window.dispatchEvent(new Event("reading-room:pet-speak"))}>🐷 戳戳阿砚</button><button className="nest-action" type="button" onClick={() => window.dispatchEvent(new CustomEvent("reading-room:pet-set-state", {detail:{state: petState === "sleeping" ? "idle" : "sleeping"}}))}>{petState === "sleeping" ? "☀️ 叫醒阿砚" : "🌙 让阿砚睡觉"}</button><div className="nest-action-grid" aria-label="阿砚的新动作">{petNestActions.map((action) => <button key={action.state} type="button" onClick={() => window.dispatchEvent(new CustomEvent("reading-room:pet-set-state", { detail: { state: action.state } }))}>{action.label}</button>)}</div><label className="nest-toggle"><input type="checkbox" defaultChecked onChange={(e) => window.localStorage.setItem("reading-room:v1:pet-speech", String(e.target.checked))}/> 主动搭话</label><div className="nest-junk"><span>阿砚的小破烂</span><small>几张书签、旧便签和一枚小印章（预留区域）</small></div></section></div>}
      {littleThingsOpen && <div className="room-panel-backdrop little-things-backdrop" onClick={closeLittleThings} role="presentation"><section className="room-panel little-things-sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="little-things-title"><header><div><span className="eyebrow">LITTLE THINGS</span><h2 id="little-things-title">璟璟的小破烂</h2><p>一些舍不得扔掉的东西。</p></div><button type="button" onClick={closeLittleThings} aria-label="关闭"><X size={18}/></button></header><nav className="little-things-links" aria-label="留下来的东西"><a href="/bookplates"><TicketCheck size={17}/><span><strong>藏书票</strong><small>读完一本书留下的纪念</small></span></a><a href="/aftertaste"><BookHeart size={17}/><span><strong>书后余味</strong><small>读完以后，还留在心里的话</small></span></a><a href="/relations"><Link2 size={17}/><span><strong>关系卡</strong><small>书与书之间的小线索</small></span></a></nav><button className="pull-old-thing" type="button" onClick={pullOldThing}><RefreshCw size={16}/>翻一件旧东西</button>{oldThing ? <article className="little-thing-result"><span>从袋子里摸出来了——</span><small>{oldThing.kind} · 《{oldThing.bookTitle}》</small><blockquote>{oldThing.text}</blockquote></article> : <p className="little-things-empty">{oldThingTried ? "袋子今天空空的。" : "伸手进去摸摸看。"}</p>}</section></div>}

      {welcome && <aside className="room-note"><button type="button" onClick={() => setWelcome(false)} aria-label="关闭小纸条"><X size={14} /></button><strong>小屋刚刚亮起来。</strong><p>这里先是一个安静的房间，书架、书桌、窗边和猪窝，都会慢慢住进你的阅读痕迹。</p></aside>}
      <PetWidget initialAnchor="bed" />
      <PwaInstallButton />
    </main>
  );
}
