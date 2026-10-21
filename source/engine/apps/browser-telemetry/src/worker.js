import { openEngine } from "./engine.js";
import { sha256 } from "../vendor/hash.js";
import { importSession } from "./importer.js";
import { compare, coach, timeRegions } from "./analysis.js";
import { buildCoaching } from "./coaching-engine.js";
import { serializeReport } from "./report.js";
import { validatePortableProfile } from "../../mobile/src/profile-contract.js";
import { readPositions, validateSessionPosition } from "./position-source.js";
import { buildExtended } from "./analytics-extended.js";
let session = null,
  comparison = null,
  pair = null,
  latestCoaching = null,
  positions = null;
const progress = (id, text) => postMessage({ id, progress: text });
const summary = () => ({
  ...session,
  laps: session.laps.map((lap) => ({
    validation: lap.validation,
    source_verified: lap.source_verified,
    certified_valid: lap.certified_valid,
    lapId: lap.profile.provenance.lapId,
    kind: lap.profile.kind,
  })),
  fastest: session.fastest?.profile.provenance.lapId ?? null,
});
self.onmessage = async ({
  data: { id, action, file, method = "handle", a, b },
}) => {
  try {
    if (action === "open") {
      const totalStarted = performance.now();
      if (
        !(file instanceof File) ||
        !file.name.toLowerCase().endsWith(".duckdb") ||
        file.size < 12288 ||
        file.size > 256 * 1024 * 1024
      )
        throw Error(
          "Выберите .duckdb базу от 12 КиБ до 256 МиБ. ZIP нужно распаковать заранее.",
        );
      const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      if (new TextDecoder().decode(header.slice(8, 12)) !== "DUCK")
        throw Error(
          "Файл не содержит заголовка DuckDB. Выберите исходную базу, а не ZIP или JSON.",
        );
      session = null;
      comparison = null;
      pair = null;
      latestCoaching = null;
      positions = null;
      progress(id, "Проверка SHA-256 по частям");
      const hashStart = performance.now(),
        hash = sha256.create();
      for (let offset = 0; offset < file.size; offset += 1024 * 1024)
        hash.update(
          new Uint8Array(
            await file.slice(offset, offset + 1024 * 1024).arrayBuffer(),
          ),
        );
      const digest = hash.hex(),
        hashMs = performance.now() - hashStart;
      let engine;
      try {
        engine = await openEngine(file, {
          method,
          progress: (text) => progress(id, text),
        });
        const imported = await importSession(engine.query, {
          sha256: digest,
          onProgress: (text) => progress(id, text),
        });
        for (const lap of imported.laps) validatePortableProfile(lap.profile);
        const positionStart = performance.now();
        positions = await readPositions(engine.query, imported);
        imported.positionSummary = positions.summary;
        imported.timings.positionExtractionMs =
          performance.now() - positionStart;
        imported.metrics = {
          ...engine.metrics,
          hashMs,
          ...imported.timings,
          positionSamples: positions.samples.length,
          positionNumericPayloadFloorBytes: positions.samples.length * 5 * 8,
          duckdbManagedBytes: await engine.memory(),
          normalizedSamples: imported.laps.reduce(
            (n, lap) => n + lap.profile.samples.length,
            0,
          ),
        };
        const closeStart = performance.now();
        await engine.close();
        engine = null;
        imported.metrics.cleanupMs = performance.now() - closeStart;
        imported.metrics.engineReleased = true;
        imported.metrics.totalImportMs = performance.now() - totalStarted;
        imported.metrics.numericPayloadFloorBytes =
          imported.metrics.normalizedSamples * 6 * 8;
        session = imported;
        postMessage({ id, result: summary() });
      } finally {
        if (engine) await engine.close();
      }
    } else if (action === "native-trajectory") {
      if (!session || !positions)
        throw Error("Сначала откройте исходный DuckDB.");
      const { buildNativePair } = await import("./native-trajectory.js");
      postMessage({ id, result: buildNativePair(positions, session, a, b) });
    } else if (action === "validate-position") {
      if (!session || !positions)
        throw Error("Сначала откройте исходный DuckDB.");
      progress(
        id,
        "Rigid-регистрация без масштаба и проверка отложенных координат",
      );
      const started = performance.now();
      const validation = await validateSessionPosition(positions, session, a);
      postMessage({
        id,
        result: { ...validation, validationMs: performance.now() - started },
      });
    } else if (action === "compare") {
      if (!session) throw Error("Сначала откройте запись.");
      const lapA = session.laps.find(
          (lap) => lap.profile.provenance.lapId === a,
        ),
        lapB = session.laps.find((lap) => lap.profile.provenance.lapId === b);
      if (!lapA || !lapB) throw Error("Круг отсутствует в этой записи.");
      if (a !== b && (!lapA.certified_valid || !lapB.certified_valid))
        throw Error(
          "Сравнение разрешено только кругам по рабочему фильтру без пит-лейна. Просмотрите остальные отдельно.",
        );
      const start = performance.now();
      comparison = compare(lapA, lapB);
      pair = [a, b];
      if (a === b && !lapA.certified_valid) {
        comparison.deltaS.fill(NaN);
        comparison.coverage = 0;
      }
      const comparisonMs = performance.now() - start;
      const graphStart = performance.now();
      const findings = a === b ? [] : coach(lapA, lapB, comparison);
      const regions = a === b ? [] : timeRegions(comparison);
      const graphPreparationMs = performance.now() - graphStart;
      const coachingStart = performance.now();
      const coaching = buildCoaching(lapA, lapB, comparison, {
        laps: session.laps,
        legacyFindings: findings,
      });
      latestCoaching = coaching;
      const coachingMs = performance.now() - coachingStart;
      const extendedStart = performance.now();
      const extended = buildExtended(lapA, lapB, comparison, {
        laps: session.laps,
      });
      postMessage({
        id,
        result: {
          comparison,
          findings,
          regions,
          comparisonMs,
          graphPreparationMs,
          coaching,
          coachingMs,
          extended,
          extendedMs: performance.now() - extendedStart,
          pair,
        },
      });
    } else if (action === "export-report") {
      if (!session) throw Error("Сначала откройте запись.");
      const selected = [...new Set([a, b])].map((id) =>
        session.laps.find((lap) => lap.profile.provenance.lapId === id),
      );
      if (selected.some((lap) => !lap))
        throw Error("Круг отсутствует в этой записи.");
      const exportStarted = performance.now();
      const exported = serializeReport(
        selected.map((lap) => lap.profile),
        {
          metadata: session.metadata,
          coaching:
            pair?.[0] === a && pair?.[1] === b ? latestCoaching : undefined,
        },
      );
      postMessage({
        id,
        result: { text: exported, exportMs: performance.now() - exportStarted },
      });
    } else if (action === "profile") {
      const lap = session?.laps.find(
        (lap) => lap.profile.provenance.lapId === a,
      );
      if (!lap) throw Error("Круг отсутствует.");
      postMessage({ id, result: lap.profile });
    } else if (action === "release") {
      session = null;
      comparison = null;
      pair = null;
      latestCoaching = null;
      positions = null;
      postMessage({ id, result: { released: true } });
    } else throw Error("Неподдерживаемое действие.");
  } catch (error) {
    postMessage({ id, error: error.message });
  }
};
