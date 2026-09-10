import { NextResponse } from "next/server";
import { getChapters, getProgress, unixDate, wereadApi, type WeReadBook } from "@/lib/weread";

export const dynamic = "force-dynamic";

function coverFromBook(book: WeReadBook) {
  return book.cover || book.coverUrl || book.cover_url || null;
}

export async function GET() {
  try {
    const shelf = await wereadApi<{ books?: WeReadBook[] }>("/shelf/sync");
    const books = [...(shelf.books ?? [])]
      .sort((left, right) => (right.readUpdateTime ?? 0) - (left.readUpdateTime ?? 0))
      .slice(0, 3);

    const recent = await Promise.all(books.map(async (shelfBook) => {
      const [progressResult, chaptersResult, infoResult] = await Promise.allSettled([
        getProgress(shelfBook.bookId),
        getChapters(shelfBook.bookId),
        wereadApi<WeReadBook>("/book/info", { bookId: shelfBook.bookId }),
      ]);
      const progress = progressResult.status === "fulfilled" ? progressResult.value : null;
      const chapters = chaptersResult.status === "fulfilled" ? chaptersResult.value : [];
      const info = infoResult.status === "fulfilled" ? infoResult.value : shelfBook;
      const chapterUid = progress?.book?.chapterUid;
      const chapter = chapters.find((item) => item.chapterUid === chapterUid);
      return {
        bookId: String(shelfBook.bookId),
        title: shelfBook.title,
        author: shelfBook.author ?? "",
        cover: coverFromBook(info),
        progress: progress?.book?.progress ?? 0,
        chapterUid: chapterUid ?? null,
        chapterTitle: chapter?.title ?? null,
        lastReadAt: unixDate(progress?.book?.updateTime ?? shelfBook.readUpdateTime),
        readingSeconds: progress?.book?.recordReadingTime ?? null,
        deepLink: info.deepLink || shelfBook.deepLink || null,
      };
    }));

    return NextResponse.json({ books: recent });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "最近阅读暂时没有同步好", books: [] },
      { status: 502 },
    );
  }
}
