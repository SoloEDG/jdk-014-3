import { computed, ref, watch, type Ref } from "vue";
import type {
  ComicDocument,
  Locale,
  ReaderLanguage,
} from "../../../shared/document";
import {
  TRANSLATION_LOCALES,
  buildExportPackage,
  importPackage,
  publishedLocales,
  setPublished,
  translationStats,
} from "../lib/engine";
import type { ImportReport } from "../lib/engine";
import { readDocument } from "../../progress/lib/storage";

export interface ProofNotice {
  text: string;
  tone: "success" | "error" | "info";
}

export function useTranslation(
  doc: Ref<ComicDocument>,
  initial?: { language?: ReaderLanguage; translator?: string },
) {
  const language = ref<ReaderLanguage>(initial?.language ?? "zh"),
    translator = ref(initial?.translator || "本地译校"),
    notice = ref<ProofNotice | null>(null),
    report = ref<ImportReport | null>(null),
    workbenchOpen = ref(false),
    publishOpen = ref(false);
  let noticeTimer: number | undefined;

  function notify(text: string, tone: ProofNotice["tone"] = "success") {
    notice.value = { text, tone };
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => {
      notice.value = null;
    }, 5200);
  }

  function available(locale: Locale) {
    return publishedLocales(doc.value).includes(locale);
  }

  function setLanguage(next: ReaderLanguage) {
    if (next === "zh") {
      language.value = "zh";
      return;
    }
    if (!available("en")) {
      notify("英文版尚未发布，读者仍停留在中文版", "info");
      language.value = "zh";
      return;
    }
    language.value = next;
  }

  function togglePublish(locale: Locale, published: boolean) {
    if (locale === doc.value.settings.sourceLocale) return;
    setPublished(doc.value, locale, published);
    if (!published && (language.value === "en" || language.value === "bi")) {
      language.value = "zh";
      notify("英文版已下架，阅读语言切回中文；镜头与书签保持原位", "info");
    } else {
      notify(
        published
          ? "已向读者发布英文版；切换语言不会改变镜头、进度与书签"
          : "已隐藏英文版，译文与审校记录仍完整保留",
        "success",
      );
    }
  }

  const stats = computed(
    () =>
      Object.fromEntries(
        TRANSLATION_LOCALES.map((locale) => [
          locale,
          translationStats(doc.value, locale),
        ]),
      ) as Record<Locale, ReturnType<typeof translationStats>>,
  );

  const published = computed(() => publishedLocales(doc.value));

  function download(filename: string, content: string) {
    const blob = new Blob([content], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportPackage(locale: Locale, onlyMine: boolean) {
    const payload = buildExportPackage(
      doc.value,
      locale,
      translator.value,
      onlyMine,
    );
    if (!payload.lines.length) {
      notify("当前没有可导出的译文", "error");
      return;
    }
    const who = onlyMine ? translator.value || "译者" : "全部";
    download(
      `${doc.value.title}-${locale}-${who}-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
    );
    notify(
      `已导出 ${payload.lines.length} 句${onlyMine ? `（仅 ${who}）` : ""}译文`,
      "success",
    );
  }

  async function importReadBook(file: File): Promise<void> {
    const raw = await file.text();
    const next = readDocument(raw);
    if (!next) {
      notify("无法读取该读本文件", "error");
      return;
    }
    doc.value = next;
    notify(
      `已打开《${next.title}》：译文、审校历史与发布设置均已恢复；阅读位置保持当前镜头`,
      "success",
    );
  }

  async function importFile(file: File): Promise<void> {
    const raw = await file.text();
    const result = importPackage(doc.value, raw, translator.value);
    report.value = result;
    if (result.errors.length && !result.accepted && !result.conflicts)
      notify(result.errors[0]!, "error");
    else if (result.conflicts)
      notify(
        `已导入 ${result.translator} 的译文：新增 ${result.accepted} 句，${result.conflicts} 句与现有译文冲突，已并列保留待审校`,
        "info",
      );
    else
      notify(
        `已导入 ${result.translator} 的译文：新增 ${result.accepted} 句，升级已审校 ${result.promoted} 句，未覆盖任何已有译文`,
        "success",
      );
  }

  function setTranslator(value: string) {
    const clean = value.trim();
    if (!clean) return;
    translator.value = clean.slice(0, 24);
    notify(`译者署名已更新为「${translator.value}」，之后的保存与导出会使用它`, "success");
  }

  function exportReadBook() {
    download(
      `${doc.value.title}-双语读本-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(doc.value, null, 2),
    );
    notify("已导出完整双语读本（含译文、审校历史与发布设置）", "success");
  }

  watch(
    () => doc.value.settings.published,
    () => {
      if (!available("en") && language.value !== "zh") language.value = "zh";
    },
    { deep: true },
  );

  return {
    language,
    translator,
    notice,
    report,
    workbenchOpen,
    publishOpen,
    stats,
    published,
    notify,
    setLanguage,
    setTranslator,
    togglePublish,
    exportPackage,
    importFile,
    importReadBook,
    exportReadBook,
  };
}
