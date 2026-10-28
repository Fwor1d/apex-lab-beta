import test from "node:test";
import assert from "node:assert/strict";
import {
  RecordingSource,
  recordingDescriptor,
  publicImportError,
  FILE_LIMITS,
} from "../../app/data/recording-source.js";
import { createImportController } from "../../app/core/import-controller.js";
import { createAppStore } from "../../app/core/app-state.js";
import { DemoSource } from "../../app/data/demo-source.js";
import { AnalyzerWorker } from "../../engine/apps/browser-telemetry/src/client.js";
import { realSessionsHTML, realRouteHTML } from "../../app/sessions.js";
import {
  summary,
  duckFile,
  analyzerHarness,
} from "../fixtures/session-summary.mjs";
const tick = () => new Promise((r) => setImmediate(r));
function setup() {
  const store = createAppStore(new DemoSource()),
    h = analyzerHarness(),
    controller = createImportController(store, {
      createSource: () => new RecordingSource(h),
    });
  return { store, h, controller };
}
test("native import transitions, stable identity, allowlist, all laps and no invented timeline", async () => {
  const { store, h, controller } = setup(),
    file = duckFile(),
    p = controller.open(file);
  assert.equal(store.state.importStatus.phase, "validating");
  await tick();
  const c = h.clients[0];
  assert.equal(c.calls[0].action, "open");
  assert.equal(c.calls[0].args.file, file);
  assert.equal(c.calls[0].args.method, "handle");
  c.progress("Извлечение кругов и проверка качества");
  assert.equal(store.state.importStatus.stage, "laps");
  assert.equal(store.state.importStatus.fraction, null);
  c.resolve(summary());
  assert.equal(await p, true);
  const s = store.snapshot();
  assert.equal(s.importStatus.phase, "ready");
  assert.equal(s.loaded, true);
  assert.equal(s.source.id, "fixture-session");
  assert.equal(s.source.laps.length, 3);
  assert.equal(s.cursorM, null);
  assert.equal(s.playback.timeS, null);
  assert.deepEqual([s.a, s.b], ["1", "2"]);
  assert.equal(JSON.stringify(s).includes("PRIVATE SENTINEL"), false);
  assert.equal(
    s.source.channels.find((c) => c.id === "steeringNormalized")
      .normalizedStatus,
    "unavailable",
  );
  assert.equal(
    s.source.channels.find((c) => c.id === "brake").normalizedStatus,
    "partial",
  );
  assert.equal(store.source.valueAt("1", 100), null);
  assert.equal(store.seekTime(1), false);
  store.state.playing = true;
  assert.equal(store.state.playing, false);
  controller.release();
  assert.equal(c.stopped, 1);
});
test("valid sessions with zero or one eligible lap remain loaded and inspectable", async () => {
  for (const eligible of [[], ["1"]]) {
    const { store, h, controller } = setup();
    const p = controller.open(duckFile());
    await tick();
    h.clients[0].resolve(summary({ eligible }));
    assert.equal(await p, true);
    assert.equal(store.state.loaded, true);
    assert.equal(store.snapshot().pair, null);
    assert.equal(store.inspectLap("0"), true);
    assert.equal(store.state.selectedLapId, "0");
    assert.equal(store.selectPair("0", "1"), false);
    controller.release();
  }
});
test("missing essential channels produce a successful partial import, not demo fallback", async () => {
  const { store, h, controller } = setup();
  const p = controller.open(duckFile());
  await tick();
  h.clients[0].resolve(summary({ missingDistance: true, eligible: [] }));
  await p;
  assert.equal(store.state.importStatus.phase, "partial");
  assert.equal(store.state.loaded, true);
  assert.equal(store.source.samples("1").length, 0);
  controller.release();
});
test("pair guards reject equal, ineligible, unknown and foreign recording references", async () => {
  const { store, h, controller } = setup();
  const p = controller.open(duckFile());
  await tick();
  h.clients[0].resolve(summary());
  await p;
  for (const args of [
    ["1", "1"],
    ["0", "1"],
    ["x", "2"],
    ["1", "2", "other-session"],
  ])
    assert.equal(store.selectPair(...args), false);
  assert.equal(store.selectPair("2", "1", "fixture-session"), true);
  assert.equal(store.snapshot().pair.sessionId, "fixture-session");
  controller.release();
});
test("replacement clears dependent state, preserves preferences and ignores old responses/progress", async () => {
  const { store, h, controller } = setup();
  store.state.rate = 2;
  store.state.focus = true;
  store.state.selectedEvent = "old";
  store.state.trainingAnalysis = { samples: [1] };
  const old = controller.open(duckFile("old.duckdb"));
  await tick();
  const first = h.clients[0];
  const current = controller.open(duckFile("new.duckdb"));
  await tick();
  assert.equal(first.stopped, 1);
  first.progress("Извлечение кругов и проверка качества");
  first.resolve(summary({ id: "obsolete" }));
  assert.equal(await old, false);
  assert.equal(store.state.source.id, null);
  h.clients[1].resolve(summary({ id: "current" }));
  await current;
  assert.equal(store.state.source.id, "current");
  assert.equal(store.state.selectedEvent, null);
  assert.equal(store.state.trainingAnalysis, null);
  assert.equal(store.state.rate, 2);
  assert.equal(store.state.focus, true);
  controller.release();
});
test("duplicate pending input reuses one request; cancel/retry releases each Worker once", async () => {
  const { store, h, controller } = setup();
  const file = duckFile();
  const p = controller.open(file);
  assert.equal(controller.open(file), p);
  await tick();
  assert.equal(h.clients.length, 1);
  controller.cancel();
  assert.equal(await p, false);
  assert.equal(store.state.importStatus.phase, "cancelled");
  assert.equal(store.state.loaded, false);
  h.clients[0].resolve(summary());
  await tick();
  assert.equal(store.state.source.id, null);
  const retry = controller.retry();
  await tick();
  h.clients[1].resolve(summary());
  await retry;
  controller.demo();
  assert.equal(store.state.source.kind, "synthetic");
  assert.equal(store.state.source.mode, "demo");
  assert.equal(controller.canRetry, false);
  assert.deepEqual(
    h.clients.map((c) => c.stopped),
    [1, 1],
  );
});
test("failed replacement cannot retain prior real session and retry recovers", async () => {
  const { store, h, controller } = setup();
  let p = controller.open(duckFile());
  await tick();
  h.clients[0].resolve(summary());
  await p;
  p = controller.open(duckFile("broken.duckdb"));
  await tick();
  h.clients[1].reject(Error("Превышен лимит 60 секунд."));
  assert.equal(await p, false);
  assert.equal(store.state.importStatus.error.code, "TIMEOUT");
  assert.equal(store.state.loaded, false);
  assert.equal(store.state.source.id, null);
  assert.equal(store.snapshot().pair, null);
  p = controller.retry();
  await tick();
  h.clients[2].resolve(summary());
  assert.equal(await p, true);
  controller.release();
});
test("file validation rejects absent, wrong type, size and signature before Worker creation", async () => {
  const h = analyzerHarness();
  for (const [file, code] of [
    [null, "NO_FILE"],
    [duckFile("file.zip"), "EXTENSION"],
    [duckFile("file.json"), "EXTENSION"],
    [new File(["x"], "x.duckdb"), "SIZE"],
    [{ name: "big.duckdb", size: FILE_LIMITS.maxBytes + 1 }, "SIZE"],
    [new File([new Uint8Array(12288)], "invalid.duckdb"), "HEADER"],
    [
      {
        name: "unreadable.duckdb",
        size: 12288,
        slice: () => ({
          arrayBuffer: () => Promise.reject(Error("private path")),
        }),
      },
      "READ",
    ],
  ]) {
    const s = new RecordingSource(h);
    await assert.rejects(s.open(file), { code });
    s.dispose();
  }
  assert.equal(h.clients.length, 0);
});
test("cancellation also interrupts pending file-header read without starting Worker", async () => {
  const { store, h, controller } = setup();
  const p = controller.open({
    name: "slow.duckdb",
    size: 12288,
    slice: () => ({ arrayBuffer: () => new Promise(() => {}) }),
  });
  controller.cancel();
  assert.equal(await p, false);
  assert.equal(store.state.importStatus.phase, "cancelled");
  assert.equal(h.clients.length, 0);
});
test("header deadline is bounded and retry is possible", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = analyzerHarness(),
    s = new RecordingSource(h);
  const p = s.open({
    name: "slow.duckdb",
    size: 12288,
    slice: () => ({ arrayBuffer: () => new Promise(() => {}) }),
  });
  const rejected = assert.rejects(p, { code: "TIMEOUT" });
  t.mock.timers.tick(FILE_LIMITS.headerTimeoutMs);
  await rejected;
  assert.equal(h.clients.length, 0);
  s.dispose();
});
test("public error taxonomy never exposes SQL, file names or stack traces", () => {
  for (const [message, code] of [
    ["Версия или RecordingTime LMU отсутствуют.", "SCHEMA"],
    ["Структура служебных таблиц не совпадает", "SCHEMA"],
    ["GPS Time содержит разрывы rowid", "CLOCK"],
    ["предел 500 000 отсчётов", "LIMIT"],
    ["Worker завершился", "WORKER"],
    ["DuckDB не отвечает", "TIMEOUT"],
    ["corrupt SECRET_DATABASE_NAME", "DATABASE"],
    ["WebAssembly failed SECRET", "WASM"],
  ]) {
    const e = publicImportError(Error(message));
    assert.equal(e.code, code);
    assert.equal(e.message.includes("SECRET"), false);
  }
});
test("native synthetic fixtures remain labeled synthetic and never gain certified pair eligibility", async () => {
  const { store, h, controller } = setup();
  const p = controller.open(duckFile());
  await tick();
  h.clients[0].resolve(summary({ kind: "synthetic" }));
  await p;
  assert.equal(store.state.source.kind, "synthetic");
  assert.equal(store.snapshot().pair, null);
  assert.match(realSessionsHTML(store.snapshot()), /синтетическая база/);
  controller.release();
});
test("metadata escaping and explicit unavailable routes block all demo analytical surfaces", () => {
  const raw = summary();
  raw.metadata.TrackName = '<img src=x onerror="alert(1)">';
  raw.warnings = ["<script>unsafe()</script>"];
  const d = recordingDescriptor(raw);
  const state = {
    source: d,
    loaded: true,
    importStatus: { phase: "ready", message: "Готово" },
    a: "1",
    b: "2",
    pair: { a: "1", b: "2" },
    selectedLapId: "0",
  };
  const html = realSessionsHTML(state);
  assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<script>"));
  for (const route of ["dashboard", "telemetry", "atlas", "lab", "reports"]) {
    const html = realRouteHTML({ ...state, route, mode: "map" });
    assert.ok(
      !/<svg|<canvas|type="range"|id="play"|id="hud|data-action="export"|5000/.test(
        html,
      ),
    );
    assert.ok(html.includes("Пространственные пути, советы и экспорт подключаются отдельно"));
  }
});
test("import lifecycle commands reject invalid transitions and mutable status overrides", () => {
  const { store } = setup();
  assert.throws(
    () => store.setImportStatus({ phase: "ready" }),
    /Invalid import/,
  );
  assert.throws(() => {
    store.state.importStatus = { phase: "ready" };
  }, TypeError);
  assert.throws(() => store.commitImportedSource(), /No imported/);
});
test("existing AnalyzerWorker request registry handles progress, timeout, late result and restart", async (t) => {
  const Original = globalThis.Worker,
    workers = [];
  globalThis.Worker = class {
    constructor() {
      this.messages = [];
      this.terminated = 0;
      workers.push(this);
    }
    postMessage(m) {
      this.messages.push(m);
    }
    terminate() {
      this.terminated++;
    }
  };
  t.after(() => {
    globalThis.Worker = Original;
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const progress = [],
    client = new AnalyzerWorker((p) => progress.push(p));
  const p = client.call("open", { file: "opaque" }),
    caught = assert.rejects(p, /60 секунд/);
  workers[0].onmessage({ data: { id: 1, progress: "stage" } });
  assert.deepEqual(progress, ["stage"]);
  t.mock.timers.tick(60000);
  await caught;
  assert.equal(client.pending.size, 0);
  assert.equal(workers[0].terminated, 1);
  workers[0].onmessage({ data: { id: 1, result: "late" } });
  const second = client.call("open");
  workers[1].onmessage({ data: { id: 2, result: "ready" } });
  assert.equal(await second, "ready");
  assert.equal(client.pending.size, 0);
  client.stop();
  assert.equal(workers[1].terminated, 1);
});
test("existing AnalyzerWorker stop rejects all pending requests and worker errors are recoverable", async (t) => {
  const Original = globalThis.Worker;
  globalThis.Worker = class {
    postMessage() {}
    terminate() {}
  };
  t.after(() => {
    globalThis.Worker = Original;
  });
  const c = new AnalyzerWorker();
  const a = assert.rejects(c.call("open"), /Worker/),
    b = assert.rejects(c.call("profile"), /Worker/);
  c.worker.onerror();
  await Promise.all([a, b]);
  assert.equal(c.pending.size, 0);
  assert.equal(c.worker, null);
});
