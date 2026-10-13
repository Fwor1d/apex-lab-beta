const TIMEOUT_MS = 30000;
export function messageWorker(worker, data, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const close = () => {
      clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
    };
    const timer = setTimeout(() => {
      close();
      reject(
        Error(
          "Подготовка кеша не подтвердилась. Проверьте сеть и свободное место; повторите попытку.",
        ),
      );
    }, timeoutMs);
    channel.port1.onmessage = ({ data: response }) => {
      close();
      response?.ok
        ? resolve(response)
        : reject(
            Error(response?.error ?? "Кеш не подготовлен. Повторите попытку."),
          );
    };
    try {
      worker.postMessage(data, [channel.port2]);
    } catch {
      close();
      reject(
        Error(
          "Офлайн-служба недоступна. Обновите страницу и повторите попытку.",
        ),
      );
    }
  });
}

function installed(registration) {
  if (registration.waiting || (!registration.installing && registration.active))
    return Promise.resolve();
  return new Promise((resolve, reject) => {
    const worker = registration.installing;
    if (!worker) {
      reject(Error("Офлайн-служба не установлена. Повторите попытку."));
      return;
    }
    const timer = setTimeout(() => {
      worker.removeEventListener("statechange", changed);
      reject(
        Error(
          "Установка офлайн-службы не завершилась. Проверьте сеть и повторите попытку.",
        ),
      );
    }, TIMEOUT_MS);
    function changed() {
      if (["installed", "activated", "redundant"].includes(worker.state)) {
        clearTimeout(timer);
        worker.removeEventListener("statechange", changed);
        worker.state === "redundant"
          ? reject(
              Error("Кеш не подготовлен. Проверьте сеть и свободное место."),
            )
          : resolve();
      }
    }
    worker.addEventListener("statechange", changed);
    changed();
  });
}

export function setupOffline() {
  const button = document.getElementById("cache");
  const status = document.getElementById("cache-state");
  if (!button || !status) return;
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const nativeButton =
    document.body.dataset.mode === "reports"
      ? null
      : document.getElementById("cache-native");
  let registration;
  let applying = false;
  const ensureButton = (id, text) => {
    let element = document.getElementById(id);
    if (!element) {
      element = document.createElement("button");
      element.id = id;
      element.textContent = text;
      element.hidden = true;
      status.before(element);
    }
    return element;
  };
  const updateButton = ensureButton(
    "apply-update",
    "Применить обновление и перезагрузить",
  );
  const clearButton = ensureButton(
    "clear-cache",
    "Удалить программный офлайн-кеш",
  );
  const controls = [button, nativeButton, updateButton, clearButton].filter(
    Boolean,
  );
  const announceWaiting = () => {
    if (registration?.waiting) {
      updateButton.hidden = false;
      status.textContent =
        "Обновление подготовлено. Примените его после экспорта открытого анализа: страница перезагрузится.";
    }
    clearButton.hidden = false;
  };
  async function register() {
    if (!("serviceWorker" in navigator))
      throw Error(
        "Офлайн недоступен. Откройте сайт через HTTPS или localhost.",
      );
    registration = await navigator.serviceWorker.register(
      new URL("../sw.js", import.meta.url),
      { updateViaCache: "none" },
    );
    await installed(registration);
    registration.addEventListener("updatefound", () => {
      registration.installing?.addEventListener("statechange", announceWaiting);
    });
    return (
      registration.waiting ?? registration.active ?? registration.installing
    );
  }
  async function run(action) {
    controls.forEach((control) => {
      control.disabled = true;
    });
    try {
      status.textContent =
        action === "cache-native"
          ? "Подготовка локального DuckDB-пакета. Объём около 33–38 МиБ; личные файлы не сохраняются."
          : "Подготовка просмотра отчётов офлайн. DuckDB-пакет не загружается.";
      const worker = await register();
      if (action === "cache-native") {
        // Official selection only after the separate heavy-cache action.
        const duckdb = await import("../vendor/duckdb.js");
        const selected = await duckdb.selectBundle({
          eh: { mainModule: "eh", mainWorker: "eh" },
          mvp: { mainModule: "mvp", mainWorker: "mvp" },
        });
        await messageWorker(worker, { action, bundle: selected.mainModule });
      } else await messageWorker(worker, { action });
      status.textContent =
        action === "cache-native"
          ? "Анализ DuckDB готов офлайн. Личные файлы не сохранены."
          : "Приложение готово офлайн для просмотра отчётов. Личные файлы не сохранены; DuckDB-пакет не загружен.";
      announceWaiting();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      controls.forEach((control) => {
        control.disabled = false;
      });
    }
  }
  button.addEventListener("click", () => run("cache"));
  nativeButton?.addEventListener("click", () => run("cache-native"));
  updateButton.addEventListener("click", async () => {
    if (!registration?.waiting) return;
    controls.forEach((control) => {
      control.disabled = true;
    });
    try {
      applying = true;
      await messageWorker(registration.waiting, { action: "apply-update" });
    } catch (error) {
      applying = false;
      status.textContent = error.message;
      controls.forEach((control) => {
        control.disabled = false;
      });
    }
  });
  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    if (applying) location.reload();
  });
  clearButton.addEventListener("click", async () => {
    controls.forEach((control) => {
      control.disabled = true;
    });
    try {
      await messageWorker(registration?.active ?? registration?.waiting, {
        action: "clear-cache",
      });
      updateButton.hidden = true;
      clearButton.hidden = true;
      status.textContent =
        "Программный кеш этого раздела удалён. Личные файлы в нём не хранились.";
    } catch (error) {
      status.textContent = error.message;
    } finally {
      controls.forEach((control) => {
        control.disabled = false;
      });
    }
  });
  // Discovery does not register a Worker or download DuckDB.
  navigator.serviceWorker
    ?.getRegistration(new URL("../", import.meta.url))
    .then((found) => {
      if (found && found.scope === new URL("../", import.meta.url).href) {
        registration = found;
        announceWaiting();
      }
    })
    .catch(() => {});
}
