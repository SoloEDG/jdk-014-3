import type {
  Bookmark,
  ComicDocument,
  Locale,
  ReaderLanguage,
  ReadingLocation,
} from "../../../shared/document";
import { migrateDocument, migrateReaderLanguage } from "../../../shared/migration";

export interface SavedSession {
  document: ComicDocument;
  location: ReadingLocation;
  bookmarks: Bookmark[];
  language?: ReaderLanguage;
  translator?: string;
  /** Locale used when the session was created, for migration hints. */
  lastLocale?: Locale;
}

const KEY = "panel-jdk014-v1";

export function readSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || typeof value !== "object") return null;
    const document = migrateDocument(value.document);
    if (!document) return null;
    if (!value.location || typeof value.location !== "object") return null;
    if (!Array.isArray(value.bookmarks)) return null;
    const bookmarks = (value.bookmarks as Bookmark[]).filter(
      (mark) =>
        mark &&
        typeof mark.id === "string" &&
        mark.location &&
        typeof mark.location.pageId === "string",
    );
    return {
      document,
      location: value.location as ReadingLocation,
      bookmarks,
      language: migrateReaderLanguage(document, value.language),
      translator:
        typeof value.translator === "string" && value.translator.trim()
          ? value.translator.trim()
          : undefined,
    };
  } catch {
    return null;
  }
}

export function writeSession(value: SavedSession): string {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
    return "已保存到此浏览器";
  } catch {
    return "存储空间不足，本次修改仅保留在当前页面；请减少导入图片";
  }
}

/** A separate key so a full bilingual read-book can be exported and re-imported. */
export const BOOK_KEY = "panel-jdk014-readbook-v1";

export function exportDocument(doc: ComicDocument) {
  return JSON.stringify(doc, null, 2);
}

export function readDocument(raw: string): ComicDocument | null {
  try {
    return migrateDocument(JSON.parse(raw));
  } catch {
    return null;
  }
}
