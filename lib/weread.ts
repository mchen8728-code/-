const WEREAD_GATEWAY = "https://i.weread.qq.com/api/agent/gateway";
const SKILL_VERSION = "1.0.4";

export type WeReadBook = {
  bookId: string;
  title: string;
  author?: string;
  category?: string;
  readUpdateTime?: number;
  finishReading?: number;
  secret?: number;
  deepLink?: string;
  cover?: string;
  coverUrl?: string;
  cover_url?: string;
};

export type WeReadProgress = {
  bookId: string;
  book?: {
    chapterUid?: number;
    chapterOffset?: number;
    progress?: number;
    updateTime?: number;
    recordReadingTime?: number;
    finishTime?: number;
    isStartReading?: number;
  };
  timestamp?: number;
};

export type WeReadChapter = {
  chapterUid: number;
  chapterIdx?: number;
  title?: string;
  wordCount?: number;
  level?: number;
  paid?: number;
  anchors?: unknown[];
};

export type WeReadHighlight = {
  bookmarkId?: string;
  bookId?: string;
  chapterUid?: number;
  markText?: string;
  createTime?: number;
  range?: string;
  colorStyle?: number;
};

export async function wereadApi<T>(
  apiName: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const apiKey = process.env.WEREAD_API_KEY;
  if (!apiKey) throw new Error("WEREAD_API_KEY is not configured");

  const response = await fetch(WEREAD_GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ api_name: apiName, ...params, skill_version: SKILL_VERSION }),
    cache: "no-store",
  });
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok || (typeof data.errcode === "number" && data.errcode !== 0)) {
    throw new Error(String(data.errmsg || `WeRead request failed: ${apiName}`));
  }
  if (data.upgrade_info) {
    const upgrade = data.upgrade_info as { message?: string };
    throw new Error(upgrade.message || "WeRead skill upgrade required");
  }
  return data as T;
}

export async function getCurrentBookRecord(): Promise<WeReadBook> {
  const shelf = await wereadApi<{ books?: WeReadBook[] }>("/shelf/sync");
  const books = [...(shelf.books ?? [])].sort(
    (left, right) => (right.readUpdateTime ?? 0) - (left.readUpdateTime ?? 0),
  );
  if (!books[0]) throw new Error("No current book was found on the WeRead shelf");
  return books[0];
}

export async function resolveBook(bookId?: string): Promise<WeReadBook> {
  if (!bookId) return getCurrentBookRecord();
  const shelf = await wereadApi<{ books?: WeReadBook[] }>("/shelf/sync");
  const match = (shelf.books ?? []).find((book) => String(book.bookId) === String(bookId));
  if (match) return match;
  const info = await wereadApi<WeReadBook>("/book/info", { bookId });
  return { ...info, bookId: String(info.bookId ?? bookId) };
}

export async function getProgress(bookId: string): Promise<WeReadProgress> {
  return wereadApi<WeReadProgress>("/book/getprogress", { bookId });
}

export async function getChapters(bookId: string): Promise<WeReadChapter[]> {
  const result = await wereadApi<{ chapters?: WeReadChapter[] }>("/book/chapterinfo", { bookId });
  return result.chapters ?? [];
}

export async function getHighlights(bookId: string): Promise<{
  highlights: WeReadHighlight[];
  chapters: WeReadChapter[];
}> {
  const result = await wereadApi<{
    updated?: WeReadHighlight[];
    chapters?: WeReadChapter[];
  }>("/book/bookmarklist", { bookId });
  return { highlights: result.updated ?? [], chapters: result.chapters ?? [] };
}

export type PersonalReview = {
  reviewId?: string;
  content?: string;
  abstract?: string;
  range?: string;
  chapterUid?: number;
  chapterIdx?: number;
  chapterName?: string;
  createTime?: number;
  star?: number;
  isFinish?: number;
};

export async function getPersonalReviews(bookId: string, limit: number): Promise<PersonalReview[]> {
  const reviews: PersonalReview[] = [];
  let synckey = 0;
  let hasMore = 1;

  while (hasMore === 1 && reviews.length < limit) {
    const result = await wereadApi<{
      reviews?: Array<{ review?: PersonalReview }>;
      hasMore?: number;
      synckey?: number;
    }>("/review/list/mine", {
      bookid: bookId,
      synckey,
      count: Math.min(20, limit - reviews.length),
    });
    reviews.push(...(result.reviews ?? []).map((entry) => entry.review ?? {}));
    hasMore = result.hasMore ?? 0;
    if (!result.synckey || result.synckey === synckey) break;
    synckey = result.synckey;
  }
  return reviews.slice(0, limit);
}

export function unixDate(value?: number): string | null {
  if (!value) return null;
  return new Date(value * 1000).toISOString();
}

export function readingDuration(seconds?: number): string {
  const total = Math.max(0, seconds ?? 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours}小时${minutes}分钟` : `${minutes}分钟`;
}

export function parseRange(range?: string): { start: number; end: number } | null {
  if (!range) return null;
  const match = range.match(/^(\d+)-(\d+)$/);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]) };
}
