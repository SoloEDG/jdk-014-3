import {
  ref,
  computed,
  watch,
  onBeforeUnmount,
  type ComputedRef,
  type Ref,
} from "vue";
import type {
  ComicDocument,
  Panel,
  ReaderLanguage,
} from "../../../shared/document";
import { AmbientSynth } from "../lib/synth";
import { cueFor } from "../lib/cues";

export function useAudio(
  doc: Ref<ComicDocument>,
  panel: ComputedRef<Panel | undefined>,
  language: ComputedRef<ReaderLanguage>,
) {
  const enabled = ref(false),
    volume = ref(0.35),
    dialogue = ref(true),
    error = ref(""),
    cue = computed(() => cueFor(doc.value, panel.value, language.value)),
    supported =
      typeof window !== "undefined" && "speechSynthesis" in window;
  const synth = new AmbientSynth();
  let generation = 0;

  function stopSpeech() {
    if (supported) window.speechSynthesis.cancel();
  }

  function speakDialogue() {
    if (!supported || !dialogue.value) return;
    stopSpeech();
    // In bilingual mode read the source aloud; otherwise read only the lines
    // that belong to the language being spoken.
    const spokenLocale = language.value === "en" ? "en" : "zh";
    const spoken = cue.value.lines.filter(
      (line) => line.locale === spokenLocale,
    );
    const text = spoken.map((line) => line.text).join("。");
    if (!text.trim()) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = spokenLocale === "en" ? "en-US" : "zh-CN";
    utterance.volume = Math.min(1, volume.value + 0.2);
    utterance.rate = spokenLocale === "en" ? 1 : 0.95;
    const prefix = spokenLocale === "en" ? "en" : "zh";
    const voices = window.speechSynthesis.getVoices();
    const voice =
      voices.find((candidate) => candidate.lang === utterance.lang) ??
      voices.find((candidate) => candidate.lang.startsWith(prefix));
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  }

  async function play() {
    const own = ++generation;
    try {
      await synth.start(cue.value.kind, volume.value);
      if (own !== generation && !enabled.value) synth.stop();
      if (own === generation) speakDialogue();
    } catch {
      enabled.value = false;
      error.value = "浏览器未能启动声音，请再次点击播放";
    }
  }

  function toggle() {
    enabled.value = !enabled.value;
    if (enabled.value) void play();
    else {
      generation++;
      synth.stop();
      stopSpeech();
    }
  }

  function retime() {
    if (enabled.value) speakDialogue();
  }

  watch(
    () => panel.value?.id,
    () => {
      if (enabled.value) void play();
    },
  );
  watch(language, () => {
    if (enabled.value) void play();
  });
  watch(volume, (value) => synth.volume(value));
  watch(dialogue, (on) => {
    if (!on) stopSpeech();
    else if (enabled.value) speakDialogue();
  });
  onBeforeUnmount(() => {
    synth.dispose();
    stopSpeech();
  });
  return {
    enabled,
    volume,
    dialogue,
    error,
    cue,
    toggle,
    retime,
    speechSupported: supported,
  };
}
