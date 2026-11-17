<script setup lang="ts">
import { computed } from "vue";
import type { ComicDocument, ReaderLanguage } from "../../../shared/document";
const props = defineProps<{
  doc: ComicDocument;
  language: ReaderLanguage;
  englishAvailable: boolean;
  stats: { total: number; translated: number; reviewed: number; pending: number };
  publisherOpen: boolean;
}>();
const emit = defineEmits<{
  language: [value: ReaderLanguage];
  publish: [];
  workbench: [];
}>();
const englishPercent = computed(() =>
  props.stats.total
    ? Math.round((props.stats.translated / props.stats.total) * 100)
    : 0,
);
</script>
<template>
  <div class="language-bar">
    <div class="language-select" role="group" aria-label="阅读语言">
      <span>阅读语言</span>
      <div class="segmented">
        <button
          :class="{ active: language === 'zh' }"
          @click="emit('language', 'zh')"
        >
          中文
        </button>
        <button
          :class="{ active: language === 'en' }"
          :disabled="!englishAvailable"
          :title="englishAvailable ? '' : '英文版尚未发布'"
          @click="emit('language', 'en')"
        >
          English
        </button>
        <button
          class="bilingual"
          :class="{ active: language === 'bi' }"
          :disabled="!englishAvailable"
          @click="emit('language', 'bi')"
        >
          中英对照
        </button>
      </div>
      <span v-if="!englishAvailable" class="lang-hint">英文版未发布</span>
      <span v-else class="lang-hint"
        >英文已译 {{ englishPercent }}% · 切换不改变镜头、进度与书签</span
      >
    </div>
    <div class="language-actions">
      <button class="ghost" @click="emit('publish')">
        发布语言与翻译
      </button>
      <button class="ghost accent" @click="emit('workbench')">
        逐句译校
      </button>
    </div>
  </div>
</template>
