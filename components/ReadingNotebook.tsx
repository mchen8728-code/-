"use client";

import {
  BookOpenCheck,
  ChevronDown,
  Copy,
  LoaderCircle,
  MessageCircleHeart,
  Pin,
  RefreshCw,
  Share2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  getTraces,
  rememberCoRead,
  rememberSyncedNotes,
  syncBookNotes,
  saveTrace,
  type CoReadingTrace,
} from "@/lib/local-reading";
import { appFetch } from "@/lib/platform";

export type NotebookBook = { bookId: string; title: string; author?: string };

type NoteItem = {
  id: string;
  chapterUid: number | null;
  chapterTitle: string | null;
  content: string;
  sourceText: string | null;
  range: string | null;
  createdAt: string | null;
};

type HighlightItem = {
  id: string;
  chapterUid: number | null;
  chapterTitle: string | null;
  text: string;
  range: string | null;
  createdAt: string | null;
};

type NotesPayload = {
  book: { bookId: string; title: string; author: string; deepLink: string | null };
  highlights: HighlightItem[];
  notes: NoteItem[];
  capability: { fullTextAvailable: false; preciseChapterLinkAvailable: false };
};

type AyaTarget = {
  chapterUid: number | null;
  chapterTitle: string | null;
  highlightId?: string;
  noteId?: string;
  sourceText?: string;
  sourceNote?: string;
};

type Props = {
  books: NotebookBook[];
  bookId?: string;
  onBookChange: (bookId: string) => void;
};

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function shortDate(value: string | null) {
  if (!value) return "时间未提供";
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value));
}

export default function ReadingNotebook({ books, bookId, onBookChange }: Props) {
  const [payload, setPayload] = useState<NotesPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ayaTarget, setAyaTarget] = useState<AyaTarget | null>(null);
  const [question, setQuestion] = useState("");
  const [discussion, setDiscussion] = useState("");
  const [toast, setToast] = useState("");
  const [traceVersion, setTraceVersion] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const saved = window.localStorage.getItem("reading-room:v1:notes-filter");
    if (saved && books.some((book) => book.bookId === saved) && !bookId) onBookChange(saved);
  }, [bookId, books, onBookChange]);

  useEffect(() => {
    if (!bookId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      window.localStorage.setItem("reading-room:v1:notes-filter", bookId);
      setLoading(true);
      setError("");
      window.dispatchEvent(new Event("reading-room:sync-start"));
      appFetch(`/api/weread/notes?book_id=${encodeURIComponent(bookId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as NotesPayload & { error?: string };
        if (!response.ok) throw new Error(data.error || "笔记暂时没有同步好");
        return data;
      })
      .then((data) => {
        setPayload(data);
        rememberSyncedNotes(data.notes.map((note) => ({ id: `${data.book.bookId}:${note.id}`, createdAt: note.createdAt })));
        syncBookNotes({
          book: { bookId: data.book.bookId, title: data.book.title, author: data.book.author, deepLink: data.book.deepLink },
          highlights: data.highlights.map((item) => ({ ...item, createdAt: item.createdAt || "" })),
          notes: data.notes.map((item) => ({ ...item, createdAt: item.createdAt || "" })),
        });
        window.dispatchEvent(new Event("reading-room:sync-success"));
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "笔记暂时没有同步好");
        window.dispatchEvent(new Event("reading-room:data-error"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [bookId, reloadToken]);

  useEffect(() => {
    if (!ayaTarget) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [ayaTarget]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const traces = useMemo(() => {
    void traceVersion;
    return payload ? getTraces(payload.book.bookId) : [];
  }, [payload, traceVersion]);
  const chapterGroups = useMemo(() => {
    if (!payload) return [];
    const groups = new Map<string, {
      uid: number | null;
      title: string;
      highlights: HighlightItem[];
      notes: NoteItem[];
      traces: CoReadingTrace[];
    }>();
    const groupFor = (uid: number | null, title: string | null) => {
      const key = String(uid ?? "unknown");
      if (!groups.has(key)) groups.set(key, { uid, title: title || "章节未标注", highlights: [], notes: [], traces: [] });
      return groups.get(key)!;
    };
    payload.highlights.forEach((item) => groupFor(item.chapterUid, item.chapterTitle).highlights.push(item));
    payload.notes.forEach((item) => groupFor(item.chapterUid, item.chapterTitle).notes.push(item));
    traces.forEach((item) => groupFor(item.chapterUid ?? null, item.chapterTitle ?? null).traces.push(item));
    return [...groups.values()];
  }, [payload, traces]);

  const contextText = useMemo(() => {
    if (!payload || !ayaTarget) return "";
    return [
      `《${payload.book.title}》`,
      payload.book.author ? `作者：${payload.book.author}` : "",
      `章节：${ayaTarget.chapterTitle || "章节名称暂缺"}`,
      ayaTarget.sourceText ? `\n【我的微信读书划线】\n${ayaTarget.sourceText}` : "",
      ayaTarget.sourceNote ? `\n【璟璟原有笔记】\n${ayaTarget.sourceNote}` : "",
      `\n【我想和阿砚聊】\n${question.trim()}`,
    ].filter(Boolean).join("\n");
  }, [ayaTarget, payload, question]);

  function callAya(target: AyaTarget) {
    setAyaTarget(target);
    setQuestion("");
    setDiscussion("");
    window.dispatchEvent(new CustomEvent("reading-room:review"));
  }

  async function shareWithAya() {
    if (!payload || !contextText) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `和阿砚共读《${payload.book.title}》`, text: contextText });
        rememberCoRead({ bookId: payload.book.bookId, title: payload.book.title, author: payload.book.author });
        setToast("共读上下文已交给系统分享");
        return;
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
      }
    }
    await copyText(contextText);
    rememberCoRead({ bookId: payload.book.bookId, title: payload.book.title, author: payload.book.author });
    setToast("共读上下文已复制，去找阿砚吧 🐷");
  }

  function keepTrace() {
    if (!payload || !ayaTarget || (!question.trim() && !discussion.trim())) {
      setToast("先写下问题或讨论内容，再留在书页里");
      return;
    }
    saveTrace({
      id: crypto.randomUUID(),
      bookId: payload.book.bookId,
      bookTitle: payload.book.title,
      author: payload.book.author,
      chapterUid: ayaTarget.chapterUid,
      chapterTitle: ayaTarget.chapterTitle,
      highlightId: ayaTarget.highlightId ?? null,
      noteId: ayaTarget.noteId ?? null,
      sourceText: ayaTarget.sourceText,
      sourceNote: ayaTarget.sourceNote,
      question: question.trim(),
      discussion: discussion.trim(),
      createdAt: new Date().toISOString(),
    });
    setTraceVersion((value) => value + 1);
    setAyaTarget(null);
    setToast("已经留在这页的共读痕迹里");
  }

  return (
    <section className="notes-room" aria-labelledby="notes-title">
      <div className="notes-room-heading">
        <div><span className="eyebrow">MY NOTES</span><h3 id="notes-title">我的笔记</h3></div>
        <label className="book-filter">
          <span>按书筛选</span>
          <select value={bookId || ""} onChange={(event) => onBookChange(event.target.value)}>
            {books.map((book) => <option key={book.bookId} value={book.bookId}>{book.title}</option>)}
          </select>
        </label>
      </div>

      <p className="notes-privacy">只同步你的划线、想法与其合法摘要；不读取或保存付费书籍正文。</p>
      {loading && <div className="notes-loading"><LoaderCircle className="spin" size={18} />阿砚正在整理笔记…</div>}
      {error && <div className="notes-error"><span>{error}</span><button type="button" onClick={() => setReloadToken((value) => value + 1)}><RefreshCw size={15} />稍后再试</button></div>}
      {!loading && !error && payload && chapterGroups.length === 0 && <div className="notes-empty">这本书暂时没有可同步的划线或笔记。</div>}

      {!loading && !error && chapterGroups.map((group, index) => (
        <details className="chapter-notes" key={`${group.uid}-${group.title}`} open={index === 0}>
          <summary>
            <span><BookOpenCheck size={17} /><strong>{group.title}</strong></span>
            <small>{group.highlights.length} 划线 · {group.notes.length} 笔记 · {group.traces.length} 共读</small>
            <ChevronDown size={17} />
          </summary>
          <div className="chapter-note-list">
            {group.highlights.map((item) => (
              <article className="note-entry" key={`highlight-${item.id}`}>
                <div className="note-entry-meta"><span className="note-kind highlight-kind">微信读书原有划线</span><time>{shortDate(item.createdAt)}</time></div>
                <blockquote>{item.text}</blockquote>
                <button type="button" className="call-aya" onClick={() => callAya({ chapterUid: item.chapterUid, chapterTitle: item.chapterTitle, highlightId: item.id, sourceText: item.text })}>🐷 叫阿砚</button>
              </article>
            ))}
            {group.notes.map((item) => (
              <article className="note-entry" key={`note-${item.id}`}>
                <div className="note-entry-meta"><span className="note-kind personal-kind">璟璟原有笔记</span><time>{shortDate(item.createdAt)}</time></div>
                {item.sourceText && <blockquote>{item.sourceText}</blockquote>}
                <p>{item.content}</p>
                <button type="button" className="call-aya" onClick={() => callAya({ chapterUid: item.chapterUid, chapterTitle: item.chapterTitle, noteId: item.id, sourceText: item.sourceText || undefined, sourceNote: item.content })}>🐷 叫阿砚</button>
              </article>
            ))}
            {group.traces.map((trace) => (
              <details className="trace-entry" key={trace.id}>
                <summary><span className="note-kind trace-kind">共读小屋讨论</span><strong>这里以前和阿砚聊过</strong><time>{shortDate(trace.createdAt)}</time></summary>
                {trace.question && <p><b>当时想问：</b>{trace.question}</p>}
                {trace.discussion && <p><b>留下的讨论：</b>{trace.discussion}</p>}
              </details>
            ))}
          </div>
        </details>
      ))}

      {ayaTarget && payload && (
        <div className="aya-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAyaTarget(null); }}>
          <section className="aya-sheet" role="dialog" aria-modal="true" aria-labelledby="aya-title">
            <header><div><span className="eyebrow">READ WITH AYAN</span><h3 id="aya-title">🐷 叫阿砚</h3></div><button type="button" onClick={() => setAyaTarget(null)} aria-label="关闭"><X size={20} /></button></header>
            <div className="aya-body scrollbar-thin">
              <div className="aya-book"><strong>《{payload.book.title}》</strong><span>{ayaTarget.chapterTitle || "章节名称暂缺"}</span></div>
              {ayaTarget.sourceText && <label className="aya-source"><span>微信读书原有划线</span><textarea value={ayaTarget.sourceText} readOnly rows={3} /></label>}
              {ayaTarget.sourceNote && <label className="aya-source"><span>璟璟原有笔记</span><textarea value={ayaTarget.sourceNote} readOnly rows={3} /></label>}
              <label className="aya-field"><span>想问阿砚什么？</span><textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} placeholder="可以先空着，分享后再慢慢聊。" /></label>
              <details className="aya-context"><summary>查看将发送的共读上下文</summary><pre>{contextText}</pre></details>
              <label className="aya-field"><span>把聊完后的内容留在这里 <small>可选，本机保存</small></span><textarea value={discussion} onChange={(event) => setDiscussion(event.target.value)} rows={4} placeholder="把想留下的讨论贴回来，不保存整本书正文。" /></label>
            </div>
            <footer>
              <button type="button" className="aya-copy" onClick={async () => { await copyText(contextText); rememberCoRead({ bookId: payload.book.bookId, title: payload.book.title, author: payload.book.author }); setToast("共读上下文已复制，去找阿砚吧 🐷"); }}><Copy size={17} />复制</button>
              <button type="button" className="aya-share" onClick={shareWithAya}><Share2 size={17} />发送</button>
              <button type="button" className="aya-pin" onClick={keepTrace}><Pin size={17} />留在书页里</button>
            </footer>
          </section>
        </div>
      )}
      {toast && <div className="local-toast"><MessageCircleHeart size={16} />{toast}</div>}
    </section>
  );
}
