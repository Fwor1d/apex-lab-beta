import {
  RecordingSource,
  publicImportError,
} from "../data/recording-source.js";
import { DemoSource } from "../data/demo-source.js";
const busy = (status) => ["validating", "importing"].includes(status.phase);
export function createImportController(
  store,
  { createSource = () => new RecordingSource(), onChange = () => {} } = {},
) {
  let generation = 0,
    file = null,
    pending = null;
  function status(value) {
    store.setImportStatus(value);
    onChange();
  }
  function open(nextFile) {
    if (nextFile && nextFile === file && busy(store.state.importStatus))
      return pending;
    const token = ++generation;
    file = nextFile ?? null;
    const source = createSource();
    store.setSource(source);
    status({
      phase: "validating",
      stage: "validation",
      message: "Проверка выбранного файла",
      fraction: null,
      error: null,
    });
    pending = (async () => {
      try {
        const descriptor = await source.open(file, (progress) => {
          if (token === generation && store.source === source) status(progress);
        });
        if (token !== generation || store.source !== source || !descriptor)
          return false;
        store.commitImportedSource();
        status({
          phase: descriptor.coverage === "partial" ? "partial" : "ready",
          stage: "complete",
          message: "Запись импортирована",
          fraction: null,
          error: null,
        });
        return true;
      } catch (error) {
        if (token !== generation || store.source !== source) return false;
        source.dispose();
        store.refreshSource();
        status({
          phase: "failed",
          stage: "error",
          message: publicImportError(error).message,
          fraction: null,
          error: publicImportError(error),
        });
        return false;
      } finally {
        if (token === generation) pending = null;
      }
    })();
    return pending;
  }
  return {
    open,
    retry: () => open(file),
    get canRetry() {
      return file !== null && !busy(store.state.importStatus);
    },
    cancel() {
      if (!busy(store.state.importStatus)) return;
      generation++;
      pending = null;
      store.source.dispose();
      store.refreshSource();
      status({
        phase: "cancelled",
        stage: "cancelled",
        message:
          "Импорт отменён. Можно выбрать другую запись или повторить попытку.",
        fraction: null,
        error: null,
      });
    },
    demo() {
      generation++;
      file = null;
      pending = null;
      store.setSource(new DemoSource());
      status({
        phase: "idle",
        stage: null,
        message: "",
        fraction: null,
        error: null,
      });
    },
    release() {
      generation++;
      file = null;
      pending = null;
      if (store.source.descriptor.mode === "real") {
        store.source.dispose();
        store.refreshSource();
        status({
          phase: "cancelled",
          stage: "released",
          message: "Запись освобождена из памяти. Выберите файл заново.",
          fraction: null,
          error: null,
        });
      }
    },
  };
}
