import { ROAD, HANDLE_DEFS, PRESETS, createLine, roadPoint, projectToRoad, moveHandle, linePath, roadBoundaryPath, validateLine } from './line-geometry.js';

export function createEditorState() {
  return { handles: createLine(), selected: 'apex', preset: 'neutral', baselineVisible: true, plannedVisible: true, undo: [], redo: [], message: 'Выберите точку на линии и перетащите её внутри дороги.' };
}
export function editorHTML() {
  return `<div class="line-editor-layout"><section class="line-editor-scene panel"><div class="section-head"><h2>Постройте свою линию</h2><span class="tag">Учебная геометрия</span></div><div class="line-scene" id="line-scene"><svg id="line-road" viewBox="0 0 900 560" aria-label="Условный правый поворот с двумя границами дороги и сравниваемыми линиями" role="img"><path id="road-surface" class="road-surface"/><path id="road-left" class="road-boundary"/><path id="road-right" class="road-boundary"/><path id="road-middle" class="road-middle"/><path id="line-baseline" class="line-baseline"/><path id="line-planned" class="line-planned"/><g aria-hidden="true" class="road-labels"><text x="110" y="535">ВХОД</text><text x="310" y="535">НАЧАЛО ПОВОРОТА</text><text x="450" y="320">АПЕКС</text><text x="735" y="85">ВЫХОД</text><path d="M130 430h36m-10-8 10 8-10 8"/></g></svg><div class="line-handles">${HANDLE_DEFS.map((d,i)=>`<button class="line-handle" id="handle-${d.id}" data-handle="${d.id}" aria-describedby="line-keyboard-help" aria-pressed="false"><span class="handle-dot">${i+1}</span><span class="handle-label">${d.label}</span></button>`).join('')}</div></div><div class="line-legend"><label class="check"><input id="baseline-visible" type="checkbox" checked><span class="line-key baseline"></span>Линия примера</label><label class="check"><input id="planned-visible" type="checkbox" checked><span class="line-key planned"></span>Ваша линия</label></div><p class="line-feedback" id="line-feedback"></p><div class="row spread"><span class="line-validity" id="line-validity"></span><span class="compact muted">Форма линии ≠ физическая достижимость</span></div><p class="compact muted" id="line-keyboard-help">Перетаскивайте точки. Клавиатура: ← / → — раньше / позже, ↑ / ↓ — внутрь / наружу; Shift — крупный шаг. Страница прокручивается вне точек.</p></section><section class="line-editor-controls"><label class="field"><span>Учебный сценарий</span><select id="line-preset">${Object.entries(PRESETS).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}<option value="custom" disabled>Своя линия</option></select></label><p>Сравните ранний и поздний апекс. Это варианты формы, а не универсальные рекомендации.</p><div class="handle-choice" role="group" aria-label="Выбрать точку линии">${HANDLE_DEFS.map((d,i)=>`<button data-select-handle="${d.id}" aria-pressed="false">${i+1}. ${d.label}</button>`).join('')}</div><div class="divider"></div><h3 id="selected-handle-title"></h3><label class="editor-field">Положение на участке<output id="handle-station-value"></output><input id="handle-station" type="range" step="0.1" aria-label="Положение выбранной точки на участке"></label><label class="editor-field">Поперечное смещение<output id="handle-offset-value"></output><input id="handle-offset" type="range" min="-75" max="75" step="1" aria-label="Смещение выбранной точки поперёк дороги"></label><p class="compact muted">Положение — % условного участка. Смещение — % полуширины дороги: минус наружу, плюс внутрь. Это не метры.</p><div class="row line-history"><button id="line-undo">Отменить</button><button id="line-redo">Повторить</button><button id="line-reset">Сбросить линию</button></div><details><summary>Геометрия и ограничения</summary><p>Авторская прямая, четверть окружности и выход. Ширина условная, не измерена в LMU. Четыре точки задают гладкое поперечное смещение вдоль дороги. Точки и линия ограничены внутренним коридором с запасом до границ. Нет расчёта оптимума, сцепления, скорости и выигрыша времени.</p></details></section></div>`;
}
const copy = handles => handles.map(h => ({...h}));
const snapshot = state => ({handles:copy(state.handles),preset:state.preset});
const number = v => v.toLocaleString('ru-RU',{maximumFractionDigits:1});
function xyPath(points) { return points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '); }
export function mountLineEditor(host,state,{announce=()=>{},onChange=()=>{}}={}) {
  const get = id => host.querySelector('#'+id);
  const scene=get('line-scene'),svg=get('line-road');
  const abort=new AbortController();const opts={signal:abort.signal};let grip=null,disposed=false;
  const listen=(el,name,fn)=>el.addEventListener(name,fn,opts);
  const baseline=createLine();
  const left=Array.from({length:321},(_,i)=>roadPoint(ROAD.total*i/320,ROAD.halfWidth));
  const right=Array.from({length:321},(_,i)=>roadPoint(ROAD.total*i/320,-ROAD.halfWidth));
  get('road-surface').setAttribute('d',xyPath([...left,...right.reverse()])+' Z');
  get('road-left').setAttribute('d',roadBoundaryPath(1));get('road-right').setAttribute('d',roadBoundaryPath(-1));
  get('road-middle').setAttribute('d',xyPath(Array.from({length:321},(_,i)=>roadPoint(ROAD.total*i/320))));
  get('line-baseline').setAttribute('d',linePath(baseline));
  function positionHandles() {
    if(disposed)return;const m=svg.getScreenCTM();if(!m)return;const r=scene.getBoundingClientRect();
    for(const h of state.handles){const p=roadPoint(h.s,h.n),screen=new DOMPoint(p.x,p.y).matrixTransform(m),el=get('handle-'+h.id);el.style.left=(screen.x-r.left)+'px';el.style.top=(screen.y-r.top)+'px';}
  }
  function draw(){
    const validity=validateLine(state.handles);if(!validity.valid){get('line-validity').textContent=validity.reason;get('line-validity').classList.add('error');return;}
    get('line-planned').setAttribute('d',linePath(state.handles));
    get('line-planned').hidden=!state.plannedVisible;get('line-planned').style.display=state.plannedVisible?'':'none';
    get('line-baseline').style.display=state.baselineVisible?'':'none';
    get('baseline-visible').checked=state.baselineVisible;get('planned-visible').checked=state.plannedVisible;
    host.querySelector('.line-handles').hidden=!state.plannedVisible;
    get('line-preset').value=state.preset;
    const h=state.handles.find(h=>h.id===state.selected),d=HANDLE_DEFS.find(d=>d.id===state.selected);
    get('selected-handle-title').textContent=d.label;
    const station=get('handle-station');station.min=d.minS/ROAD.total*100;station.max=d.maxS/ROAD.total*100;station.value=h.s/ROAD.total*100;
    get('handle-offset').value=h.n/ROAD.halfWidth*100;
    get('handle-station-value').textContent=number(h.s/ROAD.total*100)+' %';get('handle-offset-value').textContent=number(h.n/ROAD.halfWidth*100)+' % полуширины';
    for(const el of host.querySelectorAll('[data-handle],[data-select-handle]'))el.setAttribute('aria-pressed',String((el.dataset.handle||el.dataset.selectHandle)===state.selected));
    for(const def of HANDLE_DEFS){const el=get('handle-'+def.id),v=state.handles.find(h=>h.id===def.id);el.setAttribute('aria-label',`${def.label}: ${number(v.s/ROAD.total*100)}% участка, смещение ${number(v.n/ROAD.halfWidth*100)}%. Переместить стрелками.`);el.dataset.station=v.s;el.dataset.offset=v.n;}
    get('line-validity').textContent='Линия внутри учебного коридора';get('line-validity').classList.remove('error');get('line-feedback').textContent=state.message;
    get('line-undo').disabled=!state.undo.length;get('line-redo').disabled=!state.redo.length;positionHandles();onChange(state.handles);
  }
  function commit(before){if(JSON.stringify(before.handles)===JSON.stringify(state.handles))return;state.undo.push(before);if(state.undo.length>40)state.undo.shift();state.redo=[];}
  function change(id,value){
    try{state.handles=moveHandle(state.handles,id,value);state.preset='custom';const h=state.handles.find(h=>h.id===id),d=HANDLE_DEFS.find(d=>d.id===id);state.message=`${d.label}: ${number(h.s/ROAD.total*100)}% участка, смещение ${number(h.n/ROAD.halfWidth*100)}% полуширины. Ваша линия изменена.`;draw();}
    catch{state.message='Точку не удалось переместить. Последняя допустимая линия сохранена.';get('line-feedback').textContent=state.message;}
  }
  function select(id){state.selected=id;draw();}
  function finish(cancel=false){if(!grip)return;const g=grip;grip=null;if(cancel){state.handles=g.before.handles;state.preset=g.before.preset;state.message='Перемещение отменено; предыдущая линия восстановлена.';}else commit(g.before);if(g.el.hasPointerCapture(g.pointerId))g.el.releasePointerCapture(g.pointerId);draw();announce(state.message);}
  for(const el of host.querySelectorAll('[data-handle]')){
    const id=el.dataset.handle;
    listen(el,'click',()=>select(id));
    listen(el,'pointerdown',ev=>{if(grip||ev.button!==0)return;ev.preventDefault();select(id);el.focus({preventScroll:true});grip={id,pointerId:ev.pointerId,el,before:snapshot(state)};el.setPointerCapture(ev.pointerId);});
    listen(el,'pointermove',ev=>{if(!grip||grip.pointerId!==ev.pointerId)return;ev.preventDefault();const m=svg.getScreenCTM();if(!m)return;const p=new DOMPoint(ev.clientX,ev.clientY).matrixTransform(m.inverse());change(id,projectToRoad(p.x,p.y));});
    listen(el,'pointerup',ev=>{if(grip?.pointerId===ev.pointerId)finish();});listen(el,'pointercancel',ev=>{if(grip?.pointerId===ev.pointerId)finish(true);});listen(el,'lostpointercapture',()=>finish(true));
    listen(el,'keydown',ev=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key))return;ev.preventDefault();select(id);const before=snapshot(state),h=state.handles.find(h=>h.id===id),step=ev.shiftKey?12:3;change(id,{s:h.s+(ev.key==='ArrowRight'?step:ev.key==='ArrowLeft'?-step:0),n:h.n+(ev.key==='ArrowUp'?step:ev.key==='ArrowDown'?-step:0)});commit(before);draw();announce(state.message);});
  }
  host.querySelectorAll('[data-select-handle]').forEach(el=>listen(el,'click',()=>{select(el.dataset.selectHandle);get('handle-'+state.selected).focus({preventScroll:true});}));
  listen(get('line-preset'),'change',e=>{const before=snapshot(state);state.handles=createLine(e.target.value);state.preset=e.target.value;state.message=`${PRESETS[state.preset].label}: изменены начало поворота и положение апекса. Линия примера сохранена для сравнения.`;commit(before);draw();announce(state.message);});
  listen(get('baseline-visible'),'change',e=>{state.baselineVisible=e.target.checked;draw();});listen(get('planned-visible'),'change',e=>{state.plannedVisible=e.target.checked;draw();});
  for(const [id,field] of [['handle-station','s'],['handle-offset','n']]){
    let before=null;const el=get(id);
    listen(el,'input',()=>{before??=snapshot(state);const h=state.handles.find(h=>h.id===state.selected);change(state.selected,{s:field==='s'?Number(el.value)/100*ROAD.total:h.s,n:field==='n'?Number(el.value)/100*ROAD.halfWidth:h.n});});
    listen(el,'change',()=>{if(before)commit(before);before=null;draw();announce(state.message);});
  }
  listen(get('line-reset'),'click',()=>{const before=snapshot(state);state.handles=createLine();state.preset='neutral';state.message='Ваша линия сброшена к учебному примеру.';commit(before);draw();announce(state.message);});
  for(const dir of ['undo','redo'])listen(get('line-'+dir),'click',()=>{const from=state[dir],to=state[dir==='undo'?'redo':'undo'];if(!from.length)return;to.push(snapshot(state));const saved=from.pop();state.handles=saved.handles;state.preset=saved.preset;state.message=dir==='undo'?'Последнее изменение отменено.':'Изменение повторено.';draw();announce(state.message);});
  listen(window,'blur',()=>finish(true));listen(document,'visibilitychange',()=>{if(document.hidden)finish(true);});
  const resize=new ResizeObserver(positionHandles);resize.observe(scene);draw();
  return {destroy(){if(disposed)return;finish(true);disposed=true;resize.disconnect();abort.abort();}};
}
