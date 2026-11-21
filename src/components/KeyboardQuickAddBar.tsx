import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Plus,
  ShoppingBag,
  Check,
  Keyboard,
  Loader2,
  FolderPlus,
  ChevronDown
} from 'lucide-react';
import { BoardType, ConditionType, FinishType, MtgCard } from '../types';
import { ManaCost } from './ManaCost';
import { formatUsd } from './PriceBadge';
import { getCommanderOrBackgroundRole } from './CardZoomModal';

interface KeyboardQuickAddBarProps {
  mode: 'inventory' | 'deck';
  // Inventory mode props
  locations?: string[];
  defaultLocation?: string;
  onAddInventoryCard?: (payload: {
    card: MtgCard;
    quantity: number;
    finish: FinishType;
    condition: ConditionType;
    location: string;
  }) => Promise<void>;
  // Deck mode props
  deckName?: string;
  defaultToBuylist?: boolean;
  onAddDeckCard?: (payload: {
    card: MtgCard;
    quantity: number;
    board: BoardType;
    finish: FinishType;
    forceBuy: boolean;
  }) => Promise<void>;
}

// In-memory cache of printings by lowercase card name for instant dropdown loading
const printingsMemoryCache = new Map<string, MtgCard[]>();

function parseLeadingQty(raw: string): { parsedQty: number | null; cleanQuery: string } {
  const m = raw.match(/^\s*(\d{1,2})\s*x?\s+(.+)$/i);
  if (m) {
    return {
      parsedQty: Math.max(1, Math.min(99, parseInt(m[1], 10))),
      cleanQuery: m[2].trim()
    };
  }
  return { parsedQty: null, cleanQuery: raw.trim() };
}

export const KeyboardQuickAddBar: React.FC<KeyboardQuickAddBarProps> = ({
  mode,
  locations = ['Main Binder', 'Commander Box', 'Staples Binder', 'Trade Binder'],
  defaultLocation = 'Main Binder',
  onAddInventoryCard,
  deckName,
  defaultToBuylist = false,
  onAddDeckCard
}) => {
  const cardInputRef = useRef<HTMLInputElement>(null);
  const setInputRef = useRef<HTMLInputElement>(null);
  const finishSelectRef = useRef<HTMLSelectElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  const cardListRef = useRef<HTMLDivElement>(null);
  const setListRef = useRef<HTMLDivElement>(null);

  const [activeStep, setActiveStep] = useState<'card' | 'set' | 'idle'>('idle');

  // Step 1: Card search state
  const [rawCardInput, setRawCardInput] = useState('');
  const [cardResults, setCardResults] = useState<MtgCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [cardHighlightIdx, setCardHighlightIdx] = useState(0);
  const [selectedBaseCard, setSelectedBaseCard] = useState<MtgCard | null>(null);

  // Step 2: Set / Printing dropdown state
  const [printings, setPrintings] = useState<MtgCard[]>([]);
  const [loadingPrintings, setLoadingPrintings] = useState(false);
  const [setFilterText, setSetFilterText] = useState('');
  const [setHighlightIdx, setSetHighlightIdx] = useState(0);
  const [selectedPrintingCard, setSelectedPrintingCard] = useState<MtgCard | null>(null);

  // Static Foil / Non-Foil state — NEVER resets automatically; only changes when the user changes it!
  const [selectedFinish, setSelectedFinish] = useState<FinishType>(() => {
    const saved = localStorage.getItem('aethervault_static_finish');
    if (saved === 'foil' || saved === 'etched' || saved === 'nonfoil') return saved;
    return 'nonfoil';
  });

  // Static Deck Target action (+ Add to Deck vs 🛒 Add to Buy List)
  const [selectedForceBuy, setSelectedForceBuy] = useState<boolean>(defaultToBuylist);

  // Metadata fields (Qty, Binder/Location, Condition, Zone)
  const [quantity, setQuantity] = useState<number>(1);
  const [condition, setCondition] = useState<ConditionType>('NM');
  const [location, setLocation] = useState<string>(defaultLocation || 'Main Binder');
  const [board, setBoard] = useState<BoardType>('mainboard');

  const [submitting, setSubmitting] = useState(false);
  const [lastAddedBanner, setLastAddedBanner] = useState<string | null>(null);

  function handleChangeStaticFinish(nextFinish: FinishType) {
    setSelectedFinish(nextFinish);
    try {
      localStorage.setItem('aethervault_static_finish', nextFinish);
    } catch {
      // ignore storage errors
    }
  }

  useEffect(() => {
    if (defaultLocation && defaultLocation !== 'ALL') {
      setLocation(defaultLocation);
    }
  }, [defaultLocation]);

  const { parsedQty, cleanQuery } = useMemo(() => parseLeadingQty(rawCardInput), [rawCardInput]);

  useEffect(() => {
    if (parsedQty !== null) {
      setQuantity(parsedQty);
    }
  }, [parsedQty]);

  // Global "/" shortcut to jump straight to Step 1 (Card Name)
  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (!isTyping && e.key === '/') {
        e.preventDefault();
        setActiveStep('card');
        cardInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  // Search Scryfall / local catalog as user types in Step 1
  useEffect(() => {
    if (!cleanQuery || cleanQuery.length < 2) {
      setCardResults([]);
      setLoadingCards(false);
      setCardHighlightIdx(0);
      return;
    }
    if (selectedBaseCard && selectedBaseCard.name === rawCardInput && activeStep !== 'card') {
      return;
    }
    setLoadingCards(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/scryfall/search?q=${encodeURIComponent(cleanQuery)}`);
        const json = await res.json();
        const list: MtgCard[] = (json.data || []).slice(0, 15);
        setCardResults(list);
        setCardHighlightIdx(0);
      } catch {
        // ignore
      } finally {
        setLoadingCards(false);
      }
    }, 160);
    return () => clearTimeout(timer);
  }, [cleanQuery, activeStep]);

  // Scroll highlighted card item into view in Step 1 dropdown
  useEffect(() => {
    if (activeStep !== 'card' || !cardListRef.current) return;
    const el = cardListRef.current.querySelector('[data-highlighted="true"]') as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [cardHighlightIdx, activeStep]);

  // Scroll highlighted set item into view in Step 2 dropdown
  useEffect(() => {
    if (activeStep !== 'set' || !setListRef.current) return;
    const el = setListRef.current.querySelector('[data-highlighted="true"]') as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [setHighlightIdx, activeStep]);

  // Filtered printings in Step 2 dropdown (user can use Up/Down arrows OR type set code/name to filter)
  const filteredPrintings = useMemo(() => {
    const q = setFilterText.trim().toLowerCase();
    if (!q) return printings;
    const matches = printings.filter(
      p =>
        (p.set_code || '').toLowerCase().includes(q) ||
        (p.set_name || '').toLowerCase().includes(q) ||
        String(p.collector_number || '').toLowerCase().includes(q)
    );
    return matches.length > 0 ? matches : printings;
  }, [printings, setFilterText]);

  // Keep selectedPrintingCard synced with setHighlightIdx while in Step 2
  useEffect(() => {
    if (filteredPrintings.length > 0) {
      const clampedIdx = Math.min(setHighlightIdx, filteredPrintings.length - 1);
      setSelectedPrintingCard(filteredPrintings[clampedIdx]);
    }
  }, [setHighlightIdx, filteredPrintings]);

  function getUnitPrices(card: MtgCard | null, fin: FinishType) {
    if (!card) return { tcg: 0, ck: 0 };
    const isFoil = fin === 'foil' || fin === 'etched';
    const tcg =
      fin === 'etched'
        ? (card.tcg_usd_etched ?? card.tcg_usd_foil ?? card.tcg_usd ?? 0)
        : isFoil
          ? (card.tcg_usd_foil ?? card.tcg_usd ?? 0)
          : (card.tcg_usd ?? card.tcg_usd_foil ?? 0);
    const ck = isFoil
      ? (card.ck_retail_foil ?? card.ck_retail_nonfoil ?? 0)
      : (card.ck_retail_nonfoil ?? card.ck_retail_foil ?? 0);
    return { tcg, ck };
  }

  // Lock in Step 1 (Card Name) and automatically open & focus Step 2 (Set / Printing Dropdown)
  async function selectCardAndMoveToSetStep(card: MtgCard) {
    setSelectedBaseCard(card);
    setRawCardInput(card.name);
    setSelectedPrintingCard(card);
    setSetFilterText('');
    setSetHighlightIdx(0);
    setActiveStep('set');

    requestAnimationFrame(() => {
      setInputRef.current?.focus();
    });

    const key = card.name.toLowerCase();
    const cached = printingsMemoryCache.get(key);
    if (cached && cached.length > 0) {
      setPrintings(cached);
      const idx = cached.findIndex(p => p.scryfall_id === card.scryfall_id);
      setSetHighlightIdx(idx >= 0 ? idx : 0);
      setSelectedPrintingCard(cached[idx >= 0 ? idx : 0]);
      return;
    }

    setLoadingPrintings(true);
    setPrintings([card]);
    try {
      const res = await fetch(`/api/scryfall/printings?name=${encodeURIComponent(card.name)}`);
      const json = await res.json();
      const list: MtgCard[] = Array.isArray(json.data) && json.data.length > 0 ? json.data : [card];
      printingsMemoryCache.set(key, list);
      setPrintings(list);
      const idx = list.findIndex(p => p.scryfall_id === card.scryfall_id);
      setSetHighlightIdx(idx >= 0 ? idx : 0);
      setSelectedPrintingCard(list[idx >= 0 ? idx : 0]);
    } catch {
      setPrintings([card]);
    } finally {
      setLoadingPrintings(false);
    }
  }

  // Commit the card using the current static Foil/Non-Foil state, then return focus to Step 1 (Card Name)!
  // Note: selectedFinish is NEVER reset here — it stays static until the user changes it!
  async function commitCard(
    overridePrinting?: MtgCard,
    overrideForceBuy?: boolean,
    overrideBoard?: BoardType
  ) {
    const cardToAdd =
      overridePrinting ||
      selectedPrintingCard ||
      filteredPrintings[setHighlightIdx] ||
      selectedBaseCard ||
      cardResults[cardHighlightIdx];
    if (!cardToAdd || submitting) return;

    const fin = selectedFinish;
    const forceBuy = overrideForceBuy !== undefined ? overrideForceBuy : selectedForceBuy;
    const boardToUse = overrideBoard || board;
    const qtyToCommit = boardToUse === 'commander' ? 1 : Math.max(1, quantity);

    setSubmitting(true);
    const finishLabel = fin === 'foil' ? '✨ Foil' : fin === 'etched' ? '🌟 Etched Foil' : 'Non-Foil';
    const setLabel = `${(cardToAdd.set_code || '').toUpperCase()} #${cardToAdd.collector_number}`;

    try {
      if (mode === 'inventory' && onAddInventoryCard) {
        await onAddInventoryCard({
          card: cardToAdd,
          quantity: qtyToCommit,
          finish: fin,
          condition,
          location
        });
        setLastAddedBanner(
          `✓ Added ${qtyToCommit}x ${cardToAdd.name} [${setLabel} - ${cardToAdd.set_name || ''}] (${finishLabel}) to ${location}`
        );
      } else if (mode === 'deck' && onAddDeckCard) {
        await onAddDeckCard({
          card: cardToAdd,
          quantity: qtyToCommit,
          board: boardToUse,
          finish: fin,
          forceBuy
        });
        setLastAddedBanner(
          boardToUse === 'commander'
            ? `👑 Set ${cardToAdd.name} [${setLabel}] (${finishLabel}) as Commander of ${deckName || 'Deck'}!`
            : forceBuy
              ? `🛒 Added ${qtyToCommit}x ${cardToAdd.name} [${setLabel}] (${finishLabel}) to ${deckName || 'Deck'} Buy List!`
              : `✓ Added ${qtyToCommit}x ${cardToAdd.name} [${setLabel}] (${finishLabel}) to ${deckName || 'Deck'}!`
        );
      }

      // Reset ONLY the card & set search inputs — keep selectedFinish and selectedForceBuy 100% static!
      setRawCardInput('');
      setCardResults([]);
      setSelectedBaseCard(null);
      setSelectedPrintingCard(null);
      setPrintings([]);
      setSetFilterText('');
      setQuantity(1);
      setActiveStep('card');
      requestAnimationFrame(() => {
        cardInputRef.current?.focus();
      });
    } finally {
      setSubmitting(false);
    }
  }

  // Step 1 Key Handler (Card Name Dropdown)
  function handleCardInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      if (cardResults.length > 0) {
        e.preventDefault();
        setCardHighlightIdx(prev => (prev + 1) % cardResults.length);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      if (cardResults.length > 0) {
        e.preventDefault();
        setCardHighlightIdx(prev => (prev - 1 + cardResults.length) % cardResults.length);
      }
      return;
    }
    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey && cardResults.length > 0)) {
      const target = cardResults[cardHighlightIdx] || cardResults[0];
      if (target) {
        e.preventDefault();
        selectCardAndMoveToSetStep(target);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setRawCardInput('');
      setCardResults([]);
      setActiveStep('idle');
    }
  }

  // Step 2 Key Handler (Set / Printing Dropdown — Up/Down Arrow Keys select the Set!)
  function handleSetInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      if (filteredPrintings.length > 0) {
        e.preventDefault();
        setSetHighlightIdx(prev => (prev + 1) % filteredPrintings.length);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      if (filteredPrintings.length > 0) {
        e.preventDefault();
        setSetHighlightIdx(prev => (prev - 1 + filteredPrintings.length) % filteredPrintings.length);
      }
      return;
    }
    // Pressing Enter in the Set Dropdown locks in the Set and immediately adds the card
    // using the user's static Foil/Non-Foil setting (or Shift+Enter to force Buy List)!
    if (e.key === 'Enter') {
      e.preventDefault();
      const chosenSet = filteredPrintings[setHighlightIdx] || filteredPrintings[0] || selectedBaseCard;
      if (chosenSet) {
        setSelectedPrintingCard(chosenSet);
        setActiveStep('idle');
        if (mode === 'deck' && (e.shiftKey || e.ctrlKey)) {
          commitCard(chosenSet, true);
        } else {
          commitCard(chosenSet);
        }
      }
      return;
    }
    // Pressing Tab in the Set Dropdown locks in the Set and moves focus to the static Foil/Non-Foil dropdown
    // in case the user wants to change the static Foil/Non-Foil dropdown with their arrow keys!
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const chosenSet = filteredPrintings[setHighlightIdx] || filteredPrintings[0] || selectedBaseCard;
      if (chosenSet) {
        setSelectedPrintingCard(chosenSet);
      }
      setSetFilterText('');
      setActiveStep('idle');
      requestAnimationFrame(() => {
        finishSelectRef.current?.focus();
      });
      return;
    }
    if (e.key === 'Escape' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      setActiveStep('card');
      requestAnimationFrame(() => {
        cardInputRef.current?.focus();
        cardInputRef.current?.select();
      });
    }
  }

  const previewCard =
    selectedPrintingCard ||
    (activeStep === 'set' ? filteredPrintings[setHighlightIdx] : null) ||
    selectedBaseCard ||
    cardResults[cardHighlightIdx] ||
    null;

  return (
    <div className="rounded-2xl bg-slate-900/95 border border-amber-500/40 p-4 space-y-3 shadow-lg">
      {/* Top Bar: Context Selectors */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0">
            <Keyboard className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-slate-100">
            {mode === 'inventory' ? 'Quick Add Cards' : `Quick Add to ${deckName || 'Deck'}`}
          </span>
        </div>

        {/* Binder / Condition / Board Zone Context */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {mode === 'inventory' ? (
            <>
              <div className="flex items-center gap-1">
                <span className="text-slate-400 text-[11px]">Binder:</span>
                <select
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 font-semibold"
                >
                  {locations.map(loc => (
                    <option key={loc} value={loc}>
                      📁 {loc}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-400 text-[11px]">Cond:</span>
                <select
                  value={condition}
                  onChange={e => setCondition(e.target.value as ConditionType)}
                  className="px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 font-semibold"
                >
                  <option value="NM">NM</option>
                  <option value="LP">LP</option>
                  <option value="MP">MP</option>
                  <option value="HP">HP</option>
                  <option value="DMG">DMG</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <span className="text-slate-400 text-[11px]">Target:</span>
                <select
                  value={selectedForceBuy ? 'buylist' : 'deck'}
                  onChange={e => setSelectedForceBuy(e.target.value === 'buylist')}
                  className={`px-2.5 py-1 rounded-xl border text-xs font-bold ${
                    selectedForceBuy
                      ? 'bg-rose-950/70 border-rose-500/50 text-rose-200'
                      : 'bg-slate-950 border-slate-700 text-emerald-300'
                  }`}
                >
                  <option value="deck">Add to Deck</option>
                  <option value="buylist">Add to Buy List</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-400 text-[11px]">Zone:</span>
                <select
                  value={board}
                  onChange={e => setBoard(e.target.value as BoardType)}
                  className="px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 font-semibold"
                >
                  <option value="mainboard">Mainboard</option>
                  <option value="commander">👑 Commander</option>
                  <option value="sideboard">Sideboard</option>
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Sequential Bar: Card Name -> Set -> Finish -> Qty & Add */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-end">
        {/* STEP 1: CARD NAME AUTOCOMPLETE DROPDOWN (4 cols) */}
        <div className="lg:col-span-4 relative">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Card Name
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-amber-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={cardInputRef}
              type="text"
              value={rawCardInput}
              onFocus={() => setActiveStep('card')}
              onChange={e => {
                setRawCardInput(e.target.value);
                setSelectedBaseCard(null);
                setSelectedPrintingCard(null);
                setActiveStep('card');
              }}
              onKeyDown={handleCardInputKeyDown}
              placeholder="Card name..."
              className={`w-full pl-9 pr-8 py-2.5 rounded-xl bg-slate-950 border text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition ${
                activeStep === 'card'
                  ? 'border-amber-400 ring-2 ring-amber-400/20'
                  : selectedBaseCard
                    ? 'border-emerald-500/50'
                    : 'border-slate-700'
              }`}
            />
            {loadingCards && (
              <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
            )}
          </div>

          {/* Step 1 Dropdown List */}
          {activeStep === 'card' && cardResults.length > 0 && (
            <div
              ref={cardListRef}
              className="absolute left-0 right-0 top-full mt-1 z-40 rounded-xl bg-slate-950 border border-amber-500/60 shadow-2xl max-h-72 overflow-y-auto divide-y divide-slate-800/80"
            >
              {cardResults.map((card, idx) => {
                const isHighlighted = idx === cardHighlightIdx;
                const rowCmdRole = mode === 'deck' ? getCommanderOrBackgroundRole(card) : null;
                return (
                  <div
                    key={card.scryfall_id}
                    data-highlighted={isHighlighted ? 'true' : 'false'}
                    onMouseDown={e => {
                      e.preventDefault();
                      selectCardAndMoveToSetStep(card);
                    }}
                    onMouseEnter={() => setCardHighlightIdx(idx)}
                    className={`px-3 py-2 flex items-center justify-between gap-2 text-xs cursor-pointer transition ${
                      isHighlighted
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'hover:bg-slate-900 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {card.image_small && (
                        <img
                          src={card.image_small}
                          alt=""
                          className="w-6 h-8 rounded object-cover shrink-0"
                        />
                      )}
                      <span className="truncate">{card.name}</span>
                      <ManaCost cost={card.mana_cost} size="sm" />
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {rowCmdRole && (
                        <button
                          type="button"
                          onMouseDown={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            setActiveStep('idle');
                            commitCard(card, undefined, 'commander');
                          }}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border transition cursor-pointer ${
                            isHighlighted
                              ? 'bg-slate-950 text-amber-300 border-slate-800 hover:bg-slate-900'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/35'
                          }`}
                          title={
                            rowCmdRole === 'background'
                              ? `Add ${card.name} directly as Background of ${deckName || 'Deck'}`
                              : `Set ${card.name} directly as Commander of ${deckName || 'Deck'}`
                          }
                        >
                          👑 {rowCmdRole === 'background' ? '+ Background' : '+ Commander'}
                        </button>
                      )}
                      <span
                        className={`text-[10px] font-mono shrink-0 ${
                          isHighlighted ? 'text-slate-900 font-bold' : 'text-slate-400'
                        }`}
                      >
                        Enter ↵
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* STEP 2: SET / PRINTING DROPDOWN MENU (4 cols) */}
        <div className="lg:col-span-4 relative">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Set / Printing
          </label>
          <div className="relative">
            <input
              ref={setInputRef}
              type="text"
              disabled={!selectedBaseCard}
              value={
                activeStep === 'set'
                  ? setFilterText
                  : selectedPrintingCard
                    ? `[${(selectedPrintingCard.set_code || '').toUpperCase()} #${selectedPrintingCard.collector_number}] ${selectedPrintingCard.set_name || ''}`
                    : ''
              }
              onFocus={() => {
                if (selectedBaseCard) {
                  setSetFilterText('');
                  setActiveStep('set');
                }
              }}
              onChange={e => {
                setSetFilterText(e.target.value);
                setSetHighlightIdx(0);
                setActiveStep('set');
              }}
              onKeyDown={handleSetInputKeyDown}
              placeholder={
                selectedBaseCard
                  ? `Select set (${printings.length})...`
                  : 'Select card first...'
              }
              className={`w-full pl-3 pr-8 py-2.5 rounded-xl bg-slate-950 border text-xs text-slate-100 placeholder-slate-400 focus:outline-none transition disabled:opacity-40 ${
                activeStep === 'set'
                  ? 'border-amber-400 ring-2 ring-amber-400/20'
                  : selectedPrintingCard
                    ? 'border-emerald-500/50 font-semibold text-amber-200'
                    : 'border-slate-700'
              }`}
            />
            {loadingPrintings ? (
              <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
            ) : (
              <ChevronDown
                onClick={() => {
                  if (selectedBaseCard) {
                    setActiveStep(activeStep === 'set' ? 'idle' : 'set');
                    setInputRef.current?.focus();
                  }
                }}
                className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
              />
            )}
          </div>

          {/* Step 2 Vertical Set / Edition Dropdown Menu (with Live Artwork Preview!) */}
          {activeStep === 'set' && selectedBaseCard && (
            <div className="absolute left-0 right-0 lg:-right-28 top-full mt-1 z-40 rounded-xl bg-slate-950 border border-amber-500/70 shadow-2xl overflow-hidden flex">
              <div
                ref={setListRef}
                className="flex-1 max-h-72 overflow-y-auto divide-y divide-slate-800/80"
              >
                {filteredPrintings.map((p, idx) => {
                  const isHighlighted = idx === setHighlightIdx;
                  const prices = getUnitPrices(p, selectedFinish);
                  return (
                    <div
                      key={`${p.scryfall_id}-${idx}`}
                      data-highlighted={isHighlighted ? 'true' : 'false'}
                      onMouseDown={e => {
                        e.preventDefault();
                        setSetHighlightIdx(idx);
                        setSelectedPrintingCard(p);
                        setActiveStep('idle');
                        commitCard(p);
                      }}
                      onMouseEnter={() => setSetHighlightIdx(idx)}
                      className={`px-3 py-2 flex items-center justify-between gap-2 text-xs cursor-pointer transition ${
                        isHighlighted
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'hover:bg-slate-900 text-slate-200'
                      }`}
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold uppercase shrink-0 ${
                            isHighlighted
                              ? 'bg-slate-950 text-amber-300'
                              : 'bg-slate-800 text-amber-300'
                          }`}
                        >
                          {p.set_code} #{p.collector_number}
                        </span>
                        <span className="truncate">{p.set_name || p.set_code.toUpperCase()}</span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                        {mode === 'deck' && getCommanderOrBackgroundRole(p) && (
                          <button
                            type="button"
                            onMouseDown={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSetHighlightIdx(idx);
                              setSelectedPrintingCard(p);
                              setActiveStep('idle');
                              commitCard(p, undefined, 'commander');
                            }}
                            className={`px-2 py-0.5 rounded font-sans text-[10px] font-extrabold border cursor-pointer ${
                              isHighlighted
                                ? 'bg-slate-950 text-amber-300 border-slate-800'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            }`}
                            title="Add this printing directly as your Commander / Background"
                          >
                            👑 +Cmdr
                          </button>
                        )}
                        <span className={isHighlighted ? 'text-slate-950 font-extrabold' : 'text-sky-400'}>
                          {formatUsd(prices.tcg)}
                        </span>
                        <span className={`text-[10px] ${isHighlighted ? 'text-slate-900' : 'text-slate-500'}`}>
                          Enter ↵
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Side Card Art Preview for Currently Highlighted Set */}
              {previewCard && previewCard.image_normal && (
                <div className="hidden sm:flex w-36 bg-slate-900 border-l border-slate-800 p-2 flex-col items-center justify-center shrink-0">
                  <img
                    src={previewCard.image_normal}
                    alt={previewCard.name}
                    className="w-32 rounded-lg object-cover shadow-md border border-slate-700"
                  />
                  <div className="text-[10px] font-mono text-amber-300 font-bold uppercase mt-1.5 text-center">
                    {previewCard.set_code} #{previewCard.collector_number}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* STEP 3: STATIC FOIL / NON-FOIL DROPDOWN (2 cols) */}
        <div className="lg:col-span-2">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Finish
          </label>
          <select
            ref={finishSelectRef}
            value={selectedFinish}
            onChange={e => handleChangeStaticFinish(e.target.value as FinishType)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (selectedPrintingCard || selectedBaseCard)) {
                e.preventDefault();
                commitCard();
              }
            }}
            className={`w-full px-3 py-2.5 rounded-xl border text-xs font-bold focus:outline-none focus:border-amber-400 transition cursor-pointer ${
              selectedFinish === 'foil'
                ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                : selectedFinish === 'etched'
                  ? 'bg-purple-500/20 border-purple-400 text-purple-200'
                  : 'bg-slate-950 border-slate-700 text-slate-100'
            }`}
          >
            <option value="nonfoil" className="bg-slate-900 text-slate-100">
              Non-Foil
            </option>
            <option value="foil" className="bg-slate-900 text-amber-300">
              ✨ Foil
            </option>
            <option value="etched" className="bg-slate-900 text-purple-300">
              🌟 Etched Foil
            </option>
          </select>
        </div>

        {/* STEP 4: QUANTITY & ADD BUTTON (2 cols) */}
        <div className="lg:col-span-2 flex items-end gap-1.5">
          <div className="w-16 shrink-0">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Qty
            </label>
            <input
              ref={qtyInputRef}
              type="number"
              min={1}
              max={99}
              value={quantity}
              onChange={e => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitCard();
                }
              }}
              className="w-full px-2 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-amber-400 text-xs font-mono font-bold text-amber-300 text-center focus:outline-none"
            />
          </div>

          <button
            type="button"
            disabled={!selectedPrintingCard && !selectedBaseCard}
            onClick={() => commitCard()}
            className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1 transition cursor-pointer disabled:opacity-40 ${
              mode === 'deck' && selectedForceBuy
                ? 'bg-rose-500 hover:bg-rose-400 text-white'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
            }`}
          >
            {mode === 'inventory' ? (
              <>
                <FolderPlus className="w-3.5 h-3.5 shrink-0" />
                <span>Add</span>
              </>
            ) : selectedForceBuy ? (
              <>
                <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
                <span>+ Buy List</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>+ Deck</span>
              </>
            )}
          </button>

          {mode === 'deck' &&
            previewCard &&
            getCommanderOrBackgroundRole(previewCard) &&
            board !== 'commander' && (
              <button
                type="button"
                onClick={() => commitCard(undefined, undefined, 'commander')}
                className="py-2.5 px-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/60 text-amber-300 font-extrabold text-xs flex items-center justify-center gap-1 transition cursor-pointer shrink-0"
                title={`Add ${previewCard.name} directly as Commander / Background`}
              >
                <span>👑</span>
                <span>Cmdr</span>
              </button>
            )}
        </div>
      </div>

      {/* Last Added Confirmation Banner */}
      {lastAddedBanner && (
        <div className="px-3.5 py-2 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{lastAddedBanner}</span>
          </div>
          <span className="text-[11px] text-emerald-400/80 font-mono">
            Ready — type next card name!
          </span>
        </div>
      )}
    </div>
  );
};
