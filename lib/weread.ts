import { getWeReadKey } from "./weread-key";
const WEREAD_GATEWAY = "https://i.weread.qq.com/api/agent/gateway";
export const SKILL_VERSION = "1.0.6";

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

export class WeReadApiError extends Error {
  constructor(public code: "auth" | "timeout" | "network" | "upstream" | "missing_key" | "invalid_response", message: string, public upstreamStatus?: number, public upstreamCode?: string) {
    super(message);
    this.name = "WeReadApiError";
  }
}

export function connectionFailure(error: unknown) {
  if (error instanceof WeReadApiError) {
    return { error: error.message, code: error.code, upstreamStatus: error.upstreamStatus, upstreamCode: error.upstreamCode };
  }
  return { error: "小屋暂时无法完成连接，请稍后重试。", code: "internal" };
}

export async function wereadApi<T>(
  apiName: string,
  params: Record<string, unknown> = {},
  keyOverride?: string,
): Promise<T> {
  const apiKey = keyOverride || await getWeReadKey();
  if (!apiKey) throw new WeReadApiError("missing_key", "尚未配置微信读书 API Key，请重新接入。");
  let response: Response;
  try {
    response = await fetch(WEREAD_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ api_name: apiName, ...params, skill_version: SKILL_VERSION }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    throw new WeReadApiError(timeout ? "timeout" : "network", timeout
      ? "连接微信读书超时，请稍后重试。"
      : "小屋服务器暂时无法访问微信读书，请稍后重试。");
  }
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = await response.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    data = parsed as Record<string, unknown>;
  } catch {
    throw new WeReadApiError("invalid_response", "微信读书返回了异常响应，请稍后重试。", response.status);
  }
  const errcode = data.errcode;
  if (!response.ok || (errcode !== undefined && String(errcode) !== "0")) {
    const upstreamCode = typeof errcode === "number" || typeof errcode === "string" && /^-?\d{1,12}$/.test(errcode) ? String(errcode) : undefined;
    const auth = response.status === 401 || response.status === 403
      || /鉴权|授权|凭证|密钥|api.?key|token|unauthori[sz]ed|authentication/i.test(String(data.errmsg || ""));
    throw new WeReadApiError(auth ? "auth" : "upstream", auth
      ? "微信读书拒绝了此 API Key（鉴权失败）。请从官方页面重新获取并复制完整 Key。"
      : "微信读书暂时无法处理请求，请稍后重试。", response.status, upstreamCode);
  }
  // upgrade_info is advisory; successful business data must remain usable.
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
