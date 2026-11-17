<script setup lang="ts">
import {
  Headphones,
  Volume2,
  Play,
  Pause,
  MessageSquare,
} from "lucide-vue-next";
import { volumeLabel } from "../lib/cues";
import type { ReaderLanguage } from "../../../shared/document";

const PENDING = new Set(["draft", "stale", "fallback", "reverted"]);
const isPending = (status: string) => PENDING.has(status);
defineProps<{
  enabled: boolean;
  volume: number;
  dialogue: boolean;
  language: ReaderLanguage;
  englishAvailable: boolean;
  cue: {
    title: string;
    kind: string;
    speaker: string;
    text: string;
    langLabel: string;
    seconds: number;
    lines: Array<{
      key: string;
      text: string;
      speaker: string;
      locale: string;
      status: string;
      statusLabel: string;
      seconds: number;
    }>;
  };
  error: string;
}>();
const emit = defineEmits<{
  toggle: [];
  volume: [value: number];
  dialogue: [];
  language: [value: ReaderLanguage];
}>();
</script>
<template>
  <section class="audio-panel">
    <div class="section-heading">
      <span><Headphones :size="15" /> 声音与对白</span
      ><span class="live-label">LIVE</span>
    </div>
    <div class="sound-card">
      <div class="sound-icon"><Headphones :size="27" /></div>
      <h3>让故事，在耳边发生</h3>
      <p>声景随分镜变化，朗读使用当前所选语言</p>
      <div class="waveform" :class="{ playing: enabled }">
        <i
          v-for="i in 32"
          :key="i"
          :style="{
            height: `${8 + ((i * 13) % 29)}px`,
            animationDelay: `${i * 0.04}s`,
          }"
        ></i>
      </div>
      <div class="sound-track">
        <div>
          <strong>{{ cue.title }}</strong
          ><small>{{
            enabled ? "正在播放 · 循环声景" : "点击播放，进入故事"
          }}</small>
        </div>
        <button
          class="play-sound"
          :aria-label="enabled ? '暂停音效' : '播放音效'"
          @click="emit('toggle')"
        >
          <Pause v-if="enabled" :size="17" /><Play v-else :size="17" />
        </button>
      </div>
      <label class="volume"
        ><Volume2 :size="15" /><input
          aria-label="音量"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="volume"
          @input="
            emit('volume', Number(($event.target as HTMLInputElement).value))
          "
        /><span>{{ volumeLabel(volume) }}</span></label
      >
    </div>
    <div class="dialogue-heading">
      <span><MessageSquare :size="14" /> 当前对白</span
      ><button
        class="toggle"
        :class="{ on: dialogue }"
        aria-label="显示对白"
        :aria-pressed="dialogue"
        @click="emit('dialogue')"
      >
        <i></i>
      </button>
    </div>
    <div class="spoken-language">
      <span>朗读语言</span>
      <div class="mini-switch" role="group" aria-label="朗读语言">
        <button
          :class="{ active: language === 'zh' }"
          @click="emit('language', 'zh')"
        >
          中文
        </button>
        <button
          :class="{ active: language === 'en' }"
          :disabled="!englishAvailable"
          @click="emit('language', 'en')"
        >
          EN
        </button>
        <button
          :class="{ active: language === 'bi' }"
          :disabled="!englishAvailable"
          @click="emit('language', 'bi')"
        >
          对照
        </button>
      </div>
      <small>{{ cue.seconds }}s · 阅读时长按当前语言估算</small>
    </div>
    <div v-if="dialogue" class="dialogue-card">
      <div
        v-for="line in cue.lines"
        :key="line.key"
        class="dialogue-line"
        :class="[`is-${line.locale}`, { pending: isPending(line.status) }]"
      >
        <small
          >{{ line.speaker }}<template v-if="line.statusLabel">
            · {{ line.statusLabel }}</template
          >
          · {{ line.seconds }}s</small
        >
        <p>“{{ line.text }}”</p>
      </div>
      <p v-if="!cue.lines.length" class="muted">请选择一个分镜</p>
      <div class="dialogue-dots">● <span>● ●</span></div>
    </div>
    <p v-else class="muted">对白已隐藏</p>
    <p v-if="error" role="alert" class="notice">{{ error }}</p>
    <div class="headphone-note">
      <Headphones :size="15" /><span
        >推荐佩戴耳机<br /><small>[朗读使用所选语言的语音提示]</small></span
      >
    </div>
  </section>
</template>
