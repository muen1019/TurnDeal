import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { revalidateOffers } from '../../../src/evaluator/validation.mjs';
import { HttpError } from '../../src/httpError.ts';
import { createMerchant,quoteFor } from './merchant.mjs';
import { amount,authenticate,decode,equal,fail,hash,headers,json,secret,token,validateKey } from './common.mjs';
import { validate,valid } from './contracts.mjs';

const terminal=['completed','canceled','expired','blocked'];
export class PurchaseService {
  running=new Map();server=null;closing=false;
  constructor(store,{mode='test',fetchImpl=fetch,timeoutMs=3000}={}){
    if(mode!=='test')fail(503,'live_checkout_not_configured','正式購買尚未配置');
    this.store=store;this.db=store.db;this.fetch=fetchImpl;this.timeoutMs=timeoutMs;
    this.signingKey=secret(this.db,'purchase-confirmation');
    this.timer=setInterval(()=>{void this.recover();},1000);this.timer.unref();
  }
  load(id,buyer){const r=this.db.prepare('SELECT * FROM purchases WHERE purchase_id=?').get(id);if(!r||(buyer&&r.user_id!==buyer))fail(404,'not_found');return JSON.parse(r.data_json);}
  save(p){this.db.prepare('UPDATE purchases SET status=?,data_json=? WHERE purchase_id=?').run(p.status,json(p),p.purchase_id);}
  find(request,buyer){this.store.snapshot(request,buyer);const r=this.db.prepare('SELECT purchase_id FROM purchases WHERE request_id=? AND user_id=?').get(request,buyer);if(!r)fail(404,'not_found');return this.get(r.purchase_id,buyer);}
  revalidate(id){
    const p=this.load(id),s=this.store.snapshot(p.request_id,p.user_id),o=p.offer;
    if(s.status!=='accepted'||s.selected_offer_id!==o.offer_id||json(s.offers.find(x=>x.offer_id===o.offer_id))!==json(o))fail(409,'offer_changed');
    if(Date.parse(o.expires_at)<=this.store.now())fail(410,'offer_expired');
    const source=JSON.parse(this.db.prepare('SELECT input_json FROM negotiation_runs WHERE request_id=?').get(p.request_id).input_json);
    const eligible=revalidateOffers({offers:s.offers,intent:s.intent,catalog:this.store.repository.catalog(source.orchestration.seller_agents.map(x=>x.seller_id)),originalCatalog:source.catalog,orchestration:source.orchestration,now:this.store.now()});
    const r=this.db.prepare('SELECT * FROM offers WHERE offer_id=?').get(o.offer_id);
    if(!eligible.some(x=>x.offer_id===o.offer_id)||!r||r.total_price_twd!==o.total_price_twd||json(JSON.parse(r.items_json))!==json(o.items)||r.terms_id!==o.terms_id||r.delivery_days!==o.delivery_days||r.expires_at!==o.expires_at)fail(409,'offer_changed');
  }
  view(p){
    const c=p.acp,checkout=c?{currency:'twd',amount_minor:amount(p.offer),total_price_twd:p.offer.total_price_twd,line_items:c.line_items,buyer:p.buyer??null,fulfillment_address:p.address??null,fulfillment_options:c.fulfillment_options,fulfillment_option_id:c.selected_fulfillment_options?.[0]?.shipping?.option_id??null,terms:p.offer.terms_id}:null;
    const v={purchase_id:p.purchase_id,request_id:p.request_id,offer_id:p.offer.offer_id,seller_id:p.offer.seller_id,mode:'test',payment_execution:'simulated',status:p.status,checkout_session_id:c?.id??null,checkout_revision:p.revision,expires_at:p.offer.expires_at,offer:p.offer,checkout,order:p.order??null,error:p.error??null,allowed_actions:p.status==='ready'?['update','complete','cancel','get']:p.status==='needs_input'?['update','cancel','get']:['get']};
    if(p.status==='ready'){v.confirmation_expires_at=new Date(Math.min(Date.parse(p.offer.expires_at),p.confirmationExpires)).toISOString();this.addConfirmation(v,p.user_id);}
    validate('PurchaseView',v);return v;
  }
  addConfirmation(v,buyer){if(v.status==='ready')v.confirmation_token=token(this.signingKey,{purchase:v.purchase_id,buyer,revision:v.checkout_revision,cart:hash(v.checkout),expires:Date.parse(v.confirmation_expires_at)});return v;}
  get(id,buyer){let p=this.load(id,buyer);if(['ready','needs_input'].includes(p.status)){
    try{this.revalidate(id);if(p.status==='ready'&&p.confirmationExpires<=this.store.now()){p.confirmationExpires=Math.min(this.store.now()+300000,Date.parse(p.offer.expires_at));this.save(p);}}
    catch(e){p.status=e.status===410?'expired':'blocked';p.error={code:e.code,message:e.message,fields:[]};this.save(p);}
  }if(p.status==='reconciling')void this.recover();return this.view(p);}
  async transport(seller,method,path,body,id){
    if(method!=='GET')validate(path.endsWith('/complete')?'CheckoutSessionCompleteRequest':path.endsWith('/cancel')?'CancelSessionRequest':path==='/checkout_sessions'?'CheckoutSessionCreateRequest':'CheckoutSessionUpdateRequest',body,true);
    await this.start();const route=`/merchants/${encodeURIComponent(seller)}${path}`,raw=method==='GET'?'':json(body);
    const r=await this.fetch(this.base+route,{method,headers:headers(secret(this.db,`merchant-sign:${seller}`),secret(this.db,`merchant-auth:${seller}`),method,route,raw,this.store.now(),id),...(method==='GET'?{}:{body:raw}),signal:AbortSignal.timeout(this.timeoutMs),redirect:'error'});
    const data=await r.json();
    if(!r.ok){if(valid('Error',data,true))throw new HttpError(r.status,data.code,data.message);throw new Error('invalid_merchant_error');}
    validate(data.order?'CheckoutSessionWithOrder':'CheckoutSession',data,true);return data;
  }
  async start(){if(this.starting)return this.starting;this.starting=(async()=>{
    const merchant=createMerchant(this.store,id=>this.revalidate(id));
    merchant.post('/api/integrations/acp/merchants/:seller/events',(req,res)=>{try{this.receiveEvent(req);res.json({received:true});}catch(e){res.status(e.status??400).json({error:{code:e.code??'invalid_request',message:e.message,fields:[]}});}});
    this.server=merchant.listen(0,'127.0.0.1');await once(this.server,'listening');this.base=`http://127.0.0.1:${this.server.address().port}`;
  })();return this.starting;}
  checkCart(p,c){
    const q=p.quote;
    if(c.id!==p.acp?.id&&p.acp)fail(502,'invalid_acp_response');
    for(const field of ['line_items','totals','fulfillment_options','links'])if(json(c[field])!==json(q[field]))fail(409,'offer_changed');
    if(c.currency!=='twd'||c.payment_provider?.provider!=='stripe')fail(409,'offer_changed');
    if(p.buyer&&json(c.buyer)!==json(this.wireBuyer(p.buyer)))fail(409,'offer_changed');
    if(p.address){const {phone_number,...address}=p.address;if(json(c.fulfillment_details?.address)!==json(address))fail(409,'offer_changed');}
    if(p.selection&&json(c.selected_fulfillment_options)!==json([{type:'shipping',shipping:{option_id:p.selection,item_ids:q.items.map(x=>x.id)}}]))fail(409,'offer_changed');
    if(c.status==='completed'&&(!c.order||c.order.checkout_session_id!==c.id))fail(502,'invalid_acp_response');
  }
  wireBuyer(b){return {first_name:b.name,last_name:'',email:b.email,...(b.phone_number?{phone_number:b.phone_number}:{})};}
  begin(p,action,body){const id=`operation_${randomUUID()}`;
    this.db.prepare('INSERT INTO purchase_operations(operation_id,purchase_id,action,body_json,state) VALUES(?,?,?,?,?)').run(id,p.purchase_id,action,json(body),'pending');
    p.status=action==='create'?'creating':'submitting';p.error=null;this.save(p);return id;
  }
  async mutate(buyer,route,key,body,action,id){
    if(typeof buyer!=='string'||!buyer)fail(401,'authentication_required');validateKey(key);
    validate(action==='update'?'CheckoutUpdate':action==='complete'?'PurchaseComplete':'Empty',body);
    const prior=this.db.prepare('SELECT * FROM purchase_http_keys WHERE user_id=? AND route=? AND key=?').get(buyer,route,key);
    if(prior){if(prior.hash!==hash(body))fail(409,'idempotency_conflict');if(prior.response_json)return {status:prior.status,body:this.addConfirmation(JSON.parse(prior.response_json),buyer)};return {status:202,body:this.get(prior.purchase_id,buyer)};}
    const planned=this.store.transaction(()=>{
      let p;
      if(action==='create'){
        const s=this.store.snapshot(id,buyer);if(s.status!=='accepted')fail(409,'offer_not_accepted');
        const existing=this.db.prepare('SELECT purchase_id FROM purchases WHERE request_id=?').get(id);
        if(existing){p=this.load(existing.purchase_id,buyer);return {p,status:200};}
        const offer=s.offers.find(x=>x.offer_id===s.selected_offer_id),decision=this.db.prepare('SELECT decision_id FROM decisions WHERE request_id=? AND action=?').get(id,'accept');
        p={purchase_id:`purchase_${randomUUID()}`,request_id:id,user_id:buyer,offer,status:'creating',revision:0,acp:null};
        p.quote=quoteFor(p,this.store.now());
        this.db.prepare('INSERT INTO purchases VALUES(?,?,?,?,?,?,?,?)').run(p.purchase_id,id,decision.decision_id,buyer,offer.seller_id,offer.offer_id,p.status,json(p));this.revalidate(p.purchase_id);
        this.db.prepare('INSERT INTO merchant_quotes VALUES(?,?,?)').run(p.purchase_id,offer.seller_id,json(p.quote));
        for(const item of offer.items){const stock=this.db.prepare('SELECT stock FROM seller_inventory WHERE seller_id=? AND product_id=?').get(offer.seller_id,item.product_id)?.stock??0;this.db.prepare('INSERT OR IGNORE INTO merchant_inventory VALUES(?,?,?)').run(offer.seller_id,item.product_id,stock);}
      }else p=this.load(id,buyer);
      if(action==='complete'&&p.status==='completed')return {p,status:200};
      if(action==='cancel'&&p.status==='canceled')return {p,status:200};
      if(action!=='create'&&['submitting','creating','reconciling'].includes(p.status)){if(action==='complete')return {p,status:202};fail(409,'purchase_in_progress');}
      if(action!=='create'&&terminal.includes(p.status))fail(p.status==='expired'?410:409,p.status==='expired'?'offer_expired':'state_conflict');
      let wire={};
      if(action==='create')wire={items:p.quote.items};
      if(action==='update'){
        this.revalidate(p.purchase_id);
        if(body.buyer){p.buyer=body.buyer;wire.buyer=this.wireBuyer(body.buyer);}
        if(body.fulfillment_address){p.address=body.fulfillment_address;const {phone_number,...address}=p.address;wire.fulfillment_details={address,...(phone_number?{phone_number}:{})};}
        if(body.fulfillment_option_id){p.selection=body.fulfillment_option_id;wire.selected_fulfillment_options=[{type:'shipping',shipping:{option_id:p.selection,item_ids:p.quote.items.map(x=>x.id)}}];}
        p.revision++;
      }
      if(action==='complete'){
        this.revalidate(p.purchase_id);if(p.status!=='ready')fail(422,'checkout_incomplete');
        const claims=decode(this.signingKey,body.confirmation_token),v=this.view(p);
        if(!claims||claims.buyer!==buyer||claims.purchase!==p.purchase_id||claims.revision!==p.revision||claims.cart!==hash(v.checkout)||claims.expires<=this.store.now())fail(409,'checkout_changed');
        p.confirmedAt=new Date(this.store.now()).toISOString();
        wire={claims:{seller:p.offer.seller_id,session:p.acp.id,amount:amount(p.offer),expires:Date.parse(p.offer.expires_at),cart:hash(p.acp)}};
      }
      const operation=this.begin(p,action,wire);
      this.db.prepare('INSERT INTO purchase_http_keys(user_id,route,key,hash,purchase_id) VALUES(?,?,?,?,?)').run(buyer,route,key,hash(body),p.purchase_id);
      return {p,operation,status:action==='create'?201:200};
    });
    if(planned.operation)await this.execute(planned.operation);
    const p=this.load(planned.p.purchase_id,buyer),view=this.view(p);
    const response={status:['creating','submitting','reconciling'].includes(p.status)?202:planned.status,body:view};
    if(p.lastFailure&&planned.operation&&p.lastFailure.operation===planned.operation){response.status=p.lastFailure.status;response.body={error:p.error};}
    const persisted=structuredClone(response.body);delete persisted.confirmation_token;
    this.db.prepare('INSERT INTO purchase_http_keys(user_id,route,key,hash,purchase_id,status,response_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,route,key) DO UPDATE SET status=excluded.status,response_json=excluded.response_json').run(buyer,route,key,hash(body),p.purchase_id,response.status,json(persisted));
    return response;
  }
  execute(id){if(this.running.has(id))return this.running.get(id);const work=this.run(id).finally(()=>this.running.delete(id));this.running.set(id,work);return work;}
  async run(id){
    const op=this.db.prepare('SELECT * FROM purchase_operations WHERE operation_id=?').get(id);if(!op||op.state!=='pending')return;
    let p=this.load(op.purchase_id);const wire=JSON.parse(op.body_json),seller=p.offer.seller_id,path=p.acp?`/checkout_sessions/${p.acp.id}`:'/checkout_sessions';
    try{
      let c;
      if(op.attempts&&p.acp){c=await this.transport(seller,'GET',path,{},`${id}:get`);if(c.status!=='completed'&&!(op.action==='cancel'&&c.status==='canceled'))c=null;}
      if(!c){
        const body=op.action==='complete'?{payment_data:{provider:'stripe',token:token(secret(this.db,'payment-simulator'),wire.claims)}}:wire;
        const target=path+(op.action==='complete'?'/complete':op.action==='cancel'?'/cancel':'');
        c=await this.transport(seller,'POST',target,body,id);
      }
      this.checkCart(p,c);
      p.acp=c;p.error=null;delete p.lastFailure;
      if(c.status==='completed'){
        if(!p.confirmedAt)fail(502,'invalid_acp_response');
        p.status='completed';p.order={order_id:`receipt_${hash(p.purchase_id).slice(0,24)}`,merchant_order_id:c.order.id,checkout_session_id:c.id,created_at:p.confirmedAt,total_price_twd:p.offer.total_price_twd,payment_status:'simulated_succeeded'};
      }else if(c.status==='canceled')p.status='canceled';
      else if(c.status==='ready_for_payment'){p.status='ready';p.confirmationExpires=Math.min(this.store.now()+300000,Date.parse(p.offer.expires_at));}
      else if(c.status==='not_ready_for_payment')p.status='needs_input';
      else throw new Error('merchant_processing');
      this.store.transaction(()=>{this.save(p);if(p.order)this.db.prepare('INSERT OR IGNORE INTO purchase_orders VALUES(?,?,?,?)').run(p.purchase_id,seller,p.order.merchant_order_id,json(p.order));this.db.prepare("UPDATE purchase_operations SET state='completed' WHERE operation_id=?").run(id);});
    }catch(e){
      const uncertain=!(e instanceof HttpError)||e.status>=500||(op.action==='complete'&&e.code==='offer_changed');
      if(uncertain){p.status='reconciling';p.error={code:'reconciling',message:'正在核對交易，請勿重複購買。',fields:[]};this.db.prepare('UPDATE purchase_operations SET attempts=attempts+1,next_at=? WHERE operation_id=?').run(this.store.now()+Math.min(30000,1000*2**Math.min(op.attempts,5)),id);}
      else {p.status=e.status===410?'expired':['checkout_incomplete','payment_declined'].includes(e.code)?'needs_input':'blocked';p.error={code:e.code,message:e.message,fields:[]};p.lastFailure={operation:id,status:e.status};this.db.prepare("UPDATE purchase_operations SET state='failed' WHERE operation_id=?").run(id);}
      this.save(p);
    }
  }
  receiveEvent(req){
    const seller=req.params.seller;authenticate(req,secret(this.db,`event-sign:${seller}`),secret(this.db,`event-auth:${seller}`),this.store.now());
    const e=req.body;
    validate('AcpEventWebhookEvent',e);
    const rows=this.db.prepare('SELECT data_json FROM purchases WHERE seller_id=?').all(seller);const p=rows.map(x=>JSON.parse(x.data_json)).find(p=>p.acp?.id===e.data.checkout_session_id);
    if(!p)fail(404,'not_found');
    this.db.prepare('INSERT OR IGNORE INTO commerce_inbox VALUES(?,?)').run(seller,hash(e));
    // Events only schedule reconciliation. They never authoritatively complete a purchase.
    const pending=this.db.prepare("SELECT operation_id FROM purchase_operations WHERE purchase_id=? AND state='pending'").get(p.purchase_id);if(pending)void this.execute(pending.operation_id);
    else {const key=`event:${hash(e)}`;if(!this.running.has(key)){const work=this.transport(seller,'GET',`/checkout_sessions/${p.acp.id}`,{},key).then(c=>this.checkCart(p,c)).catch(()=>{/* Keep the known state; never infer payment from a notification. */}).finally(()=>this.running.delete(key));this.running.set(key,work);}}
  }
  async recover(){if(this.closing||this.recovering)return;this.recovering=true;try{
    for(const op of this.db.prepare("SELECT operation_id FROM purchase_operations WHERE state='pending' AND next_at<=?").all(this.store.now()))await this.execute(op.operation_id);
    for(const event of this.db.prepare('SELECT * FROM commerce_outbox WHERE delivered=0 AND next_at<=?').all(this.store.now())){
      try{await this.start();const path=`/api/integrations/acp/merchants/${event.seller_id}/events`;const r=await this.fetch(this.base+path,{method:'POST',headers:headers(secret(this.db,`event-sign:${event.seller_id}`),secret(this.db,`event-auth:${event.seller_id}`),'POST',path,event.body_json,this.store.now(),event.event_id),body:event.body_json,signal:AbortSignal.timeout(this.timeoutMs)});if(!r.ok)throw new Error('event_delivery');this.db.prepare('UPDATE commerce_outbox SET delivered=1 WHERE event_id=?').run(event.event_id);}
      catch{this.db.prepare('UPDATE commerce_outbox SET attempts=attempts+1,next_at=? WHERE event_id=?').run(this.store.now()+Math.min(30000,1000*2**Math.min(event.attempts,5)),event.event_id);}
    }
  }finally{this.recovering=false;}}
  async close(){this.closing=true;clearInterval(this.timer);while(this.recovering)await new Promise(r=>setTimeout(r,10));await Promise.allSettled(this.running.values());if(this.server){this.server.closeAllConnections();await new Promise(r=>this.server.close(r));}}
}

export function installPurchases(app,store,buyerId,options){
  const service=new PurchaseService(store,options);app.locals.purchases=service;
  const close=store.close.bind(store);store.close=async()=>{await service.close();await close();};
  const buyer=req=>{const id=buyerId(req);if(!id)fail(401,'authentication_required');return id;};
  for(const [path,action,param] of [['/api/requests/:request_id/purchases','create','request_id'],['/api/purchases/:purchase_id/checkout','update','purchase_id'],['/api/purchases/:purchase_id/complete','complete','purchase_id'],['/api/purchases/:purchase_id/cancel','cancel','purchase_id']])app.post(path,async(req,res,next)=>{try{const r=await service.mutate(buyer(req),req.path,req.get('Idempotency-Key'),req.body,action,req.params[param]);res.status(r.status).json(r.body);}catch(e){next(e);}});
  app.get('/api/requests/:request_id/purchase',(req,res,next)=>{try{res.json(service.find(req.params.request_id,buyer(req)));}catch(e){next(e);}});
  app.get('/api/purchases/:purchase_id',(req,res,next)=>{try{res.json(service.get(req.params.purchase_id,buyer(req)));}catch(e){next(e);}});
  app.post('/api/integrations/acp/merchants/:seller/events',(req,res,next)=>{try{service.receiveEvent(req);res.json({received:true});}catch(e){next(e);}});
  return service;
}
