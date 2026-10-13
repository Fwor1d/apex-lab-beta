export async function setupOffline(status, banner, button, help) {
  const show = (text, ready = false) => {
    status.textContent = text;
    status.dataset.ready = String(ready);
    if (help) help.hidden = ready || text === "Подготовка офлайн…";
  };
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    show("Офлайн недоступен");
    return;
  }
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) location.reload();
  });
  try {
    const registration = await navigator.serviceWorker.register("./sw.js", {
      scope: "./",
    });
    const update = () => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        banner.hidden = false;
        button.onclick = () => {
          reloading = true;
          registration.waiting?.postMessage({ type: "ACTIVATE_UPDATE" });
        };
      }
    };
    let rejectInstall;
    const watchInstall = () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed") update();
        if (worker.state === "redundant" && !registration.active) {
          show("Ошибка офлайн-кеша");
          rejectInstall?.(new Error("Ресурсы офлайн-кеша недоступны"));
        }
      });
    };
    update();
    watchInstall();
    registration.addEventListener("updatefound", watchInstall);
    let installTimer;
    const failed = new Promise((_, reject) => {
      rejectInstall = reject;
      installTimer = setTimeout(
        () => reject(new Error("Превышено время установки офлайн-кеша")),
        15000,
      );
    });
    let readyRegistration;
    try {
      // The browser's ready promise follows a replacement worker through activation.
      readyRegistration = await Promise.race([
        navigator.serviceWorker.ready,
        failed,
      ]);
    } finally {
      clearTimeout(installTimer);
    }
    const active = readyRegistration.active;
    // An active worker verifies all essential cache entries rather than advertising readiness blindly.
    const channel = new MessageChannel();
    let timeout;
    const ready = await new Promise((resolve) => {
      timeout = setTimeout(() => resolve(false), 5000);
      channel.port1.onmessage = (event) => resolve(event.data?.ready === true);
      active?.postMessage({ type: "CACHE_STATUS" }, [channel.port2]);
    });
    clearTimeout(timeout);
    channel.port1.close();
    show(
      ready
        ? navigator.onLine
          ? "Офлайн готов"
          : "Работа офлайн"
        : "Кеш не готов",
      ready,
    );
    const network = () =>
      show(
        ready
          ? navigator.onLine
            ? "Офлайн готов"
            : "Работа офлайн"
          : "Кеш не готов",
        ready,
      );
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
  } catch (error) {
    show("Ошибка офлайн-кеша");
    console.warn("APEX: не удалось подготовить офлайн-режим", error);
  }
}
