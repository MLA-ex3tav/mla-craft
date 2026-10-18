import { normalizeProgress } from "./normalizeProgress";
import { useEffect, useState } from "react";
import { listen } from "./transport";
import type { TaskProgress } from "./types";

/// Se suscribe a los eventos de progreso de tareas largas.
export function useTaskProgress() {
  const [tasks, setTasks] = useState<Record<string, TaskProgress>>({});

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    listen<TaskProgress>("task-progress", (progress) => {
      setTasks((prev) => ({ ...prev, [progress.id]: normalizeProgress(progress, prev[progress.id]) }));
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => { disposed = true; unlisten?.(); };
  }, []);

  return tasks;
}
