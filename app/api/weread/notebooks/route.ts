import { NextResponse } from "next/server";

type NotebookItem = {
  bookId: string | number;
  book?: { title?: string; author?: string };
  reviewCount?: number;
  noteCount?: number;
  bookmarkCount?: number;
  readingProgress?: number;
};

type NotebookResponse = {
  errcode?: number;
  upgrade_info?: unknown;
  books?: NotebookItem[];
  totalBookCount?: number;
  totalNoteCount?: number;
};

export async function GET() {
  const apiKey = process.env.WEREAD_API_KEY;
  if (!apiKey) return NextResponse.json({ books: [] }, { status: 503 });
  const response = await fetch("https://i.weread.qq.com/api/agent/gateway", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ api_name: "/user/notebooks", count: 100, skill_version: "1.0.4" }),
    cache: "no-store",
  });
  const data = await response.json() as NotebookResponse;
  if (!response.ok || data.errcode || data.upgrade_info) return NextResponse.json({ books: [] });
  const books = (Array.isArray(data.books) ? data.books : []).map((item) => ({
    bookId: String(item.bookId),
    title: item.book?.title ?? "未命名",
    author: item.book?.author ?? "",
    totalNotes: (item.reviewCount ?? 0) + (item.noteCount ?? 0) + (item.bookmarkCount ?? 0),
    readingProgress: item.readingProgress ?? 0,
  }));
  return NextResponse.json({ books, totalBookCount: data.totalBookCount, totalNoteCount: data.totalNoteCount });
}
