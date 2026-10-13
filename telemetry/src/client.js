export class AnalyzerWorker {
  constructor(
    onProgress = () => {},
    url = new URL("./worker.js", import.meta.url),
  ) {
    this.onProgress = onProgress;
    this.url = url;
    this.serial = 0;
    this.pending = new Map();
    this.worker = null;
  }
  start() {
    if (this.worker) return;
    this.worker = new Worker(this.url, { type: "module" });
    this.worker.onmessage = ({ data }) => {
      const entry = this.pending.get(data.id);
      if (!entry) return;
      if (data.progress) {
        this.onProgress(data.progress);
        return;
      }
      clearTimeout(entry.timer);
      this.pending.delete(data.id);
      data.error ? entry.reject(Error(data.error)) : entry.resolve(data.result);
    };
    this.worker.onerror = () => {
      this.stop("Worker завершился с ошибкой. Повторно выберите файл.");
    };
    this.worker.onmessageerror = () =>
      this.stop(
        "Браузер не смог передать результат Worker. Выберите файл меньшего размера.",
      );
  }
  call(action, args = {}) {
    this.start();
    const id = ++this.serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.stop(
            "Превышен лимит 60 секунд. Выберите меньший файл или повторите открытие.",
          ),
        60000,
      );
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.worker.postMessage({ id, action, ...args });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(
          Error(
            "Браузер не смог передать выбранный файл Worker. " + error.message,
          ),
        );
      }
    });
  }
  stop(reason = "Обработка отменена.") {
    this.worker?.terminate();
    this.worker = null;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(Error(reason));
    }
    this.pending.clear();
  }
}
