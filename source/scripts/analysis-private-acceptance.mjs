// Opt-in local oracle checks. No recording paths, recorded arrays, or private values in source.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export async function runPrivateAcceptance({
  page,
  state,
  check,
  analysisSettled,
  mode,
  responsive,
  assertCursor,
  seekDistance,
  report,
}) {
  assert.ok(
    process.env.APEX_AUDIT_ROOT &&
      process.env.APEX_LMU_DATA_ROOT &&
      process.env.APEX_BROWSER_ORACLE,
    "Private opt-in requires local audit/data/oracle",
  );
  const audit = JSON.parse(
      await fs.readFile(
        path.join(process.env.APEX_AUDIT_ROOT, "evidence/database-audit.json"),
      ),
    ),
    manifest = JSON.parse(
      await fs.readFile(
        path.join(process.env.APEX_BROWSER_ORACLE, "manifest.json"),
      ),
    );
  for (const record of audit.records) {
    await check(
      "Private " +
        record.alias +
        ": native import, quality and full-array Python parity where eligible",
      async () => {
        const file = path.join(process.env.APEX_LMU_DATA_ROOT, record.path),
          hash = async () =>
            createHash("sha256")
              .update(await fs.readFile(file))
              .digest("hex");
        assert.equal(await hash(), record.sha256);
        await page.evaluate(() => (location.hash = "sessions"));
        await page.locator("main [data-action=import]").first().click();
        const started = performance.now(),
          generation = (await state()).generation;
        await page.locator("#recording-file").setInputFiles(file);
        let imported;
        const deadline = Date.now() + 90000;
        while (Date.now() < deadline) {
          imported = await state();
          if (
            imported.generation > generation &&
            ["ready", "partial", "failed"].includes(imported.importStatus.phase)
          )
            break;
          await page.waitForTimeout(40);
        }
        assert.ok(
          ["ready", "partial"].includes(imported.importStatus.phase),
          JSON.stringify(imported.importStatus),
        );
        await analysisSettled();
        const s = await state();
        const importAndAnalysisMs = performance.now() - started;
        assert.ok(["ready", "partial"].includes(s.importStatus.phase));
        let ref = JSON.parse(
          await fs.readFile(
            manifest.find((e) => e.alias === record.alias).oracle,
          ),
        );
        assert.equal(s.source.id, ref.sessionId);
        assert.equal(s.source.laps.length, ref.laps.length);
        for (const lap of s.source.laps)
          assert.deepEqual(
            lap.validation,
            ref.laps.find((l) => l.profile.provenance.lapId === lap.id)
              .validation,
          );
        await page.locator("#close-dialog").click();
        await page.evaluate(() => (location.hash = "telemetry"));
        await page.waitForSelector(".real-analysis");
        let parity = null;
        if (ref.comparison) {
          assert.ok(
            ["ready", "partial"].includes(s.analysisStatus.phase),
            JSON.stringify(s.analysisStatus),
          );
          if (s.a === ref.comparison.lapB && s.b === ref.comparison.lapA) {
            const c = ref.comparison.aligned;
            ref = {
              ...ref,
              comparison: {
                ...ref.comparison,
                lapA: s.a,
                lapB: s.b,
                aligned: {
                  ...c,
                  a: c.b,
                  b: c.a,
                  deltaS: c.deltaS.map((v) => (v === null ? null : -v)),
                },
              },
            };
          }
          assert.equal(s.a, ref.comparison.lapA);
          assert.equal(s.b, ref.comparison.lapB);
          parity = await page.evaluate(async (ref) => {
            const source = (await import("./core/context.js")).appStore.source,
              a = source.analysis;
            let count = 0,
              maxError = 0,
              missing = 0;
            function compare(actual, expected, location) {
              if (typeof expected === "number") {
                if (!Number.isFinite(expected)) throw Error("Invalid oracle");
                if (!Number.isFinite(actual))
                  throw Error("Missing numeric value at " + location);
                const error = Math.abs(actual - expected);
                if (error > 1e-10)
                  throw Error("Numerical mismatch at " + location);
                maxError = Math.max(error, maxError);
                count++;
              } else if (expected === null) {
                if (actual !== null && Number.isFinite(actual))
                  throw Error("Missing-mask mismatch at " + location);
                missing++;
              } else if (Array.isArray(expected)) {
                if (actual.length !== expected.length)
                  throw Error("Shape mismatch at " + location);
                expected.forEach((v, i) =>
                  compare(actual[i], v, location + "." + i),
                );
              } else if (typeof expected === "object") {
                for (const [k, v] of Object.entries(expected))
                  compare(actual[k], v, location + "." + k);
              } else if (actual !== expected)
                throw Error("Value mismatch at " + location);
            }
            compare(a.comparison, ref.comparison.aligned, "comparison");
            for (const id of [ref.comparison.lapA, ref.comparison.lapB])
              compare(
                a.profiles[id].samples,
                ref.laps.find((l) => l.profile.provenance.lapId === id).profile
                  .samples,
                "profile",
              );
            return { count, maxError, missing };
          }, ref);
          const recorded = (id) =>
            ref.laps.find((l) => l.profile.provenance.lapId === id).profile
              .lapMetadata.recordedTimeS;
          assert.ok(
            Math.abs(
              s.analysisStatus.recordedDifferenceS -
                (recorded(s.b) - recorded(s.a)),
            ) <= 1e-10,
          );
          const end = ref.comparison.aligned.deltaS.findLast((v) => v !== null);
          assert.ok(Math.abs(s.analysisStatus.commonEndDeltaS - end) <= 1e-10);
          await mode("overview");
          await assertCursor();
          if (record.alias === "S2") await responsive("private-S2-overview");
          await mode("pitwall");
          if (record.alias === "S2") await responsive("private-S2-pitwall");
          await assertCursor();
          const seek = await page.evaluate(async () => {
            const s = (await import("./core/context.js")).appStore,
              m = s.source.analysis.mappings[s.state.b],
              r = m.intervals.find((r) => r.endM - r.startM > 100);
            return r ? (r.startM + r.endM) / 2 : null;
          });
          assert.notEqual(seek, null);
          await seekDistance(seek);
          await assertCursor();
          await page.locator("#play").click();
          const before = (await state()).playback.timeS;
          await page.waitForTimeout(240);
          await page.locator("#play").click();
          assert.ok((await state()).playback.timeS > before);
          await assertCursor();
          const perf = await page.evaluate(async () => {
            const { appStore } = await import("./core/context.js"),
              { updateRealCursor } = await import("./real-telemetry.js");
            const start = performance.now();
            for (let i = 0; i < 100; i++)
              updateRealCursor(document.querySelector("main"), appStore);
            return {
              hundredPausedReadoutsMs: performance.now() - start,
              heapBytes: performance.memory?.usedJSHeapSize ?? null,
              metrics: appStore.source.analysis.summary.metrics,
              domElements: document.querySelectorAll("main *").length,
            };
          });
          report.performance.push({ alias: record.alias, ...perf });
          const oldDelta = s.analysisStatus.commonEndDeltaS;
          await page.locator("#swap-real-pair").click();
          await analysisSettled();
          assert.ok(
            Math.abs(
              (await state()).analysisStatus.commonEndDeltaS + oldDelta,
            ) <= 1e-10,
          );
          assert.equal(
            await page.evaluate(
              () => window.__workers.filter((w) => w.active).length,
            ),
            1,
          );
        } else {
          assert.equal(s.pair, null);
          assert.equal(s.analysisStatus.phase, "unavailable");
          assert.equal(s.cursorM, null);
          assert.equal(await page.locator(".plot,#play").count(), 0);
        }
        assert.equal(await hash(), record.sha256);
        report.records.push({
          alias: record.alias,
          laps: s.source.laps.length,
          eligible: s.source.laps.filter((l) => l.certified_valid).length,
          pair: !!ref.comparison,
          parity,
          importAndAnalysisMs,
          journeyMs: performance.now() - started,
          unchanged: true,
        });
      },
    );
  }
  report.privateOracle =
    "passed: six native imports, both full-array comparisons and profiles, tolerance 1e-10";
}
