import { NextResponse } from "next/server";

const gateway = "https://i.weread.qq.com/api/agent/gateway";

type ShelfBook = {
  bookId: string | number;
  title?: string;
  author?: string;
  category?: string;
  readUpdateTime?: number;
  finishReading?: number;
  secret?: number;
  deepLink?: string;
};

type ShelfAlbum = { albumInfoExtra?: { secret?: number } };
type ShelfResponse = {
  errcode?: number;
  errmsg?: string;
  upgrade_info?: { message?: string };
  books?: ShelfBook[];
  albums?: ShelfAlbum[];
  mp?: Record<string, unknown>;
};

export async function GET() {
  const apiKey = process.env.WEREAD_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "微信读书尚未连接" }, { status: 503 });

  const response = await fetch(gateway, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ api_name: "/shelf/sync", skill_version: "1.0.4" }),
    cache: "no-store",
  });
  const data = await response.json() as ShelfResponse;
  if (!response.ok || data.errcode) {
    return NextResponse.json({ error: data.errmsg || "书架信息暂时没拉到" }, { status: 502 });
  }
  if (data.upgrade_info) {
    return NextResponse.json({ error: data.upgrade_info.message || "微信读书接口需要升级" }, { status: 503 });
  }

  const books = Array.isArray(data.books) ? data.books : [];
  const albums = Array.isArray(data.albums) ? data.albums : [];
  const hasMp = Boolean(data.mp && Object.keys(data.mp).length);
  const publicCount = books.filter((book) => (book.secret ?? 0) === 0).length
    + albums.filter((album) => (album.albumInfoExtra?.secret ?? 0) === 0).length;
  const privateCount = books.filter((book) => book.secret === 1).length
    + albums.filter((album) => album.albumInfoExtra?.secret === 1).length
    + (hasMp ? 1 : 0);

  books.sort((a, b) => (b.readUpdateTime ?? 0) - (a.readUpdateTime ?? 0));
  return NextResponse.json({
    books: books.map((book) => ({
      bookId: String(book.bookId),
      title: book.title,
      author: book.author,
      category: book.category,
      readUpdateTime: book.readUpdateTime,
      finishReading: book.finishReading,
      secret: book.secret,
      deepLink: book.deepLink,
    })),
    total: books.length + albums.length + (hasMp ? 1 : 0),
    publicCount,
    privateCount,
  });
}
