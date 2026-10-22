import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const base=process.env.BASE_URL||"http://127.0.0.1:8269";
const out=process.env.AUDIT_OUT||"output/playwright/rexonance-audit94/motion-before";
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:"chrome"});
try {
for(const width of [1440,1024,390]) {
const context=await browser.newContext({viewport:{width,height:width===1024?768:width===390?844:900},hasTouch:width!==1440,isMobile:width!==1440});
await context.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|grok\.com)\//,r=>r.abort("internetdisconnected"));
const page=await context.newPage();
await page.addInitScript(()=>{
window.__auditArrival=[];
const sample=()=>{const hero=document.querySelector('.rxs-hero');if(hero)window.__auditArrival.push({time:performance.now(),y:hero.getBoundingClientRect().top,nav:document.querySelector('.rxs-local-nav')?.getBoundingClientRect().height});if(performance.now()<3000)requestAnimationFrame(sample);};requestAnimationFrame(sample);
});
await page.goto(`${base}/rexonance-saga`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(3200);
const r={width,networkMode:'external-font-outage-controlled',arrival:await page.evaluate(()=>window.__auditArrival)};
await page.locator('.rxs-p14-metrics article').first().evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
r.counts=await page.evaluate(()=>new Promise(resolve=>{const samples=[];const start=performance.now();const sample=()=>{const host=document.querySelector('.rxs-p14-values strong');const overlay=host.querySelector('.rsn-count');const a=getComputedStyle(host),b=getComputedStyle(overlay);samples.push({t:performance.now()-start,state:host.dataset.rsnState,hostFill:a.webkitTextFillColor,hostBackground:a.backgroundImage,hostSize:a.fontSize,overlaySize:b.fontSize,overlayFill:b.webkitTextFillColor,overlayVisibility:b.visibility,text:overlay.textContent,hostHeight:host.getBoundingClientRect().height,overlayHeight:overlay.getBoundingClientRect().height});if(performance.now()-start<1600)requestAnimationFrame(sample);else resolve(samples);};sample();}));
r.plates=await page.locator('.rxs-headline-metrics article').evaluateAll(els=>els.map(el=>({padding:getComputedStyle(el).paddingInlineStart,left:el.getBoundingClientRect().left,labelLeft:el.querySelector('small').getBoundingClientRect().left})));
await page.goto(`${base}/world`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!document.querySelector('.load-gate'));await page.waitForTimeout(800);
await page.locator('.side-panel-trigger').first().click();const link=page.locator('#site-side-panel a[href="/rexonance-saga#top"]').first();await link.scrollIntoViewIfNeeded();
await page.evaluate(()=>{
document.addEventListener('click',event=>{if(!event.target.closest?.('a[href="/rexonance-saga#top"]'))return;
window.__auditHandover=[];const start=performance.now();const sample=()=>{const call=document.querySelector('.rx-call-sequence');const hero=document.querySelector('.rxs-hero h1');window.__auditHandover.push({ms:performance.now()-start,path:location.pathname,cover:document.documentElement.dataset.routeCover,load:!!document.querySelector('.load-gate'),call:!!call,callPhase:call?.dataset.phase,callOpacity:call?getComputedStyle(call).opacity:null,heroOpacity:hero?getComputedStyle(hero).opacity:null});if(performance.now()-start<10000)requestAnimationFrame(sample);};sample();},{capture:true,once:true});
});
await link.click();await page.waitForTimeout(10300);r.handover=await page.evaluate(()=>window.__auditHandover);
await writeFile(`${out}/${width}.json`,JSON.stringify(r,null,2));
console.log(JSON.stringify({width,arrivalY:[...new Set(r.arrival.map(x=>x.y))],counts:[...new Set(r.counts.map(x=>JSON.stringify({state:x.state,hostSize:x.hostSize,overlaySize:x.overlaySize,hostFill:x.hostFill,overlayFill:x.overlayFill})))],firstCall:r.handover?.find(x=>x.call),firstHero:r.handover?.find(x=>x.heroOpacity==='1'&&!x.call)}));
await context.close();
}
}finally{await browser.close();}
