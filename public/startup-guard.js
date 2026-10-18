// Runs independently of React and its module graph, so boot failures cannot
// leave the user looking at an endless loading animation.
(function () {
  const root = document.getElementById("root");
  const splash = document.getElementById("startup");
  if (!root || !splash) return;
  let closed = false;
  let ready = false;
  let animationLimit;
  let bootLimit;
  let lastError = "";

  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(bootLimit);
    clearTimeout(animationLimit);
    observer.disconnect();
    window.removeEventListener("error", recordError);
    root.removeAttribute("inert");
    splash.remove();
  }

  function recordError(event) {
    if (event.message) lastError = event.message;
  }

  window.mlaStartupFailed = function (error) {
    if (closed) return;
    const panel = document.createElement("section");
    panel.className = "startup-failure";
    panel.setAttribute("role", "alert");
    const title = document.createElement("h1");
    title.textContent = "No se pudo abrir MLA Server";
    const detail = document.createElement("p");
    detail.textContent = error instanceof Error ? error.message : String(error || "La interfaz no terminó de cargar.");
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Volver a cargar";
    retry.onclick = function () { window.location.reload(); };
    panel.append(title, detail, retry);
    root.replaceChildren(panel);
    close();
  };

  function checkReady() {
    if (ready || closed || !root.firstElementChild) return;
    ready = true;
    clearTimeout(bootLimit);
    // Wait only for the remaining animation, with a fallback if its script fails.
    animationLimit = setTimeout(close, 4000);
    Promise.resolve(window.mlaIntroReady).then(close, close);
  }

  const observer = new MutationObserver(checkReady);
  observer.observe(root, { childList: true });
  window.addEventListener("error", recordError);
  bootLimit = setTimeout(function () {
    if (root.firstElementChild) close();
    else window.mlaStartupFailed(lastError || "La interfaz no respondió. Revisa que el servidor de desarrollo siga funcionando y vuelve a cargar.");
  }, 12000);
  checkReady();
})();
