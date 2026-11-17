import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { demoReadBook, useLibrary } from "../features/library";
import { useChapters } from "../features/chapters";
import { useReader } from "../features/reader";
import { useAudio } from "../features/audio";
import { useProgress, readSession } from "../features/progress";
import { useTranslation } from "../features/translation/model/translation";
import { useProofreading } from "../features/translation/model/proof";
import type { LanguagePreference, ReaderLanguage } from "../shared/document";
import { migrateReaderLanguage } from "../shared/migration";

export function useWorkspace() {
  const saved = readSession(),
    doc = ref(saved?.document ?? demoReadBook()),
    reader = useReader(doc);
  if (saved) reader.dispatch({ type: "restore", location: saved.location });
  const translation = useTranslation(doc, {
      language: saved?.language,
      translator: saved?.translator,
    }),
    preference = computed<LanguagePreference>(() => ({
      language: translation.language.value,
      translator: translation.translator.value,
    })),
    progress = useProgress(doc, reader.location, saved, preference),
    library = useLibrary(doc, (id) => {
      reader.dispatch({ type: "chapter", id });
      progress.reconcile();
    }),
    chapters = useChapters(doc, () => {
      reader.reconcile();
      progress.reconcile();
    }),
    proof = useProofreading(
      doc,
      computed(() => "en"),
      computed(() => translation.translator.value),
      translation.notify,
    ),
    panel = computed(() => reader.current.value.panel),
    audio = useAudio(
      doc,
      panel,
      computed<ReaderLanguage>(() => translation.language.value),
    );
  function keydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    // Never steal keys from real text fields, but keep arrows working after a
    // toolbar button was clicked (focus stays on that button).
    if (target?.closest("input,textarea,select,[contenteditable='true']")) return;
    if (e.key === " " && target?.closest("button")) return;
    if (e.key === "Escape" && translation.workbenchOpen.value) {
      translation.workbenchOpen.value = false;
      return;
    }
    if (e.key === "Escape" && translation.publishOpen.value) {
      translation.publishOpen.value = false;
      return;
    }
    if (translation.workbenchOpen.value || translation.publishOpen.value) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      reader.dispatch({ type: "move", delta: e.key === "ArrowRight" ? 1 : -1 });
    }
    if (e.key === " ") {
      e.preventDefault();
      audio.toggle();
    }
    if (e.key === "Escape") reader.setMode("page");
  }
  onMounted(() => window.addEventListener("keydown", keydown));
  onBeforeUnmount(() => window.removeEventListener("keydown", keydown));
  /* Keep the proofreading workbench focused on the panel being read. */
  watch(panel, (value) => {
    if (value) proof.select(value.id);
  });
  /* After opening another read-book the old location may not exist. */
  watch(doc, () => {
    reader.reconcile();
    progress.reconcile();
    translation.language.value = migrateReaderLanguage(
      doc.value,
      translation.language.value,
    );
    const panel = reader.current.value.panel;
    if (panel) proof.select(panel.id);
  });
  return {
    doc,
    reader,
    progress,
    library,
    chapters,
    audio,
    translation,
    proof,
  };
}
