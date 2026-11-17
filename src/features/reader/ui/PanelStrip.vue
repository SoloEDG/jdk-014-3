<script setup lang="ts">
import { computed } from "vue";
import type {
  ComicDocument,
  ComicPage,
  ReaderLanguage,
} from "../../../shared/document";
import { frameStyle } from "../lib/viewport";
import { displayLines, panelSeconds } from "../../translation/lib/localize";
const props = defineProps<{
  page: ComicPage;
  active: string;
  language: ReaderLanguage;
  doc: ComicDocument;
}>();
const emit = defineEmits<{ select: [id: string] }>();
const rows = computed(() =>
  props.page.panels.map((panel) => {
    const lines = displayLines(props.doc, panel, props.language);
    return {
      panel,
      speaker: lines[0]?.speaker ?? "旁白",
      seconds: panelSeconds(props.doc, panel, props.language),
      pending: lines.some(
        (line) =>
          line.status === "draft" ||
          line.status === "stale" ||
          line.status === "fallback",
      ),
    };
  }),
);
</script>
<template>
  <section class="panel-strip">
    <div class="section-heading">
      <span>分镜导航 <small>STORYBOARD</small></span
      ><span class="muted">{{ page.panels.length }} 个镜头</span>
    </div>
    <div class="panel-thumbs">
      <button
        v-for="(row, i) in rows"
        :key="row.panel.id"
        :class="{ selected: active === row.panel.id }"
        @click="emit('select', row.panel.id)"
      >
        <div :style="frameStyle(page, row.panel, 'panel')"></div>
        <span
          ><b>{{ String(i + 1).padStart(2, "0") }}</b> {{ row.speaker }}
          <small v-if="row.pending" class="pending-dot" title="有未完成的译文"
            >●</small
          >
          <small>{{ row.seconds }}s</small></span
        >
      </button>
    </div>
  </section>
</template>
