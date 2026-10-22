import { assertDataSource } from './data-source.js';
// One canonical object. The R5.2 writable facade translates legacy field names.
// Cursor is an exact distance seek OR elapsed B time, never two clocks.
export function createAppStore(initialSource) {
  let source = assertDataSource(initialSource), revision = 0, queued = false;
  const listeners = new Set(), sourceListeners = new Set();
  const eligible = id => source.eligibleForPair?.(id) ?? source.available(id);
  const initialLaps = source.descriptor.laps.filter(l => eligible(l.id));
  const data = { route: 'dashboard', loaded: false, a: initialLaps[0]?.id ?? null, b: initialLaps[1]?.id ?? null,
    selectedLapId: null, importStatus: { phase: 'idle', stage: null, message: '', fraction: null, error: null },
    mode: 'overview', range: [0, source.descriptor.lengthM ?? 0], channel: 'speed', signals: ['speed','brake','throttle','steering','delta'],
    series: { a: true, b: true }, playback: { anchor: 'b', cursor: { basis: 'distance', value: null }, playing: false, rate: 1 },
    zoom: 1, panX: 0, panY: 0, sector: 'all', segmentId: null, focus: false, drawer: false, atlas: 'sebring', layout: 'full',
    lab: { entry: 195, target: 80, deceleration: 8, reaction: .2, brakeStart: 30, line: 0 }, advanced: 'Strategy', filter: 'all', generation: 0 };
  data.playback.cursor.value = source.available(data.b) ? Math.min(2050, source.descriptor.lengthM ?? 0) : null;
  const notify = () => { revision++; if (!queued) { queued = true; queueMicrotask(() => { queued = false; for (const fn of [...listeners]) fn(snapshot()); }); } };
  const distance = () => data.playback.cursor.value === null ? null : data.playback.cursor.basis === 'distance' ? data.playback.cursor.value : source.distanceAtTime(data.b, data.playback.cursor.value);
  const time = () => data.playback.cursor.value === null ? null : data.playback.cursor.basis === 'time' ? data.playback.cursor.value : source.timeAt(data.b, data.playback.cursor.value);
  const snapshot = () => structuredClone({ ...data, playback: { ...data.playback, timeS: time() }, cursorM: distance(), source: source.descriptor,
    pair: data.a !== null && data.b !== null && data.a !== data.b && eligible(data.a) && eligible(data.b) ? { sessionId: source.descriptor.id, a: data.a, b: data.b } : null, revision });
  const seekDistance = d => {
    if (!Number.isFinite(d) || source.descriptor.lengthM === null) return false;
    const bounded = Math.max(0, Math.min(source.descriptor.lengthM, d));
    if (source.timeAt(data.b, bounded) === null) return false;
    data.playback.cursor = { basis: 'distance', value: bounded }; notify(); return true;
  };
  const seekTime = t => {
    const duration = source.duration(data.b);
    if (!Number.isFinite(t) || duration === null) return false;
    const bounded = Math.max(0, Math.min(duration, t));
    if (source.distanceAtTime(data.b, bounded) === null) return false;
    data.playback.cursor = { basis: 'time', value: bounded }; notify(); return true;
  };
  function clearAnalysis() { data.selectedEvent = null; data.trainingContext = null; data.trainingAnalysis = null; }
  const pair = (a, b, sessionId = source.descriptor.id) => {
    if (sessionId !== source.descriptor.id || a === b || ![a,b].every(eligible)) return false;
    const d = distance(); data.a = a; data.b = b; data.generation++; data.playback.playing = false;
    data.playback.cursor = { basis: 'distance', value: source.available(b) ? d ?? 0 : null };
    clearAnalysis(); notify(); return true;
  };
  function initializeSource(loaded = false) {
    data.generation++; data.loaded = loaded; data.playback.playing = false;
    data.playback.cursor = { basis: 'time', value: null }; data.a = data.b = null;
    data.selectedLapId = loaded ? source.descriptor.laps[0]?.id ?? null : null;
    data.range = source.descriptor.lengthM === null ? [null,null] : [0,source.descriptor.lengthM];
    data.camera = null; data.eventCache = null; data.segmentId = null; data.sector = 'all'; clearAnalysis();
    const laps = source.descriptor.laps.filter(l => eligible(l.id));
    if (laps.length >= 2) { data.a = laps[0].id; data.b = laps[1].id; }
    data.playback.cursor = { basis: 'time', value: source.timeAt(data.b, 0) };
    for (const fn of sourceListeners) fn(source.descriptor);
    notify();
  }
  const cache = new WeakMap(), rawByProxy = new WeakMap();
  function view(target, root = false) {
    if (Object.isFrozen(target)) return target;
    if (cache.has(target)) return cache.get(target);
    const proxy = new Proxy(target, {
      get(o,k) {
        if (root && k === 'cursorM') return distance();
        if (root && ['playing','rate'].includes(k)) return o.playback[k];
        if (root && k === 'source') return source.descriptor;
        if (root && k === 'importStatus') return Object.freeze({ ...o.importStatus });
        if (root && k === 'playback') return Object.freeze({ ...data.playback, cursor: Object.freeze({ ...data.playback.cursor }), timeS: time() });
        const v = Reflect.get(o,k); return v && typeof v === 'object' ? view(v) : v;
      },
      set(o,k,v) {
        if (root && k === 'cursorM') { seekDistance(v); return true; }
        if (root && k === 'playing') { o.playback.playing = !!v && o.loaded && source.available(o.b) && time() !== null; notify(); return true; }
        if (root && k === 'rate') { if ([.5,1,2,4].includes(v)) { o.playback.rate = v; notify(); } return true; }
        if (root && ['a','b'].includes(k)) { pair(k === 'a' ? v : o.a, k === 'b' ? v : o.b); return true; }
        if (root && ['playback','source','generation','importStatus','selectedLapId'].includes(k)) throw new TypeError('Use store commands for ' + k);
        v = rawByProxy.get(v) ?? v; if (Object.is(o[k],v)) return true; o[k] = v; notify(); return true;
      },
      deleteProperty(o,k) {
        if (root && ['a','b','playback','source','generation','cursorM','playing','rate','importStatus','selectedLapId'].includes(k)) throw new TypeError('Cannot delete canonical state: ' + k);
        if (k in o) { delete o[k]; notify(); } return true;
      }
    });
    cache.set(target,proxy); rawByProxy.set(proxy,target); return proxy;
  }
  const state = view(data,true);
  return { state, snapshot, get source() { return source; }, seekDistance, seekTime, selectPair: pair,
    inspectLap(id) { if (!source.descriptor.laps.some(l => l.id === id)) return false; data.selectedLapId = id; notify(); return true; },
    setImportStatus(status) {
      const transitions = { idle: ['idle','validating','cancelled'], validating: ['validating','importing','failed','cancelled','idle'], importing: ['validating','importing','ready','partial','failed','cancelled','idle'], ready: ['validating','cancelled','idle'], partial: ['validating','cancelled','idle'], failed: ['validating','cancelled','idle'], cancelled: ['validating','cancelled','idle'] };
      if (!transitions[data.importStatus.phase].includes(status.phase)) throw new TypeError('Invalid import transition');
      data.importStatus = Object.freeze({ ...status, error: status.error ? Object.freeze({ ...status.error }) : null }); notify();
    },
    advance(dt) {
      if (!data.loaded || !data.playback.playing || !Number.isFinite(dt) || dt < 0) return false;
      const end = source.duration(data.b), current = time();
      if (end === null || current === null) { state.playing = false; return false; }
      const next = Math.min(end,current + Math.min(.1,dt) * data.playback.rate);
      if (!seekTime(next)) { state.playing = false; return false; }
      if (next >= end) data.playback.playing = false; return true;
    },
    setSource(next) { next = assertDataSource(next); source.dispose(); source = next; initializeSource(); },
    refreshSource() { initializeSource(); },
    commitImportedSource() {
      if (source.descriptor.mode !== 'real' || !source.descriptor.id || !['validating','importing'].includes(data.importStatus.phase)) throw new TypeError('No imported session');
      initializeSource(true);
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    subscribeSource(fn) { sourceListeners.add(fn); return () => sourceListeners.delete(fn); }
  };
}
