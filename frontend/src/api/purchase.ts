import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schema from '../../../contracts/purchase.v1.schema.json';
import {ApiFailure} from './client';
import type {PurchaseView} from '../purchase.generated';
const ajv=new Ajv2020({strict:false});addFormats(ajv);ajv.addSchema(schema);
const validate=ajv.compile({$ref:schema.$id+'#/$defs/PurchaseView'});
export function validPurchaseBody(name:'Empty'|'CheckoutUpdate'|'PurchaseComplete',body:unknown){
 const check=ajv.getSchema(schema.$id+'#/$defs/'+name)??ajv.compile({$ref:schema.$id+'#/$defs/'+name});
 if(!check(body))throw new ApiFailure(400,'invalid_request','結帳操作格式不完整，請重新核對。');
}
export function purchaseView(raw:unknown,requestId:string,offerId:string):PurchaseView{
 if(!validate(raw))throw new ApiFailure(0,'invalid_response','結帳回應格式不完整，請核對狀態。');
 const p=raw as PurchaseView;
 if(p.request_id!==requestId||p.offer_id!==offerId||p.offer.offer_id!==offerId||p.offer.seller_id!==p.seller_id||p.mode!=='test'||p.payment_execution!=='simulated'||(p.checkout&&p.checkout.total_price_twd!==p.offer.total_price_twd)||(p.status==='completed'&&(!p.order||p.order.payment_status!=='simulated_succeeded'||p.order.total_price_twd!==p.offer.total_price_twd)))throw new ApiFailure(0,'invalid_response','結帳資料與選定報價不一致，請核對狀態。');
 return p;
}
