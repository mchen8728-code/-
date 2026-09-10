"use client";

import {
  BookHeart,
  CalendarDays,
  ChevronRight,
  Link2,
  NotebookTabs,
  Pencil,
  Plus,
  RefreshCw,
  ScrollText,
  Sparkles,
  TicketCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  deleteRelation,
  readReadingMemory,
  rememberRevisit,
  saveAftertaste,
  saveBookplate,
  saveRelation,
  type BookRelation,
  type BookSnapshot,
  type ReadingMemory,
} from "@/lib/local-reading";

type BookOption = { bookId: string; title: string; author?: string; finishReading?: number; deepLink?: string };
type View = "timeline" | "old" | "aftertaste" | "relations" | "year";

type Props = {
  books: BookOption[];
  selectedBookId?: string;
  onSelectBook: (bookId: string) => void;
  onOpenNotes: (bookId: string) => void;
  initialView?: View;
};

const questions = [
  ["remember", "读完以后，我还会想起它吗？"],
  ["favorite", "最喜欢的人物 / 部分是什么？"],
  ["unforgettable", "哪一段最让我难忘？"],
  ["reread", "我会不会重读？"],
  ["recommend", "我想把它推荐给谁？"],
  ["oneLine", "如果只能留下一句话，我会写什么？"],
] as const;

const relationOptions = ["让我想到", "相似", "相反", "同一作者", "同一主题", "受其影响 / 致敬", "自定义关系"];

function emptyMemory(): ReadingMemory {
  return { version: 2, activeDays: [], coReadDates: [], coReads: [], syncedNotes: {}, books: {}, activities: [], highlights: [], notes: [], traces: [], relations: [], aftertastes: {}, bookplates: [], revisitCounts: {}, revisits: [] };
}

function dayKey(value: string) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateLabel(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(date);
}

function shortDate(value?: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "日期未提供";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

function durationLabel(seconds?: number | null) {
  if (!seconds) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`;
}

export default function ReadingJournal({ books, selectedBookId, onSelectBook, onOpenNotes, initialView = "timeline" }: Props) {
  const [view, setView] = useState<View>(initialView);
  const [memory, setMemory] = useState<ReadingMemory>(emptyMemory);
  const [relationEditing, setRelationEditing] = useState<BookRelation | null>(null);

  useEffect(() => {
    const refresh = () => setMemory(readReadingMemory());
    const frame = window.requestAnimationFrame(refresh);
    window.addEventListener("reading-room:local-state-changed", refresh);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("reading-room:local-state-changed", refresh);
    };
  }, []);

  const bookMap = useMemo(() => {
    const map = new Map<string, BookSnapshot>();
    books.forEach((book) => map.set(book.bookId, { ...memory.books[book.bookId], bookId: book.bookId, title: book.title, author: book.author, deepLink: book.deepLink }));
    Object.values(memory.books).forEach((book) => { if (!map.has(book.bookId)) map.set(book.bookId, book); });
    return map;
  }, [books, memory.books]);

  const selectedBook = selectedBookId ? bookMap.get(selectedBookId) : undefined;

  return (
    <section className="journal" aria-labelledby="journal-title">
      <header className="journal-heading">
        <div><span className="eyebrow">PRIVATE READING JOURNAL</span><h3 id="journal-title">我的共读手账</h3></div>
        <small>本机私人记录</small>
      </header>
      <nav className="journal-tabs" aria-label="共读手账栏目">
        <button className={view === "timeline" ? "is-active" : ""} onClick={() => setView("timeline")}><CalendarDays size={15} />时间轴</button>
        <button className={view === "old" ? "is-active" : ""} onClick={() => setView("old")}><NotebookTabs size={15} />翻旧页</button>
        <button className={view === "aftertaste" ? "is-active" : ""} onClick={() => setView("aftertaste")}><BookHeart size={15} />书后余味</button>
        <button className={view === "relations" ? "is-active" : ""} onClick={() => setView("relations")}><Link2 size={15} />阅读地图</button>
        <button className={view === "year" ? "is-active" : ""} onClick={() => setView("year")}><ScrollText size={15} />年度长卷</button>
      </nav>

      {view === "timeline" && <><Timeline memory={memory} bookMap={bookMap} onSelectBook={onSelectBook} onOpenNotes={onOpenNotes} /><div className="timeline-old"><OldPage memory={memory} onSelectBook={onSelectBook} compact /></div></>}
      {view === "old" && <OldPage memory={memory} onSelectBook={onSelectBook} />}
      {view === "aftertaste" && <AftertasteAndBookplate memory={memory} book={selectedBook} shelfBook={books.find((book) => book.bookId === selectedBookId)} />}
      {view === "relations" && <Relations memory={memory} books={[...bookMap.values()]} editing={relationEditing} setEditing={setRelationEditing} onSelectBook={onSelectBook} />}
      {view === "year" && <YearScroll memory={memory} bookMap={bookMap} onSelectBook={onSelectBook} />}
    </section>
  );
}

type TimelineGroup = {
  day: string;
  bookId: string;
  progress?: number;
  continued?: boolean;
  finished?: boolean;
  highlights: number;
  notes: number;
  traces: string[];
  coReads: number;
  aftertaste?: boolean;
  bookplates: number;
};

function Timeline({ memory, bookMap, onSelectBook, onOpenNotes }: { memory: ReadingMemory; bookMap: Map<string, BookSnapshot>; onSelectBook: (id: string) => void; onOpenNotes: (id: string) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, TimelineGroup>();
    const groupFor = (bookId: string, createdAt: string) => {
      const day = dayKey(createdAt);
      if (!day) return null;
      const key = `${day}:${bookId}`;
      if (!map.has(key)) map.set(key, { day, bookId, highlights: 0, notes: 0, traces: [], coReads: 0, bookplates: 0 });
      return map.get(key)!;
    };
    memory.activities.forEach((item) => {
      const group = groupFor(item.bookId, item.createdAt); if (!group) return;
      if (item.type === "continue") group.continued = true;
      if (item.type === "progress") group.progress = item.progress;
      if (item.type === "finished") group.finished = true;
    });
    memory.highlights.forEach((item) => { const group = groupFor(item.bookId, item.createdAt); if (group) group.highlights += 1; });
    memory.notes.forEach((item) => { const group = groupFor(item.bookId, item.createdAt); if (group) group.notes += 1; });
    memory.traces.forEach((item) => { const group = groupFor(item.bookId, item.createdAt); if (group) group.traces.push(item.question || item.discussion); });
    memory.coReads.forEach((item) => { if (!item.bookId) return; const group = groupFor(item.bookId, item.createdAt); if (group) group.coReads += 1; });
    Object.values(memory.aftertastes).forEach((item) => { const group = groupFor(item.bookId, item.updatedAt); if (group) group.aftertaste = true; });
    memory.bookplates.forEach((item) => { const group = groupFor(item.bookId, item.createdAt); if (group) group.bookplates += 1; });
    return [...map.values()].sort((a, b) => b.day.localeCompare(a.day));
  }, [memory]);
  const days = [...new Set(groups.map((item) => item.day))];
  if (!groups.length) return <p className="journal-empty">真实阅读活动积累后，会在这里慢慢长成一条时间轴。</p>;
  return <details className="timeline-fold">
    <summary><span>共读时间轴</span><small>{days.length} 天真实阅读记录 · 点击展开</small><ChevronRight size={16} /></summary>
    <div className="timeline">
    {days.map((day) => <section className="timeline-day" key={day}>
      <h4>{dateLabel(day)}</h4>
      {groups.filter((group) => group.day === day).map((group) => {
        const book = bookMap.get(group.bookId);
        if (!book) return null;
        return <article className="timeline-card" key={`${day}-${group.bookId}`}>
          <button className="timeline-book" type="button" onClick={() => onSelectBook(group.bookId)}>《{book.title}》<ChevronRight size={15} /></button>
          <div className="timeline-lines">
            {group.continued && <p>继续读了这本书</p>}
            {typeof group.progress === "number" && <p>读至 <strong>{group.progress}%</strong></p>}
            {group.highlights > 0 && <button onClick={() => onOpenNotes(group.bookId)}>留下 {group.highlights} 条划线</button>}
            {group.notes > 0 && <button onClick={() => onOpenNotes(group.bookId)}>写了 {group.notes} 条笔记</button>}
            {group.finished && <p>把这本书读完了</p>}
            {group.traces.slice(0, 2).map((text, index) => <p className="timeline-chat" key={index}>🐷 和阿砚聊了：<q>{text}</q></p>)}
            {group.coReads > group.traces.length && <p>🐷 和阿砚共读了 {group.coReads - group.traces.length} 次</p>}
            {group.aftertaste && <p>写下了书后余味</p>}
            {group.bookplates > 0 && <p>生成了 {group.bookplates} 张藏书票</p>}
          </div>
        </article>;
      })}
    </section>)}
    </div>
  </details>;
}

export type OldItem = { id: string; bookId: string; bookTitle: string; text: string; date: string; kind: string };

export function getOldItems(memory: ReadingMemory): OldItem[] {
  return [
    ...memory.highlights.map((item) => ({ id: `h:${item.bookId}:${item.id}`, bookId: item.bookId, bookTitle: item.bookTitle, text: item.text, date: item.createdAt, kind: "以前的划线" })),
    ...memory.notes.map((item) => ({ id: `n:${item.bookId}:${item.id}`, bookId: item.bookId, bookTitle: item.bookTitle, text: item.content, date: item.createdAt, kind: "以前的笔记" })),
    ...memory.traces.map((item) => ({ id: `t:${item.id}`, bookId: item.bookId, bookTitle: item.bookTitle, text: item.discussion || item.question, date: item.createdAt, kind: "和阿砚聊过" })),
    ...Object.values(memory.aftertastes).map((item) => ({ id: `a:${item.bookId}`, bookId: item.bookId, bookTitle: memory.books[item.bookId]?.title || "未命名", text: item.freeText || item.answers.oneLine || Object.values(item.answers).find(Boolean) || "", date: item.updatedAt, kind: "书后余味" })),
  ].filter((item) => item.text).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

export function pickOldItem(candidates: OldItem[], current?: OldItem | null): OldItem | null {
  if (!candidates.length) return null;
  const pool = candidates.filter((item) => item.bookId !== current?.bookId);
  const available = pool.length ? pool : candidates;
  const olderPool = available.slice(0, Math.max(1, Math.ceil(available.length * .7)));
  return olderPool[Math.floor(Math.random() * olderPool.length)];
}

function OldPage({ memory, onSelectBook, compact = false }: { memory: ReadingMemory; onSelectBook: (id: string) => void; compact?: boolean }) {
  const candidates = useMemo<OldItem[]>(() => getOldItems(memory), [memory]);
  const [current, setCurrent] = useState<OldItem | null>(null);
  const pick = () => {
    setCurrent(pickOldItem(candidates, current));
  };
  if (!candidates.length) return compact ? null : <p className="journal-empty">同步过的划线、笔记或共读记录，会偶尔从这里翻出来。</p>;
  const shown = current && candidates.some((item) => item.id === current.id) ? current : candidates[0];
  return <div className="old-page">
    <div className="old-page-title"><span>翻到以前的一页</span><button type="button" onClick={pick}><RefreshCw size={14} />再翻一页</button></div>
    <article><span>{shown.kind}</span><blockquote>{shown.text}</blockquote><footer><small>《{shown.bookTitle}》 · {shortDate(shown.date)}</small><button type="button" onClick={() => { rememberRevisit(shown.bookId); onSelectBook(shown.bookId); }}>查看原记录 <ChevronRight size={14} /></button></footer></article>
  </div>;
}

function AftertasteAndBookplate({ memory, book, shelfBook }: { memory: ReadingMemory; book?: BookSnapshot; shelfBook?: BookOption }) {
  const existing = book ? memory.aftertastes[book.bookId] : undefined;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [freeText, setFreeText] = useState("");
  const [theme, setTheme] = useState<"classic" | "minimal" | "cottage">("cottage");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { setAnswers(existing?.answers || {}); setFreeText(existing?.freeText || ""); });
    return () => window.cancelAnimationFrame(frame);
  }, [book?.bookId, existing]);
  if (!book) return <p className="journal-empty">先从书架选择一本书。</p>;
  const finished = (book.progress ?? 0) >= 100 || Boolean(book.finishedAt) || Boolean(shelfBook?.finishReading);
  if (!finished) return <div className="aftertaste-locked"><BookHeart size={24} /><strong>读完后，再来写书后余味</strong><p>这里不会催促你，也不会用星星给阅读打分。</p></div>;
  const quote = answers.oneLine || freeText.split("\n").find(Boolean) || "";
  const plates = memory.bookplates.filter((item) => item.bookId === book.bookId);
  const save = () => {
    const now = new Date().toISOString();
    saveAftertaste({ bookId: book.bookId, answers, freeText, createdAt: existing?.createdAt || now, updatedAt: now });
    setNotice("余味已经留在本机书页里");
  };
  const makePlate = () => {
    saveBookplate({ id: crypto.randomUUID(), bookId: book.bookId, theme, quote, createdAt: new Date().toISOString() });
    setNotice("新的藏书票做好了");
  };
  return <div className="aftertaste-wrap">
    <header><div><span className="eyebrow">AFTERTASTE</span><h4>《{book.title}》读完以后……</h4></div><button type="button" onClick={save}>保存余味</button></header>
    <div className="aftertaste-questions">
      {questions.map(([id, label]) => <label key={id}><span>{label}<small>可跳过</small></span><textarea rows={2} value={answers[id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [id]: event.target.value }))} /></label>)}
    </div>
    <label className="aftertaste-free"><span>读完以后……</span><textarea rows={5} value={freeText} onChange={(event) => setFreeText(event.target.value)} placeholder="不必像公开书评，只写想留给自己的话。" /></label>
    <section className="bookplate-maker">
      <div className="bookplate-heading"><div><span className="eyebrow">EX LIBRIS</span><h4>这次阅读的藏书票</h4></div><small>网页卡片 · 图片导出接口已预留</small></div>
      <div className="theme-picks">
        {([['classic','古典藏书票'],['minimal','极简书卡'],['cottage','阿砚小屋']] as const).map(([id, label]) => <button type="button" className={theme === id ? "is-active" : ""} onClick={() => setTheme(id)} key={id}>{label}</button>)}
      </div>
      <BookplateCard book={book} theme={theme} quote={quote} memory={memory} />
      <button type="button" className="make-bookplate" onClick={makePlate}><TicketCheck size={16} />生成并收藏这张藏书票</button>
      {plates.length > 0 && <p className="plate-count">这本书已经收藏了 {plates.length} 张藏书票。</p>}
    </section>
    {notice && <p className="journal-notice">{notice}</p>}
  </div>;
}

function BookplateCard({ book, theme, quote, memory }: { book: BookSnapshot; theme: "classic" | "minimal" | "cottage"; quote: string; memory: ReadingMemory }) {
  const traces = Math.max(memory.traces.filter((item) => item.bookId === book.bookId).length, memory.coReads.filter((item) => item.bookId === book.bookId).length);
  return <article className={`bookplate bookplate-${theme}`} data-export-kind="bookplate">
    <div className="bookplate-stamp">🐷</div>
    {book.cover && (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="bookplate-cover" src={book.cover} alt="" />
    )}
    <span>EX LIBRIS · 璟璟的共读小屋</span>
    <h5>《{book.title}》</h5><p>{book.author || "作者未提供"}</p>
    <dl>
      {book.finishedAt && <div><dt>读完</dt><dd>{shortDate(book.finishedAt)}</dd></div>}
      {durationLabel(book.readingSeconds) && <div><dt>阅读时长</dt><dd>{durationLabel(book.readingSeconds)}</dd></div>}
      {typeof book.highlightCount === "number" && <div><dt>划线</dt><dd>{book.highlightCount} 条</dd></div>}
      {typeof book.noteCount === "number" && <div><dt>笔记</dt><dd>{book.noteCount} 条</dd></div>}
      {traces > 0 && <div><dt>共读</dt><dd>{traces} 次</dd></div>}
    </dl>
    {quote && <blockquote>{quote}</blockquote>}
  </article>;
}

function Relations({ memory, books, editing, setEditing, onSelectBook }: { memory: ReadingMemory; books: BookSnapshot[]; editing: BookRelation | null; setEditing: (item: BookRelation | null) => void; onSelectBook: (id: string) => void }) {
  const blank = (): BookRelation => ({ id: crypto.randomUUID(), fromBookId: books[0]?.bookId || "", toBookId: books[1]?.bookId || books[0]?.bookId || "", relation: "让我想到", note: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  return <div className="relations">
    <div className="relations-heading"><div><span className="eyebrow">READING MAP</span><h4>我的阅读地图</h4></div><button type="button" onClick={() => setEditing(blank())}><Plus size={15} />建立联系</button></div>
    {!memory.relations.length && <p className="journal-empty">关系只由你亲手建立。阿砚不会擅自声称两本书存在影响关系。</p>}
    <div className="relation-list">
      {memory.relations.map((item) => {
        const from = books.find((book) => book.bookId === item.fromBookId); const to = books.find((book) => book.bookId === item.toBookId);
        return <article key={item.id} className="relation-card">
          <button onClick={() => onSelectBook(item.fromBookId)}>《{from?.title || "书籍已移出书架"}》</button>
          <span><i />{item.relation}<i /></span>
          <button onClick={() => onSelectBook(item.toBookId)}>《{to?.title || "书籍已移出书架"}》</button>
          {item.note && <p>“{item.note}”</p>}
          <footer><button type="button" onClick={() => setEditing(item)}><Pencil size={13} />编辑</button><button type="button" onClick={() => { if (window.confirm("删除这段书籍联系吗？")) deleteRelation(item.id); }}><Trash2 size={13} />删除</button></footer>
        </article>;
      })}
    </div>
    {editing && <div className="relation-editor">
      <header><strong>{memory.relations.some((item) => item.id === editing.id) ? "编辑这段联系" : "建立书与书的联系"}</strong><button onClick={() => setEditing(null)} aria-label="关闭"><X size={18} /></button></header>
      <label><span>从这本书</span><select value={editing.fromBookId} onChange={(event) => setEditing({ ...editing, fromBookId: event.target.value })}>{books.map((book) => <option value={book.bookId} key={book.bookId}>{book.title}</option>)}</select></label>
      <label><span>关系</span><select value={relationOptions.includes(editing.relation) ? editing.relation : "自定义关系"} onChange={(event) => setEditing({ ...editing, relation: event.target.value })}>{relationOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>关系名称</span><input value={editing.relation} onChange={(event) => setEditing({ ...editing, relation: event.target.value })} placeholder="比如：在梦里相遇" /></label>
      <label><span>到这本书</span><select value={editing.toBookId} onChange={(event) => setEditing({ ...editing, toBookId: event.target.value })}>{books.map((book) => <option value={book.bookId} key={book.bookId}>{book.title}</option>)}</select></label>
      <label><span>我的说明 <small>可不填</small></span><textarea rows={3} value={editing.note} onChange={(event) => setEditing({ ...editing, note: event.target.value })} /></label>
      <button className="save-relation" type="button" disabled={!editing.fromBookId || !editing.toBookId || !editing.relation.trim() || editing.fromBookId === editing.toBookId} onClick={() => { saveRelation({ ...editing, updatedAt: new Date().toISOString() }); setEditing(null); }}>保存这段联系</button>
    </div>}
  </div>;
}

function YearScroll({ memory, bookMap, onSelectBook }: { memory: ReadingMemory; bookMap: Map<string, BookSnapshot>; onSelectBook: (id: string) => void }) {
  const years = useMemo(() => {
    const values = [new Date().getFullYear(), ...memory.activeDays.map((day) => Number(day.slice(0, 4))), ...memory.activities.map((item) => new Date(item.createdAt).getFullYear())].filter(Number.isFinite);
    return [...new Set(values)].sort((a, b) => b - a);
  }, [memory]);
  const [year, setYear] = useState(new Date().getFullYear());
  const prefix = `${year}-`;
  const activities = memory.activities.filter((item) => item.createdAt.startsWith(prefix));
  const highlights = memory.highlights.filter((item) => item.createdAt.startsWith(prefix));
  const notes = memory.notes.filter((item) => item.createdAt.startsWith(prefix));
  const traces = memory.traces.filter((item) => item.createdAt.startsWith(prefix));
  const coReads = memory.coReads.filter((item) => item.createdAt.startsWith(prefix));
  const aftertastes = Object.values(memory.aftertastes).filter((item) => item.updatedAt.startsWith(prefix));
  const plates = memory.bookplates.filter((item) => item.createdAt.startsWith(prefix));
  const relations = memory.relations.filter((item) => item.createdAt.startsWith(prefix));
  const bookIds = new Set([...activities.map((item) => item.bookId), ...highlights.map((item) => item.bookId), ...notes.map((item) => item.bookId), ...traces.map((item) => item.bookId), ...coReads.map((item) => item.bookId).filter((id): id is string => Boolean(id))]);
  const finishedIds = new Set(activities.filter((item) => item.type === "finished").map((item) => item.bookId));
  const authorCounts = new Map<string, number>(); [...bookIds].forEach((id) => { const author = bookMap.get(id)?.author; if (author) authorCounts.set(author, (authorCounts.get(author) || 0) + 1); });
  const topAuthor = [...authorCounts].sort((a,b) => b[1] - a[1])[0]?.[0];
  const noteCounts = new Map<string, number>(); notes.forEach((item) => noteCounts.set(item.bookId, (noteCounts.get(item.bookId) || 0) + 1));
  const topNoteBookId = [...noteCounts].sort((a,b) => b[1] - a[1])[0]?.[0];
  const revisitCounts = new Map<string, number>(); memory.revisits.filter((item) => item.createdAt.startsWith(prefix)).forEach((item) => revisitCounts.set(item.bookId, (revisitCounts.get(item.bookId) || 0) + 1));
  const topRevisitBookId = [...revisitCounts].sort((a,b) => b[1] - a[1])[0]?.[0];
  const seasons = [["年初",0,2],["春",2,5],["夏",5,8],["秋",8,11],["冬",11,12]] as const;
  const hasData = bookIds.size || aftertastes.length || plates.length || relations.length;
  return <div className="year-scroll">
    <header><div><span className="eyebrow">ANNUAL READING SCROLL</span><h4>{year} 年阅读长卷</h4></div><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((item) => <option key={item}>{item}</option>)}</select></header>
    {!hasData && <p className="journal-empty">这一年的真实记录还没有积累起来。长卷会随着平时阅读自然展开。</p>}
    {Boolean(hasData) && <>
      <section className="year-opening"><strong>{bookIds.size}</strong><span>本读过的书</span><strong>{finishedIds.size}</strong><span>本读完</span><strong>{memory.activeDays.filter((day) => day.startsWith(prefix)).length}</strong><span>个阅读日</span></section>
      <p className="year-summary">留下 {highlights.length} 条划线、{notes.length} 条笔记，和阿砚共读 {coReads.length || traces.length || memory.coReadDates.filter((date) => date.startsWith(prefix)).length} 次。</p>
      {(topAuthor || topNoteBookId || topRevisitBookId) && <section className="year-favorites">{topAuthor && <p>这一年最常读到的作者：<strong>{topAuthor}</strong></p>}{topNoteBookId && <button onClick={() => onSelectBook(topNoteBookId)}>最常留下笔记：《{bookMap.get(topNoteBookId)?.title}》</button>}{topRevisitBookId && <button onClick={() => onSelectBook(topRevisitBookId)}>最常回看：《{bookMap.get(topRevisitBookId)?.title}》</button>}</section>}
      <section className="year-books"><h5>这一年的书</h5><div>{[...bookIds].map((id) => <button key={id} onClick={() => onSelectBook(id)}>《{bookMap.get(id)?.title || "未命名"}》</button>)}</div></section>
      <div className="seasons">
        {seasons.map(([label, start, end]) => {
          const seasonBooks = [...bookIds].filter((id) => [...activities, ...highlights, ...notes, ...traces, ...coReads].some((item) => item.bookId === id && new Date(item.createdAt).getMonth() >= start && new Date(item.createdAt).getMonth() < end));
          if (!seasonBooks.length) return null;
          return <section key={label}><span>{label}</span><i /><div>{seasonBooks.map((id) => <button key={id} onClick={() => onSelectBook(id)}>《{bookMap.get(id)?.title || "未命名"}》</button>)}</div></section>;
        })}
      </div>
      {relations.length > 0 && <section className="year-lines"><h5>这一年连起来的书</h5>{relations.map((item) => <p key={item.id}>《{bookMap.get(item.fromBookId)?.title}》 · {item.relation} · 《{bookMap.get(item.toBookId)?.title}》</p>)}</section>}
      {aftertastes.length > 0 && <section className="year-aftertastes"><h5>书后留下来的话</h5>{aftertastes.map((item) => <blockquote key={item.bookId}>{item.freeText || item.answers.oneLine || Object.values(item.answers).find(Boolean)}</blockquote>)}</section>}
      {plates.length > 0 && <section className="year-plates"><h5>这一年的藏书票</h5><div>{plates.map((plate) => <button key={plate.id} onClick={() => onSelectBook(plate.bookId)}><TicketCheck size={16} />《{bookMap.get(plate.bookId)?.title}》</button>)}</div></section>}
      <footer>这一年的最后一页 <Sparkles size={16} /><small>图片 / PDF 导出结构已预留</small></footer>
    </>}
  </div>;
}
