import { computed, ref, type Ref } from "vue";
import type {
  ComicDocument,
  DialogueLine,
  Locale,
  Panel,
  Translation,
} from "../../../shared/document";
import {
  approveTranslation,
  resolveConflict,
  editLineSource,
  lineageFor,
  mergeLines,
  panelForLine,
  revertTranslation,
  saveTranslation,
  splitLine,
  translationOf,
} from "../lib/engine";
import { restoreTranslationVersion } from "../lib/history";
import { replacePanelLines } from "../lib/engine";
import { previewPanelReplacement } from "../lib/preview";

export type ProofStatus =
  | "missing"
  | "draft"
  | "reviewed"
  | "stale"
  | "reverted";

export interface ProofLine {
  line: DialogueLine;
  translation?: Translation;
  status: ProofStatus;
  statusText: string;
  sourceChanged: boolean;
}

export function proofStatus(line: DialogueLine, translation?: Translation): ProofStatus {
  if (!translation) return "missing";
  if (translation.reverted) return "reverted";
  if (translation.stale) return "stale";
  if (!translation.text.trim()) return "missing";
  return translation.state === "reviewed" ? "reviewed" : "draft";
}

function statusText(status: ProofStatus) {
  return {
    missing: "未翻译",
    draft: "草稿待审",
    reviewed: "已审校",
    stale: "原文已改 · 待复核",
    reverted: "已回退原文",
  }[status];
}

export function useProofreading(
  doc: Ref<ComicDocument>,
  locale: Ref<Locale>,
  translator: Ref<string>,
  notify: (text: string, tone?: "success" | "error" | "info") => void,
) {
  const selectedPanelId = ref("");
  const drafts = ref<Record<string, string>>({});
  const busyLine = ref("");
  const expanded = ref<Record<string, boolean>>({});
  const bulkDraft = ref("");
  const bulkPreview = ref<ReturnType<typeof previewPanelReplacement>>(null);
  const bulkNotice = ref("");
  const mergeSelection = ref<string[]>([]);
  const mergeDraft = ref("");

  const panels = computed(() =>
    doc.value.chapters.flatMap((chapter) =>
      chapter.pages.flatMap((page) =>
        page.panels.map((panel) => ({
          panel,
          chapter,
          page,
        })),
      ),
    ),
  );

  const selected = computed(
    () =>
      panels.value.find((entry) => entry.panel.id === selectedPanelId.value) ??
      panels.value[0],
  );

  const lines = computed<ProofLine[]>(() => {
    const panel = selected.value?.panel;
    if (!panel) return [];
    return panel.lines.map((line) => {
      const translation = translationOf(doc.value, locale.value, line.id);
      const status = proofStatus(line, translation);
      return {
        line,
        translation,
        status,
        statusText: statusText(status),
        sourceChanged:
          Boolean(translation) && translation!.sourceText !== line.text,
      };
    });
  });

  const panelLabel = computed(() => {
    const entry = selected.value;
    if (!entry) return "";
    return `${entry.chapter.title} · ${entry.page.title}`;
  });

  function select(panelId: string) {
    if (selectedPanelId.value === panelId) return;
    selectedPanelId.value = panelId;
    bulkPreview.value = null;
    bulkDraft.value = "";
    bulkNotice.value = "";
    mergeSelection.value = [];
    mergeDraft.value = "";
  }

  function selectForLine(lineId: string) {
    const panel = panelForLine(doc.value, lineId);
    if (panel) selectedPanelId.value = panel.id;
  }

  function ensureSelection(panelId: string) {
    if (!selectedPanelId.value) selectedPanelId.value = panelId;
  }

  function currentDraft(lineId: string) {
    return (
      drafts.value[lineId] ??
      translationOf(doc.value, locale.value, lineId)?.text ??
      ""
    );
  }

  function setDraft(lineId: string, value: string) {
    drafts.value = { ...drafts.value, [lineId]: value };
  }

  function save(lineId: string, state: "draft" | "reviewed" = "draft") {
    const text = currentDraft(lineId);
    if (!text.trim()) {
      notify("译文为空；未完成的句子请使用「回退原文」并保留标记", "error");
      return;
    }
    if (!saveTranslation(doc.value, lineId, locale.value, text, {
      state,
      by: translator.value,
    })) {
      notify("保存失败，请确认原句仍然存在", "error");
      return;
    }
    delete drafts.value[lineId];
    notify(
      state === "reviewed"
        ? "译文已保存并标记为已审校"
        : "译文已保存为草稿（仅本句更新）",
      "success",
    );
  }

  function approve(lineId: string) {
    const text = currentDraft(lineId);
    if (text.trim())
      saveTranslation(doc.value, lineId, locale.value, text, {
        by: translator.value,
      });
    if (!approveTranslation(doc.value, lineId, locale.value, translator.value)) {
      notify("需要先有译文才能审校", "error");
      return;
    }
    delete drafts.value[lineId];
    notify("已通过审校；原文再次修改时只会标记本句待复核", "success");
  }

  function revert(lineId: string) {
    const translation = translationOf(doc.value, locale.value, lineId);
    if (!translation) {
      notify("这句还没有译文，读者本来就会看到原文", "info");
      return;
    }
    revertTranslation(doc.value, lineId, locale.value);
    delete drafts.value[lineId];
    notify("已回退为原文显示；译文历史仍保留，可随时恢复", "info");
  }

  function restore(lineId: string, versionId: string) {
    if (!restoreTranslationVersion(doc.value, lineId, locale.value, versionId)) {
      notify("无法恢复该历史版本", "error");
      return;
    }
    delete drafts.value[lineId];
    notify("已恢复历史版本，并作为新版本记录", "success");
  }

  function editSource(lineId: string, text: string) {
    if (!editLineSource(doc.value, lineId, text)) {
      notify("原句未改变，或内容为空", "info");
      return;
    }
    notify(
      "原文已更新；只有基于旧原文的译句被标记待复核，其余译文不受影响",
      "info",
    );
  }

  function split(lineId: string, parts: string[]) {
    const created = splitLine(doc.value, lineId, parts);
    if (!created) {
      notify("拆分需要至少两个非空分句", "error");
      return;
    }
    notify(
      `已拆分为 ${created.length} 句：新句记录来源关系，原译文保留为待复核草稿`,
      "success",
    );
  }

  function toggleMerge(lineId: string) {
    mergeSelection.value = mergeSelection.value.includes(lineId)
      ? mergeSelection.value.filter((id) => id !== lineId)
      : [...mergeSelection.value, lineId];
    if (mergeSelection.value.length >= 2) {
      const ordered = (selected.value?.panel.lines ?? []).filter((line) =>
        mergeSelection.value.includes(line.id),
      );
      mergeDraft.value = ordered.map((line) => line.text).join("");
    } else mergeDraft.value = "";
  }

  function mergeSelected() {
    const ordered = (selected.value?.panel.lines ?? [])
      .filter((line) => mergeSelection.value.includes(line.id))
      .map((line) => line.id);
    if (ordered.length < 2) return;
    merge(ordered, mergeDraft.value);
    mergeSelection.value = [];
    mergeDraft.value = "";
  }

  function resolve(
    lineId: string,
    conflictId: string | null,
    action: "keep" | "take",
  ) {
    const translation = translationOf(doc.value, locale.value, lineId);
    if (!translation) return;
    if (action === "keep" && !conflictId) {
      // Keep the current version and dismiss every competing import at once.
      translation.conflicts = [];
      notify("已保留当前译文，所有并列导入版本已移除", "success");
      return;
    }
    if (
      !conflictId ||
      !resolveConflict(doc.value, lineId, locale.value, conflictId, action)
    ) {
      notify("该冲突已不存在", "error");
      return;
    }
    delete drafts.value[lineId];
    notify(
      action === "take"
        ? "已采用导入译文；此前的审校版本保留在历史中"
        : "已保留当前版本，该导入译文已移出并列视图",
      "success",
    );
  }

  function merge(lineIds: string[], text: string) {
    const merged = mergeLines(doc.value, lineIds, text);
    if (!merged) {
      notify("合并需要同一分镜内至少两句原文", "error");
      return;
    }
    notify("已合并：原译文保存在新句的历史中，不会被当作已审校", "success");
  }

  function previewBulk(text: string) {
    bulkDraft.value = text;
    const panel = selected.value?.panel;
    if (!panel) return;
    const texts = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    bulkPreview.value = texts.length
      ? previewPanelReplacement(doc.value, panel.id, texts)
      : null;
    bulkNotice.value = texts.length
      ? "预览基于当前稿计算，尚未写入任何内容"
      : "";
  }

  function applyBulk() {
    const panel = selected.value?.panel;
    if (!panel || !bulkPreview.value) {
      notify("请先输入新的整段对白并查看影响预览", "error");
      return;
    }
    const texts = bulkDraft.value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const result = replacePanelLines(doc.value, panel.id, texts);
    if (!result) {
      notify("整段替换失败，请确认内容非空", "error");
      return;
    }
    bulkPreview.value = null;
    bulkDraft.value = "";
    bulkNotice.value = "";
    const archived = result.removed.length
      ? `，${result.removed.length} 句被移除（译文可在「已移除的对白」中查看）`
      : "";
    notify(
      `整段替换完成：${result.edited} 句原位更新，${result.split} 处拆分，${result.merged} 处合并，${result.replaced} 组改写${archived}；审校历史全部保留`,
      "success",
    );
  }

  function toggle(lineId: string) {
    expanded.value = {
      ...expanded.value,
      [lineId]: !expanded.value[lineId],
    };
  }

  function lineage(lineId: string) {
    return lineageFor(doc.value, lineId);
  }

  return {
    panels,
    selected,
    selectedPanelId,
    select,
    selectForLine,
    ensureSelection,
    panelLabel,
    lines,
    currentDraft,
    setDraft,
    save,
    approve,
    revert,
    restore,
    editSource,
    split,
    merge,
    previewBulk,
    applyBulk,
    bulkDraft,
    bulkPreview,
    bulkNotice,
    mergeSelection,
    mergeDraft,
    toggleMerge,
    mergeSelected,
    resolve,
    toggle,
    expanded,
    lineage,
    busyLine,
  };
}
