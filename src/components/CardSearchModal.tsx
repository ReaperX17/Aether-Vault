import React, { useState, useEffect } from 'react';
import { Search, Plus, X, Loader2, Layers, FolderPlus, Sparkles, Check, ShoppingBag } from 'lucide-react';
import { BoardType, ConditionType, DeckSummary, FinishType, MtgCard } from '../types';
import { ManaCost } from './ManaCost';
import { DualPriceBadge } from './PriceBadge';
import { PrintingPickerModal } from './PrintingPickerModal';
import { setCardForcedOnBuylist } from '../forcedBuylist';
import { getCommanderOrBackgroundRole } from './CardZoomModal';

interface CardSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTarget?: 'inventory' | 'deck';
  defaultDeckId?: number | null;
  defaultBoard?: BoardType;
  decks: DeckSummary[];
  locations: string[];
  onCardAdded: () => void;
}

export const CardSearchModal: React.FC<CardSearchModalProps> = ({
  isOpen,
  onClose,
  defaultTarget = 'inventory',
  defaultDeckId = null,
  defaultBoard = 'mainboard',
  decks,
  locations,
  onCardAdded
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MtgCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<string>('');
  const [target, setTarget] = useState<'inventory' | 'deck'>(defaultTarget);
  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(defaultDeckId || (decks[0]?.id ?? null));
  const [board, setBoard] = useState<BoardType>(defaultBoard);

  // Inventory options
  const [finish, setFinish] = useState<FinishType>('nonfoil');
  const [condition, setCondition] = useState<ConditionType>('NM');
  const [location, setLocation] = useState<string>('Main Binder');
  const [customLocation, setCustomLocation] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [purchasePrice, setPurchasePrice] = useState<string>('');

  const [addedMap, setAddedMap] = useState<Record<string, number>>({});
  const [addedBuylistMap, setAddedBuylistMap] = useState<Record<string, number>>({});
  const [printingModalCard, setPrintingModalCard] = useState<MtgCard | null>(null);

  useEffect(() => {
    setTarget(defaultTarget);
    if (defaultDeckId) setSelectedDeckId(defaultDeckId);
    else if (decks.length > 0 && !selectedDeckId) setSelectedDeckId(decks[0].id);
    setBoard(defaultBoard);
  }, [defaultTarget, defaultDeckId, defaultBoard, decks, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      runSearch(query);
    }, 280);
    return () => clearTimeout(timer);
  }, [query, isOpen]);

  async function runSearch(q: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/scryfall/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.data || []);
      setSource(data.source || '');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddCard(card: MtgCard, forceBuy = false, overrideBoard?: BoardType) {
    try {
      const boardToUse = overrideBoard || board;
      const qtyToUse = boardToUse === 'commander' ? 1 : quantity;
      if (target === 'inventory' && !forceBuy && !overrideBoard) {
        const finalLocation = location === '__custom__' ? (customLocation.trim() || 'Main Binder') : location;
        await fetch('/api/inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            card,
            quantity: qtyToUse,
            finish,
            condition,
            location: finalLocation,
            purchase_price: purchasePrice ? parseFloat(purchasePrice) : null
          })
        });
      } else {
        if (!selectedDeckId) return;
        if (forceBuy) {
          setCardForcedOnBuylist(selectedDeckId, card.name, true);
        }
        await fetch(`/api/decks/${selectedDeckId}/cards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            card,
            quantity: qtyToUse,
            board: boardToUse,
            finish,
            force_buy: forceBuy
          })
        });
      }

      if (forceBuy) {
        setAddedBuylistMap(prev => ({
          ...prev,
          [card.scryfall_id]: (prev[card.scryfall_id] || 0) + quantity
        }));
      } else {
        setAddedMap(prev => ({
          ...prev,
          [card.scryfall_id]: (prev[card.scryfall_id] || 0) + quantity
        }));
      }
      onCardAdded();
    } catch (e) {
      console.error(e);
    }
  }

  if (!isOpen) return null;

  const allLocations = Array.from(
    new Set(['Main Binder', 'Staples Binder', 'Trade Binder', 'Commander Box', 'Lands Binder', 'Longbox A', ...locations])
  );

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-6">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-6xl w-full h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">
                Search Cards
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls Bar */}
        <div className="px-6 py-3.5 bg-slate-950/70 border-b border-slate-800 space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search cards..."
                autoFocus
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Target Switcher */}
            <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setTarget('inventory')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  target === 'inventory'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FolderPlus className="w-3.5 h-3.5" />
                Add to Collection
              </button>
              <button
                type="button"
                onClick={() => setTarget('deck')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  target === 'deck'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Add to Deck
              </button>
            </div>
          </div>

          {/* Target Parameters */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Qty:</span>
              <input
                type="number"
                min={1}
                max={99}
                value={quantity}
                onChange={e => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-14 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-center"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Finish:</span>
              <select
                value={finish}
                onChange={e => setFinish(e.target.value as FinishType)}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
              >
                <option value="nonfoil">Non-Foil</option>
                <option value="foil">✨ Foil</option>
                <option value="etched">🌟 Etched Foil</option>
              </select>
            </div>

            {target === 'inventory' ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Condition:</span>
                  <select
                    value={condition}
                    onChange={e => setCondition(e.target.value as ConditionType)}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
                  >
                    <option value="NM">NM (Near Mint)</option>
                    <option value="LP">LP (Lightly Played)</option>
                    <option value="MP">MP (Moderately Played)</option>
                    <option value="HP">HP (Heavily Played)</option>
                    <option value="DMG">DMG (Damaged)</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Binder / Box:</span>
                  <select
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
                  >
                    {allLocations.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                    <option value="__custom__">+ New Binder / Box...</option>
                  </select>
                  {location === '__custom__' && (
                    <input
                      type="text"
                      value={customLocation}
                      onChange={e => setCustomLocation(e.target.value)}
                      placeholder="Binder name..."
                      className="w-32 px-2 py-1 rounded-lg bg-slate-900 border border-amber-500/60 text-slate-100"
                    />
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Paid ($):</span>
                  <input
                    type="number"
                    step="0.01"
                    value={purchasePrice}
                    onChange={e => setPurchasePrice(e.target.value)}
                    placeholder="Optional"
                    className="w-20 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Target Deck:</span>
                  <select
                    value={selectedDeckId ?? ''}
                    onChange={e => setSelectedDeckId(Number(e.target.value))}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-semibold"
                  >
                    {decks.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.format.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Zone:</span>
                  <select
                    value={board}
                    onChange={e => setBoard(e.target.value as BoardType)}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
                  >
                    <option value="mainboard">Mainboard (99 / 60)</option>
                    <option value="commander">👑 Commander Slot</option>
                    <option value="sideboard">Sideboard (15)</option>
                    <option value="considering">Considering / Maybeboard</option>
                  </select>
                </div>
              </>
            )}

            <div className="ml-auto text-[11px] text-slate-500">
              {source === 'scryfall_live' ? '🟢 Live Scryfall + Dual Market Pricing' : '⚡ Local Cache'}
            </div>
          </div>
        </div>

        {/* Results Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
              <span className="text-sm">Searching Scryfall & calculating TCGplayer / Card Kingdom prices...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              No matching cards found. Try searching by card name or Scryfall syntax.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {results.map(card => {
                const justAdded = addedMap[card.scryfall_id] || 0;
                const justAddedBuy = addedBuylistMap[card.scryfall_id] || 0;
                return (
                  <div
                    key={card.scryfall_id}
                    className="flex flex-col rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-600/80 overflow-hidden transition group"
                  >
                    <div className="relative aspect-[63/88] w-full bg-slate-900 overflow-hidden">
                      {card.image_normal ? (
                        <img
                          src={card.image_normal}
                          alt={card.name}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition duration-200"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs p-4 text-center">
                          {card.name}
                        </div>
                      )}

                      <div className="absolute top-2 left-2 flex flex-col gap-1">
                        <span className="px-2 py-0.5 rounded-md bg-slate-950/85 backdrop-blur-xs border border-slate-700 text-[11px] font-mono font-bold text-amber-300 uppercase">
                          {card.set_code} #{card.collector_number}
                        </span>
                        {(card.owned_qty ?? 0) > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-950/90 border border-emerald-500/50 text-[11px] font-semibold text-emerald-300">
                            In Vault: {card.owned_qty}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setPrintingModalCard(card)}
                        className="absolute top-2 right-2 px-2 py-1 rounded-md bg-slate-950/85 hover:bg-slate-900 border border-slate-700 text-[11px] text-slate-200 flex items-center gap-1 transition"
                        title="Switch Set / Printing"
                      >
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        Printings
                      </button>
                    </div>

                    <div className="p-3 flex-1 flex flex-col justify-between gap-2.5">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-sm text-slate-100 leading-tight">{card.name}</h4>
                          <ManaCost cost={card.mana_cost} size="sm" />
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate">{card.type_line}</p>
                      </div>

                      <div className="space-y-2">
                        <DualPriceBadge card={card} finish={finish} showBuylist />

                        <div className="flex flex-col gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleAddCard(card, false)}
                            className={`w-full py-2 px-3 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                              justAdded > 0
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                            }`}
                          >
                            {justAdded > 0 ? (
                              <>
                                <Check className="w-4 h-4" />
                                Added ({justAdded}) — Add More
                              </>
                            ) : (
                              <>
                                <Plus className="w-4 h-4" />
                                {target === 'inventory'
                                  ? `Add ${quantity}x to ${location === '__custom__' ? (customLocation || 'Binder') : location}`
                                  : `Add ${quantity}x to ${board === 'commander' ? 'Commander' : 'Deck'}`}
                              </>
                            )}
                          </button>

                          {selectedDeckId && getCommanderOrBackgroundRole(card) && board !== 'commander' && (
                            <button
                              type="button"
                              onClick={() => handleAddCard(card, false, 'commander')}
                              className="w-full py-1.5 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/50 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                              title="Add directly as your Commander / Background"
                            >
                              <span>👑</span>
                              <span>
                                {getCommanderOrBackgroundRole(card) === 'background'
                                  ? 'Set as Deck Background'
                                  : 'Set as Deck Commander'}
                              </span>
                            </button>
                          )}

                          {selectedDeckId && (
                            <button
                              type="button"
                              onClick={() => handleAddCard(card, true)}
                              className={`w-full py-1.5 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                                justAddedBuy > 0
                                  ? 'bg-emerald-600 border-emerald-400 text-white'
                                  : 'bg-rose-500/20 hover:bg-rose-500/35 border-rose-500/50 text-rose-200'
                              }`}
                              title="Add to deck and queue on the Buy List (even if you already own a copy in your Vault)"
                            >
                              {justAddedBuy > 0 ? (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  On Buy List ({justAddedBuy}) — +More
                                </>
                              ) : (
                                <>
                                  <ShoppingBag className="w-3.5 h-3.5 text-rose-400" />
                                  + Add {quantity}x to Deck Buy List
                                </>
                              )}
                            </button>
                          )}
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

      {printingModalCard && (
        <PrintingPickerModal
          cardName={printingModalCard.name}
          currentScryfallId={printingModalCard.scryfall_id}
          onClose={() => setPrintingModalCard(null)}
          onSelectPrinting={newPrinting => {
            setResults(prev =>
              prev.map(c => (c.scryfall_id === printingModalCard.scryfall_id ? { ...newPrinting, owned_qty: c.owned_qty } : c))
            );
          }}
        />
      )}
    </div>
  );
};
