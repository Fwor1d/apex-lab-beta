import * as duckdb from "../../telemetry/vendor/duckdb.js";
const relative = (name) => new URL(`../../telemetry/vendor/${name}`, import.meta.url).href;
export async function openEngine(
  file,
  { method = "handle", progress = () => {} } = {},
) {
  const metrics = { fileBytes: file.size, method };
  let db, connection, engineWorker;
  const stamp = performance.now();
  const bounded = (promise) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        engineWorker?.terminate();
        reject(
          Error(
            "DuckDB не отвечает или база повреждена. Обработка остановлена; выберите другую базу.",
          ),
        );
      }, 10000);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  try {
    const bundle = await duckdb.selectBundle({
      mvp: {
        mainModule: relative("duckdb-mvp.wasm"),
        mainWorker: relative("duckdb-browser-mvp.worker.js"),
      },
      eh: {
        mainModule: relative("duckdb-eh.wasm"),
        mainWorker: relative("duckdb-browser-eh.worker.js"),
      },
    });
    engineWorker = new Worker(bundle.mainWorker);
    db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), engineWorker);
    progress("Инициализация локального WebAssembly");
    await bounded(db.instantiate(bundle.mainModule));
    await bounded(
      db.open({
        maximumThreads: 1,
        allowUnsignedExtensions: false,
        query: { castBigIntToDouble: true },
      }),
    );
    connection = await bounded(db.connect());
    metrics.initializationMs = performance.now() - stamp;
    const query = async (sql) => {
      const table = await bounded(connection.query(sql));
      return table.toArray().map((row) => {
        const obj = row.toJSON();
        for (const k of Object.keys(obj))
          if (typeof obj[k] === "bigint") obj[k] = Number(obj[k]);
        return obj;
      });
    };
    await query(
      "SET autoload_known_extensions=false; SET autoinstall_known_extensions=false; SET allow_community_extensions=false; SET memory_limit='512MB'; SET max_temp_directory_size='0B';",
    );
    const start = performance.now();
    if (method === "buffer")
      await bounded(
        db.registerFileBuffer(
          "recording.duckdb",
          new Uint8Array(await file.arrayBuffer()),
        ),
      );
    else
      await bounded(
        db.registerFileHandle(
          "recording.duckdb",
          file,
          duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
          true,
        ),
      );
    await query(
      "ATTACH 'recording.duckdb' AS recording (READ_ONLY); USE recording; SET enable_external_access=false;",
    );
    metrics.openMs = performance.now() - start;
    metrics.version = (await query("SELECT version() AS version"))[0].version;
    metrics.bundle = bundle.mainModule.includes("-eh.") ? "eh" : "mvp";
    return {
      query,
      metrics,
      async memory() {
        return (
          await query(
            "SELECT CAST(sum(memory_usage_bytes) AS DOUBLE) AS bytes FROM duckdb_memory()",
          )
        )[0].bytes;
      },
      async close() {
        try {
          await query("USE memory; DETACH recording;");
          await bounded(connection.close());
          await bounded(db.dropFile("recording.duckdb"));
          await bounded(db.terminate());
        } finally {
          engineWorker.terminate();
        }
      },
    };
  } catch (error) {
    engineWorker?.terminate();
    throw error;
  }
}
