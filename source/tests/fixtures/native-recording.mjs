// Generates an explicitly SYNTHETIC DuckDB using the already locked Node/Wasm binding.
// No Python, private recordings, network dependency or database bytes in Git.
export const syntheticSQL = `
CREATE TABLE metadata(key VARCHAR, value VARCHAR);
INSERT INTO metadata VALUES ('Version','1'),('RecordingTime','2026-01-01T00_00_00Z'),('APEXDataKind','synthetic'),('TrackName','SYNTHETIC TRACK <img src=x onerror="alert(1)">'),('TrackLayout','TEST'),('CarName','TEST VEHICLE'),('CarClass','TEST CLASS'),('SessionType','Test'),('DriverName','PRIVATE TEST SENTINEL'),('SteamID','PRIVATE TEST SENTINEL'),('CarSetup','PRIVATE TEST SENTINEL');
CREATE TABLE channelsList(channelName VARCHAR, frequency INTEGER, unit VARCHAR);
INSERT INTO channelsList VALUES ('GPS Time',100,'s'),('Ground Speed',100,'km/h'),('Brake Pos',50,'%'),('Throttle Pos',50,'%'),('Lap Dist',10,'m');
CREATE TABLE eventsList(eventName VARCHAR, unit VARCHAR);
INSERT INTO eventsList VALUES ('Lap',''),('Lap Time','s'),('In Pits','');
CREATE TABLE "GPS Time" AS SELECT 100.0+i/100.0 AS value FROM range(3000) t(i);
CREATE TABLE "Ground Speed" AS SELECT 72.0::DOUBLE AS value FROM range(3000);
CREATE TABLE "Brake Pos" AS SELECT 25.0::DOUBLE AS value FROM range(1500);
CREATE TABLE "Throttle Pos" AS SELECT 40.0::DOUBLE AS value FROM range(1500);
CREATE TABLE "Lap Dist" AS SELECT ((i%100)*10.0)::DOUBLE AS value FROM range(300) t(i);
CREATE TABLE "Lap"(ts DOUBLE, value DOUBLE); INSERT INTO "Lap" VALUES (100,0),(110,1),(120,2);
CREATE TABLE "Lap Time"(ts DOUBLE, value DOUBLE); INSERT INTO "Lap Time" VALUES (100,0),(110,10),(120,10);
CREATE TABLE "In Pits"(ts DOUBLE, value DOUBLE); INSERT INTO "In Pits" VALUES (100,0);
`;
// Node binding is dev-only. Native import itself is exercised in the browser Worker.
export async function generateNativeFixture({ directory, mutation = "" }) {
  const fs = await import("node:fs/promises"),
    path = await import("node:path");
  const duckdb = await import("@duckdb/duckdb-wasm/blocking");
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const pkg = path.dirname(
    require.resolve("@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm"),
  );
  const temporary = await fs.mkdtemp(path.join(directory, "synthetic-native-"));
  const file = path.join(temporary, "synthetic.duckdb");
  const db = await duckdb.createDuckDB(
    {
      mvp: { mainModule: path.join(pkg, "duckdb-mvp.wasm") },
      eh: { mainModule: path.join(pkg, "duckdb-eh.wasm") },
    },
    new duckdb.VoidLogger(),
    duckdb.NODE_RUNTIME,
  );
  try {
    await db.instantiate();
    db.registerFileURL(file, file, duckdb.DuckDBDataProtocol.NODE_FS, true);
    db.open({
      path: file,
      useDirectIO: true,
      accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
      maximumThreads: 1,
    });
    const conn = db.connect();
    try {
      conn.query(syntheticSQL + mutation);
      conn.query("FORCE CHECKPOINT");
    } finally {
      conn.close();
    }
    db.flushFiles();
    db.open({ path: ":memory:" });
    return await fs.readFile(file);
  } finally {
    db.reset();
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
