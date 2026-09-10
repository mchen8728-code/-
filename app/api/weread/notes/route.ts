import { NextRequest, NextResponse } from "next/server";
import { getHighlights, getPersonalReviews, resolveBook, unixDate } from "@/lib/weread";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const bookId = request.nextUrl.searchParams.get("book_id") || undefined;
    const book = await resolveBook(bookId);
    const [highlightData, reviews] = await Promise.all([
      getHighlights(book.bookId),
      getPersonalReviews(book.bookId, 100),
    ]);
    const chapters = highlightData.chapters;
    const chapterMap = new Map(chapters.map((chapter) => [chapter.chapterUid, chapter.title || `第 ${chapter.chapterIdx ?? "?"} 章`]));

    return NextResponse.json({
      book: { bookId: String(book.bookId), title: book.title, author: book.author ?? "", deepLink: book.deepLink ?? null },
      highlights: highlightData.highlights.slice(0, 200).map((item) => ({
        id: item.bookmarkId || `${item.chapterUid}-${item.range}`,
        chapterUid: item.chapterUid ?? null,
        chapterTitle: item.chapterUid != null ? chapterMap.get(item.chapterUid) || null : null,
        text: (item.markText || "").slice(0, 1000),
        range: item.range ?? null,
        createdAt: unixDate(item.createTime),
      })).filter((item) => item.text),
      notes: reviews.map((item) => ({
        id: item.reviewId || `${item.chapterUid}-${item.range}-${item.createTime}`,
        chapterUid: item.chapterUid ?? null,
        chapterTitle: item.chapterName || (item.chapterUid != null ? chapterMap.get(item.chapterUid) : null) || null,
        content: (item.content || "").slice(0, 2000),
        sourceText: item.abstract ? item.abstract.slice(0, 1000) : null,
        range: item.range ?? null,
        createdAt: unixDate(item.createTime),
      })).filter((item) => item.content),
      capability: {
        fullTextAvailable: false,
        contextScope: "user_highlights_and_personal_note_abstracts_only",
        preciseChapterLinkAvailable: false,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "笔记暂时没有同步好" },
      { status: 502 },
    );
  }
}
