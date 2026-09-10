import { NextRequest, NextResponse } from "next/server";
import {
  getChapters,
  getHighlights,
  getPersonalReviews,
  getProgress,
  parseRange,
  resolveBook,
  unixDate,
} from "@/lib/weread";

export const dynamic = "force-dynamic";

function distanceFromPosition(range: string | undefined, position: number) {
  const parsed = parseRange(range);
  return parsed ? Math.abs(parsed.start - position) : Number.MAX_SAFE_INTEGER;
}

export async function GET(request: NextRequest) {
  try {
    const bookId = request.nextUrl.searchParams.get("book_id") || undefined;
    const book = await resolveBook(bookId);
    const [progress, chapters, highlightData, reviews] = await Promise.all([
      getProgress(book.bookId),
      getChapters(book.bookId),
      getHighlights(book.bookId),
      getPersonalReviews(book.bookId, 20),
    ]);

    const chapterUid = progress.book?.chapterUid ?? null;
    const position = progress.book?.chapterOffset ?? 0;
    const chapter = chapters.find((item) => item.chapterUid === chapterUid);

    const relatedHighlights = highlightData.highlights
      .filter((item) => item.chapterUid === chapterUid && item.markText)
      .sort((left, right) => {
        const distance = distanceFromPosition(left.range, position) - distanceFromPosition(right.range, position);
        return distance || (right.createTime ?? 0) - (left.createTime ?? 0);
      })
      .slice(0, 3)
      .map((item) => ({
        id: item.bookmarkId ?? `${item.chapterUid}-${item.range}`,
        text: (item.markText ?? "").slice(0, 500),
        range: item.range ?? null,
        created_at: unixDate(item.createTime),
      }));

    const relatedNotes = reviews
      .filter((item) => item.chapterUid === chapterUid && item.content)
      .sort((left, right) => {
        const distance = distanceFromPosition(left.range, position) - distanceFromPosition(right.range, position);
        return distance || (right.createTime ?? 0) - (left.createTime ?? 0);
      })
      .slice(0, 2)
      .map((item) => ({
        id: item.reviewId ?? `${item.chapterUid}-${item.range}-${item.createTime}`,
        content: (item.content ?? "").slice(0, 700),
        source_text: item.abstract ? item.abstract.slice(0, 500) : null,
        range: item.range ?? null,
      }));

    const nearbyCandidates = [
      ...relatedHighlights.map((item) => ({
        text: item.text,
        range: item.range,
      })),
      ...relatedNotes
        .filter((item) => item.source_text)
        .map((item) => ({ text: item.source_text ?? "", range: item.range })),
    ]
      .sort((left, right) =>
        distanceFromPosition(left.range ?? undefined, position) - distanceFromPosition(right.range ?? undefined, position),
      )
      .slice(0, 2);

    return NextResponse.json({
      book: {
        book_id: String(book.bookId),
        title: book.title,
        author: book.author ?? null,
      },
      chapter: {
        chapter_uid: chapterUid,
        title: chapter?.title ?? null,
        position,
      },
      progress_percent: progress.book?.progress ?? 0,
      nearby_text: nearbyCandidates.map((item) => item.text).filter(Boolean).join("\n\n"),
      context_scope: "personal_highlights_and_annotation_sources_only",
      highlights: relatedHighlights,
      notes: relatedNotes,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "共读上下文暂时没有整理好" },
      { status: 502 },
    );
  }
}
