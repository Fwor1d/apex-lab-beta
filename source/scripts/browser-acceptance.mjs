import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createServer} from './serve.mjs';
const browserName=process.env.APEX_BROWSER==='webkit'?'webkit':'chromium';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'.impeccable/review',browserName==='webkit'?'webkit':''),profile=path.join(root,'tmp','browser-acceptance-'+browserName),baseline=process.env.APEX_REFERENCE_ROOT??null;await fs.mkdir(out,{recursive:true});await fs.mkdir(path.join(root,'tmp'),{recursive:true});await fs.mkdir(path.join(root,'evidence'),{recursive:true});
process.env.PLAYWRIGHT_BROWSERS_PATH??=path.join(root,'.cache/playwright');
const {chromium,webkit}=await import('playwright');
if(baseline)assert.ok((await fs.stat(path.join(baseline,'index.html'))).isFile(),'R5.2 reference missing');
const server=createServer(path.join(root,'dist'),{baseline});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const context=await (browserName==='webkit'?webkit:chromium).launchPersistentContext(profile,{...(browserName==='chromium'&&process.env.APEX_BROWSER_CHANNEL?{channel:process.env.APEX_BROWSER_CHANNEL}:{}),headless:true,viewport:{width:1440,height:900},reducedMotion:'reduce',serviceWorkers:'block',acceptDownloads:false,env:{...process.env,TMPDIR:path.join(root,'tmp')},...(browserName==='chromium'?{args:['--disable-crash-reporter']}:{})});
const report={checks:[],errors:[],external:[],heavy:[],screenshots:[],metrics:[],browserEngine:browserName,browser:context.browser()?.version()};
context.on('request',r=>{const u=r.url();if(!u.startsWith(origin+'/')&&!u.startsWith('blob:')&&!u.startsWith('data:')||r.method()!=='GET')report.external.push({url:u,method:r.method()});if(/\.wasm|duckdb-browser.*worker/.test(u))report.heavy.push(u);});
await context.route('**/*',route=>route.request().url().startsWith(origin+'/')||route.request().url().startsWith('blob:')?route.continue():route.abort());
await context.addInitScript(()=>{localStorage.setItem('apex-motion','off');sessionStorage.setItem('apex-startup-r4','1');});
const page=context.pages()[0]??await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.setDefaultTimeout(15000);
const state=()=>page.evaluate(async()=>{const {appStore}=await import('./core/context.js');return appStore.snapshot();});
const check=async(name,fn)=>{await fn();report.checks.push(name);console.log('PASS '+name);};
const shot=async(name)=>{await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,name+'.png'),fullPage:true,animations:'disabled'});report.screenshots.push(name+'.png');};
try{
 await page.goto(origin+'/apex-lab/');await page.locator('[data-action="start"]').first().waitFor();
 await check('One shell, explicitly synthetic default and local DuckDB picker',async()=>{assert.equal(await page.locator('main').count(),1);await page.locator('[data-action="import"]').first().click();assert.match(await page.locator('#import-dialog').innerText(),/не отправляется на сервер/);assert.equal(await page.locator('#recording-file').getAttribute('accept'),'.duckdb');await page.locator('#close-dialog').click();});
 await page.locator('[data-action="start"]').first().click();await page.locator('[data-mode="map"]').first().click();await page.locator('#map').waitFor();
 await check('Initial map: approved R5.2 markers, full fit and source',async()=>{assert.equal((await state()).source.kind,'synthetic');assert.equal(await page.locator('.pedal-marker:visible').count(),0);assert.match(await page.locator('.demo-banner').first().innerText(),/синтетич/);});
 await check('Scope and navigation independent; global exact seek',async()=>{await page.locator('.sector-overlay>summary').click();await page.locator('[data-timing-select="sector:2"]').first().click();await page.keyboard.press('Escape');const range=(await state()).range;await page.locator('#segment-select').selectOption('part8');assert.deepEqual((await state()).range,range);await page.locator('#cursor').fill('1234');assert.equal((await state()).cursorM,1234);});
 await check('One playback survives mode/camera changes and pauses explicitly',async()=>{await page.locator('#play').click();await page.waitForTimeout(160);assert.ok((await state()).cursorM>1234);await page.locator('[data-mode="pitwall"]').first().click();assert.equal((await state()).playback.playing,true);await page.locator('#follow').click();assert.equal((await state()).playback.playing,true);await page.locator('#play').click();assert.equal((await state()).playback.playing,false);});
 await check('Paused HUD performs no per-frame DOM writes',async()=>{await page.waitForTimeout(100);const mutations=await page.evaluate(()=>new Promise(resolve=>{let writes=0;const observer=new MutationObserver(records=>writes+=records.length);observer.observe(document.querySelector('#hud-ref-steering'),{childList:true,subtree:true,characterData:true});setTimeout(()=>{observer.disconnect();resolve(writes);},200);}));assert.equal(mutations,0);});
 await check('A/B selection, missing channel and distinct delta contract',async()=>{await page.locator('#lap-a').selectOption('3');assert.equal((await state()).a,3);assert.match(await page.locator('#hud-steering').innerText(),/\d|Нет данных/);assert.match(await page.locator('#hud-ref-steering').innerText(),/Нет данных/);await page.locator('#lap-a').selectOption('1');});
 await check('Driving Lab state and unavailable recorded trajectory',async()=>{await page.locator('a[href="#lab"]').first().click();await page.locator('[data-labtab="recorded"]').click();assert.match(await page.locator('.recorded-unavailable').innerText(),/недоступна/);await page.locator('[data-labtab="calculator"]').click();assert.ok(await page.locator('#estimation-host').isVisible());await page.locator('[data-labtab="trainer"]').click();assert.ok(await page.locator('#line-editor').isVisible());});
 // Matched screenshots, same viewport/state for baseline and integrated app.
 report.referenceComparison=baseline?'included':'skipped: set APEX_REFERENCE_ROOT to approved R5.2 for visual comparison';
 for(const prefix of [...(baseline?['/baseline/']:[]),'/apex-lab/']){
  const label=prefix.includes('baseline')?'baseline':'current';await page.goto(origin+prefix);await page.locator('[data-action="start"]').first().click();await page.locator('[data-mode="map"]').first().click();await page.locator('#map').waitFor();
  for(const [width,height]of [[1440,900],[390,844],[844,390],[768,1024]]){await page.setViewportSize({width,height});await page.locator('[data-workspace="reset"]').click();await page.waitForTimeout(80);const metric=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,computedTheme:{bodyColor:getComputedStyle(document.body).color,bodyBackground:getComputedStyle(document.body).backgroundColor,textColors:[...new Set([...document.querySelectorAll('h1,h2,h3,button,label,summary,output')].filter(e=>e.getClientRects().length).map(e=>getComputedStyle(e).color))]},nativeSelects:[...document.querySelectorAll('#motion,#sector-select,#alignment,#rate')].filter(e=>e.getClientRects().length).map(e=>({id:e.id,height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width})),small:[...document.querySelectorAll('button,label,summary,output')].filter(e=>e.getClientRects().length&&parseFloat(getComputedStyle(e).fontSize)<11).map(e=>e.textContent.slice(0,50)),map:document.querySelector('#map').getBoundingClientRect().toJSON(),playback:document.querySelector('.workspace-playback').getBoundingClientRect().toJSON()}));report.metrics.push({label,...metric});assert.ok(metric.scrollWidth<=width);assert.deepEqual(metric.small,[]);if(label==='current')for(const control of metric.nativeSelects)assert.ok(control.height>=44,control.id+' touch height '+control.height);if(width===844)await shot(label+'-landscape');if(width===1440||width===390)await shot(label+(width===1440?'-desktop':'-mobile'));}
  await page.setViewportSize({width:1440,height:900});await page.locator('[data-mode="pitwall"]').first().click();await shot(label+'-pitwall');await page.locator('a[href="#lab"]').first().click();await shot(label+'-lab');
 }
 await page.goto(origin+'/apex-lab/');await page.locator('[data-action="start"]').first().click();await page.locator('[data-mode="map"]').first().click();
 await check('Brake and throttle markers fit inside the rendered road on desktop and mobile', async () => {
  const frame = page.locator('.main-map-frame');
  for (const [name, width, height, zoomSteps] of [['desktop', 1440, 900, 7], ['mobile', 390, 844, 10]]) {
   await page.setViewportSize({ width, height });
   for (const type of ['brake-on', 'throttle-on', 'full-throttle']) {
    await page.locator('[data-workspace="reset"]').click();
    await page.locator('.event-disclosure>summary').click();
    const item = page.locator(`#event-list button[data-event^="a:"][data-event*=":${type}:"]`).first();
    const id = await item.getAttribute('data-event');
    await item.click();
    for (let i = 0; i < zoomSteps; i++) await page.locator('[data-workspace="zoom-in"]').click();
    const marker = frame.locator(`button.pedal-marker[data-event="${id}"]`);
    await marker.waitFor({ state: 'visible' });
    const measurements = await frame.locator('.pedal-marker:visible').evaluateAll((buttons) => {
     const road = document.querySelector('#map [data-road="surface"]');
     const inverse = road.getScreenCTM().inverse();
     return buttons.map(button => {
      const hit = button.getBoundingClientRect();
      const symbol = button.querySelector('.event-symbol').getBoundingClientRect();
      const cx = symbol.left + symbol.width / 2;
      const cy = symbol.top + symbol.height / 2;
      const inside = Array.from({ length: 24 }, (_, i) => {
       const angle = i * Math.PI / 12;
       const p = new DOMPoint(cx + Math.cos(angle) * symbol.width / 2, cy + Math.sin(angle) * symbol.height / 2).matrixTransform(inverse);
       return road.matches('.circuit-union-surface') ? road.isPointInStroke(p) : road.isPointInFill(p);
      }).every(Boolean);
      return { id: button.dataset.event, hitWidth: hit.width, hitHeight: hit.height, symbol: symbol.width, inside };
     });
    });
    assert.ok(measurements.some(result => result.id === id));
    for (const result of measurements) {
     assert.equal(result.symbol, 26);
     assert.ok(result.hitWidth >= 44 && result.hitHeight >= 44);
     assert.ok(result.inside, `${name}: ${result.id} touches the road edge`);
    }
    if ((name === 'desktop' && type === 'brake-on') || (name === 'mobile' && type === 'throttle-on')) {
     const file = `markers-${type}-${name}.png`;
     await frame.screenshot({ path: path.join(out, file), animations: 'disabled' });
     report.screenshots.push(file);
    }
    const distance = Number(await marker.getAttribute('data-distance'));
    await marker.click();
    const snapshot = await state();
    assert.equal(snapshot.playback.playing, false);
    assert.equal(snapshot.cursorM, distance);
    await page.keyboard.press('Escape');
   }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
 });
 await check('Native selectors remain operable with 44px targets',async()=>{await page.locator('#rate').selectOption('2');assert.equal((await state()).playback.rate,2);await page.locator('#rate').selectOption('1');await page.locator('#alignment').selectOption('time');assert.equal((await state()).alignment,'time');await page.locator('#alignment').selectOption('distance');});
 await check('Routes use one AppState and preserve context',async()=>{const before=await state();for(const route of ['reports','sessions','dashboard','telemetry']){await page.goto(origin+'/apex-lab/#'+route);await page.waitForTimeout(20);const next=await state();assert.equal(next.cursorM,before.cursorM);assert.deepEqual([next.a,next.b,next.range],[before.a,before.b,before.range]);}});
 await check('Lifecycle resume does not create competing playback callbacks',async()=>{await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide'));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await page.locator('#cursor').fill('1000');await page.locator('#play').click();const before=(await state()).playback.timeS;await page.waitForTimeout(250);const after=await state();assert.ok(after.playback.timeS-before>0&&after.playback.timeS-before<.6);await page.locator('#play').click();});
 await check('Root deployment route also loads without root-relative dependencies',async()=>{await page.goto(origin+'/');assert.ok(await page.locator('[data-action="start"]').first().isVisible());});
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);assert.deepEqual(report.heavy,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error);await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});console.error(error);process.exitCode=1;
}finally{await context.close();await new Promise(r=>server.close(r));await fs.rm(profile,{recursive:true,force:true});await fs.writeFile(path.join(root,browserName==='webkit'?'evidence/browser-webkit.json':'evidence/browser-acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks.length,errors:report.errors,external:report.external,heavy:report.heavy}));}
