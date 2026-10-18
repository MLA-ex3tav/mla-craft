import type { TaskProgress } from "./types";

// Overall server installation estimate, with a distinct range for each stage.
// A downloaded archive is not yet a completed installation.
export function normalizeProgress(task: TaskProgress, previous?: TaskProgress): TaskProgress {
  const raw = Number.isFinite(task.percent) ? Math.max(0, Math.min(100, task.percent)) : 0;
  if (task.phase === "content" || task.id.startsWith("java-")) return { ...task, percent: raw };
  const ranges: Record<string, [number, number]> = {
    resolve: [0, 0], java: [5, 35], download: [35, 80], install: [80, 95], configure: [95, 99], done: [100, 100],
  };
  const range = ranges[task.phase];
  if (!range) return { ...task, percent: raw };
  let percent = range[0] + (range[1] - range[0]) * raw / 100;
  if (task.phase !== "resolve" && previous && previous.phase !== "done" && previous.phase !== "content") {
    percent = Math.max(percent, previous.percent);
  }
  return { ...task, percent: task.phase === "done" ? 100 : Math.min(99, percent) };
}
