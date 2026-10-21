/** Local presentation contract. No stage weights, elapsed-time estimates or importer. */
export const OPERATION_STAGES = Object.freeze([
  { id: 'bytes-read', label: 'Чтение байтов' },
  { id: 'parse', label: 'Разбор файла' },
  { id: 'validation', label: 'Проверка данных' },
  { id: 'analysis', label: 'Анализ' },
  { id: 'view-ready', label: 'Подготовка вида' },
  { id: 'complete', label: 'Завершение' },
  { id: 'error', label: 'Ошибка' },
  { id: 'cancel', label: 'Отмена' },
]);
const STAGES = new Set(OPERATION_STAGES.map(({ id }) => id));
const STATES = new Set(['idle', 'running', 'complete', 'error', 'cancelled']);

function ratio(counter) {
  if (!counter || !Number.isFinite(counter.completed) || !Number.isFinite(counter.total)
    || counter.total <= 0 || counter.completed < 0 || counter.completed > counter.total) return null;
  return counter.completed * 100 / counter.total;
}

/** An overall denominator must describe ALL work, never only bytes or stage count. */
export function progressSnapshot(input = {}) {
  const status = STATES.has(input.status) ? input.status : 'idle';
  const stage = STAGES.has(input.stage) ? input.stage : null;
  const source = typeof input.source === 'string' && input.source.trim() ? input.source.trim() : null;
  const kind = input.kind === 'manual-demo' || input.kind === 'measured' ? input.kind : null;
  const overall = source && kind && input.overall?.basis === 'all-operation-work' ? ratio(input.overall) : null;
  const bytesPercent = ratio(input.bytes);
  const finished = status === 'complete' && stage === 'complete' && Boolean(source && kind);
  const stopped = status === 'error' || status === 'cancelled';
  // A complete local counter is not itself proof that the operation finished.
  const pendingCompletion = overall === 100 && !finished && !stopped;
  return Object.freeze({
    status, stage, source, kind,
    reportedPercent: overall,
    percent: stopped ? null : finished ? 100 : pendingCompletion ? null : overall,
    bytesPercent,
    pendingCompletion,
    complete: finished,
    mode: !stopped && (finished || (overall !== null && !pendingCompletion)) ? 'determinate' : 'indeterminate',
  });
}

/** 100 on this explicit manual control is itself the demo completion event. */
export function manualDemoProgress(value, status = 'running', stage = 'bytes-read') {
  if (!Number.isInteger(value) || value < 0 || value > 100) throw new RangeError('Manual percent must be an integer from 0 to 100');
  const complete = value === 100 && status !== 'error' && status !== 'cancelled';
  return progressSnapshot({
    status: complete ? 'complete' : status,
    stage: complete ? 'complete' : stage,
    source: 'Ручной ввод в демонстрации', kind: 'manual-demo',
    overall: { basis: 'all-operation-work', completed: value, total: 100 },
  });
}
