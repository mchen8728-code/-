export type BookSnapshot = {
  bookId: string;
  title: string;
  author?: string;
  cover?: string | null;
  deepLink?: string | null;
  progress?: number;
  lastReadAt?: string | null;
  finishedAt?: string | null;
  readingSeconds?: number | null;
  highlightCount?: number;
  noteCount?: number;
};

export type ReadingActivity = {
  id: string;
  type: "continue" | "progress" | "finished";
  bookId: string;
  createdAt: string;
  progress?: number;
};

export type LocalHighlight = {
  id: string;
  bookId: string;
  bookTitle: string;
  chapterUid?: number | null;
  chapterTitle?: string | null;
  text: string;
  createdAt: string;
};

export type LocalNote = {
  id: string;
  bookId: string;
  bookTitle: string;
  chapterUid?: number | null;
  chapterTitle?: string | null;
  content: string;
  sourceText?: string | null;
  createdAt: string;
};

export type CoReadingTrace = {
  id: string;
  bookId: string;
  bookTitle: string;
  author?: string;
  chapterUid?: number | null;
  chapterTitle?: string | null;
  highlightId?: string | null;
  noteId?: string | null;
  sourceText?: string;
  sourceNote?: string;
  question: string;
  discussion: string;
  createdAt: string;
};

export type BookRelation = {
  id: string;
  fromBookId: string;
  toBookId: string;
  relation: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type Aftertaste = {
  bookId: string;
  answers: Record<string, string>;
  freeText: string;
  updatedAt: string;
  createdAt: string;
};

export type Bookplate = {
  id: string;
  bookId: string;
  theme: "classic" | "minimal" | "cottage";
  quote: string;
  createdAt: string;
};

export type CoReadEvent = { id: string; bookId?: string; createdAt: string };

export type ReadingMemory = {
  version: 2;
  activeDays: string[];
  coReadDates: string[];
  coReads: CoReadEvent[];
  syncedNotes: Record<string, string>;
  books: Record<string, BookSnapshot>;
  activities: ReadingActivity[];
  highlights: LocalHighlight[];
  notes: LocalNote[];
  traces: CoReadingTrace[];
  relations: BookRelation[];
  aftertastes: Record<string, Aftertaste>;
  bookplates: Bookplate[];
  revisitCounts: Record<string, number>;
  revisits: Array<{ bookId: string; createdAt: string }>;
};

const memoryKey = "reading-room:v1:memory";

function emptyMemory(): ReadingMemory {
  return { version: 2, activeDays: [], coReadDates: [], coReads: [], syncedNotes: {}, books: {}, activities: [], highlights: [], notes: [], traces: [], relations: [], aftertastes: {}, bookplates: [], revisitCounts: {}, revisits: [] };
}

export function readReadingMemory(): ReadingMemory {
  if (typeof window === "undefined") return emptyMemory();
  try {
    const value = JSON.parse(window.localStorage.getItem(memoryKey) || "{}") as Partial<ReadingMemory>;
    return {
      ...emptyMemory(), ...value, version: 2,
      activeDays: Array.isArray(value.activeDays) ? value.activeDays : [],
      coReadDates: Array.isArray(value.coReadDates) ? value.coReadDates : [],
      coReads: Array.isArray(value.coReads) ? value.coReads : [],
      syncedNotes: value.syncedNotes && typeof value.syncedNotes === "object" ? value.syncedNotes : {},
      books: value.books && typeof value.books === "object" ? value.books : {},
      activities: Array.isArray(value.activities) ? value.activities : [],
      highlights: Array.isArray(value.highlights) ? value.highlights : [],
      notes: Array.isArray(value.notes) ? value.notes : [],
      traces: Array.isArray(value.traces) ? value.traces : [],
      relations: Array.isArray(value.relations) ? value.relations : [],
      aftertastes: value.aftertastes && typeof value.aftertastes === "object" ? value.aftertastes : {},
      bookplates: Array.isArray(value.bookplates) ? value.bookplates : [],
      revisitCounts: value.revisitCounts && typeof value.revisitCounts === "object" ? value.revisitCounts : {},
      revisits: Array.isArray(value.revisits) ? value.revisits : [],
    };
  } catch { return emptyMemory(); }
}

function writeMemory(memory: ReadingMemory) {
  window.localStorage.setItem(memoryKey, JSON.stringify(memory));
  window.dispatchEvent(new Event("reading-room:local-state-changed"));
}

function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function knownDate(value?: string | null) {
  return value && !Number.isNaN(new Date(value).getTime()) ? value : null;
}

function upsertBook(memory: ReadingMemory, book: BookSnapshot) {
  memory.books[book.bookId] = { ...memory.books[book.bookId], ...book };
}

function addActivity(memory: ReadingMemory, activity: ReadingActivity) {
  if (!memory.activities.some((item) => item.id === activity.id)) memory.activities.push(activity);
  memory.activities = memory.activities.slice(-600);
}

export function rememberReadingDay() {
  const memory = readReadingMemory();
  const today = localDay();
  if (!memory.activeDays.includes(today)) { memory.activeDays.push(today); writeMemory(memory); }
}

export function rememberBookVisit(book: BookSnapshot) {
  const memory = readReadingMemory();
  upsertBook(memory, book);
  const day = localDay();
  addActivity(memory, { id: `continue:${book.bookId}:${day}`, type: "continue", bookId: book.bookId, createdAt: new Date().toISOString() });
  if (!memory.activeDays.includes(day)) memory.activeDays.push(day);
  writeMemory(memory);
}

export function syncRecentBooks(books: BookSnapshot[]) {
  const memory = readReadingMemory();
  books.forEach((book) => {
    const previous = memory.books[book.bookId];
    upsertBook(memory, book);
    if (typeof book.progress === "number" && previous?.progress !== book.progress) {
      const stamp = knownDate(book.lastReadAt);
      if (stamp) addActivity(memory, { id: `progress:${book.bookId}:${stamp}:${book.progress}`, type: "progress", bookId: book.bookId, createdAt: stamp, progress: book.progress });
    }
    if ((book.progress ?? 0) >= 100 && !previous?.finishedAt) {
      const stamp = knownDate(book.lastReadAt);
      if (stamp) {
        memory.books[book.bookId].finishedAt = stamp;
        addActivity(memory, { id: `finished:${book.bookId}`, type: "finished", bookId: book.bookId, createdAt: stamp, progress: 100 });
      }
    }
  });
  writeMemory(memory);
}

export function syncBookNotes(input: {
  book: BookSnapshot;
  highlights: Array<Omit<LocalHighlight, "bookId" | "bookTitle">>;
  notes: Array<Omit<LocalNote, "bookId" | "bookTitle">>;
}) {
  const memory = readReadingMemory();
  upsertBook(memory, { ...input.book, highlightCount: input.highlights.length, noteCount: input.notes.length });
  // The MCP response is the current source of truth for WeRead annotations.
  // Replace this book's synced entries so annotations deleted in WeRead
  // disappear locally on the next sync, while preserving other books and
  // separate co-reading traces.
  const bookId = input.book.bookId;
  memory.highlights = memory.highlights.filter((item) => item.bookId !== bookId);
  memory.notes = memory.notes.filter((item) => item.bookId !== bookId);
  memory.highlights.push(...input.highlights.map((item) => ({
    ...item,
    bookId,
    bookTitle: input.book.title,
    text: item.text.slice(0, 1000),
    createdAt: knownDate(item.createdAt) || "",
  })));
  memory.notes.push(...input.notes.map((item) => ({
    ...item,
    bookId,
    bookTitle: input.book.title,
    content: item.content.slice(0, 1600),
    sourceText: item.sourceText?.slice(0, 800),
    createdAt: knownDate(item.createdAt) || "",
  })));
  const currentNoteKeys = new Set(input.notes.map((item) => `${bookId}:${item.id}`));
  Object.keys(memory.syncedNotes).forEach((key) => {
    if (key.startsWith(`${bookId}:`) && !currentNoteKeys.has(key)) delete memory.syncedNotes[key];
  });
  input.notes.forEach((item) => {
    const key = `${bookId}:${item.id}`;
    if (knownDate(item.createdAt)) memory.syncedNotes[key] = item.createdAt;
  });
  memory.highlights = memory.highlights.slice(-500);
  memory.notes = memory.notes.slice(-400);
  writeMemory(memory);
}

export function rememberSyncedNotes(notes: Array<{ id: string; createdAt?: string | null }>) {
  const memory = readReadingMemory();
  let changed = false;
  notes.forEach((note) => { if (!memory.syncedNotes[note.id] && note.createdAt) { memory.syncedNotes[note.id] = note.createdAt; changed = true; } });
  if (changed) writeMemory(memory);
}

export function rememberCoRead(book?: BookSnapshot) {
  const memory = readReadingMemory();
  const now = new Date().toISOString();
  memory.coReads.push({ id: crypto.randomUUID(), bookId: book?.bookId, createdAt: now });
  if (book) upsertBook(memory, book);
  if (!memory.activeDays.includes(localDay())) memory.activeDays.push(localDay());
  writeMemory(memory);
}

export function saveTrace(trace: CoReadingTrace) {
  const memory = readReadingMemory();
  memory.traces.unshift(trace);
  memory.traces = memory.traces.slice(0, 200);
  upsertBook(memory, { bookId: trace.bookId, title: trace.bookTitle, author: trace.author });
  if (!memory.activeDays.includes(localDay())) memory.activeDays.push(localDay());
  writeMemory(memory);
}

export function saveAftertaste(aftertaste: Aftertaste) {
  const memory = readReadingMemory();
  memory.aftertastes[aftertaste.bookId] = aftertaste;
  writeMemory(memory);
}

export function saveBookplate(bookplate: Bookplate) {
  const memory = readReadingMemory();
  memory.bookplates.unshift(bookplate);
  memory.bookplates = memory.bookplates.slice(0, 120);
  writeMemory(memory);
}

export function saveRelation(relation: BookRelation) {
  const memory = readReadingMemory();
  const index = memory.relations.findIndex((item) => item.id === relation.id);
  if (index >= 0) memory.relations[index] = relation; else memory.relations.unshift(relation);
  writeMemory(memory);
}

export function deleteRelation(id: string) {
  const memory = readReadingMemory();
  memory.relations = memory.relations.filter((item) => item.id !== id);
  writeMemory(memory);
}

export function rememberRevisit(key: string) {
  const memory = readReadingMemory();
  memory.revisitCounts[key] = (memory.revisitCounts[key] ?? 0) + 1;
  memory.revisits.push({ bookId: key, createdAt: new Date().toISOString() });
  writeMemory(memory);
}

export function getTraces(bookId?: string) {
  const traces = readReadingMemory().traces;
  return bookId ? traces.filter((trace) => trace.bookId === bookId) : traces;
}

export function getMonthlyStats(date = new Date()) {
  const memory = readReadingMemory();
  const prefix = localDay(date).slice(0, 7);
  return {
    readingDays: new Set(memory.activeDays.filter((day) => day.startsWith(prefix))).size,
    noteCount: Object.values(memory.syncedNotes).filter((value) => value.startsWith(prefix)).length,
    coReadCount: memory.coReadDates.filter((value) => value.startsWith(prefix)).length + memory.coReads.filter((value) => value.createdAt.startsWith(prefix)).length,
  };
}
