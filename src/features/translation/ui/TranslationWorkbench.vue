<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  X,
  Check,
  RotateCcw,
  Save,
  History,
  Split,
  Merge,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  GitBranch,
  Upload,
  FileJson,
  ShieldCheck,
} from "lucide-vue-next";
import type { ComicDocument, Locale } from "../../../shared/document";
import type { useProofreading } from "../model/proof";
import type { ImportReport } from "../lib/engine";
import { statusTone } from "../lib/status";
import { sourceKindLabel } from "../lib/engine";
import { conflictSummary, versionSummary, translationStateLabel } from "../lib/history";
import { archivedLines, lineageFor } from "../lib/engine";
import { LOCALE_LABEL } from "../lib/engine";

type Proof = ReturnType<typeof useProofreading>;

const props = defineProps<{
  doc: ComicDocument;
  proof: Proof;
  locale: Locale;
  translator: string;
  published: string[];
  report: ImportReport | null;
  onClose: () => void;
}>();

const emit = defineEmits<{
  upload: [file: File];
  exportMine: [];
  exportAll: [];
  dismissReport: [];
  translator: [value: string];
}>();

const chapterFilter = ref("all");
const pageFilter = ref("all");
const splitOpen = ref("");
const splitDraft = ref<Record<string, string>>({});
const bulkOpen = ref(false);
const sourceEditing = ref("");
const sourceDraft = ref("");

const chapters = computed(() => props.doc.chapters);
const pages = computed(() => {
  const chapter = chapters.value.find((c) => c.id === chapterFilter.value);
  return chapter?.pages ?? [];
});
const panelRows = computed(() => {
  return props.proof.panels.value.filter(({ chapter, page }) => {
    if (chapterFilter.value !== "all" && chapter.id !== chapterFilter.value)
      return false;
    if (pageFilter.value !== "all" && page.id !== pageFilter.value) return false;
    return true;
  });
});

watch(chapterFilter, () => {
  pageFilter.value = "all";
});

const progress = computed(() => {
  const lines = props.proof.lines.value;
  return {
    reviewed: lines.filter((line) => line.status === "reviewed").length,
    pending: lines.filter(
      (line) => line.status === "draft" || line.status === "stale",
    ).length,
    missing: lines.filter(
      (line) => line.status === "missing" || line.status === "reverted",
    ).length,
  };
});

function choosePanel(id: string) {
  props.proof.select(id);
  splitOpen.value = "";
}

function sourceFor(lineId: string) {
  return (
    props.doc.chapters
      .flatMap((chapter) => chapter.pages)
      .flatMap((page) => page.panels)
      .flatMap((panel) => panel.lines)
      .find((line) => line.id === lineId)?.text ?? ""
  );
}

function beginEditSource(lineId: string, text: string) {
  sourceEditing.value = lineId;
  sourceDraft.value = text;
}

function commitSource(lineId: string) {
  if (sourceDraft.value.trim() && sourceDraft.value !== sourceFor(lineId))
    props.proof.editSource(lineId, sourceDraft.value);
  sourceEditing.value = "";
}

function beginSplit(lineId: string) {
  splitOpen.value = splitOpen.value === lineId ? "" : lineId;
  splitDraft.value[lineId] = sourceFor(lineId);
}

function runSplit(lineId: string) {
  const parts = (splitDraft.value[lineId] ?? "")
    .split("\n")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return;
  props.proof.split(lineId, parts);
  splitOpen.value = "";
}

function file(event: Event) {
  const input = event.target as HTMLInputElement;
  const chosen = input.files?.[0];
  if (chosen) emit("upload", chosen);
  input.value = "";
}

const archivedForPanel = computed(() =>
  archivedLines(props.doc, props.proof.selected.value?.panel.id ?? ""),
);

function sourceLogFor(lineId: string) {
  return props.doc.sourceLog.filter((entry) => entry.lineId === lineId);
}

const panelProgress = (id: string) => {
  const panel = props.proof.panels.value.find((entry) => entry.panel.id === id);
  if (!panel) return { translated: 0, total: 0 };
  const total = panel.panel.lines.length;
  const translated = panel.panel.lines.filter((line) => {
    const translation = props.doc.translations[`${props.locale}:${line.id}`];
    return Boolean(translation?.text.trim()) && !translation?.reverted;
  }).length;
  return { translated, total };
};
</script>

<template>
  <div class="modal-backdrop" @click.self="onClose">
    <section class="workbench" role="dialog" aria-label="逐句译校">
      <header class="workbench-head">
        <div>
          <small>BILINGUAL PROOFING</small>
          <h2>逐句译校 · {{ LOCALE_LABEL[locale] }}</h2>
        </div>
        <div class="workbench-head-actions">
          <label class="file-button">
            <Upload :size="13" />导入译者结果
            <input
              type="file"
              accept="application/json,.json"
              @change="file"
            />
          </label>
          <button class="ghost" @click="emit('exportMine')">
            <FileJson :size="13" />导出我的译文
          </button>
          <button class="ghost" @click="emit('exportAll')">
            <FileJson :size="13" />导出全部
          </button>
          <button class="close" aria-label="关闭译校台" @click="onClose">
            <X :size="16" />
          </button>
        </div>
      </header>
      <div class="workbench-body">
        <aside class="proof-nav">
          <div class="proof-filters">
            <label
              >章节<select v-model="chapterFilter">
                <option value="all">全部章节</option>
                <option v-for="c in chapters" :key="c.id" :value="c.id">
                  {{ c.title }}
                </option>
              </select></label
            >
            <label
              >页面<select v-model="pageFilter">
                <option value="all">全部页面</option>
                <option v-for="p in pages" :key="p.id" :value="p.id">
                  {{ p.title }}
                </option>
              </select></label
            >
          </div>
          <button
            v-for="(row, i) in panelRows"
            :key="row.panel.id"
            class="proof-nav-item"
            :class="{ active: row.panel.id === proof.selected.value?.panel.id }"
            @click="choosePanel(row.panel.id)"
          >
            <span class="proof-nav-index">{{
              String(i + 1).padStart(2, "0")
            }}</span>
            <span class="proof-nav-copy">
              <strong>{{ row.page.title }} · {{ row.panel.lines.length }} 句</strong>
              <small>{{ row.chapter.title }}</small>
            </span>
            <span class="proof-nav-count">
              {{ panelProgress(row.panel.id).translated }}/{{
                panelProgress(row.panel.id).total
              }}
            </span>
          </button>
        </aside>
        <main class="proof-lines" v-if="proof.selected.value">
          <div v-if="report" class="import-report" role="status">
            <div>
              <strong>导入结果 · {{ report.translator }}</strong>
              <small
                >新增 {{ report.accepted }} · 升级审校 {{ report.promoted }} ·
                相同 {{ report.unchanged }} · 并列冲突 {{ report.conflicts }} ·
                跳过 {{ report.skipped }}</small
              >
              <small v-if="report.conflicts"
                >冲突不会覆盖现有译文，已在对应句下方并列显示。</small
              >
              <small v-for="(line, i) in report.errors" :key="i" class="warn">{{
                line
              }}</small>
            </div>
            <button aria-label="关闭导入结果" @click="emit('dismissReport')">
              <X :size="12" />
            </button>
          </div>
          <div class="proof-summary">
            <div>
              <strong>{{ proof.panelLabel.value }}</strong>
              <small
                >译文按原句 id 关联，不随显示顺序变化 · 已审校
                {{ progress.reviewed }} 句 · 待处理
                {{ progress.pending }} 句 · 未完成
                {{ progress.missing }} 句</small
              >
            </div>
            <span class="source-locale">原文 {{ LOCALE_LABEL.zh }}</span>
          </div>
          <article
            v-for="(row, index) in proof.lines.value"
            :key="row.line.id"
            class="proof-line"
            :class="[`tone-${statusTone(row.status)}`, { open: proof.expanded.value[row.line.id] }]"
          >
            <div class="proof-line-head">
              <span class="line-number">{{
                String(index + 1).padStart(2, "0")
              }}</span>
              <span class="line-speaker">{{ row.line.speaker }}</span>
              <span class="status-chip" :class="statusTone(row.status)">{{
                row.statusText
              }}</span>
              <span v-if="row.sourceChanged" class="status-chip stale"
                >原文快照不同</span
              >
              <span v-if="row.translation?.conflicts.length" class="status-chip conflict"
                >{{ row.translation.conflicts.length }} 个导入冲突</span
              >
              <span class="line-id" :title="row.line.id">{{ row.line.id }}</span>
            </div>
            <div class="line-grid">
              <div class="source-cell">
                <label class="cell-label"
                  >原句
                  <button
                    v-if="sourceEditing !== row.line.id"
                    aria-label="修改原句"
                    @click="beginEditSource(row.line.id, row.line.text)"
                  >
                    修改
                  </button>
                </label>
                <textarea
                  v-if="sourceEditing === row.line.id"
                  v-model="sourceDraft"
                  rows="2"
                  :aria-label="`第 ${index + 1} 句原句`"
                  @keydown.enter.exact.prevent="commitSource(row.line.id)"
                  @keydown.esc="sourceEditing = ''"
                ></textarea>
                <p v-else class="source-text">{{ row.line.text }}</p>
                <small class="line-meta"
                  >作者时长 {{ row.line.duration }}s · 原文修改只影响基于旧稿的译句</small
                >
              </div>
              <div class="translation-cell">
                <label class="cell-label">译文 · {{ LOCALE_LABEL[locale] }}</label>
                <textarea
                  rows="3"
                  :aria-label="`第 ${index + 1} 句译文`"
                  :value="proof.currentDraft(row.line.id)"
                  :placeholder="
                    row.status === 'reverted'
                      ? '已回退；读者目前看到原文。可重新翻译。'
                      : '输入译文…'
                  "
                  @input="
                    proof.setDraft(
                      row.line.id,
                      ($event.target as HTMLTextAreaElement).value,
                    )
                  "
                ></textarea>
                <div class="line-actions">
                  <button @click="proof.save(row.line.id, 'draft')">
                    <Save :size="12" />保存草稿
                  </button>
                  <button @click="proof.approve(row.line.id)">
                    <Check :size="12" />审校通过
                  </button>
                  <button @click="proof.revert(row.line.id)">
                    <RotateCcw :size="12" />回退原文
                  </button>
                  <button @click="proof.toggle(row.line.id)">
                    <History :size="12" />历史
                    {{ row.translation?.history.length ?? 0 }}
                  </button>
                  <button title="拆分本句" @click="beginSplit(row.line.id)">
                    <Split :size="12" />拆分
                  </button>
                  <button
                    class="merge-toggle"
                    :class="{ on: proof.mergeSelection.value.includes(row.line.id) }"
                    title="选择相邻句以合并"
                    @click="proof.toggleMerge(row.line.id)"
                  >
                    <Merge :size="12" />合并
                  </button>
                </div>
                <div v-if="sourceEditing !== row.line.id && row.sourceChanged && row.translation" class="source-diff">
                  <small>译文基于：{{ row.translation.sourceText || "（空）" }}</small>
                  <span>现在原文：{{ row.line.text }}</span>
                </div>
              </div>
            </div>

            <div v-if="splitOpen === row.line.id" class="inline-tool split-tool">
              <label
                >把原句拆成多句（每行一句）
                <textarea v-model="splitDraft[row.line.id]" rows="3"></textarea>
              </label>
              <div>
                <button
                  class="ghost"
                  @click="splitDraft[row.line.id] = (splitDraft[row.line.id] ?? '').replace(/([。！？!?])\s*/g, '$1\n')"
                >
                  按句号预分
                </button>
                <button @click="runSplit(row.line.id)">确认拆分</button>
                <small
                  >拆分后新句获得新 id；原译文转为第一句的待复核草稿，历史保留</small
                >
              </div>
            </div>

            <div
              v-if="row.translation?.conflicts.length"
              class="conflict-box"
            >
              <div class="conflict-title">
                <AlertTriangle :size="13" />同一句存在不同译文，请并列审阅（不会自动覆盖）
              </div>
              <div class="conflict-grid">
                <div class="conflict-column current">
                  <small>当前版本 · {{ row.translation.state === "reviewed" ? "已审校" : "草稿" }}</small>
                  <p>{{ row.translation.text }}</p>
                  <button @click="proof.resolve(row.line.id, null, 'keep')">
                    保留当前译文
                  </button>
                </div>
                <div
                  v-for="conflict in row.translation.conflicts"
                  :key="conflict.id"
                  class="conflict-column incoming"
                >
                  <small>{{ conflictSummary(conflict) }} · {{ conflict.state === "reviewed" ? "导入时已审校" : "导入草稿" }}</small>
                  <p>{{ conflict.text }}</p>
                  <small v-if="conflict.sourceText !== row.line.text" class="warn"
                    >基于旧原文，采用后需复核</small
                  >
                  <button @click="proof.resolve(row.line.id, conflict.id, 'take')">
                    采用此版本
                  </button>
                </div>
              </div>
            </div>

            <div v-if="proof.expanded.value[row.line.id]" class="history-box">
              <div class="history-head">
                <span><History :size="12" />审校历史</span>
                <span v-if="row.translation?.note">{{ row.translation.note }}</span>
              </div>
              <div v-if="row.translation?.history.length" class="history-list">
                <div
                  v-for="version in [...row.translation.history].reverse()"
                  :key="version.id"
                  class="history-row"
                >
                  <small
                    >{{ versionSummary(version) }} ·
                    {{ translationStateLabel(version.state) }}</small
                  >
                  <p>{{ version.text }}</p>
                  <small v-if="version.note" class="note">{{ version.note }}</small>
                  <button @click="proof.restore(row.line.id, version.id)">
                    恢复
                  </button>
                </div>
              </div>
              <p v-else class="muted">还没有历史版本</p>
              <div class="lineage">
                <span><GitBranch :size="12" />来源关系</span>
                <template
                  v-if="proof.lineage(row.line.id).sources.length"
                >
                  <div
                    v-for="source in proof.lineage(row.line.id).sources"
                    :key="source.id + source.link.id"
                  >
                    <small
                      >{{
                        source.link.kind === "split"
                          ? "由原句拆分"
                          : source.link.kind === "merge"
                            ? "由多句合并"
                            : "整段替换"
                      }}
                      · {{ new Date(source.link.at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) }}</small
                    >
                    <p>{{ source.text }}</p>
                  </div>
                </template>
                <small v-else>无（原句直接保留）</small>
                <details
                  v-if="sourceLogFor(row.line.id).length"
                  class="source-log"
                >
                  <summary>原文变更记录（{{ sourceLogFor(row.line.id).length }}）</summary>
                  <div
                    v-for="change in sourceLogFor(row.line.id)"
                    :key="change.id"
                  >
                    <small
                      >{{ sourceKindLabel(change.kind) }} ·
                      {{ new Date(change.at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) }}</small
                    >
                    <p v-if="change.kind === 'edit'" class="before-text">
                      {{ change.before.map((item) => item.text).join(" / ") }}
                    </p>
                    <p v-if="change.kind === 'edit'" class="after-text">
                      → {{ change.after.map((item) => item.text).join(" / ") }}
                    </p>
                  </div>
                </details>
              </div>
            </div>
          </article>

          <div v-if="proof.mergeSelection.value.length >= 2" class="merge-bar">
            <span>合并选中的 {{ proof.mergeSelection.value.length }} 句</span>
            <input
              :value="proof.mergeDraft.value"
              aria-label="合并后的原句"
              @input="proof.mergeDraft.value = ($event.target as HTMLInputElement).value"
            />
            <button @click="proof.mergeSelected()">确认合并</button>
          </div>

          <details
            v-if="archivedForPanel.length"
            class="archived-tool"
          >
            <summary>
              已移除的对白（{{ archivedForPanel.length }} 条，译文历史已保留）
            </summary>
            <div
              v-for="row in archivedForPanel"
              :key="row.id"
              class="archived-row"
            >
              <p>{{ row.text }}</p>
              <small
                >{{ row.id }} ·
                {{
                  row.translations
                    .map(
                      (translation) =>
                        `${translation.state === "reviewed" ? "已审校" : "草稿"}「${translation.text || "已回退"}」`,
                    )
                    .join(" / ")
                }}
                · 移除于
                {{
                  new Date(row.removedAt).toLocaleString("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                }}</small
              >
            </div>
          </details>
          <section class="bulk-tool">
            <button class="bulk-toggle" @click="bulkOpen = !bulkOpen">
              <ChevronDown v-if="bulkOpen" :size="13" /><ChevronRight
                v-else
                :size="13"
              />整段替换本分镜原文（保留可追溯关系）
            </button>
            <div v-if="bulkOpen" class="bulk-body">
              <textarea
                rows="5"
                placeholder="每行一句；未变化的句子会保留原 id 与审校记录"
                :value="proof.bulkDraft.value"
                @input="proof.previewBulk(($event.target as HTMLTextAreaElement).value)"
              ></textarea>
              <p class="muted">{{ proof.bulkNotice.value }}</p>
              <div v-if="proof.bulkPreview.value" class="bulk-preview">
                <div class="bulk-counts">
                  <span>原位修改 {{ proof.bulkPreview.value.counts.edited }}</span>
                  <span>拆分 {{ proof.bulkPreview.value.counts.split }}</span>
                  <span>合并 {{ proof.bulkPreview.value.counts.merged }}</span>
                  <span>改写 {{ proof.bulkPreview.value.counts.replaced }}</span>
                  <span>新增 {{ proof.bulkPreview.value.counts.added }}</span>
                  <span>移除 {{ proof.bulkPreview.value.counts.removed }}</span>
                  <span class="accent"
                    >受影响译句 {{ proof.bulkPreview.value.affectedTranslation }}</span
                  >
                  <span v-if="proof.bulkPreview.value.affectedReviewed" class="warn"
                    >其中已审校
                    {{ proof.bulkPreview.value.affectedReviewed }} 句会转为待复核或进入历史</span
                  >
                  <span
                    v-if="proof.bulkPreview.value.archivedTranslation"
                    class="warn"
                    >{{ proof.bulkPreview.value.archivedTranslation }}
                    句随原句移除，译文移入「已移除的对白」（其中已审校
                    {{ proof.bulkPreview.value.archivedReviewed }} 句）</span
                  >
                </div>
                <div class="bulk-lines">
                  <div
                    v-for="(row, i) in proof.bulkPreview.value.lines"
                    :key="i"
                    :class="row.kind"
                  >
                    <small>{{ row.label }}</small>
                    <p v-if="row.before.length" class="before">{{ row.before.join(" / ") }}</p>
                    <p v-if="row.after.length" class="after">{{ row.after.join(" / ") }}</p>
                  </div>
                </div>
                <p class="bulk-warning">
                  已审校的译文不会被删除：能保留身份的原位更新会转为待复核，结构变化的译文进入历史。确认前不会写入。
                </p>
              </div>
              <div class="bulk-actions">
                <button class="ghost" @click="proof.previewBulk(proof.bulkDraft.value)">
                  重新预览
                </button>
                <button class="primary" @click="proof.applyBulk()">
                  <ShieldCheck :size="13" />确认整段替换
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
      <footer class="workbench-foot">
        <label class="translator-field"
          >当前译者
          <input
            :value="translator"
            aria-label="译者署名"
            maxlength="24"
            @change="
              emit('translator', ($event.target as HTMLInputElement).value)
            "
        /></label>
        <span
          >发布状态：{{
            published.includes(locale) ? "读者可见" : "读者不可见"
          }}</span
        >
        <span>逐句保存 · 局部更新 · 不影响其他语言</span>
      </footer>
    </section>
  </div>
</template>
