import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://localhost:8080";
const engine = process.env.PW_ENGINE || "chromium";
const browser = await (engine === "webkit" ? webkit : chromium).launch(engine === "webkit" ? {} : {channel:"chrome"});
const results = [];
const routes = ["/world", "/characters/terra", "/characters/luna", "/managers/zeus", "/managers/opus", "/riders/saga", "/riders/leddic", "/rexonance-saga", "/extreme-saga", "/dream-chapter"];

try {
  for (const [width,height] of [[390,844], [1280,800]]) {
    const context = await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:engine === "chromium"});
    const page = await context.newPage();
    const cdp = engine === "chromium" ? await context.newCDPSession(page) : null;
    for (const route of routes) {
      await page.goto(new URL(route,base).href);
      await page.locator('main').first().waitFor();
      await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-route-scroll-settling'));
      await page.waitForTimeout(300);
      for (const selector of ['main h1','main h2','main h3','main p','main img']) {
        const element = page.locator(selector).first();
        if (!(await element.count())) continue;
        await element.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
        await page.waitForTimeout(200);
        const target = await element.evaluate(e=>{
          const r=e.getBoundingClientRect();
          const y=Math.min(innerHeight-35,Math.max(145,r.y+r.height/2));
          const x=Math.min(innerWidth-16,Math.max(16,r.x+r.width/2));
          const hit=document.elementFromPoint(x,y);
          if(r.width<1||r.height<1||!hit||hit.closest('.liquid-swipe-tabs,.ios-slide-open,.zeus-button')) return null;
          const max=document.documentElement.scrollHeight-innerHeight;
          const direction=scrollY+160<max?-1:1;
          if(max<160 || (direction===1&&scrollY<160)) return null;
          const touchChain=[];
          for(let node=hit;node;node=node.parentElement) {
            const s=getComputedStyle(node);
            if(s.touchAction==='none'||s.touchAction==='pan-x') touchChain.push(`${node.tagName}.${node.className}: ${s.touchAction}`);
          }
          return {x,y,direction,before:scrollY,hit:hit.tagName+'.'+hit.className,touchChain};
        });
        if(!target) continue;
        if(cdp) {
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:target.x,y:target.y}]});
          for(let step=1;step<=10;step++) {
            await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:target.x,y:target.y+target.direction*120*step/10}]});
            await page.waitForTimeout(16);
          }
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        } else { await page.mouse.move(target.x,target.y); await page.mouse.wheel(0,-target.direction*160); }
        await page.waitForTimeout(220);
        const after=await page.evaluate(()=>scrollY);
        const ok=(after-target.before)*-target.direction>12;
        const result={engine,width,route,selector,ok,before:target.before,after,hit:target.hit,touchChain:target.touchChain};
        results.push(result);
        if(!ok) console.log('FAIL',JSON.stringify(result));
      }
      console.log(`${engine} ${width} ${route} checked`);
    }
    await context.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({total:results.length,passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok)},null,2));
assert.ok(results.length>=60,'Insufficient content scroll coverage');
assert.ok(results.every(r=>r.ok),'Content surfaces blocked scrolling');
