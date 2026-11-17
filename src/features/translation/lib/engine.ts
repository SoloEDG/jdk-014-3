import type {
  ComicDocument,
  DialogueLine,
  Locale,
  Panel,
  Translation,
  TranslationState,
} from "../../../shared/document";
import { makeId } from "../../../shared/commands";
import { findLine, findLineLocation } from "../../../shared/lookup";

export const TRANSLATION_LOCALES: Locale[] = ["en"];
export const LOCALE_LABEL: Record<Locale, string> = { zh: "中文", en: "English" };
const SOURCE: Locale = "zh";

export function translationKey(locale: Locale, lineId: string) {
  return `${locale}:${lineId}`;
}

export function translationOf(
  doc: ComicDocument,
  locale: Locale,
  lineId: string,
): Translation | undefined {
  return doc.translations[translationKey(locale, lineId)];
}

export function sourceLine(doc: ComicDocument, lineId: string) {
  return findLineLocation(doc, lineId);
}

export type LineDisplayStatus =
  | "source"
  | "translation"
  | "draft"
  | "stale"
  | "reverted"
  | "fallback";

export interface LineDisplay {
  lineId: string;
  text: string;
  speaker: string;
  status: LineDisplayStatus;
  translation?: Translation;
}

/**
 * Resolves what a reader sees for one line. Unfinished or reverted translations
 * deliberately fall back to the source and carry a visible status.
 */
export function resolveLineDisplay(
  doc: ComicDocument,
  line: DialogueLine,
  locale: Locale,
): LineDisplay {
  if (locale === doc.settings.sourceLocale)
    return {
      lineId: line.id,
      text: line.text,
      speaker: line.speaker,
      status: "source",
    };
  const translation = translationOf(doc, locale, line.id);
  if (!translation || translation.reverted || !translation.text.trim())
    return {
      lineId: line.id,
      text: line.text,
      speaker: line.speaker,
      status: translation?.reverted ? "reverted" : "fallback",
      translation,
    };
  return {
    lineId: line.id,
    text: translation.text,
    speaker: line.speaker,
    status: translation.stale
      ? "stale"
      : translation.state === "reviewed"
        ? "translation"
        : "draft",
    translation,
  };
}

const GENERIC_SPEAKERS: Record<string, string> = {
  "旁白": "Narrator",
  "叙述者": "Narrator",
  "未知": "Unknown",
};

export function speakerFor(speaker: string, locale: Locale) {
  if (locale !== "en") return speaker;
  return GENERIC_SPEAKERS[speaker] ?? speaker;
}

export function statusLabel(status: LineDisplayStatus, locale: Locale = "zh") {
  if (locale === "en") {
    return {
      source: "Original",
      translation: "Reviewed",
      draft: "Draft",
      stale: "Source changed · recheck",
      reverted: "Reverted to original",
      fallback: "No translation · original shown",
    }[status];
  }
  switch (status) {
    case "translation":
      return "已审校";
    case "draft":
      return "译文草稿";
    case "stale":
      return "原文已改 · 待复核";
    case "fallback":
      return "暂无译文 · 显示原文";
    case "reverted":
      return "已回退 · 显示原文";
    default:
      return "原文";
  }
}

/** Reader-facing wording; proofreading uses the more clinical statusLabel. */
export function readerStatusLabel(status: LineDisplayStatus, locale: Locale) {
  if (locale === "en") {
    return {
      source: "",
      translation: "",
      draft: "Translation in progress",
      stale: "Translation being updated",
      reverted: "Original shown",
      fallback: "Original shown",
    }[status];
  }
  return {
    source: "",
    translation: "",
    draft: "译文更新中",
    stale: "译文核对中",
    reverted: "显示原文",
    fallback: "显示原文",
  }[status];
}

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;

/**
 * Rough reading time in seconds for the text actually on screen. Script
 * detection matters because a fallback line in English mode is still Chinese;
 * using the word count there would claim it takes one second.
 */
export function readingSeconds(text: string, locale: Locale): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const cjk = Array.from(trimmed.replace(/\s+/g, "")).filter((char) =>
    CJK.test(char),
  ).length;
  const latinWords = trimmed
    .replace(CJK, " ")
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  if (cjk && latinWords) {
    // Mixed content: count each part at its own natural pace.
    return Math.max(
      1,
      Math.round((cjk / 4.5 + latinWords / 2.8) * 10) / 10,
    );
  }
  if (cjk) return Math.max(1, Math.round((cjk / 4.5) * 10) / 10);
  return Math.max(
    1,
    Math.round((latinWords / (locale === "en" ? 2.8 : 2.5)) * 10) / 10,
  );
}

export function lineSourceText(doc: ComicDocument, lineId: string) {
  return findLine(doc, lineId)?.text ?? "";
}

/** Only the translations whose own source snapshot differs are touched. */
export function markLineStale(doc: ComicDocument, lineId: string) {
  for (const locale of TRANSLATION_LOCALES) {
    const key = translationKey(locale, lineId);
    const translation = doc.translations[key];
    const line = findLine(doc, lineId);
    if (!translation || !line) continue;
    if (translation.sourceText !== line.text) translation.stale = true;
  }
}

export function logSourceChange(
  doc: ComicDocument,
  entry: Omit<ComicDocument["sourceLog"][number], "id" | "at" | "by"> & {
    at?: number;
    by?: string;
  },
) {
  doc.sourceLog.push({
    id: makeId("source"),
    at: entry.at ?? Date.now(),
    by: entry.by ?? "本地编辑",
    lineId: entry.lineId,
    panelId: entry.panelId,
    kind: entry.kind,
    before: entry.before,
    after: entry.after,
  });
}

export function addLineage(
  doc: ComicDocument,
  lineId: string,
  from: string[],
  kind: "split" | "merge" | "replace",
) {
  doc.lineage.push({
    id: makeId("lineage"),
    lineId,
    from,
    kind,
    at: Date.now(),
    by: "本地编辑",
  });
}

function snapshot(translation: Translation, note: string) {
  translation.history.push({
    id: makeId("version"),
    text: translation.text,
    state: translation.state,
    sourceText: translation.sourceText,
    by: translation.by,
    at: translation.at,
    note,
  });
  if (translation.history.length > 40)
    translation.history.splice(0, translation.history.length - 40);
}

/** Moves any active translation for a line into a new record's history. */
function carryTranslationHistory(
  doc: ComicDocument,
  fromLineId: string,
  toLineId: string,
  note: string,
  carryText: boolean,
): Translation | undefined {
  let carried: Translation | undefined;
  for (const locale of TRANSLATION_LOCALES) {
    const key = translationKey(locale, fromLineId);
    const old = doc.translations[key];
    if (!old) continue;
    const targetKey = translationKey(locale, toLineId);
    const existing = doc.translations[targetKey];
    const historyEntry = {
      id: makeId("version"),
      text: old.text,
      state: old.state,
      sourceText: old.sourceText,
      by: old.by,
      at: old.at,
      note,
    };
    if (existing) {
      existing.history.push(historyEntry);
      continue;
    }
    if (carryText && old.text.trim()) {
      carried = {
        lineId: toLineId,
        locale,
        text: old.text,
        state: "draft",
        sourceText: lineSourceText(doc, toLineId),
        stale: false,
        by: old.by,
        at: Date.now(),
        note,
        history: [historyEntry],
        conflicts: [],
      };
      doc.translations[targetKey] = carried;
    }
  }
  for (const locale of TRANSLATION_LOCALES)
    delete doc.translations[translationKey(locale, fromLineId)];
  return carried;
}

/** Stores the old translation snapshots on a new line without reusing the text. */
function transferTranslationsToHistory(
  doc: ComicDocument,
  fromLineIds: string[],
  toLineId: string,
  note: string,
) {
  for (const locale of TRANSLATION_LOCALES) {
    const key = translationKey(locale, toLineId);
    const existing = doc.translations[key];
    const entries = fromLineIds
      .map((fromId) => doc.translations[translationKey(locale, fromId)])
      .filter((value): value is Translation => Boolean(value?.text.trim()))
      .map((old) => ({
        id: makeId("version"),
        text: old.text,
        state: old.state,
        sourceText: old.sourceText,
        by: old.by,
        at: old.at,
        note,
      }));
    if (!entries.length) continue;
    if (existing) existing.history.push(...entries);
    else
      doc.translations[key] = {
        lineId: toLineId,
        locale,
        text: "",
        state: "draft",
        sourceText: lineSourceText(doc, toLineId),
        stale: false,
        by: "本地编辑",
        at: Date.now(),
        note,
        history: entries,
        conflicts: [],
      };
  }
  for (const fromId of fromLineIds)
    for (const locale of TRANSLATION_LOCALES)
      delete doc.translations[translationKey(locale, fromId)];
}

export function editLineSource(
  doc: ComicDocument,
  lineId: string,
  text: string,
): boolean {
  const found = findLineLocation(doc, lineId);
  const clean = text.trim();
  if (!found || !clean || clean === found.line.text) return false;
  const before = [{ id: found.line.id, text: found.line.text }];
  found.line.text = clean;
  logSourceChange(doc, {
    kind: "edit",
    lineId,
    panelId: found.panel.id,
    before,
    after: [{ id: lineId, text: clean }],
  });
  markLineStale(doc, lineId);
  return true;
}

function distributeDuration(total: number, texts: string[]) {
  const weights = texts.map((text) => Math.max(1, Array.from(text).length));
  const sum = weights.reduce((a, b) => a + b, 0);
  const durations = weights.map(
    (weight) => Math.max(1.2, Math.round((total * weight) / sum * 10) / 10),
  );
  return durations;
}

/**
 * Splits one line. Every segment receives a fresh id, lineage back to the old
 * line is recorded, and the previous translation is kept as an unreviewed
 * carry-over on the first segment (never silently treated as reviewed).
 */
export function splitLine(
  doc: ComicDocument,
  lineId: string,
  parts: string[],
): DialogueLine[] | null {
  const found = findLineLocation(doc, lineId);
  if (!found) return null;
  const texts = parts.map((part) => part.trim()).filter(Boolean);
  if (texts.length < 2) return null;
  const durations = distributeDuration(found.line.duration, texts);
  const created: DialogueLine[] = texts.map((text, index) => ({
    id: makeId("line"),
    text,
    speaker: found.line.speaker,
    duration: durations[index] ?? 3,
  }));
  const index = found.panel.lines.findIndex((line) => line.id === lineId);
  found.panel.lines.splice(index, 1, ...created);
  created.forEach((line) => addLineage(doc, line.id, [lineId], "split"));
  logSourceChange(doc, {
    kind: "split",
    lineId,
    panelId: found.panel.id,
    before: [{ id: lineId, text: found.line.text }],
    after: created.map((line) => ({ id: line.id, text: line.text })),
  });
  carryTranslationHistory(
    doc,
    lineId,
    created[0]!.id,
    "原句拆分，译文需按新分句复核",
    true,
  );
  return created;
}

/** Merges consecutive lines into one new identity. */
export function mergeLines(
  doc: ComicDocument,
  lineIds: string[],
  text: string,
): DialogueLine | null {
  const found = lineIds
    .map((id) => findLineLocation(doc, id))
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
  if (found.length < 2) return null;
  const panel = found[0]!.panel;
  if (found.some((entry) => entry.panel.id !== panel.id)) return null;
  const indexes = found
    .map((entry) => panel.lines.findIndex((line) => line.id === entry.line.id))
    .sort((a, b) => a - b);
  const ordered = indexes.map((index) => panel.lines[index]!);
  const clean = text.trim();
  if (!clean) return null;
  const merged: DialogueLine = {
    id: makeId("line"),
    text: clean,
    speaker: ordered[0]!.speaker,
    duration: Math.max(
      1.5,
      Math.round(ordered.reduce((sum, line) => sum + line.duration, 0) * 10) /
        10,
    ),
  };
  const insertAt = Math.min(...indexes);
  for (let i = indexes.length - 1; i >= 0; i--)
    panel.lines.splice(indexes[i]!, 1);
  panel.lines.splice(insertAt, 0, merged);
  addLineage(
    doc,
    merged.id,
    ordered.map((line) => line.id),
    "merge",
  );
  logSourceChange(doc, {
    kind: "merge",
    lineId: merged.id,
    panelId: panel.id,
    before: ordered.map((line) => ({ id: line.id, text: line.text })),
    after: [{ id: merged.id, text: merged.text }],
  });
  transferTranslationsToHistory(
    doc,
    ordered.map((line) => line.id),
    merged.id,
    `由 ${ordered.length} 句合并，原译文保留在历史中`,
  );
  return merged;
}

interface BulkResult {
  added: DialogueLine[];
  removed: string[];
  split: number;
  merged: number;
  replaced: number;
  edited: number;
}

/**
 * Replaces the whole dialogue of a panel without losing reviewed history.
 * Unchanged lines keep their ids; a single replacement keeps its identity and
 * therefore only becomes "pending review"; structural changes get fresh ids
 * with lineage and old translations retained in history.
 */
export function replacePanelLines(
  doc: ComicDocument,
  panelId: string,
  texts: string[],
): BulkResult | null {
  const panel = findPanel(doc, panelId);
  if (!panel) return null;
  const clean = texts.map((text) => text.trim()).filter(Boolean);
  if (!clean.length) return null;
  const old = panel.lines;
  const oldTexts = old.map((line) => line.text);
  // LCS alignment: only exact matches reuse an identity. Everything between
  // anchors is treated as an edit, split, merge or replacement group.
  const anchors = lcsPairs(oldTexts, clean);
  const result: BulkResult = {
    added: [],
    removed: [],
    split: 0,
    merged: 0,
    replaced: 0,
    edited: 0,
  };
  const rebuilt: DialogueLine[] = [];
  let oldStart = 0;
  let newStart = 0;
  const blocks = [...anchors, [old.length, clean.length] as const];
  for (const [anchorOld, anchorNew] of blocks) {
    const oldBlock = old.slice(oldStart, anchorOld);
    const newBlock = clean.slice(newStart, anchorNew);
    if (oldBlock.length === 1 && newBlock.length === 1) {
      const line = oldBlock[0]!;
      if (line.text !== newBlock[0]) {
        const before = [{ id: line.id, text: line.text }];
        line.text = newBlock[0]!;
        result.edited++;
        logSourceChange(doc, {
          kind: "edit",
          lineId: line.id,
          panelId,
          before,
          after: [{ id: line.id, text: line.text }],
        });
        markLineStale(doc, line.id);
      }
      rebuilt.push(line);
    } else if (oldBlock.length === 1 && newBlock.length > 1) {
      const source = oldBlock[0]!;
      const durations = distributeDuration(source.duration, newBlock);
      const created = newBlock.map((text, index) => ({
        id: makeId("line"),
        text,
        speaker: source.speaker,
        duration: durations[index] ?? 3,
      }));
      created.forEach((line) =>
        addLineage(doc, line.id, [source.id], "split"),
      );
      logSourceChange(doc, {
        kind: "split",
        lineId: source.id,
        panelId,
        before: [{ id: source.id, text: source.text }],
        after: created.map((line) => ({ id: line.id, text: line.text })),
      });
      carryTranslationHistory(
        doc,
        source.id,
        created[0]!.id,
        "整段替换时拆分，译文需复核",
        true,
      );
      result.added.push(...created);
      result.removed.push(source.id);
      result.split++;
      rebuilt.push(...created);
    } else if (oldBlock.length > 1 && newBlock.length === 1) {
      const created: DialogueLine = {
        id: makeId("line"),
        text: newBlock[0]!,
        speaker: oldBlock[0]!.speaker,
        duration: Math.max(
          1.5,
          Math.round(
            oldBlock.reduce((sum, line) => sum + line.duration, 0) * 10,
          ) / 10,
        ),
      };
      addLineage(
        doc,
        created.id,
        oldBlock.map((line) => line.id),
        "merge",
      );
      logSourceChange(doc, {
        kind: "merge",
        lineId: created.id,
        panelId,
        before: oldBlock.map((line) => ({ id: line.id, text: line.text })),
        after: [{ id: created.id, text: created.text }],
      });
      transferTranslationsToHistory(
        doc,
        oldBlock.map((line) => line.id),
        created.id,
        `由 ${oldBlock.length} 句合并，原译文保留在历史中`,
      );
      result.added.push(created);
      result.removed.push(...oldBlock.map((line) => line.id));
      result.merged++;
      rebuilt.push(created);
    } else if (oldBlock.length > 0 && newBlock.length > 0) {
      const created: DialogueLine[] = newBlock.map((text, index) => ({
        id: makeId("line"),
        text,
        speaker: oldBlock[0]!.speaker,
        duration:
          oldBlock[index]?.duration ??
          Math.max(2, Math.round(oldBlock[0]!.duration * 10) / 10),
      }));
      const oldIds = oldBlock.map((line) => line.id);
      created.forEach((line) =>
        addLineage(doc, line.id, oldIds, "replace"),
      );
      logSourceChange(doc, {
        kind: "replace",
        lineId: created[0]?.id,
        panelId,
        before: oldBlock.map((line) => ({ id: line.id, text: line.text })),
        after: created.map((line) => ({ id: line.id, text: line.text })),
      });
      created.forEach((line, index) => {
        if (index === 0)
          transferTranslationsToHistory(
            doc,
            oldIds,
            line.id,
            "整段替换，原译文保留在历史中",
          );
        else
          for (const locale of TRANSLATION_LOCALES) {
            const source = oldIds
              .map((id) => doc.translations[translationKey(locale, id)])
              .find((value) => value?.text.trim());
            if (!source) continue;
            const key = translationKey(locale, line.id);
            if (!doc.translations[key])
              doc.translations[key] = {
                lineId: line.id,
                locale,
                text: "",
                state: "draft",
                sourceText: line.text,
                stale: false,
                by: "本地编辑",
                at: Date.now(),
                note: "整段替换，原译文保留在历史中",
                history: [
                  {
                    id: makeId("version"),
                    text: source.text,
                    state: source.state,
                    sourceText: source.sourceText,
                    by: source.by,
                    at: source.at,
                    note: "整段替换，原译文保留在历史中",
                  },
                ],
                conflicts: [],
              };
          }
      });
      result.added.push(...created);
      result.removed.push(...oldIds);
      result.replaced++;
      rebuilt.push(...created);
    } else if (newBlock.length > 0) {
      const created: DialogueLine[] = newBlock.map((text) => ({
        id: makeId("line"),
        text,
        speaker: old[0]?.speaker ?? "旁白",
        duration: 4,
      }));
      result.added.push(...created);
      rebuilt.push(...created);
    } else if (oldBlock.length > 0) {
      result.removed.push(...oldBlock.map((line) => line.id));
      // Keep the translation records (and their review history) even though the
      // line is gone from this draft; deleting them would silently lose audited
      // work. They stay out of reader views and out of export packages.
      logSourceChange(doc, {
        kind: "replace",
        panelId,
        before: oldBlock.map((line) => ({ id: line.id, text: line.text })),
        after: [],
      });
    }
    if (anchorOld < old.length) rebuilt.push(old[anchorOld]!);
    oldStart = anchorOld + 1;
    newStart = anchorNew + 1;
  }
  panel.lines = rebuilt;
  return result;
}

function findPanel(doc: ComicDocument, panelId: string): Panel | undefined {
  for (const chapter of doc.chapters)
    for (const page of chapter.pages) {
      const panel = page.panels.find((candidate) => candidate.id === panelId);
      if (panel) return panel;
    }
  return undefined;
}

/** Longest common subsequence over source texts, returning aligned index pairs. */
export function lcsPairs(a: string[], b: string[]): Array<readonly [number, number]> {
  const rows = a.length;
  const cols = b.length;
  const table = Array.from({ length: rows + 1 }, () =>
    Array<number>(cols + 1).fill(0),
  );
  for (let i = rows - 1; i >= 0; i--)
    for (let j = cols - 1; j >= 0; j--)
      table[i]![j] =
        a[i] === b[j]
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const pairs: Array<readonly [number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (a[i] === b[j]) {
      pairs.push([i, j] as const);
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) i++;
    else j++;
  }
  return pairs;
}

export function saveTranslation(
  doc: ComicDocument,
  lineId: string,
  locale: Locale,
  text: string,
  options: { state?: TranslationState; by?: string } = {},
): boolean {
  const line = findLine(doc, lineId);
  const clean = text.trim();
  if (!line || !clean) return false;
  const key = translationKey(locale, lineId);
  const now = Date.now();
  const by = options.by || "本地译校";
  const existing = doc.translations[key];
  if (!existing) {
    doc.translations[key] = {
      lineId,
      locale,
      text: clean,
      state: options.state ?? "draft",
      sourceText: line.text,
      stale: false,
      by,
      at: now,
      history: [],
      conflicts: [],
    };
    return true;
  }
  const changed =
    existing.text !== clean ||
    existing.sourceText !== line.text ||
    (options.state && options.state !== existing.state);
  if (!changed) return true;
  snapshot(existing, existing.stale ? "原文修改后复核前版本" : "保存前版本");
  existing.text = clean;
  existing.state = options.state ?? "draft";
  existing.sourceText = line.text;
  existing.stale = false;
  existing.reverted = false;
  existing.by = by;
  existing.at = now;
  return true;
}

export function approveTranslation(
  doc: ComicDocument,
  lineId: string,
  locale: Locale,
  by = "本地审校",
): boolean {
  const translation = translationOf(doc, locale, lineId);
  const line = findLine(doc, lineId);
  if (!translation || !line || !translation.text.trim()) return false;
  if (
    translation.state === "reviewed" &&
    translation.sourceText === line.text &&
    !translation.stale
  )
    return true;
  snapshot(translation, "审校通过前版本");
  translation.state = "reviewed";
  translation.sourceText = line.text;
  translation.stale = false;
  translation.reverted = false;
  translation.by = by;
  translation.at = Date.now();
  return true;
}

/** Reverting keeps the history and shows the source text with a clear marker. */
export function revertTranslation(
  doc: ComicDocument,
  lineId: string,
  locale: Locale,
): boolean {
  const translation = translationOf(doc, locale, lineId);
  if (!translation) return false;
  if (!translation.reverted) {
    snapshot(translation, "回退到原文前版本");
  }
  translation.text = "";
  translation.state = "draft";
  translation.sourceText = lineSourceText(doc, lineId);
  translation.stale = false;
  translation.reverted = true;
  translation.at = Date.now();
  translation.by = "本地译校";
  return true;
}

export interface ImportReport {
  translator: string;
  locale: Locale;
  accepted: number;
  promoted: number;
  unchanged: number;
  conflicts: number;
  skipped: number;
  errors: string[];
}

export interface ExportPackage {
  format: "panel-translations";
  version: 1;
  locale: Locale;
  translator: string;
  exportedAt: number;
  lines: Array<{
    lineId: string;
    sourceText: string;
    text: string;
    state: TranslationState;
  }>;
}

export function buildExportPackage(
  doc: ComicDocument,
  locale: Locale,
  translator: string,
  onlyMine = false,
): ExportPackage {
  const lines: ExportPackage["lines"] = [];
  for (const chapter of doc.chapters)
    for (const page of chapter.pages)
      for (const panel of page.panels)
        for (const line of panel.lines) {
          const translation = translationOf(doc, locale, line.id);
          if (!translation || translation.reverted || !translation.text.trim())
            continue;
          if (onlyMine && translator && translation.by !== translator) continue;
          lines.push({
            lineId: line.id,
            sourceText: line.text,
            text: translation.text,
            state: translation.state,
          });
        }
  return {
    format: "panel-translations",
    version: 1,
    locale,
    translator,
    exportedAt: Date.now(),
    lines,
  };
}

/**
 * Imports a translator's package. Existing text is never overwritten: every
 * different proposal becomes a side-by-side conflict for a human to resolve,
 * which also protects reviewed versions from a last-import-wins race.
 */
export function importPackage(
  doc: ComicDocument,
  raw: string,
  fallbackTranslator = "合作译者",
): ImportReport {
  const empty = (errors: string[]): ImportReport => ({
    translator: fallbackTranslator,
    locale: "en",
    accepted: 0,
    promoted: 0,
    unchanged: 0,
    conflicts: 0,
    skipped: 0,
    errors,
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty(["文件不是有效的 JSON"]);
  }
  if (!parsed || typeof parsed !== "object") return empty(["文件内容为空"]);
  const payload = parsed as Record<string, unknown>;
  if (payload.format !== "panel-translations")
    return empty(["这不是 PANEL 译文包（format 应为 panel-translations）"]);
  const locale = payload.locale;
  if (locale !== "zh" && locale !== "en") return empty(["缺少有效的目标语言"]);
  if (locale === doc.settings.sourceLocale)
    return empty(["目标语言不能与原文语言相同"]);
  if (!Array.isArray(payload.lines)) return empty(["译文包没有 lines 列表"]);
  const translator =
    typeof payload.translator === "string" && payload.translator.trim()
      ? payload.translator.trim()
      : fallbackTranslator;
  const report: ImportReport = {
    translator,
    locale,
    accepted: 0,
    promoted: 0,
    unchanged: 0,
    conflicts: 0,
    skipped: 0,
    errors: [],
  };
  const seen = new Set<string>();
  for (const [index, value] of payload.lines.entries()) {
    if (!value || typeof value !== "object") {
      report.skipped++;
      continue;
    }
    const item = value as Record<string, unknown>;
    const lineId = typeof item.lineId === "string" ? item.lineId : "";
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (!lineId || !text) {
      report.skipped++;
      continue;
    }
    if (seen.has(lineId)) {
      report.skipped++;
      report.errors.push(`第 ${index + 1} 条：同一句重复出现，已跳过`);
      continue;
    }
    seen.add(lineId);
    const line = findLine(doc, lineId);
    if (!line) {
      report.skipped++;
      report.errors.push(`第 ${index + 1} 条：原句 ${lineId} 已不存在`);
      continue;
    }
    const sourceText =
      typeof item.sourceText === "string" ? item.sourceText : "";
    const sourceMatches = sourceText === line.text;
    const state: TranslationState =
      item.state === "reviewed" && sourceMatches ? "reviewed" : "draft";
    const key = translationKey(locale, lineId);
    const existing = doc.translations[key];
    const now = Date.now();
    if (existing?.reverted || (existing && !existing.text.trim() && !existing.conflicts.length)) {
      // A reverted or carried-over placeholder is open for a fresh proposal.
      if (existing.text.trim() || existing.history.length)
        snapshot(existing, "导入新译文前记录");
      existing.text = text;
      existing.state = state;
      existing.sourceText = line.text;
      existing.stale = !sourceMatches;
      existing.reverted = false;
      existing.by = translator;
      existing.at = now;
      existing.note = sourceMatches
        ? "由合作译者导入"
        : "导入译文基于旧原文，已标为待复核";
      if (!sourceMatches)
        report.errors.push(
          `${line.text.slice(0, 16)}：导入译文基于旧原文，已标为待复核`,
        );
      report.accepted++;
      continue;
    }
    if (!existing) {
      doc.translations[key] = {
        lineId,
        locale,
        text,
        state,
        sourceText: line.text,
        stale: !sourceMatches,
        by: translator,
        at: now,
        history: [],
        conflicts: [],
      };
      if (!sourceMatches)
        report.errors.push(
          `${line.text.slice(0, 16)}：导入译文基于旧原文，已标为待复核`,
        );
      report.accepted++;
      continue;
    }
    if (existing.text === text) {
      if (
        existing.state === "draft" &&
        state === "reviewed" &&
        !existing.stale &&
        existing.sourceText === line.text
      ) {
        snapshot(existing, "导入审校版本前记录");
        existing.state = "reviewed";
        existing.sourceText = line.text;
        existing.by = translator;
        existing.at = now;
        report.promoted++;
      } else report.unchanged++;
      continue;
    }
    const duplicate = existing.conflicts.some(
      (conflict) => conflict.text === text && conflict.by === translator,
    );
    if (!duplicate) {
      existing.conflicts.push({
        id: makeId("conflict"),
        text,
        state,
        sourceText,
        by: translator,
        at: now,
      });
    }
    report.conflicts++;
  }
  return report;
}

export function resolveConflict(
  doc: ComicDocument,
  lineId: string,
  locale: Locale,
  conflictId: string,
  action: "keep" | "take",
  reviewer = "本地审校",
): boolean {
  const translation = translationOf(doc, locale, lineId);
  const line = findLine(doc, lineId);
  if (!translation || !line) return false;
  const conflict = translation.conflicts.find(
    (entry) => entry.id === conflictId,
  );
  if (!conflict) return false;
  if (action === "take") {
    snapshot(translation, "并排冲突中采用导入译文前版本");
    const stale = conflict.sourceText !== line.text;
    translation.text = conflict.text;
    translation.state = stale ? "draft" : conflict.state;
    translation.sourceText = line.text;
    translation.stale = stale;
    translation.reverted = false;
    translation.by = conflict.by;
    translation.at = Date.now();
    translation.note = `审校 ${reviewer} 在并列预览中采用`;
  }
  translation.conflicts = translation.conflicts.filter(
    (entry) => entry.id !== conflictId,
  );
  return true;
}

export function setPublished(
  doc: ComicDocument,
  locale: Locale,
  published: boolean,
) {
  if (locale === doc.settings.sourceLocale) return;
  const set = new Set(doc.settings.published);
  if (published) set.add(locale);
  else set.delete(locale);
  set.add(doc.settings.sourceLocale);
  doc.settings.published = [...set] as Locale[];
}

export function publishedLocales(doc: ComicDocument): Locale[] {
  return doc.settings.published.filter(
    (locale) => locale === doc.settings.sourceLocale || locale === "en",
  );
}

export interface TranslationStats {
  total: number;
  translated: number;
  reviewed: number;
  pending: number;
  conflicts: number;
}

export function translationStats(
  doc: ComicDocument,
  locale: Locale,
): TranslationStats {
  let total = 0,
    translated = 0,
    reviewed = 0,
    pending = 0,
    conflicts = 0;
  for (const chapter of doc.chapters)
    for (const page of chapter.pages)
      for (const panel of page.panels)
        for (const line of panel.lines) {
          total++;
          const translation = translationOf(doc, locale, line.id);
          if (translation?.conflicts.length) conflicts += translation.conflicts.length;
          if (!translation || translation.reverted || !translation.text.trim())
            continue;
          translated++;
          if (translation.state === "reviewed" && !translation.stale) reviewed++;
          if (translation.state === "draft" || translation.stale) pending++;
        }
  return { total, translated, reviewed, pending, conflicts };
}

export interface ArchivedLine {
  id: string;
  text: string;
  removedAt: number;
  translations: Translation[];
}

/**
 * Lines that disappeared from the current draft but whose translations were
 * deliberately kept. They are not readable in the book, but reviewers can still
 * inspect what was translated and reviewed for them.
 */
/** Drops translations whose line is gone and has no trace in the source log. */
export function pruneTranslations(doc: ComicDocument) {
  const referenced = new Set(
    doc.sourceLog.flatMap((change) => change.before.map((item) => item.id)),
  );
  const present = new Set(
    doc.chapters
      .flatMap((chapter) => chapter.pages)
      .flatMap((page) => page.panels)
      .flatMap((panel) => panel.lines)
      .map((line) => line.id),
  );
  let removed = 0;
  for (const [key, translation] of Object.entries(doc.translations))
    if (!present.has(translation.lineId) && !referenced.has(translation.lineId)) {
      delete doc.translations[key];
      removed++;
    }
  return removed;
}

export function archivedLines(doc: ComicDocument, panelId: string) {
  const present = new Set(
    doc.chapters
      .flatMap((chapter) => chapter.pages)
      .flatMap((page) => page.panels)
      .flatMap((panel) => panel.lines)
      .map((line) => line.id),
  );
  const rows = new Map<string, ArchivedLine>();
  for (const change of doc.sourceLog) {
    if (change.panelId !== panelId) continue;
    for (const item of change.before) {
      if (present.has(item.id)) continue;
      const translations = Object.values(doc.translations).filter(
        (translation) => translation.lineId === item.id,
      );
      if (!translations.length) continue;
      rows.set(item.id, {
        id: item.id,
        text: item.text,
        removedAt: change.at,
        translations,
      });
    }
  }
  return [...rows.values()].sort((a, b) => b.removedAt - a.removedAt);
}

export function sourceKindLabel(kind: ComicDocument["sourceLog"][number]["kind"]) {
  return {
    edit: "原句修改",
    split: "拆分",
    merge: "合并",
    replace: "整段替换",
  }[kind];
}

export function lineageFor(doc: ComicDocument, lineId: string) {
  const links = doc.lineage.filter((link) => link.lineId === lineId);
  const sources = links.flatMap((link) =>
    link.from.flatMap((sourceId) => {
      const change = [...doc.sourceLog]
        .reverse()
        .find(
          (entry) =>
            entry.kind !== "edit" &&
            entry.before.some((item) => item.id === sourceId),
        );
      const before = change?.before.find((item) => item.id === sourceId);
      return [
        {
          link,
          id: sourceId,
          text: before?.text ?? "（原句已不在当前稿中）",
        },
      ];
    }),
  );
  return { links, sources };
}

export function panelForLine(doc: ComicDocument, lineId: string) {
  return findLineLocation(doc, lineId)?.panel;
}
