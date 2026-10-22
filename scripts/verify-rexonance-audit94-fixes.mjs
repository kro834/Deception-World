import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:8269";
const out = process.env.AUDIT_OUT || "output/playwright/rexonance-audit94/verified-fixes";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const results = [];
try {
  for (const width of [1440, 1024, 390]) {
    const page = await browser.newPage({viewport:{width,height:width===1024?768:width===390?844:900},hasTouch:width!==1440,isMobile:width!==1440});
    await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|grok\.com)\//,r=>r.abort("internetdisconnected"));
    const errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.goto(`${base}/rexonance-saga`,{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>document.querySelector(".rxs-stage-tabs")?.dataset.liquidInitialized==="true"&&!document.documentElement.hasAttribute("data-route-cover"));
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForTimeout(1500);
    const r={width,networkMode:"external-font-outage-controlled",checks:[]};
    const pass=id=>r.checks.push(id);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
    r.heroImage=await page.locator('.rxs-hero-visual img').evaluate(img=>({source:img.currentSrc,width:img.getBoundingClientRect().width,sizes:img.sizes}));
    if(width===1440){assert.ok(r.heroImage.source.endsWith('-640.webp'));pass('F69');}
    r.platePadding=await page.locator('.rxs-headline-metrics article').evaluateAll(els=>els.map(el=>parseFloat(getComputedStyle(el).paddingInlineStart)));
    assert.ok(r.platePadding.every(x=>x>=16));pass('F47');
    assert.equal(await page.locator('.rxs-p14-comparator header output').count(),0);pass('F51');
    assert.ok((await page.locator('.rxs-system-grid article').first().innerText()).includes('フェイブルが開発した'));pass('F64');
    if(width===1440){
      await page.locator('#system').evaluate(el=>el.scrollIntoView({behavior:'instant'}));
      await page.waitForTimeout(1200);
      r.systemBodyY=await page.locator('.rxs-system-grid article > p').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().top));
      assert.ok(Math.max(...r.systemBodyY)-Math.min(...r.systemBodyY)<1);pass('F99');
      const cdp=await page.context().newCDPSession(page);
      const doc=await cdp.send('DOM.getDocument');
      const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#system .rxs-section-heading'});
      const description=await cdp.send('DOM.describeNode',{nodeId});
      r.emitter={};
      for(const pseudo of description.node.pseudoElements||[]){const {model}=await cdp.send('DOM.getBoxModel',{nodeId:pseudo.nodeId});r.emitter[pseudo.pseudoType]=(model.border[0]+model.border[2]+model.border[4]+model.border[6])/4;}
      await cdp.detach();
      assert.ok(Math.abs(r.emitter.before-r.emitter.after)<2);pass('F70');
    }
    if(width===390){const boxes=await page.locator('.rxe-hero-rail a').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().width));assert.ok(Math.abs(boxes[0]-boxes[1])<1);pass('F105');}
    await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
    await page.locator('.rxe-hero-primary').click();
    await page.waitForTimeout(120);
    r.anchor=await page.evaluate(()=>({gap:document.querySelector('#assembly').getBoundingClientRect().top-document.querySelector('.rxs-local-nav').getBoundingClientRect().height,y:scrollY,hash:location.hash,behavior:getComputedStyle(document.documentElement).scrollBehavior}));
    assert.ok(Math.abs(r.anchor.gap-24)<2);pass('F113');assert.equal(r.anchor.behavior,'auto');assert.equal(r.anchor.hash,'#assembly');pass('F124');
    if(width===1024){const h=await page.locator("h1").boundingBox();assert.ok(h.y+await page.evaluate(()=>scrollY)+h.height<768);pass("F14");}
    await page.locator(".rxs-menu-trigger").click();
    await page.waitForTimeout(300);
    const menu=await page.locator('[data-side-menu-sections] > p').boundingBox();
    assert.ok(menu.y>80&&menu.y<500);pass("F59");
    for(const hash of ["performance","p14","assembly","stages","system"]) assert.ok(await page.locator(`[data-side-menu-sections] a[href$="#${hash}"]`).count());
    pass("F61");
    await page.keyboard.press("Escape");await page.waitForTimeout(400);
    const brand=await page.locator(".rxs-brand").getAttribute("aria-label");assert.ok(brand.includes("REXONANCE"));
    const select=page.locator(".rxs-comparison-selector select");assert.ok((await select.getAttribute("aria-label")).includes("比較する相手"));pass("F17");
    assert.equal(await page.getByRole("banner").count(),1);assert.equal(await page.getByRole("contentinfo").count(),1);pass("F111");
    await page.locator("#p14").evaluate(el=>el.scrollIntoView({behavior:"instant"}));
    await page.evaluate(()=>{window.__auditLive=document.querySelector(".rxs-p14-metrics");window.__auditCompare=document.querySelector(".rxs-comparison-metrics");});
    await page.getByRole("button",{name:"P2比",exact:true}).click();
    assert.equal(await page.evaluate(()=>window.__auditLive===document.querySelector(".rxs-p14-metrics")),true);
    const text=await page.locator(".rxs-p14-metrics article").first().innerText();assert.ok(text.includes("500%")&&text.includes("5.0倍 / +400%"));pass("F62");
    const thumb=page.locator(".rxs-p14-ios-thumb");
    if(await thumb.count()){
      await page.waitForTimeout(350);
      const p2=await thumb.evaluate(el=>({x:el.getBoundingClientRect().x,left:getComputedStyle(el).left,transition:getComputedStyle(el).transitionProperty}));
      await page.getByRole("button",{name:"P1比",exact:true}).click();await page.waitForTimeout(350);
      const p1=await thumb.evaluate(el=>({x:el.getBoundingClientRect().x,left:getComputedStyle(el).left}));
      assert.ok(p2.x>p1.x+100);assert.equal(p1.left,p2.left);assert.ok(!p2.transition.includes("left"));pass("F127");
    }
    await select.selectOption("extreme");assert.equal(await page.evaluate(()=>window.__auditCompare===document.querySelector(".rxs-comparison-metrics")),true);pass("F56");
    assert.ok((await page.locator(".rxs-processing-comparison").innerText()).includes("P14（Extreme tuning）"));pass("F63");
    assert.ok(await page.locator('.rxs-bars[role="img"]').count());pass("F109");
    await page.evaluate(()=>{
      window.__auditDrawer=[];
      document.querySelector('.rxe-form-comparison summary').addEventListener('click',()=>{
        const start=performance.now();const sample=()=>{const d=document.querySelector('.rxe-form-comparison');const s=d.querySelector('summary');window.__auditDrawer.push({ms:performance.now()-start,height:d.getBoundingClientRect().height-s.getBoundingClientRect().height});if(performance.now()-start<350)requestAnimationFrame(sample);};sample();
      },{once:true,capture:true});
    });
    await page.locator(".rxe-form-comparison summary").click();await page.waitForTimeout(400);
    r.drawerFrames=await page.evaluate(()=>window.__auditDrawer);
    if(await page.evaluate(()=>CSS.supports('interpolate-size','allow-keywords'))){assert.ok(new Set(r.drawerFrames.map(x=>Math.round(x.height))).size>4,JSON.stringify(r.drawerFrames));pass('F78');}
    await page.locator(".rxe-comparison-card button").nth(1).click();await page.waitForTimeout(1000);
    const selection=await page.evaluate(()=>{const a=document.querySelector('.rxs-stage-tabs [aria-selected="true"]').getBoundingClientRect();const l=document.querySelector('.rxs-stage-tabs .liquid-selection-lens').getBoundingClientRect();const p=document.querySelector('#rxs-stage-panel').getBoundingClientRect();return{error:Math.max(Math.abs(a.x-l.x),Math.abs(a.width-l.width)),top:p.top};});
    assert.ok(selection.error<1);pass("F57");assert.ok(selection.top>0&&selection.top<500);pass("F112");
    assert.equal(await page.locator('.rxe-comparison-card button[aria-pressed="true"]').innerText(),"マックスを表示中");pass("F110");
    assert.equal(await page.locator("#rxs-stage-panel").getAttribute("aria-live"),null);pass("F107");
    for(const forcedColors of ["none","active"]){
      await page.emulateMedia({forcedColors});await page.keyboard.press("Tab");
      for(const selector of [".rxs-footer > a", ".rxs-p14-range-labels button"]){for(const el of await page.locator(selector).all()){
        await el.focus();const s=await el.evaluate(el=>({offset:getComputedStyle(el).outlineOffset,width:getComputedStyle(el).outlineWidth,visible:el.matches(':focus-visible')}));
        assert.equal(s.visible,true);assert.equal(s.width,"2px");assert.ok(parseFloat(s.offset)<0);
      }}
    }
    pass("F16");pass("F108");
    assert.equal(await page.evaluate(()=>getComputedStyle(document.body,"::before").display),"none");pass("F103");
    await page.emulateMedia({forcedColors:"none",reducedMotion:"reduce"});
    await page.getByRole("link",{name:"変身の資料を見る",exact:true}).waitFor();
    assert.ok(!(await page.locator("#assembly-replay").innerText()).includes("もう一度、装着を体験"));pass("F115");
    if(width===390){
      await page.emulateMedia({reducedMotion:"no-preference"});
      await page.locator("#assembly-runway").evaluate(el=>scrollTo({top:el.getBoundingClientRect().top+scrollY+(el.offsetHeight-innerHeight)*.45,behavior:"instant"}));await page.waitForTimeout(700);
      await page.setViewportSize({width:844,height:390});await page.waitForTimeout(900);
      r.orientation=await page.locator("#assembly-runway").evaluate(el=>-el.getBoundingClientRect().top/(el.offsetHeight-innerHeight));
      assert.ok(Math.abs(r.orientation-.45)<.015);pass("F58");
      await page.locator('#p14').evaluate(el=>{const start=el.getBoundingClientRect().top+scrollY;const end=document.querySelector('#assembly').getBoundingClientRect().top+scrollY;scrollTo({top:start+(end-start)*.45,behavior:'instant'});});await page.waitForTimeout(500);
      await page.setViewportSize({width:390,height:844});await page.waitForTimeout(900);
      r.readingOrientation=await page.locator('#p14').evaluate(el=>{const start=el.getBoundingClientRect().top+scrollY;const end=document.querySelector('#assembly').getBoundingClientRect().top+scrollY;return(scrollY-start)/(end-start);});
      assert.ok(Math.abs(r.readingOrientation-.45)<.015);
    }
    assert.deepEqual(errors,[]);r.errors=errors;results.push(r);console.log(JSON.stringify(r));await page.close();
  }
} finally {await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
