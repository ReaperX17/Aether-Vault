import React from 'react';
import { ExternalLink } from 'lucide-react';
import { FinishType, MtgCard } from '../types';

export function formatUsd(val?: number | null): string {
  if (val === undefined || val === null || Number.isNaN(Number(val))) return '—';
  return `$${Number(val).toFixed(2)}`;
}

interface DualPriceProps {
  card?: MtgCard | null;
  finish?: FinishType;
  quantity?: number;
  compact?: boolean;
  showBuylist?: boolean;
  tcgUsd?: number | null;
  ckRetail?: number | null;
  tcgUrl?: string | null;
  ckUrl?: string | null;
}

export const DualPriceBadge: React.FC<DualPriceProps> = ({
  card,
  finish = 'nonfoil',
  quantity = 1,
  compact = false,
  showBuylist = false,
  tcgUsd,
  ckRetail,
  tcgUrl: tcgUrlProp,
  ckUrl: ckUrlProp
}) => {
  const isFoil = finish === 'foil' || finish === 'etched';

  const tcgUnit =
    tcgUsd !== undefined
      ? tcgUsd
      : card
        ? finish === 'etched'
          ? (card.tcg_usd_etched ?? card.tcg_usd_foil ?? card.tcg_usd)
          : isFoil
            ? (card.tcg_usd_foil ?? card.tcg_usd)
            : (card.tcg_usd ?? card.tcg_usd_foil)
        : null;

  const ckRetailUnit =
    ckRetail !== undefined
      ? ckRetail
      : card
        ? isFoil
          ? (card.ck_retail_foil ?? card.ck_retail_nonfoil)
          : (card.ck_retail_nonfoil ?? card.ck_retail_foil)
        : null;

  const ckBuyUnit = card
    ? isFoil
      ? (card.ck_buylist_foil ?? card.ck_buylist_nonfoil)
      : (card.ck_buylist_nonfoil ?? card.ck_buylist_foil)
    : null;

  const tcgTotal = tcgUnit != null ? tcgUnit * quantity : null;
  const ckRetailTotal = ckRetailUnit != null ? ckRetailUnit * quantity : null;
  const ckBuyTotal = ckBuyUnit != null ? ckBuyUnit * quantity : null;

  const cardName = card?.name || '';
  const tcgUrl =
    tcgUrlProp ||
    card?.tcgplayer_url ||
    `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(cardName)}`;
  const ckUrl =
    ckUrlProp ||
    card?.cardkingdom_url ||
    `https://www.cardkingdom.com/catalog/search?search=header&filter%5Bname%5D=${encodeURIComponent(cardName)}`;

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 text-xs font-mono">
        <a
          href={tcgUrl}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          title="TCGplayer Market Price (Click to view on TCGplayer)"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 hover:bg-sky-500/25 transition"
        >
          <span className="text-[10px] font-sans font-semibold text-sky-400">TCG</span>
          <span>{formatUsd(tcgTotal)}</span>
        </a>
        <a
          href={ckUrl}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          title={`Card Kingdom Retail Price${ckBuyTotal != null ? ` (Buylist: ${formatUsd(ckBuyTotal)})` : ''} — Click to view on Card Kingdom`}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition"
        >
          <span className="text-[10px] font-sans font-semibold text-amber-400">CK</span>
          <span>{formatUsd(ckRetailTotal)}</span>
        </a>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-1.5 text-xs">
      <a
        href={tcgUrl}
        target="_blank"
        rel="noreferrer"
        onClick={e => e.stopPropagation()}
        className="flex flex-col justify-between p-1.5 rounded-lg bg-sky-950/50 border border-sky-500/25 hover:border-sky-400/60 transition group"
      >
        <div className="flex items-center justify-between text-[10px] text-sky-400 font-semibold">
          <span>TCGplayer</span>
          <ExternalLink className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100" />
        </div>
        <div className="font-mono font-bold text-slate-100 text-sm mt-0.5">
          {formatUsd(tcgTotal)}
        </div>
        {quantity > 1 && tcgUnit != null && (
          <div className="text-[10px] text-slate-400 font-mono">{formatUsd(tcgUnit)} ea</div>
        )}
      </a>

      <a
        href={ckUrl}
        target="_blank"
        rel="noreferrer"
        onClick={e => e.stopPropagation()}
        className="flex flex-col justify-between p-1.5 rounded-lg bg-amber-950/40 border border-amber-500/25 hover:border-amber-400/60 transition group"
      >
        <div className="flex items-center justify-between text-[10px] text-amber-400 font-semibold">
          <span>Card Kingdom</span>
          <ExternalLink className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100" />
        </div>
        <div className="font-mono font-bold text-slate-100 text-sm mt-0.5">
          {formatUsd(ckRetailTotal)}
        </div>
        {showBuylist && ckBuyTotal != null ? (
          <div className="text-[10px] text-emerald-400 font-mono">Buy: {formatUsd(ckBuyTotal)}</div>
        ) : quantity > 1 && ckRetailUnit != null ? (
          <div className="text-[10px] text-slate-400 font-mono">{formatUsd(ckRetailUnit)} ea</div>
        ) : null}
      </a>
    </div>
  );
};
