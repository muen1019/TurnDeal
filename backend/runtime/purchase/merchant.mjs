import express from 'express';
import { randomUUID } from 'node:crypto';
import { amount,authenticate,decode,equal,fail,hash,json,secret,validateKey } from './common.mjs';
import { validate,valid } from './contracts.mjs';
import { HttpError } from '../../src/httpError.ts';

export function quoteFor(p,now){
  const total=amount(p.offer);
  const line_items=p.offer.items.map((item,i)=>({id:`line_${i}`,item:{id:`item_${hash([p.purchase_id,item.product_id]).slice(0,32)}`,quantity:item.quantity},name:item.product_id,base_amount:i===0?total:0,discount:0,subtotal:i===0?total:0,tax:0,total:i===0?total:0}));
  const delivery=new Date(now+p.offer.delivery_days*86400000).toISOString();
  return {offer:p.offer,items:line_items.map(x=>x.item),line_items,
    totals:[{type:'items_base_amount',display_text:'測試商品含稅價',amount:total},{type:'subtotal',display_text:'小計',amount:total},{type:'fulfillment',display_text:'含運費',amount:0},{type:'tax',display_text:'已含於測試價格',amount:0},{type:'total',display_text:'總額',amount:total}],
    fulfillment_options:[{type:'shipping',id:'shipping_standard',title:'原報價配送（測試）',carrier:'Test delivery',earliest_delivery_time:delivery,latest_delivery_time:delivery,total:0}],
    links:[{type:'terms_of_use',url:`https://merchant.example/terms/${encodeURIComponent(p.offer.terms_id)}`}]};
}

export function createMerchant(store,revalidate){
  const {db}=store,app=express();
  app.use(express.json({limit:'64kb',verify(req,_res,buf){req.rawBody=buf.toString();}}));
  const row=(id,seller)=>{const r=db.prepare('SELECT * FROM merchant_checkout_sessions WHERE session_id=? AND seller_id=?').get(id,seller);if(!r)fail(404,'not_found');return {...r,session:JSON.parse(r.data_json)};};
  const getQuote=id=>JSON.parse(db.prepare('SELECT quote_json FROM merchant_quotes WHERE purchase_id=?').get(id).quote_json);
  function checkQuote(r){const q=getQuote(r.purchase_id);revalidate(r.purchase_id);if(Date.parse(q.offer.expires_at)<=store.now())fail(410,'offer_expired');return q;}
  function save(r,s){db.prepare('UPDATE merchant_checkout_sessions SET data_json=? WHERE session_id=?').run(json(s),r.session_id);}
  app.use('/merchants/:seller',(req,res,next)=>{try{
    req.seller=req.params.seller;
    // The signed path includes the merchant prefix; req.path inside a mounted middleware does not.
    const original=req.path;Object.defineProperty(req,'path',{value:req.originalUrl.split('?')[0],configurable:true});
    authenticate(req,secret(db,`merchant-sign:${req.seller}`),secret(db,`merchant-auth:${req.seller}`),store.now());
    Object.defineProperty(req,'path',{value:original,configurable:true});delete req.path;
    next();
  }catch(e){next(e);}});
  function post(path,requestType,work){app.post(`/merchants/:seller${path}`,(req,res,next)=>{try{
    if(!valid(requestType,req.body,true))fail(400,'invalid_request');
    const key=req.get('Idempotency-Key');validateKey(key);const route=req.path,seller=req.params.seller;
    const result=store.transaction(()=>{
      const prior=db.prepare('SELECT * FROM merchant_http_keys WHERE seller_id=? AND route=? AND key=?').get(seller,route,key);
      if(prior){if(prior.hash!==hash(req.body))fail(409,'request_not_idempotent');return {status:prior.status,body:JSON.parse(prior.response_json)};}
      const result=work(req,seller);
      validate(result.body.order?'CheckoutSessionWithOrder':'CheckoutSession',result.body,true);
      db.prepare('INSERT INTO merchant_http_keys VALUES(?,?,?,?,?,?)').run(seller,route,key,hash(req.body),result.status,json(result.body));return result;
    });
    res.set('Idempotency-Key',key).set('Request-Id',req.get('Request-Id')).status(result.status).json(result.body);
  }catch(e){next(e);}});}
  post('/checkout_sessions','CheckoutSessionCreateRequest',(req,seller)=>{
    const match=db.prepare('SELECT * FROM merchant_quotes WHERE seller_id=?').all(seller).find(r=>equal(json(JSON.parse(r.quote_json).items),json(req.body.items)));
    if(!match)fail(404,'not_found');
    const old=db.prepare('SELECT * FROM merchant_checkout_sessions WHERE purchase_id=?').get(match.purchase_id);
    if(old)return {status:201,body:JSON.parse(old.data_json)};
    const q=checkQuote({purchase_id:match.purchase_id});
    const s={id:`checkout_${randomUUID()}`,status:'not_ready_for_payment',currency:'twd',payment_provider:{provider:'stripe',supported_payment_methods:[{type:'card',supported_card_networks:['visa']}]},line_items:q.line_items,totals:q.totals,fulfillment_options:q.fulfillment_options,links:q.links,messages:[]};
    if(req.body.buyer)s.buyer=req.body.buyer;if(req.body.fulfillment_details)s.fulfillment_details=req.body.fulfillment_details;
    db.prepare('INSERT INTO merchant_checkout_sessions VALUES(?,?,?,?)').run(s.id,match.purchase_id,seller,json(s));return {status:201,body:s};
  });
  post('/checkout_sessions/:id','CheckoutSessionUpdateRequest',(req,seller)=>{
    const r=row(req.params.id,seller),q=checkQuote(r),s=r.session;
    if(['completed','canceled','in_progress'].includes(s.status))fail(409,'state_conflict');
    if(req.body.items&&json(req.body.items)!==json(q.items))fail(409,'offer_changed');
    const body=req.body;
    if(body.buyer)s.buyer=body.buyer;
    if(body.fulfillment_details){if(body.fulfillment_details.address?.country!=='TW')fail(422,'checkout_incomplete');s.fulfillment_details=body.fulfillment_details;}
    if(body.selected_fulfillment_options){const selection=body.selected_fulfillment_options;
      if(selection.length!==1||selection[0].type!=='shipping'||selection[0].shipping.option_id!=='shipping_standard'||json([...selection[0].shipping.item_ids].sort())!==json(q.items.map(x=>x.id).sort()))fail(422,'checkout_incomplete');s.selected_fulfillment_options=selection;}
    s.status=s.buyer&&s.fulfillment_details?.address&&s.selected_fulfillment_options?.length?'ready_for_payment':'not_ready_for_payment';save(r,s);return {status:200,body:s};
  });
  post('/checkout_sessions/:id/complete','CheckoutSessionCompleteRequest',(req,seller)=>{
    const r=row(req.params.id,seller),s=r.session;
    if(s.status==='completed')return {status:200,body:s};
    const q=checkQuote(r);if(s.status!=='ready_for_payment')fail(422,'checkout_incomplete');
    const payment=decode(secret(db,'payment-simulator'),req.body.payment_data.token);
    if(!payment||payment.seller!==seller||payment.session!==s.id||payment.amount!==amount(q.offer)||payment.expires<=store.now()||payment.cart!==hash(s))fail(422,'payment_declined');
    for(const item of q.offer.items){const updated=db.prepare('UPDATE merchant_inventory SET stock=stock-? WHERE seller_id=? AND product_id=? AND stock>=?').run(item.quantity,seller,item.product_id,item.quantity);if(!updated.changes)fail(409,'inventory_unavailable');}
    const id=`order_${randomUUID()}`,created=new Date(store.now()).toISOString();
    db.prepare('INSERT INTO merchant_orders VALUES(?,?,?,?)').run(id,s.id,hash(req.body.payment_data.token),created);
    s.status='completed';s.order={id,checkout_session_id:s.id,permalink_url:`https://merchant.example/orders/${id}`};save(r,s);
    const event={type:'order_create',data:{type:'order',checkout_session_id:s.id,permalink_url:s.order.permalink_url,status:'created',refunds:[]}};
    db.prepare('INSERT INTO commerce_outbox(event_id,seller_id,body_json) VALUES(?,?,?)').run(`event_${randomUUID()}`,seller,json(event));
    return {status:200,body:s};
  });
  post('/checkout_sessions/:id/cancel','CancelSessionRequest',(req,seller)=>{const r=row(req.params.id,seller);if(['completed','canceled'].includes(r.session.status))fail(405,'state_conflict');r.session.status='canceled';save(r,r.session);return {status:200,body:r.session};});
  app.get('/merchants/:seller/checkout_sessions/:id',(req,res,next)=>{try{const s=row(req.params.id,req.params.seller).session;validate(s.order?'CheckoutSessionWithOrder':'CheckoutSession',s,true);res.json(s);}catch(e){next(e);}});
  app.use((err,_req,res,_next)=>{const e=err instanceof HttpError?err:new HttpError(500,'processing_error','Merchant test service failed');res.status(e.status??500).json({type:'invalid_request',code:e.code??'processing_error',message:e.message});});
  return app;
}
