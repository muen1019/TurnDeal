// Full mobile UX with a fresh isolated SQLite and no paid model calls.
import {chromium} from '../frontend/node_modules/playwright/index.mjs';
import {createRuntimeApp} from '../backend/runtime/app.mjs';
import {once} from 'node:events';
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const app=createRuntimeApp(),server=app.listen(0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,channel:'msedge'});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
await page.route('http://127.0.0.1:5173/api/**',async route=>{
 const req=route.request(),url=new URL(req.url());
 const response=await fetch(origin+url.pathname+url.search,{method:req.method(),headers:{'Content-Type':'application/json','Idempotency-Key':req.headers()['idempotency-key']??''},...(req.postData()?{body:req.postData()}: {})});
 await route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
});
const out='frontend/test-results/history-refinement';mkdirSync(out,{recursive:true});
try{
 await page.goto('http://127.0.0.1:5173/chat');await page.getByRole('textbox',{name:/名稱/}).fill('UI Test');
 await page.getByRole('button',{name:/下一步/}).click();await page.getByRole('button',{name:/儲存並開始/}).click();
 await page.getByRole('textbox',{name:'輸入購物需求'}).fill('1000元滑鼠');await page.getByRole('button',{name:'送出需求'}).click();
 await page.getByRole('heading',{name:'再確認一下',exact:true}).waitFor();
 assert.equal(await page.locator('.clarification-question').count(),2);
 assert.ok(!(await page.locator('body').innerText()).includes('尚未理解'));
 await page.getByRole('button',{name:'NT$1,000 以內',exact:true}).click();await page.getByRole('button',{name:'7 天內',exact:true}).click();
 await page.getByRole('button',{name:'繼續',exact:true}).click();await page.getByRole('heading',{name:'為你找到的優惠'}).waitFor();
 const before=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('offermesh:demo-buyer:workspace:v1')).conversations[0].requestId);
 const parent=app.locals.store.snapshot(before,'demo_buyer');
 // Use the accessible skip control for each card; pointer swipe is covered by mobile-browser.
 for(let i=0;i<parent.ranked_offers.length;i++)await page.getByRole('button',{name:/略過.*方案|略過此方案|略過/}).first().click();
 await page.getByRole('textbox',{name:'回饋內容'}).fill('太貴，希望價格優先');await page.getByRole('button',{name:'送出回饋',exact:true}).click();
 await page.getByRole('heading',{name:'再確認一下',exact:true}).waitFor();
 await page.waitForTimeout(500);await page.screenshot({path:`${out}/02-refinement.png`,fullPage:true});
 await page.getByRole('button',{name:'便宜優先',exact:true}).click();await page.getByRole('button',{name:'維持其他條件',exact:true}).click();
 await page.reload();await page.getByRole('heading',{name:'再確認一下',exact:true}).waitFor();
 assert.equal(await page.locator('.clarification-question textarea').first().inputValue(),'價格優先');
 await page.getByRole('button',{name:'繼續',exact:true}).click();await page.getByRole('heading',{name:'為你找到的優惠'}).waitFor();
 const after=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('offermesh:demo-buyer:workspace:v1')).conversations[0].requestId);
 assert.notEqual(before,after);assert.equal(app.locals.store.snapshot(before,'demo_buyer').status,'rejected');assert.equal(app.locals.store.snapshot(after,'demo_buyer').intent.max_total_twd,1000);
 await page.getByRole('button',{name:'開始新對話',exact:true}).click();
 await page.getByRole('button',{name:'切換導覽'}).click();await page.waitForTimeout(400);
 assert.equal(await page.locator('.chat-main-slot').evaluate(el=>el.inert),true);
 await page.screenshot({path:`${out}/01-drawer.png`,fullPage:true});
 const drawer=await page.locator('#history-sidebar').boundingBox();assert.ok(drawer.x>=0&&drawer.width<390);
 await page.keyboard.press('Escape');await page.waitForTimeout(350);assert.equal(await page.getByRole('button',{name:'切換導覽'}).evaluate(el=>el===document.activeElement),true);
 await page.getByRole('button',{name:'切換導覽'}).click();
 await page.getByRole('button',{name:'刪除對話：1000元滑鼠',exact:true}).click();await page.getByRole('button',{name:'取消',exact:true}).click();
 await page.getByRole('button',{name:'刪除對話：1000元滑鼠',exact:true}).click();await page.getByRole('button',{name:'確認刪除',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'刪除對話：1000元滑鼠',exact:true}).count(),0);
 assert.equal(app.locals.store.snapshot(after,'demo_buyer').status,'awaiting_user');
 await page.getByRole('button',{name:'關閉歷史紀錄'}).click();await page.reload();
 for(const width of [320,430,1440]){await page.setViewportSize({width,height:844});await page.waitForTimeout(200);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,paidCalls:0,flow:'price clarification → offers → reject → questions → reload → refined offers → drawer → delete history'}));
}catch(error){console.log('UI', (await page.locator('body').innerText()).slice(0,2800));console.log(errors);await page.screenshot({path:`${out}/failure.png`,fullPage:true});throw error;}
finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await app.locals.store.close();}
