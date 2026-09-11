"use client";

import {
  BookOpen,
  Bookmark,
  Check,
  ChevronRight,
  Copy,
  Database,
  House,
  Library,
  LoaderCircle,
  MessageCircleMore,
  PlugZap,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ShareToChatGPT from "@/components/share-to-chatgpt";
import PwaInstallButton from "@/components/PwaInstallButton";
import RecentReading from "@/components/RecentReading";
import ReadingNotebook from "@/components/ReadingNotebook";
import ReadingStats from "@/components/ReadingStats";
import ReadingJournal from "@/components/journal/ReadingJournal";
import { appFetch, isNativeApp } from "@/lib/platform";

type Book = {
  bookId: string;
  title: string;
  author: string;
  category?: string;
  readUpdateTime?: number;
  finishReading?: number;
  secret?: number;
  deepLink?: string;
};

type ShelfData = {
  books: Book[];
  total: number;
  publicCount: number;
  privateCount: number;
};

type Notebook = {
  bookId: string;
  title: string;
  author: string;
  totalNotes: number;
  readingProgress: number;
};

const prompts = ["这本书值得留意的母题", "陪我梳理刚读完的部分", "问我一个不剧透的问题"];

const mcpTools = [
  ["get_current_book", "当前书籍"],
  ["get_current_chapter", "当前章节"],
  ["get_reading_progress", "阅读进度"],
  ["get_recent_highlights", "最近划线"],
  ["get_notes", "划线与批注"],
  ["get_context_around_position", "当前位置附近文本"],
] as const;

export default function ReadingRoom({ section = "all" }: { section?: "all" | "library" | "timeline" | "notes" | "reading" | "aftertaste" | "bookplates" | "relations" | "year" | "old" }) {
  const [shelf, setShelf] = useState<ShelfData | null>(null);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [selected, setSelected] = useState<Book | null>(null);
  const [query, setQuery] = useState("");
  const [loadingShelf, setLoadingShelf] = useState(true);
  const [shelfError, setShelfError] = useState("");
  const [mcpEndpoint, setMcpEndpoint] = useState("/mcp");
  const [copied, setCopied] = useState<"endpoint" | string | null>(null);
  const [mcpOpen, setMcpOpen] = useState(false);

  const loadLibrary = useCallback(() => {
    setLoadingShelf(true);
    setShelfError("");
    window.dispatchEvent(new Event("reading-room:sync-start"));
    return Promise.all([
      appFetch("/api/weread/shelf").then((response) => {
        if (!response.ok) throw new Error("书架暂时没有拉到");
        return Promise.all([response.json() as Promise<ShelfData>, Promise.resolve(response.headers.get("X-Reading-Room-Cache") === "stale")]);
      }),
      appFetch("/api/weread/notebooks").then(async (response) => ({
        data: response.ok ? await response.json() as { books?: Notebook[] } : { books: [] as Notebook[] },
        stale: response.headers.get("X-Reading-Room-Cache") === "stale",
      })),
    ])
      .then(([[shelfData, shelfStale], noteResult]) => {
        setShelf(shelfData);
        setNotebooks(noteResult.data.books ?? []);
        const remembered = window.localStorage.getItem("reading-room:v1:last-book");
        setSelected(shelfData.books?.find((book: Book) => book.bookId === remembered) ?? shelfData.books?.[0] ?? null);
        if (!shelfStale && !noteResult.stale) window.dispatchEvent(new Event("reading-room:sync-success"));
      })
      .catch((error) => {
        setShelfError(error instanceof Error ? error.message : "加载失败");
        window.dispatchEvent(new CustomEvent("reading-room:sync-error", { detail: { message: error instanceof Error ? error.message : "同步失败，请重试" } }));
      })
      .finally(() => setLoadingShelf(false));
  }, []);

  useEffect(() => {
    void loadLibrary();
    const retry = () => { void loadLibrary(); };
    window.addEventListener("reading-room:retry-sync", retry);
    return () => window.removeEventListener("reading-room:retry-sync", retry);
  }, [loadLibrary]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setMcpEndpoint(isNativeApp() ? "在线同步由小屋服务器提供" : `${window.location.origin}/mcp`);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!mcpOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMcpOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mcpOpen]);

  const noteMap = useMemo(
    () => new Map(notebooks.map((item) => [item.bookId, item])),
    [notebooks],
  );

  const filteredBooks = useMemo(() => {
    const books = shelf?.books ?? [];
    const keyword = query.trim().toLowerCase();
    if (!keyword) return books.slice(0, 80);
    return books
      .filter((book) => `${book.title} ${book.author}`.toLowerCase().includes(keyword))
      .slice(0, 80);
  }, [query, shelf]);

  const selectedNotebook = selected ? noteMap.get(selected.bookId) : undefined;

  async function copyText(value: string, key: "endpoint" | string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1600);
  }

  const chooseBook = useCallback((book: Book) => {
    setSelected(book);
    window.localStorage.setItem("reading-room:v1:last-book", book.bookId);
    window.dispatchEvent(new Event("reading-room:navigate"));
  }, []);

  const chooseBookById = useCallback((bookId: string) => {
    const book = shelf?.books.find((item) => item.bookId === bookId);
    if (book) chooseBook(book);
  }, [chooseBook, shelf]);

  const openNotes = useCallback((bookId: string) => {
    chooseBookById(bookId);
    window.setTimeout(() => document.getElementById("my-notes")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [chooseBookById]);

  const talkAboutBook = useCallback((bookId: string) => {
    chooseBookById(bookId);
    window.setTimeout(() => window.dispatchEvent(new Event("reading-room:open-share")), 50);
  }, [chooseBookById]);

  return (
    <main className={`reading-shell reading-view-${section}`}>
      <header className="topbar">
        <a className="brand-mark room-return-mark" href="/"><House size={20} /></a>
        <div>
          <h1>璟璟的共读小屋</h1>
          <p>微信读书 × ChatGPT</p>
        </div>
        <div className="topbar-status">
          <PwaInstallButton />
          <span className="status-pill is-online"><i />微信读书已连接</span>
          <span className="status-pill is-online"><i />MCP · 6 个只读工具</span>
        </div>
      </header>

      <section className={`workspace ${mcpOpen ? "is-mcp-open" : ""}`}>
        <aside className="shelf-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">MY LIBRARY</span>
              <h2>我的书架</h2>
            </div>
            <Library size={21} />
          </div>

          <label className="search-box">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜书名或作者"
              aria-label="搜书名或作者"
            />
          </label>

          <div className="shelf-summary">
            <div><strong>{shelf?.total ?? "—"}</strong><span>书架条目</span></div>
            <div><strong>{notebooks.length || "—"}</strong><span>笔记本</span></div>
          </div>

          <div className="book-list scrollbar-thin">
            {loadingShelf && (
              <div className="loading-state"><LoaderCircle className="spin" size={19} />正在整理书架…</div>
            )}
            {shelfError && <div className="error-state">{shelfError}</div>}
            {!loadingShelf && !shelfError && filteredBooks.length === 0 && (
              <div className="empty-state">没有找到这本书。</div>
            )}
            {filteredBooks.map((book, index) => {
              const note = noteMap.get(book.bookId);
              const active = selected?.bookId === book.bookId;
              return (
                <button
                  key={book.bookId}
                  type="button"
                  className={`book-row ${active ? "is-active" : ""}`}
                  onClick={() => chooseBook(book)}
                >
                  <span className={`book-spine spine-${index % 5}`} aria-hidden="true" />
                  <span className="book-copy">
                    <strong>{book.title}</strong>
                    <small>{book.author || "作者未知"}{note ? ` · ${note.totalNotes} 条笔记` : ""}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              );
            })}
          </div>
        </aside>

        <section className="reading-panel">
          <RecentReading onSelectBook={chooseBookById} onOpenNotes={openNotes} onTalk={talkAboutBook} />
          <ReadingStats />
          <ReadingJournal
            books={(shelf?.books ?? []).map((book) => ({ bookId: book.bookId, title: book.title, author: book.author, deepLink: book.deepLink, finishReading: book.finishReading }))}
            selectedBookId={selected?.bookId}
            onSelectBook={chooseBookById}
            onOpenNotes={openNotes}
            initialView={section === "aftertaste" || section === "bookplates" ? "aftertaste" : section === "relations" ? "relations" : section === "year" ? "year" : section === "old" ? "old" : "timeline"}
          />
          <div className="book-hero">
            <span className="chapter-kicker">NOW READING</span>
            <h2>{selected?.title ?? "从书架选一本书"}</h2>
            <p>{selected?.author ?? "你的阅读现场会在这里展开"}</p>
            <div className="book-meta">
              {selected?.category && <span>{selected.category.replace("-", " · ")}</span>}
              {selectedNotebook && <span>阅读进度 {selectedNotebook.readingProgress}%</span>}
              {selectedNotebook && <span>{selectedNotebook.totalNotes} 条笔记</span>}
            </div>
          </div>

          <article className="reading-card">
            <div className="quote-mark">“</div>
            <span className="eyebrow">共读页</span>
            <h3>把你停下来的那一句，交给这里。</h3>
            <p>
              阅读不必急着得出结论。连接右侧 MCP 后，ChatGPT 可以按需读取你在微信读书里的当前章节、进度、划线和批注，再陪你讨论。
            </p>
            <div className="prompt-grid">
              {prompts.map((prompt) => (
                <button key={prompt} type="button" onClick={() => copyText(prompt, prompt)}>
                  {copied === prompt ? <Check size={15} /> : <Sparkles size={15} />}{prompt}
                </button>
              ))}
            </div>
          </article>

          <div id="my-notes">
            <ReadingNotebook
              books={(shelf?.books ?? []).map((book) => ({ bookId: book.bookId, title: book.title, author: book.author }))}
              bookId={selected?.bookId}
              onBookChange={chooseBookById}
            />
          </div>

          <div className="reading-footer">
            <div><Bookmark size={17} /><span>{selectedNotebook ? `${selectedNotebook.totalNotes} 条个人笔记` : "这本书还没有笔记"}</span></div>
            {selected?.deepLink && <a href={selected.deepLink} target="_blank" rel="noreferrer">打开微信读书 <ChevronRight size={15} /></a>}
          </div>
        </section>

        {mcpOpen && <aside className="chat-panel" id="mcp-panel" aria-label="ChatGPT 共读连接">
          <div className="chat-heading">
            <div className="avatar"><PlugZap size={18} /></div>
            <div><h2>ChatGPT 共读连接</h2><p>只读 MCP · 不调用 OpenAI API</p></div>
            <ShieldCheck className="secure-icon" size={20} />
            <button className="panel-close" type="button" onClick={() => setMcpOpen(false)} aria-label="关闭共读面板">
              <X size={18} />
            </button>
          </div>

          <div className="mcp-panel-body scrollbar-thin">
            <section className="mcp-intro">
              <span className="eyebrow">MCP SERVER</span>
              <h3>让 ChatGPT 读到你的阅读现场</h3>
              <p>聊天发生在 ChatGPT；这个私人网页只提供微信读书的只读数据工具。</p>
            </section>

            <section className="endpoint-card">
              <div className="endpoint-label"><Database size={15} /><span>Streamable HTTP 地址</span></div>
              <code>{mcpEndpoint}</code>
              <button type="button" onClick={() => copyText(mcpEndpoint, "endpoint")}>
                {copied === "endpoint" ? <Check size={15} /> : <Copy size={15} />}
                {copied === "endpoint" ? "已复制" : "复制地址"}
              </button>
            </section>

            <section className="tool-section">
              <div className="section-title"><span>可读取的内容</span><small>6 TOOLS</small></div>
              <div className="tool-list">
                {mcpTools.map(([name, label]) => (
                  <div className="tool-item" key={name}>
                    <Check size={14} />
                    <span><strong>{label}</strong><code>{name}</code></span>
                  </div>
                ))}
              </div>
            </section>

            <section className="connection-steps">
              <div className="section-title"><span>连接方式</span><small>CHATGPT</small></div>
              <ol>
                <li><b>1</b><span>打开 ChatGPT 设置，进入应用与连接器的高级设置</span></li>
                <li><b>2</b><span>开启开发者模式，添加远程 MCP Server</span></li>
                <li><b>3</b><span>粘贴上面的地址，在对话中选择它开始共读</span></li>
              </ol>
            </section>

            <p className="mcp-footnote">
              “当前书”以微信读书最近打开的书为准。附近正文仅返回当前位置可验证的个人划线及批注原文。
            </p>
          </div>
        </aside>}
      </section>

      {!mcpOpen && (
        <button
          className="mcp-launcher"
          type="button"
          onClick={() => setMcpOpen(true)}
          aria-expanded="false"
          aria-controls="mcp-panel"
        >
          <span><MessageCircleMore size={20} /></span>
          <span><strong>打开共读</strong><small>ChatGPT · MCP</small></span>
        </button>
      )}
      <ShareToChatGPT bookId={selected?.bookId} bookTitle={selected?.title} />
    </main>
  );
}
