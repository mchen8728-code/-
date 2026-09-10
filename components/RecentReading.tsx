"use client";

import { BookOpen, ChevronRight, Clock3, LoaderCircle, MessageCircleHeart, NotebookPen } from "lucide-react";
import { useEffect, useState } from "react";
import { syncRecentBooks } from "@/lib/local-reading";
import { appFetch } from "@/lib/platform";

export type RecentBook = {
  bookId: string;
  title: string;
  author: string;
  cover: string | null;
  progress: number;
  chapterUid: number | null;
  chapterTitle: string | null;
  lastReadAt: string | null;
  readingSeconds: number | null;
  deepLink: string | null;
};

type Props = {
  onSelectBook: (bookId: string) => void;
  onOpenNotes: (bookId: string) => void;
  onTalk: (bookId: string) => void;
};

function relativeDate(value: string | null) {
  if (!value) return "最近时间未提供";
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return "今天读过";
  if (days === 1) return "昨天读过";
  if (days < 30) return `${days} 天前读过`;
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value));
}

export default function RecentReading({ onSelectBook, onOpenNotes, onTalk }: Props) {
  const [books, setBooks] = useState<RecentBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    appFetch("/api/weread/recent", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { books?: RecentBook[]; error?: string };
        if (!response.ok) throw new Error(result.error || "最近阅读暂时没有同步好");
        return result.books || [];
      })
      .then((items) => {
        setBooks(items);
        syncRecentBooks(items.map((book) => ({
          bookId: book.bookId, title: book.title, author: book.author, cover: book.cover,
          deepLink: book.deepLink, progress: book.progress, lastReadAt: book.lastReadAt,
          readingSeconds: book.readingSeconds,
        })));
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "最近阅读暂时没有同步好"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="recent-reading" aria-labelledby="recent-title">
      <div className="recent-heading"><div><span className="eyebrow">RECENTLY READING</span><h3 id="recent-title">最近在读</h3></div><small>最多 3 本</small></div>
      {loading && <div className="recent-loading"><LoaderCircle className="spin" size={17} />正在找回最近翻过的书…</div>}
      {error && <p className="recent-error">{error}</p>}
      {!loading && !error && books.length === 0 && <p className="recent-empty">微信读书暂时没有返回最近阅读记录。</p>}
      <div className="recent-grid">
        {books.map((book, index) => (
          <article className="recent-card" key={book.bookId}>
            <button className="recent-cover" type="button" onClick={() => onSelectBook(book.bookId)} aria-label={`查看《${book.title}》`}>
              {book.cover ? (
                // The gateway may return an authenticated or dynamic cover host, so native img is intentional here.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={book.cover} alt="" />
              ) : <span className={`recent-spine tone-${index % 3}`}><BookOpen size={22} /></span>}
            </button>
            <div className="recent-copy">
              <strong>{book.title}</strong>
              <span>{book.chapterTitle || "最近章节名称暂缺"}</span>
              <div className="recent-progress"><i style={{ width: `${Math.max(0, Math.min(100, book.progress))}%` }} /><b>{book.progress}%</b></div>
              <small><Clock3 size={12} />{relativeDate(book.lastReadAt)}</small>
            </div>
            <div className="recent-actions">
              {book.deepLink ? (
                <a href={book.deepLink} target="_blank" rel="noreferrer" onClick={() => onSelectBook(book.bookId)}>继续阅读 <ChevronRight size={14} /></a>
              ) : (
                <button type="button" onClick={() => onSelectBook(book.bookId)}>继续阅读 <ChevronRight size={14} /></button>
              )}
              <button type="button" onClick={() => onOpenNotes(book.bookId)}><NotebookPen size={14} />我的笔记</button>
              <button type="button" onClick={() => onTalk(book.bookId)}><MessageCircleHeart size={14} />和阿砚聊</button>
            </div>
          </article>
        ))}
      </div>
      <p className="recent-limit-note">没有微信读书跳转链接的书，会回到小屋里的共读详情，不会在这里加载付费正文。</p>
    </section>
  );
}
