import type {ButtonHTMLAttributes, ReactNode} from 'react';
import {AlertCircle, CheckCircle2, Clock3, Info, PackageCheck, Tag} from 'lucide-react';
import type {Offer, RequestSnapshot} from '../../contract.generated';
import {categoryLabel, formatDateTime, formatTwd, mediaForOffer, roleLabel} from './offerUtils';
import '../../styles/offers.css';

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

export interface OfferButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
}

export function OfferButton({variant = 'secondary', icon, children, className = '', ...props}: OfferButtonProps) {
  return (
    <button className={`offer-button offer-button--${variant} ${className}`.trim()} {...props}>
      {icon ? <span className="offer-button__icon" aria-hidden="true">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}

export interface StatusPillProps {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'danger' | 'pending' | 'sponsored';
}

export function StatusPill({children, tone = 'neutral'}: StatusPillProps) {
  return <span className={`offer-pill offer-pill--${tone}`}>{children}</span>;
}

export interface StatusMessageProps {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'danger' | 'pending';
}

export function StatusMessage({children, tone = 'neutral'}: StatusMessageProps) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'danger' ? AlertCircle : tone === 'pending' ? Clock3 : Info;
  return (
    <div className={`offer-status-message offer-status-message--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export interface PriceBlockProps {
  amount: number;
  caption?: string;
}

export function PriceBlock({amount, caption = '含稅運'}: PriceBlockProps) {
  return (
    <div className="offer-price">
      <strong>{formatTwd(amount)}</strong>
      <span>{caption}</span>
    </div>
  );
}

export interface OfferMediaProps {
  offer: Offer;
  compact?: boolean;
}

export function OfferMedia({offer, compact = false}: OfferMediaProps) {
  const source = mediaForOffer(offer);

  return (
    <figure className={`offer-media ${compact ? 'offer-media--compact' : ''}`.trim()}>
      <img
        src={source}
        alt={`${offer.items.map((item) => categoryLabel(item.category)).join(' + ')} 商品示意`}
        onError={(event) => {
          event.currentTarget.hidden = true;
          event.currentTarget.parentElement?.setAttribute('data-image-failed', 'true');
        }}
      />
      <figcaption>商品示意</figcaption>
      <div className="offer-media__placeholder" aria-hidden="true">
        <PackageCheck size={36} />
        <span>商品示意</span>
      </div>
    </figure>
  );
}

export interface ItemRowProps {
  item: Offer['items'][number];
  snapshot?:RequestSnapshot;
}

export function ItemRow({item,snapshot}: ItemRowProps) {
  return (
    <div className="offer-item-row">
      <div className="offer-item-row__icon" aria-hidden="true">
        <Tag size={18} />
      </div>
      <div className="offer-item-row__body">
        <strong>{snapshot?.product_details?.find(p=>p.product_id===item.product_id)?.name??categoryLabel(item.category)}</strong>
        {snapshot&&<ProductColor snapshot={snapshot} productId={item.product_id}/>}
        <span>{roleLabel(item.role)}</span>
      </div>
      <div className="offer-item-row__meta">
        <span>數量 {item.quantity}</span>
      </div>
    </div>
  );
}

export interface OfferSummaryMetaProps {
  snapshot: RequestSnapshot;
  offer: Offer;
}

export function OfferSummaryMeta({snapshot, offer}: OfferSummaryMetaProps) {
  const sponsored = snapshot.sponsored_placement?.seller_id === offer.seller_id;

  return (
    <div className="offer-summary-meta">
      <ProductColor snapshot={snapshot} productId={offer.items.find(i=>i.role==='primary')?.product_id??''}/>
      <span>預計 {offer.delivery_days} 天送達</span>
      <span>有效至 {formatDateTime(offer.expires_at)}</span>
      {sponsored ? <StatusPill tone="sponsored">Sponsored</StatusPill> : null}
    </div>
  );
}
export function ProductColor({snapshot,productId}:{snapshot:RequestSnapshot;productId:string}){
 const color=snapshot.product_details?.find(p=>p.product_id===productId)?.color;
 const palette:Record<string,[string,string]>={black:['黑色','#303744'],white:['白色','#fafafa'],blue:['藍色','#5785c8'],red:['紅色','#c96872'],rose:['粉色','#e0a4b7']};
 if(!color)return <span className="product-color">顏色未提供</span>;
 const label=palette[color];return <span className="product-color">{label&&<i style={{background:label[1]}} aria-hidden="true"/>}{label?.[0]??color}</span>;
}
