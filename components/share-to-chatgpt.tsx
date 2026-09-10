"use client";

import { Check, Copy, LoaderCircle, MessagesSquare, Share2, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { rememberCoRead } from "@/lib/local-reading";
import { appFetch } from "@/lib/platform";

type ShareContext = {
  book: { book_id: string; title: string; author: string | null };
  chapter: { chapter_uid: number | null; title: string | null; position: number };
  progress_percent: number;
  nearby_text: string;
  context_scope: string;
  highlights: Array<{ id: string; text: string; range: string | null }>;
  notes: Array<{ id: string; content: string; source_text: string | null; range: string | null }>;
};

type Props = {
  bookId?: string;
  bookTitle?: string;
};

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const fallback = document.createElement("textarea");
    fallback.value = text;
    fallback.style.position = "fixed";
    fallback.style.opacity = "0";
    document.body.appendChild(fallback);
    fallback.select();
    if (!document.execCommand("copy")) throw new Error("浏览器不允许自动复制");
    fallback.remove();
  }
}

export default function ShareToChatGPT({ bookId, bookTitle }: Props) {
  const selectedText = useRef("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ShareContext | null>(null);
  const [positionText, setPositionText] = useState("");
  const [usedSelection, setUsedSelection] = useState(false);
  const [highlights, setHighlights] = useState<ShareContext["highlights"]>([]);
  const [notes, setNotes] = useState<ShareContext["notes"]>([]);
  const [question, setQuestion] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function openShareSheet() {
    const selection = selectedText.current || window.getSelection()?.toString().trim() || "";
    selectedText.current = "";
    const safeSelection = selection.slice(0, 800);
    setOpen(true);
    setLoading(true);
    setError("");
    setData(null);
    setQuestion("");
    window.dispatchEvent(new CustomEvent("reading-room:share-to-chatgpt", {
      detail: { bookId: bookId ?? null, bookTitle: bookTitle ?? null },
    }));

    try {
      const query = bookId ? `?book_id=${encodeURIComponent(bookId)}` : "";
      const response = await appFetch(`/api/weread/share-context${query}`, { cache: "no-store" });
      const result = await response.json() as ShareContext & { error?: string };
      if (!response.ok) throw new Error(result.error || "共读上下文暂时没有整理好");
      setData(result);
      setHighlights(result.highlights);
      setNotes(result.notes);
      setUsedSelection(Boolean(safeSelection));
      setPositionText(
        safeSelection || result.nearby_text || "当前位置附近没有可提供的个人划线或批注原文。",
      );
    } catch (loadError) {
      window.dispatchEvent(new Event("reading-room:data-error"));
      setError(loadError instanceof Error ? loadError.message : "共读上下文暂时没有整理好");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const openFromBook = () => { void openShareSheet(); };
    window.addEventListener("reading-room:open-share", openFromBook);
    return () => window.removeEventListener("reading-room:open-share", openFromBook);
  });

  const shareText = useMemo(() => {
    if (!data) return "";
    const highlightText = highlights.length
      ? highlights.map((item, index) => `${index + 1}. ${item.text}`).join("\n")
      : "（没有选入划线）";
    const noteText = notes.length
      ? notes.map((item, index) => `${index + 1}. ${item.content}`).join("\n")
      : "（没有选入批注）";
    return [
      `《${data.book.title}》`,
      `当前章节：${data.chapter.title || "章节名称暂缺"}`,
      `阅读进度：${data.progress_percent}%`,
      "",
      "【当前阅读位置】",
      positionText.trim() || "（未提供）",
      "",
      "【最近相关划线】",
      highlightText,
      "",
      "【我的批注】",
      noteText,
      "",
      "【我想和你聊】",
      question.trim(),
    ].join("\n");
  }, [data, highlights, notes, positionText, question]);

  async function shareContext() {
    if (!data || !shareText) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `和哥哥共读《${data.book.title}》`, text: shareText });
        rememberCoRead({ bookId: data.book.book_id, title: data.book.title, author: data.book.author || undefined });
        setToast("共读内容已经交给系统分享啦");
        setOpen(false);
        return;
      } catch (shareError) {
        if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      }
    }
    await copyToClipboard(shareText);
    rememberCoRead({ bookId: data.book.book_id, title: data.book.title, author: data.book.author || undefined });
    setToast("已复制共读内容，去 ChatGPT 粘贴就好");
    setOpen(false);
  }

  return (
    <>
      <button
        className="share-trigger"
        type="button"
        onPointerDown={() => {
          selectedText.current = window.getSelection()?.toString().trim().slice(0, 800) ?? "";
        }}
        onClick={openShareSheet}
        aria-haspopup="dialog"
      >
        <MessagesSquare size={18} />
        <span>和哥哥聊这一段</span>
      </button>

      {open && (
        <div className="share-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-title">
            <header className="share-sheet-header">
              <div>
                <span className="eyebrow">SHARE TO CHATGPT</span>
                <h2 id="share-title">和哥哥聊这一段</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="关闭分享面板"><X size={20} /></button>
            </header>

            <div className="share-sheet-body scrollbar-thin">
              {loading && <div className="share-loading"><LoaderCircle className="spin" size={21} />正在整理这一页的共读内容…</div>}
              {error && <div className="share-error"><p>{error}</p><button type="button" onClick={openShareSheet}>再试一次</button></div>}
              {data && !loading && (
                <>
                  <div className="share-book-summary">
                    <strong>《{data.book.title}》</strong>
                    <span>{data.chapter.title || "章节名称暂缺"} · {data.progress_percent}%</span>
                  </div>

                  <label className="share-field">
                    <span>当前阅读位置 <small>{usedSelection ? "已使用选中文字" : "有限附近文本"}</small></span>
                    <textarea value={positionText} onChange={(event) => setPositionText(event.target.value)} rows={4} />
                  </label>

                  <section className="share-pick-section">
                    <div><h3>最近相关划线</h3><small>点垃圾桶可移除</small></div>
                    {highlights.length ? highlights.map((item) => (
                      <article key={item.id} className="share-pick-item">
                        <p>{item.text}</p>
                        <button type="button" onClick={() => setHighlights((current) => current.filter((entry) => entry.id !== item.id))} aria-label="移除这条划线"><Trash2 size={15} /></button>
                      </article>
                    )) : <p className="share-empty">没有选入划线。</p>}
                  </section>

                  <section className="share-pick-section">
                    <div><h3>我的批注</h3><small>只保留当前章节相关内容</small></div>
                    {notes.length ? notes.map((item) => (
                      <article key={item.id} className="share-pick-item">
                        <p>{item.content}</p>
                        <button type="button" onClick={() => setNotes((current) => current.filter((entry) => entry.id !== item.id))} aria-label="移除这条批注"><Trash2 size={15} /></button>
                      </article>
                    )) : <p className="share-empty">没有选入批注。</p>}
                  </section>

                  <label className="share-field">
                    <span>我想和你聊 <small>可不填</small></span>
                    <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} placeholder="比如：这一段为什么让我觉得很不安？" />
                  </label>

                  <details className="share-preview">
                    <summary>查看最终发送内容</summary>
                    <pre>{shareText}</pre>
                  </details>
                </>
              )}
            </div>

            {data && !loading && (
              <footer className="share-sheet-footer">
                <button className="copy-context" type="button" onClick={async () => { await copyToClipboard(shareText); rememberCoRead({ bookId: data.book.book_id, title: data.book.title, author: data.book.author || undefined }); setToast("已复制共读内容"); }}><Copy size={17} />复制</button>
                <button className="share-context" type="button" onClick={shareContext}><Share2 size={18} />分享到 ChatGPT 共读</button>
              </footer>
            )}
          </section>
        </div>
      )}

      {toast && <div className="share-toast" role="status"><Check size={16} />{toast}</div>}
    </>
  );
}
