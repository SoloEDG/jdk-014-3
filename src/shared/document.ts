export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type Locale = "zh" | "en";
/** What the reader is currently showing. "bi" is a display-only bilingual mode. */
export type ReaderLanguage = Locale | "bi";
export interface DialogueLine {
  /** Stable identity. Translations point at this id, never at a display index. */
  id: string;
  text: string;
  speaker: string;
  /** Authored duration for the source line. Display duration is language-aware. */
  duration: number;
}
export interface Panel {
  id: string;
  rect: Rect;
  lines: DialogueLine[];
  sound: "rain" | "pulse" | "wind";
}
export interface ComicPage {
  id: string;
  title: string;
  image: string;
  width: number;
  height: number;
  panels: Panel[];
}
export interface Chapter {
  id: string;
  title: string;
  subtitle: string;
  pages: ComicPage[];
}

export type TranslationState = "draft" | "reviewed";

/** An immutable snapshot of a translation as it stood before an edit. */
export interface TranslationVersion {
  id: string;
  text: string;
  state: TranslationState;
  sourceText: string;
  by: string;
  at: number;
  note?: string;
}

/** An incoming translation that differs from the version already in the book. */
export interface TranslationConflict {
  id: string;
  text: string;
  state: TranslationState;
  sourceText: string;
  by: string;
  at: number;
}

export interface Translation {
  lineId: string;
  locale: Locale;
  text: string;
  state: TranslationState;
  /** The source text this translation was last checked against. */
  sourceText: string;
  /** True when the source changed after this translation was saved/reviewed. */
  stale: boolean;
  /** Reverted to the original; the text is deliberately empty and history is kept. */
  reverted?: boolean;
  by: string;
  at: number;
  note?: string;
  history: TranslationVersion[];
  conflicts: TranslationConflict[];
}

/** Records how a line acquired its identity (from a split, merge or bulk replace). */
export interface LineageLink {
  id: string;
  lineId: string;
  from: string[];
  kind: "split" | "merge" | "replace";
  at: number;
  by: string;
}

/** Audit trail for source-side changes, kept separately from translation history. */
export interface SourceChange {
  id: string;
  lineId?: string;
  panelId?: string;
  kind: "edit" | "split" | "merge" | "replace";
  before: { id: string; text: string }[];
  after: { id: string; text: string }[];
  at: number;
  by: string;
}

export interface TranslationSettings {
  /** Languages exposed to readers. The source language is always published. */
  published: Locale[];
  sourceLocale: Locale;
}

export interface ComicDocument {
  version: 2;
  id: string;
  title: string;
  author: string;
  chapters: Chapter[];
  /** Keyed by `locale:lineId`. */
  translations: Record<string, Translation>;
  lineage: LineageLink[];
  sourceLog: SourceChange[];
  settings: TranslationSettings;
}

export interface ReadingLocation {
  chapterId: string;
  pageId: string;
  panelId: string;
  zoom: number;
  x: number;
  y: number;
}
export interface Bookmark {
  id: string;
  label: string;
  location: ReadingLocation;
  created: number;
}
export type ReadingMode = "page" | "panel";

/** Per-device reading preferences. Language never changes the reading location. */
export interface LanguagePreference {
  language: ReaderLanguage;
  translator: string;
}
