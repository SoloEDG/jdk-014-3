<script setup lang="ts">
import { computed } from "vue";
import {
  X,
  Globe2,
  Eye,
  EyeOff,
  Languages,
  Download,
  Upload,
} from "lucide-vue-next";
import type { ComicDocument, Locale } from "../../../shared/document";

const props = defineProps<{
  doc: ComicDocument;
  stats: Record<Locale, { total: number; translated: number; reviewed: number; pending: number; conflicts: number }>;
  onClose: () => void;
}>();
const emit = defineEmits<{
  publish: [locale: Locale, value: boolean];
  exportBook: [];
  openBook: [file: File];
}>();

function choseBook(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) emit("openBook", file);
  input.value = "";
}

const en = computed(() => props.stats.en);
const enPercent = computed(() =>
  en.value.total ? Math.round((en.value.translated / en.value.total) * 100) : 0,
);
const reviewedPercent = computed(() =>
  en.value.total ? Math.round((en.value.reviewed / en.value.total) * 100) : 0,
);
const enPublished = computed(() => props.doc.settings.published.includes("en"));
const pendingPublish = computed(
  () => en.value.pending + en.value.conflicts,
);
</script>

<template>
  <div class="modal-backdrop" @click.self="onClose">
    <section class="publish-dialog" role="dialog" aria-label="发布语言">
      <header>
        <div>
          <small>PUBLISH</small>
          <h2>选择发布哪些语言</h2>
        </div>
        <button class="close" aria-label="关闭发布设置" @click="onClose">
          <X :size="16" />
        </button>
      </header>
      <p class="publish-lead">
        原文始终保持发布；译文达到可读状态后再对外开放。读者切换语言时，镜头、阅读进度与书签都保持原位。
      </p>
      <article class="publish-row locked">
        <div class="publish-icon"><Languages :size="17" /></div>
        <div>
          <strong>中文 · 原文</strong>
          <p>原始对白，无法下架；所有译文都以它为基准。</p>
        </div>
        <span class="publish-badge on">已发布</span>
      </article>
      <article class="publish-row">
        <div class="publish-icon"><Globe2 :size="17" /></div>
        <div>
          <strong>English · 译文</strong>
          <p>
            已翻译 {{ en.translated }}/{{ en.total }} 句（{{ enPercent }}%），
            已审校 {{ en.reviewed }} 句（{{ reviewedPercent }}%），
            待复核 {{ en.pending }} 句，冲突 {{ en.conflicts }} 句。
          </p>
          <div class="publish-meter">
            <i :style="{ width: `${enPercent}%` }"></i>
            <b :style="{ width: `${reviewedPercent}%` }"></b>
          </div>
          <p v-if="!enPublished && pendingPublish" class="warn">
            仍有 {{ pendingPublish }} 句未完成审校；未完成的句子对读者回退显示原文，并带有「待译」标记。
          </p>
        </div>
        <button
          class="publish-toggle"
          :class="{ on: enPublished }"
          :disabled="!en.translated"
          @click="emit('publish', 'en', !enPublished)"
        >
          <Eye v-if="enPublished" :size="13" /><EyeOff v-else :size="13" />
          {{ enPublished ? "对读者发布中" : "发布英文版" }}
        </button>
      </article>
      <div class="publish-foot">
        <div class="publish-foot-actions">
          <button class="ghost" @click="emit('exportBook')">
            <Download :size="13" />导出完整双语读本
          </button>
          <label class="file-button">
            <Upload :size="13" />打开双语读本
            <input
              type="file"
              accept="application/json,.json"
              @change="choseBook"
            />
          </label>
        </div>
        <small
          >发布只影响读者能看到哪种语言，不会改动任何译文或审校记录。</small
        >
      </div>
    </section>
  </div>
</template>
