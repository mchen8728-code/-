import { wereadApi, connectionFailure } from "@/lib/weread";
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
  try {
  const data = await wereadApi<NotebookResponse>("/user/notebooks", { count: 100 });
  const books = (Array.isArray(data.books) ? data.books : []).map((item) => ({
    bookId: String(item.bookId),
    title: item.book?.title ?? "未命名",
    author: item.book?.author ?? "",
    totalNotes: (item.reviewCount ?? 0) + (item.noteCount ?? 0) + (item.bookmarkCount ?? 0),
    readingProgress: item.readingProgress ?? 0,
  }));
  return NextResponse.json({ books, totalBookCount: data.totalBookCount, totalNoteCount: data.totalNoteCount });
  } catch (error) {
    return NextResponse.json({ ...connectionFailure(error), books: [] }, { status: 502 });
  }
}
