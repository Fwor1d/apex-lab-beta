import { OPERATION_STAGES, manualDemoProgress, progressSnapshot } from './progress-contract.js';

// Preserve historical numeric stage indices; parsing is an added fifth example.
const STAGES = ['bytes-read', 'validation', 'analysis', 'view-ready', 'parse'].map((id) => OPERATION_STAGES.find((stage) => stage.id === id));
const LEGACY_STAGE_LABELS = ['Чтение файла', 'Проверка данных', 'Подготовка анализа', 'Построение интерфейса'];
const STATES = new Set(['idle', 'running', 'complete', 'error', 'cancelled']);
const controllers = new WeakMap();
let nextInstrumentId = 0;
const point = (radius, degrees) => {
  const angle = degrees * Math.PI / 180;
  return [156 + Math.cos(angle) * radius, 156 + Math.sin(angle) * radius];
};
function scaleMarkup() {
  const ticks = Array.from({ length: 51 }, (_, index) => {
    const [x1, y1] = point(index % 5 === 0 ? 134 : 140, 110 + index * 6.4);
    const [x2, y2] = point(145, 110 + index * 6.4);
    return `<line data-percent="${index * 2}" class="instrument-tick${index % 5 === 0 ? ' instrument-tick-major' : ''}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join('');
  const numbers = Array.from({ length: 11 }, (_, index) => {
    const [x, y] = point(116, 110 + index * 32);
    return `<text class="instrument-number" x="${x}" y="${y}">${index * 10}</text>`;
  }).join('');
  return `<svg class="instrument-scale" viewBox="0 0 312 312" aria-hidden="true" focusable="false"><circle class="instrument-rim" cx="156" cy="156" r="153"/><circle class="instrument-inner-rim" cx="156" cy="156" r="149"/>${ticks}${numbers}<line class="instrument-pointer" visibility="hidden"/></svg>`;
}

/** Manual presentation only: no file, DuckDB, analysis or timed completion. */
export function mountInstrument(host, { loadDial, motion = () => 'off', onComplete } = {}) {
  if (!host || typeof host.replaceChildren !== 'function') throw new TypeError('Instrument host is required');
  if (typeof loadDial !== 'function') throw new TypeError('loadDial must return the original mountDial API');
  controllers.get(host)?.destroy();
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  let destroyed = false;
  let generation = 0;
  let apiPromise = null;
  let dial = null;
  let dialProps = null;
  let pageHidden = false;
  let motionOverride = null;
  let state = { status: 'idle', stage: 0, paused: false, message: '', mode: 'indeterminate', percent: 0 };
  let lastAnnouncement = '';
  let previousPercent = null;
  const listeners = [];
  const noteId = `instrument-progress-note-${++nextInstrumentId}`;
  const root = doc.createElement('section');
  root.className = 'instrument';
  root.setAttribute('aria-label', 'Ручной пример индикатора');
  root.innerHTML = `
    <div class="instrument-frame" role="progressbar" aria-label="Ручная демонстрация готовности" aria-valuemin="0" aria-valuemax="100">
      ${scaleMarkup()}
      <div class="instrument-dial-host" aria-hidden="true"><span class="instrument-placeholder">—</span></div>
      <span class="instrument-mode" aria-hidden="true"></span>
      <div class="instrument-terminal" hidden aria-hidden="true"></div>
    </div>
    <p class="instrument-scale-note">Шкала 0–100% · значение только из ручного ввода</p>
    <div class="instrument-status" role="status" aria-live="polite" aria-atomic="true"></div>
    <p class="instrument-description">Демонстрация интерфейса. Файл не читается, DuckDB и анализ не запускаются.</p>
    <p class="instrument-error" role="alert" hidden></p>
    <label class="instrument-field"><span>Режим демонстрации</span>
      <select class="instrument-demo-mode"><option value="indeterminate">Общий объём неизвестен</option><option value="determinate">Известная доля · ручной ввод</option></select>
    </label>
    <label class="instrument-field instrument-range-field"><span>Ручная готовность: <output class="instrument-input-value">0%</output></span>
      <input class="instrument-progress" type="range" min="0" max="100" step="1" value="0" aria-label="Ручная готовность демонстрации" aria-describedby="${noteId}">
    </label>
    <p class="instrument-input-note" id="${noteId}">Ввод 100% явно завершает только этот ручной пример. Время и номер этапа не меняют процент.</p>
    <label class="instrument-stage-label"><span>Пример этапа · выбирается вручную</span>
      <select class="instrument-stage" aria-label="Выбрать ручной пример этапа">${STAGES.map((stage, index) => `<option value="${index}">${stage.label}</option>`).join('')}</select>
    </label>
    <p class="instrument-stage-readout"></p>
    <div class="instrument-controls" role="group" aria-label="Ручное управление примером">
      <button class="instrument-button instrument-start" type="button">Запустить пример</button>
      <button class="instrument-button instrument-pause" type="button">Пауза</button>
      <button class="instrument-button instrument-reset" type="button">Сбросить</button>
      <button class="instrument-button instrument-complete" type="button">Завершить пример · 100%</button>
      <button class="instrument-button instrument-fail" type="button">Показать ошибку</button>
      <button class="instrument-button instrument-cancel" type="button">Отменить пример</button>
    </div>
    <button class="instrument-button instrument-next" type="button" hidden>Перейти к демо-разбору</button>
  `;
  host.replaceChildren(root);
  const find = (name) => root.querySelector(`.instrument-${name}`);
  const frame = find('frame');
  const dialHost = find('dial-host');
  const terminal = find('terminal');
  const status = find('status');
  const error = find('error');
  const stageSelect = find('stage');
  const range = find('progress');
  const modeSelect = find('demo-mode');
  const next = find('next');
  const snapshot = () => state.status === 'complete' || state.mode === 'determinate'
    ? manualDemoProgress(state.status === 'complete' ? 100 : state.percent, state.status, STAGES[state.stage].id)
    : progressSnapshot({ status: state.status, stage: STAGES[state.stage].id, source: 'Ручной пример без общего знаменателя', kind: 'manual-demo' });

  function listen(target, event, handler) {
    target.addEventListener(event, handler);
    listeners.push(() => target.removeEventListener(event, handler));
  }
  function effectiveMotion() {
    let preference = 'off';
    try { preference = motionOverride ?? (typeof motion === 'function' ? motion() : motion); } catch { /* Static fallback. */ }
    // Determinate values are exact: no spring overshoot may imply unreported work.
    return snapshot().mode === 'indeterminate' && state.status === 'running' && !doc.hidden && !pageHidden && !reducedMotion?.matches && preference === 'full' ? 'full' : 'off';
  }
  function releaseDial() {
    generation += 1;
    const mounted = dial;
    dial = null;
    dialProps = null;
    mounted?.destroy();
    dialHost.replaceChildren();
  }
  function placeholder() {
    const existing = dialHost.querySelector('.instrument-placeholder');
    if (existing) { existing.textContent = snapshot().percent === null ? '—' : `${snapshot().percent}%`; return; }
    if (dialHost.firstChild) return;
    const dash = doc.createElement('span');
    dash.className = 'instrument-placeholder';
    dash.textContent = snapshot().percent === null ? '—' : `${snapshot().percent}%`;
    dialHost.append(dash);
  }
  async function syncDial() {
    const terminalState = ['complete', 'error', 'cancelled'].includes(state.status);
    if (destroyed || terminalState || doc.hidden || pageHidden) {
      releaseDial();
      if (!terminalState && !destroyed) placeholder();
      return;
    }
    const props = { progress: snapshot().percent, motion: effectiveMotion() };
    // Fresh finite mounts prevent even one stale rendered value on a downward edit.
    // The original component, geometry and spring source remain untouched.
    if (dial && props.progress !== dialProps.progress && (props.progress !== null || dialProps.progress !== null)) releaseDial();
    if (dial) {
      if (dialProps.progress !== props.progress || dialProps.motion !== props.motion) {
        dial.update(props);
        dialProps = props;
      }
      return;
    }
    const token = ++generation;
    placeholder();
    try {
      apiPromise ??= Promise.resolve().then(loadDial);
      const api = await apiPromise;
      if (destroyed || token !== generation || doc.hidden || pageHidden || !root.isConnected || !['idle', 'running'].includes(state.status)) return;
      if (typeof api?.mountDial !== 'function') throw new TypeError('Original mountDial API is unavailable');
      dialHost.replaceChildren();
      const requestedProps = { progress: snapshot().percent, motion: effectiveMotion() };
      const mounted = api.mountDial(dialHost, requestedProps);
      if (destroyed || token !== generation) { mounted?.destroy(); return; }
      dial = mounted;
      dialProps = requestedProps;
    } catch {
      if (destroyed || token !== generation) return;
      apiPromise = null;
      setState({ status: 'error', message: 'Индикатор не загрузился. Нажмите «Сбросить», чтобы повторить. Файл не обрабатывался.' });
    }
  }
  function render() {
    if (destroyed) return;
    const progress = snapshot();
    root.dataset.state = state.status;
    root.dataset.demoMode = state.mode;
    root.dataset.motion = effectiveMotion();
    const isTerminal = ['complete', 'error', 'cancelled'].includes(state.status);
    terminal.hidden = !isTerminal;
    find('mode').hidden = state.status === 'error' || state.status === 'cancelled';
    find('mode').textContent = progress.percent !== null ? 'РУЧНОЙ ВВОД' : state.paused ? 'ПАУЗА' : 'ОЖИДАНИЕ';
    terminal.textContent = state.status === 'complete' ? '100%' : state.status === 'error' ? 'Ошибка' : 'Отмена';
    dialHost.hidden = isTerminal;
    if (progress.percent === null) frame.removeAttribute('aria-valuenow');
    else frame.setAttribute('aria-valuenow', String(progress.percent));
    frame.setAttribute('aria-valuetext', progress.percent === null ? 'Общая доля неизвестна; ручная демонстрация' : `${progress.percent} процентов; ручная демонстрация`);
    const pointer = find('pointer');
    pointer.setAttribute('visibility', progress.percent === null ? 'hidden' : 'visible');
    let requestedMotion = 'off';
    try { requestedMotion = motionOverride ?? (typeof motion === 'function' ? motion() : motion); } catch {}
    const animateIncrease = progress.percent !== null && previousPercent !== null && progress.percent > previousPercent && requestedMotion === 'full' && !reducedMotion?.matches && !doc.hidden && !pageHidden;
    root.dataset.progressMotion = String(animateIncrease);
    pointer.style.transition = animateIncrease ? 'transform 180ms cubic-bezier(.16,1,.3,1)' : 'none';
    if (progress.percent !== null) {
      const [x1,y1]=point(130,-90),[x2,y2]=point(148,-90);
      for(const [name,value] of Object.entries({x1,y1,x2,y2}))pointer.setAttribute(name,String(value));
      pointer.style.transformOrigin='156px 156px';
      pointer.style.transform=`rotate(${200+progress.percent*3.2}deg)`;
    }
    previousPercent=progress.percent;
    root.querySelectorAll('[data-percent]').forEach((tick) => tick.classList.toggle('instrument-tick-active', progress.percent !== null && progress.percent > 0 && Number(tick.dataset.percent) <= progress.percent));
    const labels = {
      idle: state.paused ? 'Ручной пример на паузе' : 'Ручной пример готов к запуску',
      running: progress.percent === null ? 'Пример запущен · общая доля неизвестна' : `Ручной ввод: ${progress.percent}% · это не измерение обработки файла`,
      complete: 'Демонстрация завершена вручную · 100%. Файл не обрабатывался.',
      error: 'Пример остановлен с ошибкой',
      cancelled: 'Пример отменён вручную · завершение не подтверждено',
    };
    const announcement = labels[state.status];
    if (announcement !== lastAnnouncement) { status.textContent = announcement; lastAnnouncement = announcement; }
    error.hidden = state.status !== 'error';
    error.textContent = state.status === 'error' ? state.message || 'Ручной пример ошибки. Нажмите «Сбросить», чтобы начать заново.' : '';
    stageSelect.value = String(state.stage);
    find('stage-readout').textContent = `Выбран пример: ${STAGES[state.stage].label}. Это не выполняемый этап и не доля всей работы.`;
    modeSelect.value = state.mode;
    find('range-field').hidden=state.mode!=='determinate';
    find('input-note').hidden=state.mode!=='determinate';
    find('scale-note').textContent=state.mode==='determinate'?'Шкала 0–100% · значение только из ручного ввода':'Процент неизвестен · анимация ожидания';
    range.disabled = state.mode !== 'determinate';
    range.value = String(state.percent);
    find('input-value').textContent = `${state.percent}%`;
    find('start').disabled = state.status === 'running';
    find('start').textContent = state.paused ? 'Продолжить пример' : 'Запустить пример';
    find('pause').disabled = state.status !== 'running';
    next.hidden = state.status !== 'complete' || typeof onComplete !== 'function';
    void syncDial();
  }
  function setState(input) {
    if (destroyed) return;
    const value = typeof input === 'string' ? { status: input } : input;
    if (!value || typeof value !== 'object') return;
    let requestedStatus = value.status ?? value.state ?? state.status;
    if (!STATES.has(requestedStatus)) return;
    let stage = value.stage ?? state.stage;
    if (typeof stage === 'string') {
      const legacyIndex = LEGACY_STAGE_LABELS.indexOf(stage);
      stage = legacyIndex >= 0 ? legacyIndex : STAGES.findIndex((item) => item.id === stage || item.label === stage);
    }
    stage = Number.isInteger(stage) && stage >= 0 && stage < STAGES.length ? stage : state.stage;
    const mode = ['indeterminate', 'determinate'].includes(value.mode) ? value.mode : state.mode;
    let percent = Number.isInteger(value.percent) && value.percent >= 0 && value.percent <= 100 ? value.percent : state.percent;
    if (requestedStatus === 'complete') percent = 100;
    if (value.percent === 100 && mode === 'determinate' && !['error', 'cancelled'].includes(requestedStatus)) requestedStatus = 'complete';
    // Restarting a completed demo explicitly returns to zero, never to a hidden 100.
    if (['idle', 'running'].includes(requestedStatus) && percent === 100) percent = 0;
    state = { status: requestedStatus, stage, mode, percent,
      paused: requestedStatus === 'idle' && value.paused === true,
      message: requestedStatus === 'error' && typeof value.message === 'string' ? value.message : '' };
    render();
  }
  function setMotion(value) {
    if (destroyed) return;
    motionOverride = value === 'full' || value === 'off' ? value : null;
    render();
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    releaseDial();
    listeners.splice(0).forEach((remove) => remove());
    root.remove();
    if (controllers.get(host) === controller) controllers.delete(host);
  }
  listen(find('start'), 'click', () => setState({ status: 'running' }));
  listen(find('pause'), 'click', () => setState({ status: 'idle', paused: true }));
  listen(find('reset'), 'click', () => setState({ status: 'idle', stage: 0, percent: 0 }));
  listen(find('complete'), 'click', () => setState('complete'));
  listen(find('fail'), 'click', () => setState('error'));
  listen(find('cancel'), 'click', () => setState('cancelled'));
  listen(modeSelect, 'change', () => setState({ mode: modeSelect.value }));
  listen(range, 'input', () => setState({ status: 'running', percent: Number(range.value) }));
  listen(stageSelect, 'change', () => setState({ stage: Number(stageSelect.value), paused: state.paused, message: state.message }));
  listen(next, 'click', () => { if (!destroyed && state.status === 'complete') onComplete?.(); });
  listen(doc, 'visibilitychange', render);
  if (reducedMotion) listen(reducedMotion, 'change', render);
  listen(win, 'pagehide', () => { pageHidden = true; render(); });
  listen(win, 'pageshow', () => { pageHidden = false; render(); });
  const controller = { setState, setMotion, destroy };
  controllers.set(host, controller);
  render();
  return controller;
}
