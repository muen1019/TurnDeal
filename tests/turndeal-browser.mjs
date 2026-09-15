// Actual UI + isolated SQLite + local ACP test merchant. No paid LLM or real payment.
import {chromium} from '../frontend/node_modules/playwright/index.mjs';
import {createRuntimeApp} from '../backend/runtime/app.mjs';
import {once} from 'node:events';
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const app=createRuntimeApp(),server=app.listen(0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`;
const ui=process.env.TEST_UI_ORIGIN??'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,channel:'msedge'});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
let loseComplete=true,holdProgress=false,held=null;const completeKeys=[];
await page.route(ui+'/api/**',async route=>{
 const req=route.request(),url=new URL(req.url());
 if(holdProgress&&held&&req.method()==='GET'&&url.pathname===`/api/requests/${held.request_id}`){await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(held)});return;}
 const response=await fetch(origin+url.pathname+url.search,{method:req.method(),headers:{'Content-Type':'application/json','Idempotency-Key':req.headers()['idempotency-key']??''},...(req.postData()?{body:req.postData()}: {})});
 if(url.pathname.endsWith('/complete')){completeKeys.push(req.headers()['idempotency-key']);if(loseComplete){loseComplete=false;await route.abort('failed');return;}}
 const text=await response.text();if(holdProgress&&req.method()==='POST'&&url.pathname==='/api/requests')held=JSON.parse(text);
 await route.fulfill({status:response.status,contentType:'application/json',body:text});
});
const out='frontend/test-results/turndeal';mkdirSync(out,{recursive:true});
try{
 await page.goto(ui+'/chat');assert.match(await page.title(),/TurnDeal/);
 await page.getByRole('textbox',{name:/名稱/}).fill('測試買家');await page.getByRole('textbox',{name:'電子郵件',exact:true}).fill('buyer@example.test');await page.getByRole('combobox',{name:'縣市',exact:true}).selectOption('臺北市');await page.getByRole('combobox',{name:'鄉鎮市區',exact:true}).selectOption('中正區');await page.getByRole('textbox',{name:'街道、門牌與樓層',exact:true}).fill('測試路 1 號');await page.getByRole('button',{name:/下一步/}).click();await page.getByRole('button',{name:/儲存並開始/}).click();
 assert.equal(await page.getByRole('combobox',{name:'新需求使用的模型'}).inputValue(),'gpt-5.6-sol');
 await page.getByRole('combobox',{name:'新需求使用的模型'}).selectOption('gpt-4.1-mini');
 await page.screenshot({path:`${out}/01-home.png`,fullPage:true});
 await page.getByRole('textbox',{name:'輸入購物需求'}).fill('買無線滑鼠，含運最高預算1000元，7天內到貨');await page.getByRole('button',{name:'送出需求'}).click();
 await page.getByRole('heading',{name:'為你找到的優惠'}).waitFor();
 assert.ok(await page.locator('.product-color').count());assert.ok(!(await page.locator('.product-color').first().innerText()).includes('未提供'));
 const requestId=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('offermesh:demo-buyer:workspace:v1')).conversations[0].requestId);
 const parent=await requestId();const snapshot=app.locals.store.snapshot(parent,'demo_buyer');
 assert.equal(snapshot.model,'gpt-4.1-mini');
 for(let i=0;i<snapshot.ranked_offers.length;i++)await page.getByRole('button',{name:/略過/}).first().click();
 await page.getByRole('textbox',{name:'回饋內容'}).fill('不太符合我的需要');await page.getByRole('button',{name:'送出回饋',exact:true}).click();
 await page.getByRole('textbox',{name:'完整說明這次想調整的條件'}).waitFor();
 assert.equal(app.locals.store.db.prepare('SELECT count(*) n FROM requests WHERE parent_request_id=?').get(parent).n,0);
 await page.screenshot({path:`${out}/02-improver.png`,fullPage:true});
 await page.getByRole('textbox',{name:'完整說明這次想調整的條件'}).fill('這次預算改成 800 元。');await page.getByRole('button',{name:'更新需求並重新篩選'}).click();
 await page.getByRole('button',{name:'查看新一輪結果'}).waitFor();await page.reload();await page.getByRole('button',{name:'查看新一輪結果'}).click();
 await page.getByRole('heading',{name:'為你找到的優惠'}).waitFor();
 const child=await requestId();assert.notEqual(child,parent);assert.equal(app.locals.store.snapshot(child,'demo_buyer').intent.max_total_twd,800);
 assert.equal(app.locals.store.snapshot(child,'demo_buyer').model,'gpt-4.1-mini');
 assert.equal(app.locals.store.db.prepare('SELECT count(*) n FROM requests WHERE parent_request_id=?').get(parent).n,1);
 await page.getByRole('button',{name:/略過/}).first().click();
 await page.getByRole('button',{name:'立即採用',exact:true}).click();
 await page.getByRole('button',{name:'前往測試結帳'}).click();
 await page.getByRole('textbox',{name:'收件人姓名',exact:true}).fill('測試買家');
 await page.getByRole('textbox',{name:'電子郵件',exact:true}).fill('buyer@example.test');
 await page.getByRole('textbox',{name:'街道、門牌與樓層',exact:true}).fill('測試路 1 號');
 await page.getByRole('combobox',{name:'縣市',exact:true}).selectOption('臺北市');
 await page.getByRole('combobox',{name:'鄉鎮市區',exact:true}).selectOption('中正區');

 await page.getByRole('button',{name:'儲存並確認資料'}).click();await page.getByRole('button',{name:/確認測試購買 ·/}).waitFor();
 await page.screenshot({path:`${out}/03-checkout.png`,fullPage:true});
 await page.getByRole('button',{name:/確認測試購買 ·/}).click();await page.getByRole('button',{name:'核對原購買操作'}).waitFor();
 await page.reload();await page.getByRole('button',{name:'核對原購買操作'}).click();
 await page.getByRole('heading',{name:'測試購買完成'}).waitFor();
 assert.equal(completeKeys.length,2);assert.equal(completeKeys[0],completeKeys[1]);
 assert.equal(app.locals.store.db.prepare('SELECT count(*) n FROM purchases').get().n,1);
 const purchase=app.locals.store.db.prepare('SELECT data_json FROM purchases').get();assert.equal(JSON.parse(purchase.data_json).status,'completed');
 await page.screenshot({path:`${out}/04-receipt.png`,fullPage:true});
 await page.getByRole('button',{name:'切換導覽'}).click();await page.getByRole('button',{name:'新對話',exact:true}).click();await page.getByRole('button',{name:'切換導覽'}).click();
 const deleteButtons=page.getByRole('button',{name:/刪除對話：/});await deleteButtons.last().click();await page.getByRole('button',{name:'取消',exact:true}).click();
 await deleteButtons.last().click();await page.getByRole('button',{name:'確認刪除',exact:true}).click();
 await page.getByRole('button',{name:'清除全部歷史紀錄'}).click();await page.getByRole('button',{name:'確認清除全部',exact:true}).click();
 await page.reload();assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('offermesh:demo-buyer:workspace:v1')).conversations.length),1);
 holdProgress=true;
 await page.getByRole('textbox',{name:'輸入購物需求'}).fill('買無線滑鼠，最高預算1000元，7天內到貨');await page.getByRole('button',{name:'送出需求'}).click();
 await page.getByRole('progressbar').waitFor();await page.waitForTimeout(500);
 assert.ok(!(await page.locator('body').innerText()).includes('你慢慢挑'));
 assert.equal(await page.locator('.journey-track i').evaluate(e=>getComputedStyle(e).animationName),'deal-stream');
 await page.screenshot({path:`${out}/05-progress.png`,fullPage:true});
 for(const width of [320,430,1440]){await page.setViewportSize({width,height:844});await page.waitForTimeout(150);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,paidCalls:0,realPayments:0,flow:'full improver clarification → unique child → color → accept → checkout → lost response → reload → same-key recovery → receipt'}));
}catch(e){console.log((await page.locator('body').innerText()).slice(0,3500));console.log(app.locals.store.db.prepare('SELECT status,result_json FROM improver_jobs').all().map(r=>({status:r.status,result:JSON.parse(r.result_json??'null')})));await page.screenshot({path:`${out}/failure.png`,fullPage:true});throw e;}
finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await app.locals.store.close();}
