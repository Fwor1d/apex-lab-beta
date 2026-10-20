/** Revision 5.1 presentation only: existing DOM and shared telemetry state. */
import {state as s,lapTime} from './core/context.js';
import {comparisonAt} from './comparison.js';
const fmt=(n,d=0)=>n===null?'Нет данных':n.toLocaleString('ru-RU',{minimumFractionDigits:d,maximumFractionDigits:d});
const clock=n=>`${Math.floor(n/60)}:${(n%60).toFixed(3).padStart(6,'0')}`;
export function mountPrecisionMap(host){
 if(s.mode!=='map')return null;
 const main=host.parentElement,frame=host.querySelector('.main-map-frame'),toolbar=host.querySelector('.workspace-toolbar'),hud=host.querySelector('.telemetry-hud'),dock=host.querySelector('.analysis-dock');
 host.classList.add('precision-layout');document.body.classList.add('precision-map-active');
 const options=document.createElement('details');options.className='precision-options';options.innerHTML='<summary>Настройки карты</summary><div class="precision-options-body"></div>';
 const body=options.lastElementChild;
 body.append(toolbar.children[0],toolbar.querySelector('.popover-control'),hud);
 const legend=main.querySelector('.comparison-legend');if(legend)body.append(legend);
 const readouts=main.querySelector('.comparison-readouts'),basis=main.querySelector('.alignment-explanation');if(readouts)body.append(readouts);if(basis)body.append(basis);
 toolbar.append(options);
 const scope=toolbar.querySelector('label[for="sector-select"]');scope.textContent='Область анализа';toolbar.querySelector('#sector-select option[value="all"]').textContent='Весь круг';
 frame.append(host.querySelector('.mini-overview'),host.querySelector('.segment-toolbar'));
 const segment=frame.querySelector('.segment-toolbar');segment.querySelector('.segment-select>span').textContent='Навигация по трассе';segment.querySelector('[data-workspace="entire"]').textContent='Весь путь';
 const sector=host.querySelector('.sector-comparison');const comparison=frame.querySelector('.sector-overlay');comparison.append(sector);comparison.querySelector('summary').textContent='Секторы и время';
 host.querySelector('.map-side').hidden=true;host.querySelector('#mini-map').setAttribute('aria-label','Весь синтетический круг и окно камеры. Клик выбирает навигационный участок без изменения анализа. Стрелки — соседний участок.');
 const tools=frame.querySelector('.camera-tools');for(const [action,label,path]of [['fit','Вписать выбранный участок','M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M8 12h8M12 8v8'],['reset','Весь путь — только камера','M4 4h16v16H4zM8 8h8v8H8z'],['follow','Следовать за B','M12 3v3M12 18v3M3 12h3M18 12h3M16 12a4 4 0 1 1-8 0a4 4 0 1 1 8 0']]){const button=tools.querySelector(`[data-workspace="${action}"]`);button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;button.setAttribute('aria-label',label);button.title=label;}
 const panel=document.createElement('section');panel.className='precision-ab-dock';panel.setAttribute('aria-label','Сравнение кругов A и B');
 const lap=k=>`<div class="precision-lap lap-${k}"><div class="precision-lap-heading"><strong class="identity-${k}">${k.toUpperCase()} <span id="precision-lap-${k}"></span></strong><span id="precision-time-${k}"></span></div><div class="precision-speed" data-hud-item="speed"><strong id="precision-speed-${k}"></strong><span>км/ч</span></div><div class="precision-pedals">${['throttle','brake'].map(c=>`<div data-hud-item="${c}"><span>${c==='brake'?'Тормоз':'Газ'}</span><meter id="precision-${c}-${k}" class="pedal-${c}" min="0" max="100"></meter><output id="precision-${c}-text-${k}"></output></div>`).join('')}</div></div>`;
 panel.innerHTML=lap('a')+'<div class="precision-delta"><span>Δ B − A · по дистанции</span><strong id="precision-delta"></strong><span id="precision-advantage"></span><small>Отдельные демо-круги</small></div>'+lap('b');dock.prepend(panel);
 const status=document.createElement('span');status.className='precision-source';status.textContent='Демо · синтетика';main.querySelector('.telemetry-context').prepend(status);
 const tabs=main.querySelector('.telemetry-context .tabs'),secondaryModes=[...tabs.querySelectorAll('[data-mode=advanced],[data-mode=setup]')],secondary=document.createElement('div');secondary.className='secondary-modes';body.append(secondary);
 const mobileDisclosures=document.createElement('div');mobileDisclosures.className='precision-mobile-disclosures';const eventDisclosure=frame.querySelector('.event-disclosure');
 const supplement=document.createElement('section');supplement.className='precision-supplement';supplement.id='precision-supplement';supplement.hidden=true;supplement.setAttribute('aria-label','Данные и настройки карты');
 const toggle=document.createElement('button');toggle.className='precision-sheet-toggle';toggle.textContent='Данные';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',supplement.id);main.querySelector('.telemetry-context').append(toggle);host.append(supplement);
 const abort=new AbortController(),small=matchMedia('(max-width:760px)'),landscape=matchMedia('(max-height:500px) and (min-width:761px)'),column=host.querySelector('.map-column'),stage=host.querySelector('.map-stage'),playback=host.querySelector('.workspace-playback'),context=host.querySelector('.playback-context');
 function closeSupplement(){supplement.hidden=true;toggle.setAttribute('aria-expanded','false');}
 toggle.addEventListener('click',()=>{const open=supplement.hidden;supplement.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open){options.open=false;supplement.querySelector('select,button,summary')?.focus({preventScroll:true});}},{signal:abort.signal});
 function arrangeSegment(){
  closeSupplement();
  if(small.matches||landscape.matches)secondary.append(...secondaryModes);else tabs.append(...secondaryModes);
  if(landscape.matches){supplement.append(toolbar,panel,context,segment,mobileDisclosures);mobileDisclosures.append(comparison,eventDisclosure);}
  else {column.insertBefore(toolbar,stage);dock.prepend(panel);dock.append(context);
   if(small.matches){host.append(segment,mobileDisclosures);mobileDisclosures.append(comparison,eventDisclosure);dock.prepend(playback);}
   else{frame.append(segment,comparison,eventDisclosure);mobileDisclosures.remove();dock.append(playback,context);}
  }
 }
 arrangeSegment();small.addEventListener('change',arrangeSegment,{signal:abort.signal});landscape.addEventListener('change',arrangeSegment,{signal:abort.signal});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(options.open){options.open=false;options.querySelector('summary').focus();}else if(!supplement.hidden){closeSupplement();toggle.focus({preventScroll:true});}}},{signal:abort.signal});
 function update(){const c=comparisonAt();for(const k of ['a','b']){host.querySelector('#precision-lap-'+k).textContent='Круг '+s[k];host.querySelector('#precision-time-'+k).textContent=clock(lapTime(s[k]));host.querySelector('#precision-speed-'+k).textContent=fmt(c[k].speed);for(const channel of ['throttle','brake']){const v=c[k][channel],meter=host.querySelector(`#precision-${channel}-${k}`);meter.value=v??0;meter.setAttribute('aria-label',`${k.toUpperCase()} · ${channel==='brake'?'Тормоз':'Газ'} · ${fmt(v)} %`);meter.hidden=v===null;host.querySelector(`#precision-${channel}-text-${k}`).textContent=v===null?'Нет данных':fmt(v)+'%';}}
 host.querySelector('#precision-delta').textContent=(c.delta>=0?'+':'')+fmt(c.delta,3)+' с';host.querySelector('#precision-advantage').textContent=c.distanceText;
 for(const el of panel.querySelectorAll('[data-hud-item]'))el.hidden=!s.hud[el.dataset.hudItem];
 }
 update();return{update,destroy(){abort.abort();document.body.classList.remove('precision-map-active');}};
}
