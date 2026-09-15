// Isolated in-memory backend. This test never changes the user's profile or calls a paid model.
import {chromium} from '../frontend/node_modules/playwright/index.mjs';
import {createRuntimeApp} from '../backend/runtime/app.mjs';
import {once} from 'node:events';
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const app=createRuntimeApp(),server=app.listen(0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,channel:'msedge'});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
await page.route('http://127.0.0.1:5173/api/**',async route=>{
 const req=route.request(),url=new URL(req.url());
 const response=await fetch(origin+url.pathname+url.search,{method:req.method(),headers:{'Content-Type':'application/json','Idempotency-Key':req.headers()['idempotency-key']??''},...(req.postData()?{body:req.postData()}: {})});
 await route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
});
const out='frontend/test-results/buyer-setup';mkdirSync(out,{recursive:true});
const shot=async name=>{await page.waitForTimeout(500);await page.screenshot({path:`${out}/${name}.png`,fullPage:true});};
try{
 await page.goto('http://127.0.0.1:5173/chat');await page.getByRole('button',{name:/以訪客身份繼續/}).click();await page.getByRole('heading',{name:'先認識一下你'}).waitFor();await shot('01-profile');
 await page.getByRole('textbox',{name:/名稱/}).fill('Demo Buyer');await page.getByRole('textbox',{name:/運送地址/}).fill('示範城市・測試路 1 號');
 await page.getByRole('combobox',{name:'偏好付款方式'}).selectOption('mobile');
 await page.getByRole('button',{name:/下一步/}).click();
 assert.equal(await page.getByRole('slider').count(),4);
 await page.getByRole('slider',{name:/價格/}).fill('70');await page.getByRole('button',{name:'墨黑'}).click();
 await page.locator('.setup-container').evaluate(el=>el.scrollTop=0);await shot('02-preferences');
 await page.getByRole('button',{name:/儲存並開始/}).click();await page.getByRole('textbox',{name:'輸入購物需求'}).waitFor();await shot('03-home');
 const stored=(await(await fetch(origin+'/api/buyer-profile')).json()).profile;
 assert.equal(stored.name,'Demo Buyer');assert.equal(stored.weights.price,70);assert.deepEqual(stored.colors,['black']);
 assert.ok(!(await page.evaluate(()=>JSON.stringify(sessionStorage))).includes('測試路'));
 await page.reload();await page.getByRole('textbox',{name:'輸入購物需求'}).waitFor();
 for(const [width,height] of [[320,568],[430,932],[1440,1000],[390,844]]){
  await page.setViewportSize({width,height});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  if(width===320)await shot('04-small');if(width===1440)await shot('05-desktop');
 }
 await page.getByRole('button',{name:'開啟設定',exact:true}).click();await page.getByRole('heading',{name:'先認識一下你'}).waitFor();
 assert.equal(await page.getByRole('textbox',{name:/名稱/}).inputValue(),'Demo Buyer');
 await page.getByRole('button',{name:'關閉',exact:true}).click();
 await page.getByRole('textbox',{name:'輸入購物需求'}).fill('買無線滑鼠，預算1000元，7天內到貨');
 const posted=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/requests'));
 await page.getByRole('button',{name:'送出需求'}).click();const initial=await(await posted).json();
 await page.getByRole('heading',{name:'為你找到的優惠'}).waitFor({timeout:40000});await shot('06-results');
 const result=app.locals.store.snapshot(initial.request_id,'demo_buyer');
 assert.equal(result.intent.ranking_weights.price,70);assert.equal(result.status,'awaiting_user');assert.ok(!JSON.stringify(result).includes('測試路'));
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,isolated:true,paidCalls:0,flow:'basic details -> weights -> saved SQLite -> reload -> blue home -> weighted results',offers:result.ranked_offers.length}));
}catch(error){console.log('Browser errors:',errors);console.log('Rendered UI:',(await page.locator('body').innerText()).slice(0,3500));await shot('failure');throw error;}
finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await app.locals.store.close();}
