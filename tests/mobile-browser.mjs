import {chromium} from '../frontend/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const base=process.env.OFFERMESH_MOBILE_URL??'http://127.0.0.1:5174';
const out=new URL('../frontend/test-results/mobile/',import.meta.url);mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.setDefaultTimeout(15000);
const shot=async name=>{await page.waitForTimeout(550);await page.screenshot({path:fileURLToPath(new URL(name+'.png',out)),fullPage:true});};
const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight),'document overflow');
try {
  await page.goto(base+'/chat');await page.getByRole('button',{name:/以訪客身份繼續/}).click();
  await page.getByRole('textbox').first().waitFor();
  if(await page.getByRole('heading',{name:'先認識一下你'}).count()){
    await page.getByRole('textbox',{name:/名稱/}).fill('Demo Buyer');
    await page.getByRole('button',{name:/下一步/}).click();
    await page.getByRole('button',{name:/儲存並開始/}).click();
  }
  await page.getByRole('textbox',{name:'輸入購物需求'}).waitFor();
  assert.equal(await page.getByText('說說你想買什麼。').count(),0);
  await shot('01-home');await noOverflow();
  for(const [width,height] of [[320,568],[430,932],[390,844]]){
    await page.setViewportSize({width,height});await noOverflow();
    await page.getByRole('textbox',{name:'輸入購物需求'}).fill('買無線滑鼠，預算1000元，7天內到貨。');
    assert.ok(await page.getByRole('button',{name:'送出需求'}).isEnabled());
    if(width===320)await shot('00-small');
  }
  const creating=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/requests'));
  await page.getByRole('button',{name:'送出需求'}).click();
  const created=await (await creating).json();
  await page.getByRole('progressbar').waitFor();
  assert.equal(await page.getByRole('textbox',{name:'輸入購物需求'}).count(),0);
  await page.waitForFunction(()=>document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')==='60');
  await shot('02-progress');await noOverflow();
  await page.getByRole('heading',{name:'為你找到的優惠'}).waitFor({timeout:20000});
  assert.ok(page.url().includes('/requests/'));
  await shot('03-offers');await noOverflow();
  const first=await page.getByTestId('offer-card-shell').locator('h3').textContent();
  const box=await page.getByTestId('offer-card-shell').boundingBox();
  await page.mouse.move(box.x+box.width*.7,box.y+75);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.3,box.y+76,{steps:18});await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector('.offer-deck__header p')?.textContent?.includes('2 /'));
  await page.getByRole('button',{name:'撤回略過',exact:true}).click();
  assert.equal(await page.getByTestId('offer-card-shell').locator('h3').textContent(),first);
  // Real touch events exercise pan-y arbitration, not only mouse emulation.
  const cdp=await page.context().newCDPSession(page);
  await page.waitForTimeout(400);
  await page.evaluate(()=>{globalThis.__touchLog=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])document.addEventListener(type,e=>globalThis.__touchLog.push({type,x:e.clientX,y:e.clientY,target:e.target.tagName}),{capture:true});});
  const touchBox=await page.getByTestId('offer-card-shell').boundingBox();
  const start={x:touchBox.x+touchBox.width*.75,y:touchBox.y+70};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
  for(let step=1;step<=12;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x-touchBox.width*.45*step/12,y:start.y+1}]});await page.waitForTimeout(20);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>document.querySelector('.offer-deck__header p')?.textContent?.includes('2 /')).catch(async e=>{console.log(await page.evaluate(()=>globalThis.__touchLog));throw e;});
  await page.getByRole('button',{name:'撤回略過',exact:true}).click();
  for(const [width,height] of [[320,568],[430,932],[390,844]]) {
    await page.setViewportSize({width,height});await noOverflow();
    const button=page.getByRole('button',{name:'立即採用',exact:true});await button.scrollIntoViewIfNeeded();
    const bounds=await button.boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=height+1);
    if(width===320)await shot('05-small-offers');
  }
  // Returning to the conversation must not auto-redirect a historical ready result.
  await page.getByRole('button',{name:'返回對話',exact:true}).click();
  await page.getByRole('button',{name:'查看推薦',exact:true}).waitFor();
  await page.getByRole('button',{name:'查看推薦',exact:true}).click();
  await page.getByRole('button',{name:'立即採用',exact:true}).click();
  await page.getByText('決策已保存；尚未購買或付款。',{exact:true}).waitFor();
  const saved=await(await page.request.get(base+'/api/requests/'+created.request_id)).json();assert.equal(saved.status,'accepted');
  await shot('04-accepted');await noOverflow();
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'開始新的購物需求',exact:true}).click();
  assert.equal(await page.locator('.mobile-screen-enter').evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('textbox',{name:'輸入購物需求'}).waitFor();await noOverflow();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,request_id:created.request_id,widths:[320,390,430,1440],flow:'prompt -> progress -> auto results -> drag skip -> undo -> return -> accept',screenshots:fileURLToPath(out)}));
} finally {await browser.close();}
