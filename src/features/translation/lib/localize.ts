import type {
  ComicDocument,
  DialogueLine,
  Locale,
  Panel,
  ReaderLanguage,
  Translation,
} from "../../../shared/document";
import {
  readerStatusLabel,
  readingSeconds,
  resolveLineDisplay,
  speakerFor,
  translationOf,
  type LineDisplayStatus,
} from "./engine";
export interface DisplayLine {
  key: string;
  lineId: string;
  speaker: string;
  text: string;
  locale: Locale;
  status: LineDisplayStatus;
  statusLabel: string;
  seconds: number;
  sourceText: string;
  translation?: Translation;
}

/** Flattens a panel into exactly what the reader should see, per language. */
export function displayLines(
  doc: ComicDocument,
  panel: Panel | undefined,
  language: ReaderLanguage,
): DisplayLine[] {
  if (!panel) return [];
  const sourceLocale = doc.settings.sourceLocale;
  const result: DisplayLine[] = [];
  for (const line of panel.lines) {
    if (language === "bi") {
      const source = resolveLineDisplay(doc, line, sourceLocale);
      const target = resolveLineDisplay(doc, line, "en");
      const sourceRow = build(line, source, sourceLocale, `${line.id}:source`);
      if (target.status === "fallback" || target.status === "reverted") {
        sourceRow.statusLabel = sourceRow.statusLabel
          ? `${sourceRow.statusLabel}`
          : "英文待译";
        result.push(sourceRow);
      } else {
        result.push(sourceRow, build(line, target, "en", `${line.id}:target`));
      }
      continue;
    }
    const resolved = resolveLineDisplay(doc, line, language);
    result.push(build(line, resolved, language, line.id));
  }
  return result;
}

function build(
  line: DialogueLine,
  resolved: ReturnType<typeof resolveLineDisplay>,
  locale: Locale,
  key: string,
): DisplayLine {
  return {
    key,
    lineId: line.id,
    speaker: speakerFor(line.speaker, locale),
    text: resolved.text,
    locale,
    status: resolved.status,
    statusLabel: readerStatusLabel(resolved.status, locale),
    seconds: readingSeconds(resolved.text, locale),
    sourceText: line.text,
    translation: resolved.translation,
  };
}

export function panelSeconds(
  doc: ComicDocument,
  panel: Panel | undefined,
  language: ReaderLanguage,
): number {
  const total = displayLines(doc, panel, language).reduce(
    (sum, line) => sum + line.seconds,
    0,
  );
  return Math.round(total * 10) / 10;
}

export function hasTranslation(
  doc: ComicDocument,
  lineId: string,
  locale: Locale,
) {
  const translation = translationOf(doc, locale, lineId);
  return Boolean(translation?.text.trim()) && !translation?.reverted;
}
