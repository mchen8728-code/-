import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getChapters,
  getCurrentBookRecord,
  getHighlights,
  getPersonalReviews,
  getProgress,
  parseRange,
  readingDuration,
  resolveBook,
  unixDate,
  wereadApi,
} from "./weread";

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const bookIdInput = {
  book_id: z.string().optional().describe("微信读书 bookId；省略时使用最近阅读的书"),
};

function result<T extends Record<string, unknown>>(data: T, summary: string) {
  return {
    structuredContent: data,
    content: [{ type: "text" as const, text: `${summary}\n${JSON.stringify(data, null, 2)}` }],
  };
}

export function createWeReadMcpServer() {
  const server = new McpServer(
    { name: "jingjing-weread", version: "1.0.0" },
    {
      instructions:
        "只读访问用户的微信读书数据。未传 book_id 时，把书架中 readUpdateTime 最新的电子书视为当前书。不要声称返回了未由工具提供的正文；get_context_around_position 会明确说明正文覆盖范围。",
    },
  );

  server.registerTool(
    "get_current_book",
    {
      title: "获取当前书籍",
      description: "读取用户在微信读书中最近打开的电子书及基本信息。",
      inputSchema: {},
      outputSchema: {
        book: z.object({
          book_id: z.string(),
          title: z.string(),
          author: z.string().nullable(),
          translator: z.string().nullable(),
          category: z.string().nullable(),
          publisher: z.string().nullable(),
          intro: z.string().nullable(),
          word_count: z.number().nullable(),
          last_read_at: z.string().nullable(),
          deep_link: z.string().nullable(),
        }),
      },
      annotations: readOnlyAnnotations,
    },
    async () => {
      const current = await getCurrentBookRecord();
      const info = await wereadApi<Record<string, unknown>>("/book/info", { bookId: current.bookId });
      const book = {
        book_id: String(current.bookId),
        title: String(info.title ?? current.title),
        author: (info.author ?? current.author ?? null) as string | null,
        translator: (info.translator ?? null) as string | null,
        category: (info.category ?? current.category ?? null) as string | null,
        publisher: (info.publisher ?? null) as string | null,
        intro: (info.intro ?? null) as string | null,
        word_count: typeof info.wordCount === "number" ? info.wordCount : null,
        last_read_at: unixDate(current.readUpdateTime),
        deep_link: (info.deepLink ?? current.deepLink ?? null) as string | null,
      };
      return result({ book }, `当前书籍是《${book.title}》。`);
    },
  );

  server.registerTool(
    "get_current_chapter",
    {
      title: "获取当前章节",
      description: "读取指定书或最近阅读书籍的当前章节、章节内偏移和目录位置。",
      inputSchema: bookIdInput,
      outputSchema: {
        book_id: z.string(),
        book_title: z.string(),
        chapter: z.object({
          chapter_uid: z.number(),
          chapter_index: z.number().nullable(),
          title: z.string().nullable(),
          word_count: z.number().nullable(),
          level: z.number().nullable(),
          chapter_offset: z.number(),
        }).nullable(),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ book_id }) => {
      const book = await resolveBook(book_id);
      const [progress, chapters] = await Promise.all([
        getProgress(book.bookId),
        getChapters(book.bookId),
      ]);
      const chapterUid = progress.book?.chapterUid;
      const match = chapters.find((chapter) => chapter.chapterUid === chapterUid);
      const chapter = typeof chapterUid === "number" ? {
        chapter_uid: chapterUid,
        chapter_index: match?.chapterIdx ?? null,
        title: match?.title ?? null,
        word_count: match?.wordCount ?? null,
        level: match?.level ?? null,
        chapter_offset: progress.book?.chapterOffset ?? 0,
      } : null;
      return result(
        { book_id: String(book.bookId), book_title: book.title, chapter },
        chapter ? `当前读到《${book.title}》的“${chapter.title ?? "未命名章节"}”。` : "没有找到当前章节。",
      );
    },
  );

  server.registerTool(
    "get_reading_progress",
    {
      title: "获取阅读进度",
      description: "读取指定书或最近阅读书籍的进度、累计阅读时长和最后阅读时间。",
      inputSchema: bookIdInput,
      outputSchema: {
        book_id: z.string(),
        book_title: z.string(),
        progress_percent: z.number(),
        chapter_uid: z.number().nullable(),
        chapter_offset: z.number(),
        reading_time_seconds: z.number(),
        reading_time_human: z.string(),
        last_read_at: z.string().nullable(),
        finished_at: z.string().nullable(),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ book_id }) => {
      const book = await resolveBook(book_id);
      const progress = await getProgress(book.bookId);
      const data = {
        book_id: String(book.bookId),
        book_title: book.title,
        progress_percent: progress.book?.progress ?? 0,
        chapter_uid: progress.book?.chapterUid ?? null,
        chapter_offset: progress.book?.chapterOffset ?? 0,
        reading_time_seconds: progress.book?.recordReadingTime ?? 0,
        reading_time_human: readingDuration(progress.book?.recordReadingTime),
        last_read_at: unixDate(progress.book?.updateTime),
        finished_at: unixDate(progress.book?.finishTime),
      };
      return result(data, `《${book.title}》当前进度为 ${data.progress_percent}%。`);
    },
  );

  server.registerTool(
    "get_recent_highlights",
    {
      title: "获取最近划线",
      description: "读取指定书或最近阅读书籍中最近创建的个人划线；不返回书签。",
      inputSchema: {
        ...bookIdInput,
        limit: z.number().int().min(1).max(30).default(10).describe("返回数量，1 到 30"),
      },
      outputSchema: {
        book_id: z.string(),
        book_title: z.string(),
        highlights: z.array(z.object({
          highlight_id: z.string().nullable(),
          text: z.string(),
          chapter_uid: z.number().nullable(),
          chapter_title: z.string().nullable(),
          range: z.string().nullable(),
          created_at: z.string().nullable(),
        })),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ book_id, limit }) => {
      const book = await resolveBook(book_id);
      const data = await getHighlights(book.bookId);
      const chapterMap = new Map(data.chapters.map((chapter) => [chapter.chapterUid, chapter.title ?? null]));
      const highlights = [...data.highlights]
        .sort((left, right) => (right.createTime ?? 0) - (left.createTime ?? 0))
        .slice(0, limit)
        .map((highlight) => ({
          highlight_id: highlight.bookmarkId ?? null,
          text: (highlight.markText ?? "").slice(0, 1000),
          chapter_uid: highlight.chapterUid ?? null,
          chapter_title: highlight.chapterUid ? chapterMap.get(highlight.chapterUid) ?? null : null,
          range: highlight.range ?? null,
          created_at: unixDate(highlight.createTime),
        }));
      return result(
        { book_id: String(book.bookId), book_title: book.title, highlights },
        `读取到《${book.title}》最近的 ${highlights.length} 条划线。`,
      );
    },
  );

  server.registerTool(
    "get_notes",
    {
      title: "获取划线与批注",
      description: "读取指定书或最近阅读书籍的个人划线、划线想法、章节点评和整本书评。",
      inputSchema: {
        ...bookIdInput,
        limit: z.number().int().min(1).max(50).default(20).describe("每类内容的最大返回数量，1 到 50"),
      },
      outputSchema: {
        book_id: z.string(),
        book_title: z.string(),
        highlights: z.array(z.object({
          text: z.string(),
          chapter_uid: z.number().nullable(),
          range: z.string().nullable(),
          created_at: z.string().nullable(),
        })),
        annotations: z.array(z.object({
          note_id: z.string().nullable(),
          content: z.string(),
          source_text: z.string().nullable(),
          chapter_uid: z.number().nullable(),
          chapter_title: z.string().nullable(),
          range: z.string().nullable(),
          created_at: z.string().nullable(),
        })),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ book_id, limit }) => {
      const book = await resolveBook(book_id);
      const [highlightData, reviewData] = await Promise.all([
        getHighlights(book.bookId),
        getPersonalReviews(book.bookId, limit),
      ]);
      const highlights = [...highlightData.highlights]
        .sort((left, right) => (right.createTime ?? 0) - (left.createTime ?? 0))
        .slice(0, limit)
        .map((item) => ({
          text: (item.markText ?? "").slice(0, 1000),
          chapter_uid: item.chapterUid ?? null,
          range: item.range ?? null,
          created_at: unixDate(item.createTime),
        }));
      const annotations = reviewData.map((item) => ({
        note_id: item.reviewId ?? null,
        content: (item.content ?? "").slice(0, 2000),
        source_text: item.abstract ? item.abstract.slice(0, 1000) : null,
        chapter_uid: item.chapterUid ?? null,
        chapter_title: item.chapterName ?? null,
        range: item.range ?? null,
        created_at: unixDate(item.createTime),
      }));
      return result(
        { book_id: String(book.bookId), book_title: book.title, highlights, annotations },
        `读取到 ${highlights.length} 条划线和 ${annotations.length} 条批注。`,
      );
    },
  );

  server.registerTool(
    "get_context_around_position",
    {
      title: "获取当前位置附近上下文",
      description: "围绕当前或指定章节位置，返回附近可验证的个人划线和批注原文。微信读书网关不提供整章正文时会明确说明。",
      inputSchema: {
        ...bookIdInput,
        chapter_uid: z.number().int().optional().describe("章节 UID；省略时使用当前章节"),
        position: z.number().int().min(0).optional().describe("章节内字符偏移；省略时使用当前阅读位置"),
        radius: z.number().int().min(100).max(5000).default(1200).describe("位置前后的字符范围"),
      },
      outputSchema: {
        book_id: z.string(),
        book_title: z.string(),
        chapter_uid: z.number().nullable(),
        chapter_title: z.string().nullable(),
        position: z.number(),
        radius: z.number(),
        body_text_available: z.boolean(),
        coverage: z.string(),
        limitation: z.string().nullable(),
        passages: z.array(z.object({
          kind: z.enum(["highlight", "annotation_source"]),
          text: z.string(),
          annotation: z.string().nullable(),
          range: z.string().nullable(),
          distance: z.number().nullable(),
          within_radius: z.boolean(),
        })),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ book_id, chapter_uid, position, radius }) => {
      const book = await resolveBook(book_id);
      const [progress, chapters, highlightData, reviews] = await Promise.all([
        getProgress(book.bookId),
        getChapters(book.bookId),
        getHighlights(book.bookId),
        getPersonalReviews(book.bookId, 50),
      ]);
      const targetChapter = chapter_uid ?? progress.book?.chapterUid ?? null;
      const targetPosition = position ?? progress.book?.chapterOffset ?? 0;
      const chapter = chapters.find((item) => item.chapterUid === targetChapter);
      const candidates = [
        ...highlightData.highlights
          .filter((item) => item.chapterUid === targetChapter && item.markText)
          .map((item) => ({
            kind: "highlight" as const,
            text: (item.markText ?? "").slice(0, 1200),
            annotation: null,
            range: item.range ?? null,
            parsed: parseRange(item.range),
          })),
        ...reviews
          .filter((item) => item.chapterUid === targetChapter && item.abstract)
          .map((item) => ({
            kind: "annotation_source" as const,
            text: (item.abstract ?? "").slice(0, 1200),
            annotation: item.content ? item.content.slice(0, 1200) : null,
            range: item.range ?? null,
            parsed: parseRange(item.range),
          })),
      ].map((item) => {
        const distance = item.parsed ? Math.abs(item.parsed.start - targetPosition) : null;
        return { ...item, distance, within_radius: distance !== null && distance <= radius };
      }).sort((left, right) => (left.distance ?? Number.MAX_SAFE_INTEGER) - (right.distance ?? Number.MAX_SAFE_INTEGER));
      const inRadius = candidates.filter((item) => item.within_radius);
      const selected = (inRadius.length ? inRadius : candidates).slice(0, 8).map((item) => ({
        kind: item.kind,
        text: item.text,
        annotation: item.annotation,
        range: item.range,
        distance: item.distance,
        within_radius: item.within_radius,
      }));
      const data = {
        book_id: String(book.bookId),
        book_title: book.title,
        chapter_uid: targetChapter,
        chapter_title: chapter?.title ?? null,
        position: targetPosition,
        radius,
        body_text_available: selected.length > 0,
        coverage: "personal_highlights_and_annotation_sources_only",
        limitation: "微信读书 Agent 网关当前未开放按章节偏移读取完整正文；这里只返回该位置附近可验证的个人划线与批注所对应原文。",
        passages: selected,
      };
      return result(data, selected.length ? `找到 ${selected.length} 段可验证的附近文本。` : "当前位置附近没有可读取的个人划线或批注原文。" );
    },
  );

  return server;
}
