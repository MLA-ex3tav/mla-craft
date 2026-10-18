// The HTML splash is visible before React loads, and only runs once per launch.
let finishing = false;

declare global {
  interface Window {
    mlaIntroReady?: Promise<void>;
    mlaStartupFailed?: (error: unknown) => void;
  }
}
// Safety cap: a slow asset load must never block entry into the app for longer than this.
const INTRO_MAX_MS = 4000;
const FADE_MS = 120;

function wait(ms: number) {
  return new Promise<void>((resolve) => { window.setTimeout(resolve, ms); });
}

export async function finishStartup() {
  const splash = document.getElementById("startup");
  if (!splash || finishing) return;
  finishing = true;
  // Warm the landscape so the app does not paint an empty background, but never wait on it:
  // it is a 1.2 MB JPEG and blocking on its decode used to add ~500 ms to every launch.
  const landscape = new Image();
  landscape.src = "/backgrounds/complementary-forest.jpg";
  void landscape.decode().catch(() => {});
  // Asset failures must never prevent entry into the app.
  let safetyTimer: number | undefined;
  try {
    await Promise.race([
      window.mlaIntroReady ?? Promise.resolve(),
      new Promise<void>((resolve) => { safetyTimer = window.setTimeout(resolve, INTRO_MAX_MS); }),
    ]);
  } finally {
    window.clearTimeout(safetyTimer);
    document.getElementById("root")?.removeAttribute("inert");
    // Let the held frame fade out instead of cutting straight to the app.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      splash.remove();
    } else {
      splash.classList.add("is-leaving");
      await wait(FADE_MS);
      splash.remove();
    }
  }
}
