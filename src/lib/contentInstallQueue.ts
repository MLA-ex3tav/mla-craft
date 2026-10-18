import { installContent, errorMessage } from "./api";

export type InstallJob = {
  key: string;
  source: string;
  projectId: string;
  name: string;
  status: "queued" | "installing" | "installed" | "error";
  error?: string;
};

// Keep downloads alive across catalog pagination, navigation and remounts.
export function createInstallQueue(run: typeof installContent) {
  let jobs: Record<string, InstallJob[]> = {};
  const listeners = new Set<() => void>();
  const running = new Set<string>();
  const empty: InstallJob[] = [];
  function publish(id: string, list: InstallJob[]) {
    jobs = { ...jobs, [id]: list };
    listeners.forEach((listener) => listener());
  }
  function update(id: string, key: string, patch: Partial<InstallJob>) {
    publish(id, jobs[id].map((job) => job.key === key ? { ...job, ...patch } : job));
  }
  async function drain(id: string) {
    if (running.has(id)) return;
    running.add(id);
    try {
      let job: InstallJob | undefined;
      while ((job = jobs[id]?.find((item) => item.status === "queued"))) {
        update(id, job.key, { status: "installing" });
        try {
          await run(id, job.source, job.projectId);
          update(id, job.key, { status: "installed" });
        } catch (error) {
          update(id, job.key, { status: "error", error: errorMessage(error) });
        }
      }
    } finally { running.delete(id); }
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot(id: string) { return jobs[id] ?? empty; },
    enqueue(id: string, project: { source: string; id: string; name: string }) {
      const key = `${project.source}:${project.id}`;
      const existing = jobs[id] ?? [];
      if (existing.some((job) => job.key === key && job.status !== "error")) return;
      publish(id, [...existing.filter((job) => job.key !== key), { key, source: project.source, projectId: project.id, name: project.name, status: "queued" }]);
      void drain(id);
    },
  };
}

export const contentInstallQueue = createInstallQueue(installContent);
