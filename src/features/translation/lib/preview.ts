import type { ComicDocument, DialogueLine } from "../../../shared/document";
import { lcsPairs, replacePanelLines } from "./engine";

export interface PreviewRow {
  kind: "same" | "edited" | "split" | "merged" | "replaced" | "added" | "removed";
  label: string;
  before: string[];
  after: string[];
}

export interface ReplacementPreview {
  lines: PreviewRow[];
  counts: {
    same: number;
    edited: number;
    split: number;
    merged: number;
    replaced: number;
    added: number;
    removed: number;
  };
  affectedTranslation: number;
  affectedReviewed: number;
  /** Reviewed translations that leave the book and move to the archive view. */
  archivedTranslation: number;
  archivedReviewed: number;
}

const LABEL: Record<PreviewRow["kind"], string> = {
  same: "保持",
  edited: "原位修改",
  split: "拆分",
  merged: "合并",
  replaced: "整段改写",
  added: "新增",
  removed: "移除",
};

function groupKind(
  oldBlock: DialogueLine[],
  newBlock: string[],
): PreviewRow["kind"] | null {
  if (!oldBlock.length && !newBlock.length) return null;
  if (!oldBlock.length) return "added";
  if (!newBlock.length) return "removed";
  if (oldBlock.length === 1 && newBlock.length === 1)
    return oldBlock[0]!.text === newBlock[0] ? "same" : "edited";
  if (oldBlock.length === 1) return "split";
  if (newBlock.length === 1) return "merged";
  return "replaced";
}

/**
 * Runs the replacement on a clone so the reviewer sees exactly which lines keep
 * their identity, which become new lines, and how many translations are touched.
 */
export function previewPanelReplacement(
  doc: ComicDocument,
  panelId: string,
  texts: string[],
): ReplacementPreview | null {
  const panel = doc.chapters
    .flatMap((chapter) => chapter.pages)
    .flatMap((page) => page.panels)
    .find((candidate) => candidate.id === panelId);
  if (!panel) return null;
  const clean = texts.map((text) => text.trim()).filter(Boolean);
  if (!clean.length) return null;
  const rows: PreviewRow[] = [];
  const counts = {
    same: 0,
    edited: 0,
    split: 0,
    merged: 0,
    replaced: 0,
    added: 0,
    removed: 0,
  };
  const old = panel.lines;
  const anchors = lcsPairs(
    old.map((line) => line.text),
    clean,
  );
  let oldStart = 0;
  let newStart = 0;
  for (const [anchorOld, anchorNew] of [
    ...anchors,
    [old.length, clean.length] as const,
  ]) {
    const oldBlock = old.slice(oldStart, anchorOld);
    const newBlock = clean.slice(newStart, anchorNew);
    const kind = groupKind(oldBlock, newBlock);
    if (kind) {
      counts[kind]++;
      rows.push({
        kind,
        label: LABEL[kind],
        before: oldBlock.map((line) => line.text),
        after: newBlock,
      });
    }
    if (anchorOld < old.length) {
      counts.same++;
      rows.push({
        kind: "same",
        label: LABEL.same,
        before: [old[anchorOld]!.text],
        after: [clean[anchorNew]!],
      });
    }
    oldStart = anchorOld + 1;
    newStart = anchorNew + 1;
  }

  // Run the real replacement on a clone and diff the translation store, so the
  // numbers reflect exactly what a confirmation would change.
  // Vue's reactive proxy is not structured-cloneable in the browser; the
  // document is plain JSON, so a JSON round-trip is both safe and faithful.
  const clone = JSON.parse(JSON.stringify(doc)) as ComicDocument;
  const createdAfter = Date.now() - 1;
  const result = replacePanelLines(clone, panelId, clean);
  if (!result) return null;
  let affectedTranslation = 0;
  let affectedReviewed = 0;
  let archivedTranslation = 0;
  let archivedReviewed = 0;
  // Lines consumed by a split/merge/replace carry their translation into the
  // new line's history; only lines with no successor end up in the archive.
  const consumed = new Set(
    clone.lineage
      .filter((link) => link.at >= createdAfter)
      .flatMap((link) => link.from),
  );
  const archived = new Set(
    result.removed.filter((lineId) => !consumed.has(lineId)),
  );
  for (const translation of Object.values(doc.translations))
    if (archived.has(translation.lineId)) {
      archivedTranslation++;
      if (translation.state === "reviewed") archivedReviewed++;
    }
  const keys = new Set([
    ...Object.keys(doc.translations),
    ...Object.keys(clone.translations),
  ]);
  for (const key of keys) {
    const original = doc.translations[key];
    const next = clone.translations[key];
    const changed =
      !original ||
      !next ||
      next.text !== original.text ||
      next.stale !== original.stale ||
      next.state !== original.state ||
      next.sourceText !== original.sourceText ||
      next.history.length !== original.history.length;
    if (!changed) continue;
    affectedTranslation++;
    if (original?.state === "reviewed") affectedReviewed++;
  }
  return {
    lines: rows,
    counts,
    affectedTranslation,
    affectedReviewed,
    archivedTranslation,
    archivedReviewed,
  };
}
