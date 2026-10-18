// Catch dependency/CSS loading failures before React can mount.
void import("./main").catch((error: unknown) => {
  console.error("MLA Server startup failed", error);
  window.mlaStartupFailed?.(error);
});
