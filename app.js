const button = document.getElementById("home-cache"),
  status = document.getElementById("home-status"),
  update = document.getElementById("home-update");
let registration,
  applyingUpdate = false;
button.addEventListener("click", async () => {
  button.disabled = true;
  try {
    if (!("serviceWorker" in navigator))
      throw Error("Нужен HTTPS или localhost.");
    registration = await navigator.serviceWorker.register("./sw.js");
    await new Promise((resolve, reject) => {
      const hadActive = Boolean(registration.active);
      const worker = registration.installing;
      if (!worker) {
        registration.active || registration.waiting
          ? resolve()
          : reject(Error("Нет службы"));
        return;
      }
      const timer = setTimeout(() => finish(false), 30000);
      function finish(ok) {
        clearTimeout(timer);
        worker.removeEventListener("statechange", changed);
        ok ? resolve() : reject(Error("Установка не завершена"));
      }
      function changed() {
        if (
          worker.state === "activated" ||
          (hadActive && worker.state === "installed")
        )
          finish(true);
        else if (worker.state === "redundant") finish(false);
      }
      worker.addEventListener("statechange", changed);
      changed();
    });
    const pending = registration.waiting;
    update.hidden = !pending;
    status.textContent = pending
      ? "Доступна новая копия. Обновите её после завершения работы."
      : "Главная готова офлайн. Личные файлы не сохранены.";
  } catch {
    status.textContent =
      "Не удалось подготовить главную. Подключитесь к сети и повторите.";
  } finally {
    button.disabled = false;
  }
});
update.addEventListener("click", () => {
  applyingUpdate = true;
  registration?.waiting?.postMessage({ type: "ACTIVATE_UPDATE" });
});
navigator.serviceWorker?.addEventListener("controllerchange", () => {
  if (applyingUpdate) location.reload();
});

performance.mark("apex-home-ready");
