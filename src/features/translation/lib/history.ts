import type {
  Locale,
  TranslationConflict,
  TranslationVersion,
} from "../../../shared/document";
import type { ComicDocument } from "../../../shared/document";
import { makeId } from "../../../shared/commands";
import { translationOf, translationKey, sourceLine } from "../lib/engine";

export function restoreTranslationVersion(
  doc: ComicDocument,
  lineId: string,
  locale: Locale,
  versionId: string,
): boolean {
  const translation = translationOf(doc, locale, lineId);
  const found = sourceLine(doc, lineId);
  if (!translation || !found) return false;
  const line = found.line;
  const version = translation.history.find((entry) => entry.id === versionId);
  if (!version) return false;
  translation.history.push({
    id: makeId("version"),
    text: translation.text,
    state: translation.state,
    sourceText: translation.sourceText,
    by: translation.by,
    at: translation.at,
    note: "恢复历史版本前记录",
  });
  translation.text = version.text;
  translation.sourceText = line.text;
  translation.stale = version.sourceText !== line.text;
  translation.state = translation.stale ? "draft" : version.state;
  translation.reverted = false;
  translation.by = "本地译校";
  translation.at = Date.now();
  translation.note = `恢复 ${new Date(version.at).toLocaleString("zh-CN")} 的版本`;
  // Keep conflicts untouched; they remain visible for review.
  return true;
}

export function conflictSummary(conflict: TranslationConflict) {
  return `${conflict.by || "合作译者"} · ${new Date(conflict.at).toLocaleString(
    "zh-CN",
    { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" },
  )}`;
}

export function versionSummary(version: TranslationVersion) {
  return `${version.by || "本地译校"} · ${new Date(version.at).toLocaleString(
    "zh-CN",
    { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" },
  )}`;
}

export function translationStateLabel(state: TranslationVersion["state"]) {
  return state === "reviewed" ? "已审校" : "草稿";
}
