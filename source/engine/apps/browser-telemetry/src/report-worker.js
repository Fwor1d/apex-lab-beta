import { parseReport, reportComparison, serializeReport } from "./report.js";
let session = null,
  latest = null;
self.onmessage = async ({ data: { id, action, file, a, b } }) => {
  try {
    let result;
    if (action === "open") {
      if (!(file instanceof File) || file.size > 32 * 1024 * 1024)
        throw Error("Выберите локальный JSON-отчёт не больше 32 МиБ.");
      session = parseReport(await file.text());
      latest = null;
      result = {
        ...session,
        laps: session.laps.map(({ profile, ...lap }) => lap),
      };
    } else if (action === "compare") {
      if (!session) throw Error("Сначала откройте отчёт.");
      result = reportComparison(session, a, b);
      latest = result;
    } else if (action === "export-report") {
      if (!session) throw Error("Сначала откройте отчёт.");
      const selected = [...new Set([a, b])].map(
        (id) => session.laps.find((lap) => lap.lapId === id)?.profile,
      );
      if (selected.some((p) => !p)) throw Error("Круг отсутствует в отчёте.");
      const exportStarted = performance.now();
      const text = serializeReport(selected, {
        metadata: session.metadata,
        coaching:
          latest?.pair[0] === a && latest?.pair[1] === b
            ? latest.coaching
            : undefined,
      });
      result = { text, exportMs: performance.now() - exportStarted };
    } else if (action === "profile") {
      result = session?.laps.find((lap) => lap.lapId === a)?.profile;
      if (!result) throw Error("Круг отсутствует в отчёте.");
    } else if (action === "release") {
      session = null;
      latest = null;
      result = { released: true };
    } else throw Error("Неподдерживаемое действие.");
    postMessage({ id, result });
  } catch (e) {
    postMessage({ id, error: e.message });
  }
};
