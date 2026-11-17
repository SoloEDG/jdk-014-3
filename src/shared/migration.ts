import type {
  ComicDocument,
  Chapter,
  ComicPage,
  DialogueLine,
  Locale,
  Panel,
  ReaderLanguage,
  Translation,
  TranslationState,
} from "./document";
import { makeId } from "./commands";

const SOURCE_LOCALE: Locale = "zh";

/**
 * Older sessions stored one `dialogue` string per panel. Migration keeps that
 * single utterance as one line so bookmarks and reading positions stay valid.
 */
export function migrateDocument(value: unknown): ComicDocument | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.chapters) || !raw.chapters.length) return null;

  const chapters: Chapter[] = [];
  for (const chapterValue of raw.chapters) {
    if (!chapterValue || typeof chapterValue !== "object") return null;
    const chapterRaw = chapterValue as Record<string, unknown>;
    if (!Array.isArray(chapterRaw.pages) || !chapterRaw.pages.length)
      return null;
    const pages: ComicPage[] = [];
    for (const pageValue of chapterRaw.pages) {
      if (!pageValue || typeof pageValue !== "object") return null;
      const pageRaw = pageValue as Record<string, unknown>;
      if (!Array.isArray(pageRaw.panels) || !pageRaw.panels.length) return null;
      if (typeof pageRaw.image !== "string") return null;
      const panels: Panel[] = [];
      for (const panelValue of pageRaw.panels) {
        if (!panelValue || typeof panelValue !== "object") return null;
        const panelRaw = panelValue as Record<string, unknown>;
        const panelId = String(panelRaw.id ?? makeId("panel"));
        const sound =
          panelRaw.sound === "pulse" || panelRaw.sound === "wind"
            ? panelRaw.sound
            : "rain";
        let lines: DialogueLine[] = [];
        if (Array.isArray(panelRaw.lines)) {
          lines = panelRaw.lines.flatMap((lineValue, index) => {
            if (!lineValue || typeof lineValue !== "object") return [];
            const lineRaw = lineValue as Record<string, unknown>;
            if (typeof lineRaw.text !== "string") return [];
            return [
              {
                id: String(lineRaw.id ?? `${panelId}-l${index}`),
                text: lineRaw.text,
                speaker: String(lineRaw.speaker ?? "旁白"),
                duration:
                  typeof lineRaw.duration === "number" &&
                  Number.isFinite(lineRaw.duration)
                    ? Math.max(1, lineRaw.duration)
                    : 4,
              },
            ];
          });
        }
        if (!lines.length) {
          const text =
            typeof panelRaw.dialogue === "string" ? panelRaw.dialogue : "";
          if (!text) return null;
          lines = [
            {
              id: `${panelId}-l0`,
              text,
              speaker: String(panelRaw.speaker ?? "旁白"),
              duration:
                typeof panelRaw.duration === "number" &&
                Number.isFinite(panelRaw.duration)
                  ? Math.max(1, panelRaw.duration)
                  : 4,
            },
          ];
        }
        const rect = panelRaw.rect as Record<string, unknown> | undefined;
        if (!rect) return null;
        panels.push({
          id: panelId,
          rect: {
            x: Number(rect.x) || 0,
            y: Number(rect.y) || 0,
            width: Number(rect.width) || 1,
            height: Number(rect.height) || 1,
          },
          lines,
          sound,
        });
      }
      pages.push({
        id: String(pageRaw.id ?? makeId("page")),
        title: String(pageRaw.title ?? "未命名页面"),
        image: pageRaw.image,
        width: Number(pageRaw.width) || 900,
        height: Number(pageRaw.height) || 1200,
        panels,
      });
    }
    chapters.push({
      id: String(chapterRaw.id ?? makeId("chapter")),
      title: String(chapterRaw.title ?? "未命名章节"),
      subtitle: String(chapterRaw.subtitle ?? ""),
      pages,
    });
  }

  const existingTranslations =
    raw.translations && typeof raw.translations === "object"
      ? (raw.translations as Record<string, unknown>)
      : {};
  const translations: Record<string, Translation> = {};
  for (const [translationKey, value] of Object.entries(existingTranslations)) {
    const translation = sanitizeTranslation(value);
    if (translation) translations[translationKey] = translation;
  }

  const settingsRaw =
    raw.settings && typeof raw.settings === "object"
      ? (raw.settings as Record<string, unknown>)
      : {};
  // English is only published if the saved book explicitly said so; a v1
  // session has no translations, so it must not advertise an English edition.
  const publishedRaw = Array.isArray(settingsRaw.published)
    ? settingsRaw.published
    : ["zh"];
  const published = publishedRaw.includes("en")
    ? (["zh", "en"] as Locale[])
    : (["zh"] as Locale[]);
  const sourceLocale =
    settingsRaw.sourceLocale === "en" ? "en" : SOURCE_LOCALE;

  return {
    version: 2,
    id: String(raw.id ?? makeId("comic")),
    title: String(raw.title ?? "未命名漫画"),
    author: String(raw.author ?? ""),
    chapters,
    translations,
    lineage: Array.isArray(raw.lineage)
      ? (raw.lineage as ComicDocument["lineage"]).filter(
          (link) => link && typeof link.lineId === "string",
        )
      : [],
    sourceLog: Array.isArray(raw.sourceLog)
      ? (raw.sourceLog as ComicDocument["sourceLog"]).filter(
          (entry) => entry && typeof entry.id === "string",
        )
      : [],
    settings: {
      sourceLocale,
      published: published.includes(sourceLocale)
        ? published
        : [sourceLocale, ...published],
    },
  };
}

function sanitizeTranslation(value: unknown): Translation | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.lineId !== "string") return null;
  if (raw.locale !== "zh" && raw.locale !== "en") return null;
  const state: TranslationState = raw.state === "reviewed" ? "reviewed" : "draft";
  const history = Array.isArray(raw.history)
    ? raw.history
        .filter(
          (entry) =>
            entry &&
            typeof entry === "object" &&
            typeof (entry as Record<string, unknown>).text === "string",
        )
        .map((entry) => {
          const item = entry as Record<string, unknown>;
          return {
            id: String(item.id ?? makeId("version")),
            text: String(item.text),
            state: (item.state === "reviewed"
              ? "reviewed"
              : "draft") as TranslationState,
            sourceText: String(item.sourceText ?? ""),
            by: String(item.by ?? ""),
            at: Number(item.at) || Date.now(),
            note: typeof item.note === "string" ? item.note : undefined,
          };
        })
    : [];
  const conflicts = Array.isArray(raw.conflicts)
    ? raw.conflicts
        .filter(
          (entry) =>
            entry &&
            typeof entry === "object" &&
            typeof (entry as Record<string, unknown>).text === "string",
        )
        .map((entry) => {
          const item = entry as Record<string, unknown>;
          return {
            id: String(item.id ?? makeId("conflict")),
            text: String(item.text),
            state: (item.state === "reviewed"
              ? "reviewed"
              : "draft") as TranslationState,
            sourceText: String(item.sourceText ?? ""),
            by: String(item.by ?? ""),
            at: Number(item.at) || Date.now(),
          };
        })
    : [];
  return {
    lineId: raw.lineId,
    locale: raw.locale,
    text: typeof raw.text === "string" ? raw.text : "",
    state,
    sourceText: typeof raw.sourceText === "string" ? raw.sourceText : "",
    stale: raw.stale === true,
    reverted: raw.reverted === true,
    by: String(raw.by ?? ""),
    at: Number(raw.at) || Date.now(),
    note: typeof raw.note === "string" ? raw.note : undefined,
    history,
    conflicts,
  };
}

export function migrateReaderLanguage(
  document: ComicDocument,
  value: unknown,
): ReaderLanguage {
  const published = document.settings.published;
  if (value === "zh") return "zh";
  if (value === "en" && published.includes("en")) return "en";
  if (value === "bi" && published.includes("en")) return "bi";
  return "zh";
}
