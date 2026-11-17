import type {
  ComicDocument,
  Panel,
  ReaderLanguage,
} from "../../../shared/document";
import { displayLines } from "../../translation/lib/localize";

export function cueFor(
  doc: ComicDocument,
  panel: Panel | undefined,
  language: ReaderLanguage,
) {
  const lines = displayLines(doc, panel, language);
  const locale =
    language === "en"
      ? "en"
      : language === "bi"
        ? "bi"
        : doc.settings.sourceLocale;
  const english =
    language === "en" || (language === "bi" && locale === "en");
  return {
    title: english
      ? panel?.sound === "rain"
        ? "Rainy night · city ambience"
        : panel?.sound === "pulse"
          ? "Radio wave · low pulse"
          : "Distant · coastal wind"
      : panel?.sound === "rain"
        ? "雨夜 · 城市白噪音"
        : panel?.sound === "pulse"
          ? "电波 · 低频脉冲"
          : "远处 · 海岸风声",
    kind: panel?.sound ?? "rain",
    speaker: lines[0]?.speaker ?? "旁白",
    text: lines.length
      ? lines.map((line) => line.text).join(" / ")
      : "请选择一个分镜",
    lang: locale === "en" ? "en-US" : "zh-CN",
    langLabel: locale === "en" ? "English" : locale === "bi" ? "双语" : "中文",
    seconds:
      Math.round(lines.reduce((sum, line) => sum + line.seconds, 0) * 10) / 10,
    lines: lines.map((line) => ({
      key: line.key,
      text: line.text,
      speaker: line.speaker,
      locale: line.locale,
      status: line.status,
      statusLabel: line.statusLabel,
      seconds: line.seconds,
    })),
  };
}

export function volumeLabel(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}
