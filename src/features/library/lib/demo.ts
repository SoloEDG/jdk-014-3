import type {
  Chapter,
  ComicDocument,
  ComicPage,
  Panel,
} from "../../../shared/document";
import { artwork } from "./artwork";
import type { Translation } from "../../../shared/document";

const DEMO_EN: Record<string, string> = {
  "整座城市都在等待一场不会停的雨。":
    "The whole city is waiting for a rain that will not stop.",
  "末班车已经走了，你还在等谁？":
    "The last train has already gone. Who are you still waiting for?",
  "一封没有署名的消息，在凌晨两点亮起。":
    "An unsigned message lights up at two in the morning.",
  "沿着光走。我们在旧车站见。":
    "Follow the light. We'll meet at the old station.",
  "街灯把影子拉得很长。":
    "The streetlamps stretch our shadows long.",
  "我记得这里，曾经有一间唱片店。":
    "I remember this place. There used to be a record shop.",
  "有人比我更早抵达。": "Someone arrived before I did.",
  "雨声里，传来一首熟悉的歌。":
    "Through the rain comes a song I know.",
};

export function demoDocument(): ComicDocument {
  const lines = [
    [
      "整座城市都在等待一场不会停的雨。",
      "末班车已经走了，你还在等谁？",
      "一封没有署名的消息，在凌晨两点亮起。",
      "沿着光走。我们在旧车站见。",
    ],
    [
      "街灯把影子拉得很长。",
      "我记得这里，曾经有一间唱片店。",
      "有人比我更早抵达。",
      "雨声里，传来一首熟悉的歌。",
    ],
    [
      "城市的边缘，终于亮起一线微光。",
      "原来你一直都在。",
      "那封信，是写给昨天的自己。",
      "天亮了。我们出发吧。",
    ],
  ];
  const chapters: Chapter[] = lines.map((text, c) => {
    const pages: ComicPage[] = Array.from(
      { length: c === 0 ? 4 : 3 },
      (_, p) => ({
        id: `page-${c}-${p}`,
        title: `第 ${p + 1} 页`,
        width: 900,
        height: 1200,
        image: artwork(c + p),
        panels: text.map((dialogue, i) => {
          const panelId = `panel-${c}-${p}-${i}`;
          const panel: Panel = {
            id: panelId,
            lines: [
              {
                id: `${panelId}-l0`,
                text: dialogue,
                speaker: i % 2 ? "陈屿" : "旁白",
                duration: 4 + i,
              },
            ],
            sound: i === 2 ? "pulse" : "rain",
            rect: [
              { x: 12, y: 12, width: 876, height: 532 },
              { x: 12, y: 558, width: 430, height: 390 },
              { x: 456, y: 558, width: 432, height: 390 },
              { x: 12, y: 962, width: 876, height: 226 },
            ][i]!,
          };
          return panel;
        }),
      }),
    );
    return {
      id: `chapter-${c}`,
      title: ["第一章 · 夜的来信", "第二章 · 失落的频率", "第三章 · 天光将至"][
        c
      ]!,
      subtitle: [
        "凌晨 02:17 / 城市边缘",
        "凌晨 03:42 / 旧车站",
        "清晨 05:06 / 海岸",
      ][c]!,
      pages,
    };
  });
  return {
    version: 2,
    id: "before-rain",
    title: "雨停之前",
    author: "林间工作室",
    chapters,
    translations: {},
    lineage: [],
    sourceLog: [],
    settings: { sourceLocale: "zh", published: ["zh", "en"] },
  };
}

/**
 * A small bilingual sample so readers can try switching language immediately.
 * Chapter 2 is intentionally left untranslated to demonstrate the fallback.
 */
export function demoReadBook(): ComicDocument {
  const doc = demoDocument();
  const seededAt = Date.now() - 1000 * 60 * 60 * 26;
  let index = 0;
  for (const chapter of doc.chapters.slice(0, 2)) {
    for (const page of chapter.pages) {
      for (const panel of page.panels) {
        for (const line of panel.lines) {
          const text = DEMO_EN[line.text];
          if (!text) continue;
          index++;
          // Leave two lines as draft and one reverted so the reader can see
          // how unfinished translations are handled.
          const state = index === 9 || index === 13 ? "draft" : "reviewed";
          const translation: Translation = {
            lineId: line.id,
            locale: "en",
            text,
            state,
            sourceText: line.text,
            stale: false,
            by: "演示译校",
            at: seededAt,
            history: [],
            conflicts: [],
          };
          if (index === 16) {
            translation.text = "";
            translation.reverted = true;
            translation.state = "draft";
            translation.history = [
              {
                id: `demo-version-${index}`,
                text,
                state: "draft",
                sourceText: line.text,
                by: "演示译校",
                at: seededAt,
                note: "回退到原文前版本",
              },
            ];
          }
          doc.translations[`en:${line.id}`] = translation;
        }
      }
    }
  }
  return doc;
}
