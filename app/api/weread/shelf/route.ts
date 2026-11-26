import { wereadApi, connectionFailure } from "@/lib/weread";
import { NextResponse } from "next/server";


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
  try {
  const data = await wereadApi<ShelfResponse>("/shelf/sync");

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
  } catch (error) {
    return NextResponse.json(connectionFailure(error), { status: 502 });
  }
}
