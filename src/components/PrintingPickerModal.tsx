import React, { useEffect, useState } from 'react';
import { X, Sparkles, Check, Loader2 } from 'lucide-react';
import { MtgCard } from '../types';
import { formatUsd } from './PriceBadge';

interface PrintingPickerModalProps {
  cardName: string;
  currentScryfallId: string;
  onSelectPrinting: (card: MtgCard) => void;
  onClose: () => void;
}

export const PrintingPickerModal: React.FC<PrintingPickerModalProps> = ({
  cardName,
  currentScryfallId,
  onSelectPrinting,
  onClose
}) => {
  const [printings, setPrintings] = useState<MtgCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/scryfall/printings?name=${encodeURIComponent(cardName)}`)
      .then(r => r.json())
      .then(res => {
        if (active) {
          setPrintings(res.data || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cardName]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              Select Printing / Set Edition — {cardName}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Compare TCGplayer Market and Card Kingdom Retail/Buylist prices across printings
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
              <span className="text-sm">Fetching printings from Scryfall...</span>
            </div>
          ) : printings.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              No alternate printings found.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {printings.map(p => {
                const isSelected = p.scryfall_id === currentScryfallId;
                return (
                  <div
                    key={p.scryfall_id}
                    onClick={() => {
                      onSelectPrinting(p);
                      onClose();
                    }}
                    className={`cursor-pointer rounded-xl border p-3 flex gap-3 transition ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-400 ring-1 ring-amber-400/50'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    {p.image_small ? (
                      <img
                        src={p.image_small}
                        alt={p.name}
                        className="w-20 h-28 object-cover rounded-lg border border-slate-700 shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-28 rounded-lg bg-slate-800 flex items-center justify-center text-xs text-slate-500 shrink-0">
                        No Image
                      </div>
                    )}
                    <div className="flex flex-col justify-between flex-1 min-w-0">
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-xs font-bold uppercase">
                            {p.set_code} #{p.collector_number}
                          </span>
                          {isSelected && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-amber-400">
                              <Check className="w-3.5 h-3.5" /> Active
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-medium text-slate-200 truncate mt-1" title={p.set_name}>
                          {p.set_name}
                        </div>
                        <div className="text-[11px] text-slate-400 capitalize">{p.rarity}</div>
                      </div>

                      <div className="space-y-1 pt-2 border-t border-slate-800/80 text-[11px] font-mono">
                        <div className="flex justify-between">
                          <span className="text-sky-400 font-sans">TCG Non-Foil / Foil:</span>
                          <span className="text-slate-200">
                            {formatUsd(p.tcg_usd)} / {formatUsd(p.tcg_usd_foil)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-amber-400 font-sans">CK Retail:</span>
                          <span className="text-slate-200">
                            {formatUsd(p.ck_retail_nonfoil)} / {formatUsd(p.ck_retail_foil)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
