/** The one TurnDeal logo mark, shared everywhere — the welcome screen, the app header, onboarding, and the favicon (index.html points straight at the same file). Source: src/img/TurnDeal_LOGO.png, cropped to the icon glyph and resized into public/images/logo.png. */
export function TurnDealMark({size=64,className}:{size?:number;className?:string}){
  return <img className={className?`turndeal-mark ${className}`:'turndeal-mark'} src="/images/logo.png" width={size} height={size} alt="" draggable={false}/>;
}
