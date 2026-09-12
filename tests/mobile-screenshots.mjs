// Real LAN-demo API, synthetic data only. Run npm run dev:mobile first.
import {chromium} from '../frontend/node_modules/playwright/index.mjs';
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const origin=process.env.TEST_UI_ORIGIN??'http://127.0.0.1:5174';
const out='docs/screenshots/mobile';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage();page.setDefaultTimeout(30000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const shot=async name=>{await page.waitForTimeout(300);await page.screenshot({path:out+'/'+name+'.png'});};
try{
 await page.goto(origin+'/chat');
 await page.getByRole('textbox',{name:/名稱/}).fill('Demo Buyer');
 for(const [label,value] of [['電子郵件','buyer@example.test'],['城市／縣市','台北市'],['區域','中正區'],['郵遞區號','100'],['運送地址','測試路 1 號（虛構地址）']])
  await page.getByRole('textbox',{name:new RegExp(label)}).fill(value);
 await page.getByRole('heading',{name:'先認識一下你'}).scrollIntoViewIfNeeded();await shot('01-settings');
 await page.getByRole('textbox',{name:/運送地址/}).scrollIntoViewIfNeeded();await shot('02-shipping');
 await page.getByRole('button',{name:/下一步/}).click();await shot('03-preferences');
 await page.getByRole('button',{name:/儲存並開始/}).click();await page.getByRole('textbox',{name:'輸入購物需求'}).waitFor();await shot('04-home');
 const response=await context.request.get(origin+'/api/buyer-profile');assert.equal((await response.json()).profile.shipping_details.email,'buyer@example.test');
 const other=await browser.newContext();assert.equal((await (await other.request.get(origin+'/api/buyer-profile')).json()).profile,null);await other.close();
 await page.getByRole('textbox',{name:'輸入購物需求'}).fill('買無線滑鼠，含運最高預算1000元，7天內到貨');
 await page.getByRole('button',{name:'送出需求'}).click();
 await page.getByRole('heading',{name:'為你找到的優惠'}).waitFor();await shot('06-products');
 await page.getByRole('button',{name:'立即採用',exact:true}).click();
 await page.getByRole('button',{name:'前往測試結帳'}).click();
 assert.equal(await page.getByRole('textbox',{name:'電子郵件',exact:true}).inputValue(),'buyer@example.test');
 assert.equal(await page.getByRole('textbox',{name:'街道地址',exact:true}).inputValue(),'測試路 1 號（虛構地址）');
 assert.equal(await page.getByRole('textbox',{name:'城市／縣市',exact:true}).inputValue(),'台北市');
 await page.locator('.commerce-panel').evaluate(el=>el.scrollIntoView({block:'start'}));await shot('07-checkout-address');
 await page.getByRole('button',{name:'儲存並確認資料'}).click();
 await page.getByRole('button',{name:/確認測試購買 ·/}).scrollIntoViewIfNeeded();await shot('08-checkout-confirm');
 await page.getByRole('button',{name:/確認測試購買 ·/}).click();
 await page.getByRole('heading',{name:'測試購買完成'}).waitFor();
 await page.locator('.purchase-receipt').scrollIntoViewIfNeeded();await shot('09-receipt');
 await page.reload();await page.getByRole('heading',{name:'測試購買完成'}).waitFor();
 await page.getByRole('button',{name:'切換導覽'}).click();await shot('10-history');
 // Capture the real progress UI with polling held on its initial server snapshot.
 await page.getByRole('button',{name:'關閉歷史紀錄'}).click();
 await page.getByRole('button',{name:'開始新對話',exact:true}).click();
 let held;
 await page.route(origin+'/api/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(held&&req.method()==='GET'&&url.pathname==='/api/requests/'+held.request_id){await route.fulfill({json:held});return;}
  const response=await route.fetch();
  if(req.method()==='POST'&&url.pathname==='/api/requests')held=await response.json();
  await route.fulfill({response});
 });
 await page.getByRole('textbox',{name:'輸入購物需求'}).fill('買無線滑鼠，含運最高預算1000元，7天內到貨');
 await page.getByRole('button',{name:'送出需求'}).click();await page.getByRole('progressbar').waitFor();await shot('05-progress');
 for(const width of [320,390,430]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 const forbidden=await context.request.get(origin+'/@fs/'+process.cwd().replaceAll('\\','/')+'/data/app.sqlite');assert.equal(forbidden.status(),403);
 assert.deepEqual(errors,[]);
 console.log('PASS: mobile settings → preferences → products → prefilled checkout → explicit simulated payment → receipt reload; browser isolation; private DB denied. Screenshots: '+out);
}catch(error){console.error((await page.locator('body').innerText()).slice(0,3000));throw error;}finally{await browser.close();}
