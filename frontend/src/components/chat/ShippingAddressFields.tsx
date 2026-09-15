import districts from '../../reference/taiwan-addresses.json';
import '../../styles/address.css';
export type ShippingAddressValue={city:string;state:string;postal_code:string;line_one:string};
const regions:Record<string,Record<string,string>>=districts;
export const normalizeCity=(city:string)=>city.replace(/^台/,'臺');
export function validShippingRegion(value:ShippingAddressValue){
 const zip=regions[normalizeCity(value.city)]?.[value.state];
 return !!zip&&value.postal_code.startsWith(zip)&&value.line_one.trim().length>0;
}
export function ShippingAddressFields({value,onChange,disabled=false}:{value:ShippingAddressValue;onChange:(value:ShippingAddressValue)=>void;disabled?:boolean}){
 const city=normalizeCity(value.city),areas=regions[city]??{};
 return <fieldset className="shipping-address-fields" disabled={disabled}>
  <legend>收件地址</legend>
  <div className="shipping-select-row">
   <label>縣市<select aria-label="縣市" required value={city} onChange={e=>onChange({...value,city:e.target.value,state:'',postal_code:''})}><option value="" disabled>選擇縣市</option>{!regions[city]&&city&&<option value={city} disabled>{city}（請重新選擇）</option>}{Object.keys(regions).map(name=><option key={name} value={name}>{name}</option>)}</select></label>
   <label>鄉鎮市區<select aria-label="鄉鎮市區" required disabled={!regions[city]||disabled} value={value.state} onChange={e=>onChange({...value,state:e.target.value,postal_code:areas[e.target.value]??''})}><option value="" disabled>選擇區域</option>{!areas[value.state]&&value.state&&<option value={value.state} disabled>{value.state}（請重新選擇）</option>}{Object.keys(areas).map(name=><option key={name} value={name}>{name}</option>)}</select></label>
  </div>
  <label>街道、門牌與樓層<input aria-label="街道、門牌與樓層" autoComplete="off" required maxLength={240} placeholder="例如：測試路 1 號 3 樓" value={value.line_one} onChange={e=>onChange({...value,line_one:e.target.value})}/></label>
  <p className="shipping-address-summary"><span>台灣 · 郵遞區號 {value.postal_code||'自動帶入'}</span>{value.city&&value.state&&<strong>{value.city}{value.state}{value.line_one}</strong>}</p>
 </fieldset>;
}
