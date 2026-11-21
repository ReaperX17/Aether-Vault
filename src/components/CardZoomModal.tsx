import React, { useEffect, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Swords,
  Check,
  Plus,
  Minus,
  Sparkles,
  ExternalLink,
  FolderOpen,
  Layers,
  RefreshCw
} from 'lucide-react';
import { BoardType, DeckSummary, FinishType, InventoryItem, MtgCard } from '../types';
import { ManaCost } from './ManaCost';
import { DualPriceBadge, formatUsd } from './PriceBadge';
import { getSingleCardBracketBadges } from '../deckBracketAndSalt';

export interface ZoomableCard extends Partial<InventoryItem> {
  scryfall_id: string;
  name: string;
  set_code: string;
  collector_number: string;
  image_normal?: string | null;
  image_small?: string | null;
  finish?: FinishType;
  quantity?: number;
  sectionTitle?: string;
}

export function getCommanderOrBackgroundRole(card: {
  type_line?: string;
  oracle_text?: string;
}): 'commander' | 'background' | null {
  const tl = (card.type_line || '').toLowerCase();
  const ot = (card.oracle_text || '').toLowerCase();
  if (tl.includes('background')) {
    return 'background';
  }
  if (
    tl.includes('legendary') &&
    (tl.includes('creature') ||
      tl.includes('planeswalker') ||
      tl.includes('vehicle') ||
      tl.includes('spacecraft') ||
      ot.includes('can be your commander'))
  ) {
    return 'commander';
  }
  if (ot.includes('can be your commander')) {
    return 'commander';
  }
  return null;
}

export function isTransformOrDoubleFacedCard(card: {
  name?: string;
  type_line?: string;
  oracle_text?: string;
  keywords?: string[];
  image_normal?: string | null;
  image_small?: string | null;
}): boolean {
  const name = card.name || '';
  if (!name.includes('//')) return false;
  const tl = (card.type_line || '').toLowerCase();
  const ot = (card.oracle_text || '').toLowerCase();
  const kw = Array.isArray(card.keywords) ? card.keywords.map(k => k.toLowerCase()) : [];

  // Single-faced Adventure and Room cards have both halves on the front image
  if (tl.includes('adventure') || tl.includes('room')) return false;

  // Explicit transform / double-faced keywords or oracle text
  if (
    kw.includes('transform') ||
    kw.includes('daybound') ||
    kw.includes('nightbound') ||
    kw.includes('disturb') ||
    kw.includes('craft') ||
    kw.includes('more than meets the eye') ||
    kw.includes('living metal') ||
    ot.includes('transform') ||
    ot.includes('convert') ||
    ot.includes('melds with')
  ) {
    return true;
  }

  // Single-faced Split / Fuse / Aftermath cards are Instant/Sorcery on both halves
  if (kw.includes('fuse') || kw.includes('aftermath')) return false;
  const typeParts = tl.split('//').map(s => s.trim());
  if (
    typeParts.length === 2 &&
    /^(instant|sorcery)$/.test(typeParts[0]) &&
    /^(instant|sorcery)$/.test(typeParts[1])
  ) {
    return false;
  }

  // Modal DFCs (Pathways, Zendikar Rising spell-lands, Strixhaven Deans, etc.) and Battles have Permanent types on at least one face
  return true;
}

export function getCardFaceImageUrl(
  card: {
    scryfall_id: string;
    image_normal?: string | null;
    image_small?: string | null;
  },
  face: 'front' | 'back',
  size: 'large' | 'normal' | 'small' = 'normal'
): string {
  const rawBase =
    size === 'small'
      ? card.image_small || card.image_normal || null
      : card.image_normal || card.image_small || null;

  if (rawBase) {
    let sizedUrl = rawBase;
    if (size === 'large') {
      sizedUrl = sizedUrl.replace('/small/', '/large/').replace('/normal/', '/large/');
    } else if (size === 'normal') {
      sizedUrl = sizedUrl.replace('/small/', '/normal/');
    }
    if (face === 'back') {
      if (sizedUrl.includes('/front/')) {
        return sizedUrl.replace('/front/', '/back/');
      }
      return `https://api.scryfall.com/cards/${card.scryfall_id}?format=image&version=${size}&face=back`;
    }
    return sizedUrl;
  }

  return `https://api.scryfall.com/cards/${card.scryfall_id}?format=image&version=${size}&face=${face}`;
}

interface CardZoomModalProps {
  card: ZoomableCard | null;
  cardsList?: ZoomableCard[];
  decks?: DeckSummary[];
  defaultTargetDeckId?: number | null;
  defaultBoard?: BoardType;
  onClose: () => void;
  onSelectCard?: (card: ZoomableCard) => void;
  onTargetDeckChange?: (deckId: number) => void;
  onAddToDeck?: (card: ZoomableCard, deckId: number, board: BoardType) => Promise<void> | void;
  onCreateNewDeckWithCommander?: (card: ZoomableCard, deckName: string) => Promise<void> | void;
  onUpdateInventoryQty?: (id: number, nextQty: number) => Promise<void> | void;
  onOpenPrintingPicker?: (card: ZoomableCard) => void;
  onNavigateToDeck?: (deckId: number) => void;
}

export const CardZoomModal: React.FC<CardZoomModalProps> = ({
  card,
  cardsList = [],
  decks = [],
  defaultTargetDeckId = null,
  defaultBoard = 'mainboard',
  onClose,
  onSelectCard,
  onTargetDeckChange,
  onAddToDeck,
  onCreateNewDeckWithCommander,
  onUpdateInventoryQty,
  onOpenPrintingPicker,
  onNavigateToDeck
}) => {
  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(
    defaultTargetDeckId || (decks.length > 0 ? decks[0].id : null)
  );
  const [selectedBoard, setSelectedBoard] = useState<BoardType>(defaultBoard);
  const [addingToDeck, setAddingToDeck] = useState(false);
  const [addedFeedback, setAddedFeedback] = useState<string | null>(null);
  const [newCmdDeckName, setNewCmdDeckName] = useState<string>('');
  const [creatingCmdDeck, setCreatingCmdDeck] = useState<boolean>(false);
  const [createdCmdFeedback, setCreatedCmdFeedback] = useState<string | null>(null);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [backImgFallbackRotate, setBackImgFallbackRotate] = useState<boolean>(false);

  useEffect(() => {
    if (defaultTargetDeckId) {
      setSelectedDeckId(defaultTargetDeckId);
    } else if (!selectedDeckId && decks.length > 0) {
      setSelectedDeckId(decks[0].id);
    }
  }, [defaultTargetDeckId, decks, selectedDeckId]);

  useEffect(() => {
    setSelectedBoard(defaultBoard);
  }, [defaultBoard]);

  useEffect(() => {
    setAddedFeedback(null);
    setCreatedCmdFeedback(null);
    setIsFlipped(false);
    setBackImgFallbackRotate(false);
    if (card?.name) {
      setNewCmdDeckName(card.name);
    }
  }, [card?.id, card?.scryfall_id, card?.name]);

  const currentIndex = React.useMemo(() => {
    if (!card || cardsList.length <= 1) return -1;
    return cardsList.findIndex(c =>
      card.id !== undefined && c.id !== undefined
        ? c.id === card.id
        : c.scryfall_id === card.scryfall_id && c.finish === card.finish
    );
  }, [card, cardsList]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < cardsList.length - 1;

  // Build Archidekt-style section breakdown if cardsList has sectionTitle tags
  const sectionGroups = React.useMemo(() => {
    const map = new Map<string, { title: string; firstIndex: number; cards: ZoomableCard[]; totalQty: number }>();
    cardsList.forEach((c, idx) => {
      if (!c.sectionTitle) return;
      const existing = map.get(c.sectionTitle);
      if (!existing) {
        map.set(c.sectionTitle, {
          title: c.sectionTitle,
          firstIndex: idx,
          cards: [c],
          totalQty: c.quantity || 1
        });
      } else {
        existing.cards.push(c);
        existing.totalQty += c.quantity || 1;
      }
    });
    return Array.from(map.values());
  }, [cardsList]);

  const currentSectionTitle =
    (currentIndex >= 0 ? cardsList[currentIndex]?.sectionTitle : undefined) || card?.sectionTitle;
  const currentSectionIdx = currentSectionTitle
    ? sectionGroups.findIndex(s => s.title === currentSectionTitle)
    : -1;
  const currentSectionObj = currentSectionIdx >= 0 ? sectionGroups[currentSectionIdx] : null;
  const indexWithinSection =
    currentSectionObj && card
      ? currentSectionObj.cards.findIndex(c =>
          card.id !== undefined && c.id !== undefined ? c.id === card.id : c.scryfall_id === card.scryfall_id
        )
      : -1;

  const canFlip = card ? isTransformOrDoubleFacedCard(card) : false;

  useEffect(() => {
    if (!card) return;
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (!inInput && e.key === 'ArrowLeft' && hasPrev && onSelectCard) {
        e.preventDefault();
        onSelectCard(cardsList[currentIndex - 1]);
      } else if (!inInput && e.key === 'ArrowRight' && hasNext && onSelectCard) {
        e.preventDefault();
        onSelectCard(cardsList[currentIndex + 1]);
      } else if (!inInput && (e.key === 'f' || e.key === 'F') && canFlip) {
        e.preventDefault();
        setIsFlipped(v => !v);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [card, hasPrev, hasNext, currentIndex, cardsList, onClose, onSelectCard, canFlip]);

  if (!card) return null;

  const activeFace: 'front' | 'back' = canFlip && isFlipped ? 'back' : 'front';
  const baseImg = getCardFaceImageUrl(card, activeFace, 'normal');
  const highResImg = backImgFallbackRotate
    ? getCardFaceImageUrl(card, 'front', 'large')
    : getCardFaceImageUrl(card, activeFace, 'large');

  const faceNames = (card.name || '').split('//').map(s => s.trim());
  const faceTypes = (card.type_line || '').split('//').map(s => s.trim());
  const faceOracles = (card.oracle_text || '').split('\n---\n').map(s => s.trim());

  const finish: FinishType = card.finish || 'nonfoil';
  const usedDecks = card.used_in_decks || [];
  const targetDeckObj = decks.find(d => d.id === selectedDeckId) || null;
  const inTargetDeckEntry = targetDeckObj
    ? usedDecks.find(d => d.deck_id === targetDeckObj.id)
    : undefined;

  async function handleTriggerAddToDeck(overrideBoard?: BoardType) {
    if (!selectedDeckId || !card) return;
    const boardToUse = overrideBoard || selectedBoard;
    setAddingToDeck(true);
    try {
      if (onAddToDeck) {
        await onAddToDeck(card, selectedDeckId, boardToUse);
      } else {
        await fetch(`/api/decks/${selectedDeckId}/cards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            card,
            quantity: 1,
            board: boardToUse,
            finish: card.finish || 'nonfoil'
          })
        });
      }
      const dName = targetDeckObj ? targetDeckObj.name : 'Deck';
      setAddedFeedback(`Added 1x to "${dName}" (${boardToUse})`);
      setTimeout(() => setAddedFeedback(null), 2400);
    } finally {
      setAddingToDeck(false);
    }
  }

  const cmdRole = getCommanderOrBackgroundRole(card);
  const isLegendaryCmdrCandidate = cmdRole !== null;

  async function handleStartNewDeckWithCommander(e: React.FormEvent) {
    e.preventDefault();
    if (!card) return;
    const deckTitle = (newCmdDeckName || card.name).trim() || card.name;
    setCreatingCmdDeck(true);
    try {
      if (onCreateNewDeckWithCommander) {
        await onCreateNewDeckWithCommander(card, deckTitle);
      } else {
        await fetch('/api/decks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: deckTitle,
            format: 'commander',
            commanderCard: card
          })
        });
      }
      setCreatedCmdFeedback(
        cmdRole === 'background'
          ? `Created "${deckTitle}" with ${card.name} as Background & set as Active Target Deck!`
          : `Created "${deckTitle}" with ${card.name} as Commander & set as Active Target Deck!`
      );
    } finally {
      setCreatingCmdDeck(false);
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-3 sm:p-6 overflow-y-auto"
    >
      {/* Left Arrow Navigation (Desktop/Tablet) */}
      {hasPrev && onSelectCard && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onSelectCard(cardsList[currentIndex - 1]);
          }}
          className="hidden md:flex fixed left-5 top-1/2 -translate-y-1/2 z-50 p-3 rounded-full bg-slate-900/90 hover:bg-amber-500 text-slate-200 hover:text-slate-950 border border-slate-700 shadow-2xl transition cursor-pointer"
          title="Previous Card (Left Arrow Key)"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* Right Arrow Navigation (Desktop/Tablet) */}
      {hasNext && onSelectCard && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onSelectCard(cardsList[currentIndex + 1]);
          }}
          className="hidden md:flex fixed right-5 top-1/2 -translate-y-1/2 z-50 p-3 rounded-full bg-slate-900/90 hover:bg-amber-500 text-slate-200 hover:text-slate-950 border border-slate-700 shadow-2xl transition cursor-pointer"
          title="Next Card (Right Arrow Key)"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Modal Content Container */}
      <div
        onClick={e => e.stopPropagation()}
        className="relative bg-slate-900 border border-slate-700/90 rounded-2xl sm:rounded-3xl max-w-4xl w-full p-4 sm:p-7 shadow-2xl grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-5 items-start max-h-[92vh] overflow-y-auto"
      >
        {/* Unified Top Header Bar (No Overlapping Elements) */}
        <div className="md:col-span-12 pb-3 border-b border-slate-800 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Left Side: Current Section Badge or Card Position */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {currentSectionObj && indexWithinSection >= 0 && (
                <span className="px-2 sm:px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/40 font-bold text-xs text-amber-300">
                  {currentSectionObj.title} ({indexWithinSection + 1} / {currentSectionObj.cards.length})
                </span>
              )}
              {currentIndex >= 0 && cardsList.length > 1 && (
                <span className="px-2 sm:px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-400">
                  {currentIndex + 1} / {cardsList.length}
                </span>
              )}
            </div>

            {/* Right Side: Mobile Card Prev/Next + Prev/Next Section Buttons + Close Button */}
            <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
              {cardsList.length > 1 && onSelectCard && (
                <div className="flex md:hidden items-center gap-1 text-xs">
                  <button
                    type="button"
                    disabled={!hasPrev}
                    onClick={() => hasPrev && onSelectCard(cardsList[currentIndex - 1])}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 disabled:opacity-40 border border-slate-700 text-slate-200 font-bold cursor-pointer"
                  >
                    ← Card
                  </button>
                  <button
                    type="button"
                    disabled={!hasNext}
                    onClick={() => hasNext && onSelectCard(cardsList[currentIndex + 1])}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 disabled:opacity-40 border border-slate-700 text-slate-200 font-bold cursor-pointer"
                  >
                    Card →
                  </button>
                </div>
              )}

              {sectionGroups.length > 1 && onSelectCard && (
                <div className="hidden sm:flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    disabled={currentSectionIdx <= 0}
                    onClick={() => {
                      if (currentSectionIdx > 0) {
                        const prevSec = sectionGroups[currentSectionIdx - 1];
                        if (prevSec.cards[0]) onSelectCard(prevSec.cards[0]);
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 disabled:opacity-40 border border-slate-700 text-slate-200 font-semibold cursor-pointer"
                  >
                    ◀ Prev Section
                  </button>
                  <button
                    type="button"
                    disabled={currentSectionIdx < 0 || currentSectionIdx >= sectionGroups.length - 1}
                    onClick={() => {
                      if (currentSectionIdx >= 0 && currentSectionIdx < sectionGroups.length - 1) {
                        const nextSec = sectionGroups[currentSectionIdx + 1];
                        if (nextSec.cards[0]) onSelectCard(nextSec.cards[0]);
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 disabled:opacity-40 border border-slate-700 text-slate-200 font-semibold cursor-pointer"
                  >
                    Next Section ▶
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Row 2: Clickable Section Pills (Swipeable on Mobile, Wrapped on Desktop) */}
          {sectionGroups.length > 1 && onSelectCard && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0 sm:flex-wrap">
              {sectionGroups.map(sec => {
                const isActiveSec = sec.title === currentSectionTitle;
                return (
                  <button
                    key={sec.title}
                    type="button"
                    onClick={() => {
                      if (sec.cards[0]) onSelectCard(sec.cards[0]);
                    }}
                    className={`shrink-0 px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border ${
                      isActiveSec
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                        : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'
                    }`}
                  >
                    <span>{sec.title}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] ${
                        isActiveSec ? 'bg-slate-950/20 text-slate-950 font-extrabold' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {sec.totalQty}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Left Column: Blown-Up High-Res Card Artwork */}
        <div className="md:col-span-5 flex flex-col items-center">
          <div
            className={`relative w-full max-w-[260px] sm:max-w-[330px] md:max-w-[360px] aspect-[63/88] rounded-[20px] overflow-hidden bg-slate-950 shadow-2xl border-2 ${
              finish === 'foil'
                ? 'border-amber-400 shadow-amber-500/20'
                : finish === 'etched'
                  ? 'border-purple-400 shadow-purple-500/20'
                  : 'border-slate-800'
            }`}
          >
            <img
              src={highResImg}
              alt={card.name}
              onError={e => {
                const imgEl = e.currentTarget as HTMLImageElement;
                if (activeFace === 'back' && !backImgFallbackRotate) {
                  setBackImgFallbackRotate(true);
                  return;
                }
                if (baseImg && imgEl.src !== baseImg) {
                  imgEl.src = baseImg;
                }
              }}
              className={`w-full h-full object-contain transition-transform duration-300 ${
                activeFace === 'back' && backImgFallbackRotate ? 'rotate-180' : ''
              }`}
            />
            {finish !== 'nonfoil' && (
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-amber-500/95 text-slate-950 font-black text-xs uppercase shadow-lg">
                ✨ {finish}
              </div>
            )}
            {canFlip && (
              <button
                type="button"
                onClick={() => setIsFlipped(v => !v)}
                className="absolute bottom-3 inset-x-4 py-2 px-3 rounded-xl bg-slate-950/90 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-400/60 font-extrabold text-xs flex items-center justify-center gap-2 shadow-xl backdrop-blur-md transition cursor-pointer"
                title="Flip between Front and Back side of this Transform / Double-Faced card (Shortcut: F)"
              >
                <RefreshCw className={`w-4 h-4 transition-transform duration-300 ${isFlipped ? 'rotate-180' : ''}`} />
                <span>
                  {isFlipped
                    ? `Viewing Back Side (${faceNames[1] || 'Back'}) • Flip to Front`
                    : `Flip to Back Side (${faceNames[1] || 'Transform'})`}
                </span>
              </button>
            )}
          </div>

          {/* Below-Image Quick Flip, Quantity & Set Controls */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-3 w-full">
            {canFlip && (
              <button
                type="button"
                onClick={() => setIsFlipped(v => !v)}
                className={`px-3.5 py-1.5 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
                  isFlipped
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                    : 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border-sky-500/50'
                }`}
                title="Shortcut: Press 'F' to flip card"
              >
                <RefreshCw className={`w-3.5 h-3.5 transition-transform duration-300 ${isFlipped ? 'rotate-180' : ''}`} />
                <span>{isFlipped ? 'Flip to Front Side (F)' : 'Flip to Back Side (F)'}</span>
              </button>
            )}
            {card.id !== undefined && onUpdateInventoryQty && card.quantity !== undefined && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xs text-slate-400">Owned Qty:</span>
                <button
                  type="button"
                  onClick={() => onUpdateInventoryQty(card.id!, card.quantity! - 1)}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono font-bold text-sm text-amber-300 px-1.5">
                  {card.quantity}x
                </span>
                <button
                  type="button"
                  onClick={() => onUpdateInventoryQty(card.id!, card.quantity! + 1)}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {onOpenPrintingPicker && (
              <button
                type="button"
                onClick={() => onOpenPrintingPicker(card)}
                className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-amber-300 flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Switch Set / Printing
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Card Oracle Text, Pricing, Allocation & Add-to-Deck Controls */}
        <div className="md:col-span-7 space-y-4">
          {/* Title & Mana Cost */}
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-black text-slate-100 leading-tight">
                {card.name}
              </h2>
              {card.mana_cost && <ManaCost cost={card.mana_cost} size="md" />}
            </div>
            <div className="text-sm font-semibold text-amber-300/90 mt-1">
              {card.type_line}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
              <span className="px-2.5 py-0.5 rounded-md bg-slate-950 border border-slate-700 font-mono font-bold text-amber-300 uppercase">
                {card.set_code} #{card.collector_number}
              </span>
              {card.set_name && (
                <span className="text-slate-400">{card.set_name}</span>
              )}
              {card.rarity && (
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 capitalize font-medium">
                  {card.rarity}
                </span>
              )}
              {card.condition && (
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono">
                  Cond: {card.condition}
                </span>
              )}

              {/* Official WotC Game Changer / Fast Mana / MLD / Salt Score Badges inside Blown-Up View */}
              {(() => {
                const bInfo = getSingleCardBracketBadges(card);
                return (
                  <>
                    {bInfo.isGameChanger && (
                      <span
                        className="px-2.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/60 text-amber-200 font-extrabold"
                        title={`Official Wizards of the Coast Game Changer (${bInfo.gameChangerCategory})`}
                      >
                        ⚡ Official WotC Game Changer ({bInfo.gameChangerCategory})
                      </span>
                    )}
                    {bInfo.isFastMana && (
                      <span className="px-2 py-0.5 rounded-md bg-sky-500/20 border border-sky-400/50 text-sky-200 font-bold">
                        💎 Fast Mana
                      </span>
                    )}
                    {bInfo.isMld && (
                      <span className="px-2 py-0.5 rounded-md bg-rose-500/25 border border-rose-400/60 text-rose-200 font-extrabold">
                        🌋 Mass Land Denial (Bracket 4+)
                      </span>
                    )}
                    {bInfo.isExtraTurn && (
                      <span className="px-2 py-0.5 rounded-md bg-purple-500/20 border border-purple-400/50 text-purple-200 font-bold">
                        ⏳ Extra Turn
                      </span>
                    )}
                    <span
                      className={`px-2.5 py-0.5 rounded-md font-mono font-bold border ${
                        bInfo.saltScore >= 2.5
                          ? 'bg-rose-500/20 border-rose-500/50 text-rose-200'
                          : bInfo.saltScore >= 1.75
                            ? 'bg-orange-500/20 border-orange-500/50 text-orange-200'
                            : 'bg-slate-950 border-slate-800 text-slate-300'
                      }`}
                      title={bInfo.saltReasons.join(' • ') || 'Community Salt Score (0.00 - 4.00 EDHREC Scale)'}
                    >
                      🧂 Salt Score: {bInfo.saltScore.toFixed(2)} / 4.00
                    </span>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Oracle Text & Power/Toughness (with Front/Back Face Selector for Transform Cards) */}
          {(card.oracle_text || card.power !== undefined || canFlip) && (
            <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2.5">
              {canFlip && faceNames.length >= 2 && (
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
                  <div className="inline-flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                    <button
                      type="button"
                      onClick={() => setIsFlipped(false)}
                      className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                        !isFlipped ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Front: {faceNames[0]}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsFlipped(true)}
                      className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                        isFlipped ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Back: {faceNames[1]}
                    </button>
                  </div>
                  <span className="text-[11px] font-semibold text-amber-300/90">
                    {isFlipped ? faceTypes[1] || faceTypes[0] : faceTypes[0]}
                  </span>
                </div>
              )}

              {card.oracle_text && (
                <div className="text-xs sm:text-sm text-slate-200 whitespace-pre-line leading-relaxed">
                  {canFlip && faceOracles.length >= 2
                    ? isFlipped
                      ? faceOracles[1]
                      : faceOracles[0]
                    : card.oracle_text}
                </div>
              )}
              {card.power !== undefined && card.power !== null && card.toughness !== undefined && card.toughness !== null && (
                <div className="flex justify-end pt-1">
                  <span className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-700 font-mono font-black text-sm text-amber-300">
                    {card.power} / {card.toughness}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Quick-Add to Any Deck Directly From Blown-Up View */}
          {decks.length > 0 && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-sky-950/50 via-slate-950 to-amber-950/30 border border-sky-500/40 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-sky-300 flex items-center gap-1.5 uppercase tracking-wider">
                  <Swords className="w-4 h-4 text-sky-400" />
                  Add This Card to a Deck
                </div>
                {inTargetDeckEntry && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold">
                    ✓ Already in {targetDeckObj?.name} ({inTargetDeckEntry.quantity}x)
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] text-slate-400 mb-1 uppercase font-bold">
                    Switch Target Deck ({decks.length} Decks Available)
                  </label>
                  <select
                    value={selectedDeckId || ''}
                    onChange={e => {
                      const nextId = Number(e.target.value);
                      setSelectedDeckId(nextId);
                      if (onTargetDeckChange) onTargetDeckChange(nextId);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-amber-300 font-bold text-xs focus:outline-none focus:border-amber-400"
                  >
                    {decks.map(d => (
                      <option key={d.id} value={d.id}>
                        ⚔️ {d.name} ({d.counts.activeTotal}/{d.counts.targetTotal})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 uppercase font-bold">Section</label>
                  <select
                    value={selectedBoard}
                    onChange={e => setSelectedBoard(e.target.value as BoardType)}
                    className="w-full px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 font-semibold text-xs focus:outline-none focus:border-amber-400"
                  >
                    <option value="mainboard">Mainboard</option>
                    <option value="considering">Considering</option>
                    <option value="sideboard">Sideboard</option>
                    <option value="commander">👑 Commander</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={addingToDeck || !selectedDeckId}
                  onClick={() => handleTriggerAddToDeck()}
                  className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
                    addedFeedback
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md'
                  }`}
                >
                  {addedFeedback ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>{addedFeedback}</span>
                    </>
                  ) : (
                    <>
                      <Swords className="w-4 h-4" />
                      <span>
                        + Add 1x to {targetDeckObj ? targetDeckObj.name : 'Deck'} ({selectedBoard})
                      </span>
                    </>
                  )}
                </button>

                {isLegendaryCmdrCandidate && selectedBoard !== 'commander' && (
                  <button
                    type="button"
                    disabled={addingToDeck || !selectedDeckId}
                    onClick={() => handleTriggerAddToDeck('commander')}
                    className="py-2.5 px-3.5 rounded-xl bg-slate-900 hover:bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-xs cursor-pointer"
                    title={
                      cmdRole === 'background'
                        ? `Add as Background in Commander zone of ${targetDeckObj?.name || 'Deck'}`
                        : `Set as Commander of ${targetDeckObj?.name || 'Deck'}`
                    }
                  >
                    {cmdRole === 'background'
                      ? `👑 Set Background in ${targetDeckObj?.name || 'Deck'}`
                      : `👑 Set Commander of ${targetDeckObj?.name || 'Deck'}`}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Start a Brand-New Deck with This Legendary Creature or Background */}
          {isLegendaryCmdrCandidate && (
            <form
              onSubmit={handleStartNewDeckWithCommander}
              className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/50 via-slate-950 to-emerald-950/30 border border-amber-500/50 space-y-2.5"
            >
              <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5 uppercase tracking-wider">
                <span>👑</span>
                <span>
                  {cmdRole === 'background'
                    ? 'Start a New Commander Deck with This Background'
                    : 'Start a New Commander Deck with This Commander'}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newCmdDeckName}
                  onChange={e => setNewCmdDeckName(e.target.value)}
                  placeholder="New Deck Name..."
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-amber-500/40 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
                />
                <button
                  type="submit"
                  disabled={creatingCmdDeck}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  {creatingCmdDeck
                    ? 'Creating Deck...'
                    : cmdRole === 'background'
                      ? '👑 New Deck w/ Background'
                      : '👑 New Deck as Commander'}
                </button>
              </div>
              {createdCmdFeedback && (
                <div className="px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{createdCmdFeedback}</span>
                </div>
              )}
            </form>
          )}

          {/* Collection Allocation & Binder Location Info */}
          {(card.quantity !== undefined || card.location || usedDecks.length > 0) && (
            <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {card.quantity !== undefined && (
                  <div className="flex items-center gap-3">
                    <span className="text-slate-300">
                      Total Owned: <strong className="font-mono text-slate-100">{card.quantity}</strong>
                    </span>
                    <span className="text-emerald-400">
                      ✓ Available: <strong className="font-mono">{card.available_qty ?? card.quantity}</strong>
                    </span>
                    <span className="text-sky-400">
                      ⚔️ In Decks: <strong className="font-mono">{card.in_decks_qty ?? 0}</strong>
                    </span>
                  </div>
                )}
                {card.location && (
                  <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1">
                    <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                    {card.location}
                  </span>
                )}
              </div>

              {usedDecks.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1 mr-1">
                    <Layers className="w-3.5 h-3.5 text-sky-400" />
                    Used in Decks:
                  </span>
                  {usedDecks.map(d => (
                    <button
                      key={d.deck_id}
                      type="button"
                      onClick={() => {
                        if (onNavigateToDeck) {
                          onClose();
                          onNavigateToDeck(d.deck_id);
                        }
                      }}
                      className="px-2 py-0.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/30 border border-sky-500/30 text-sky-300 font-semibold cursor-pointer"
                    >
                      ⚔️ {d.deck_name} ({d.quantity}x)
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Live Pricing & Store Links */}
          <div className="space-y-2">
            <DualPriceBadge
              card={card as MtgCard}
              finish={finish}
              quantity={card.quantity || 1}
              showBuylist
            />
            <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
              {card.tcgplayer_url && (
                <a
                  href={card.tcgplayer_url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 font-semibold flex items-center gap-1.5"
                >
                  <span>View on TCGplayer ({formatUsd(card.unit_tcg ?? card.tcg_usd)})</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              {card.cardkingdom_url && (
                <a
                  href={card.cardkingdom_url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-semibold flex items-center gap-1.5"
                >
                  <span>View on Card Kingdom ({formatUsd(card.unit_ck_retail ?? card.ck_retail_nonfoil)})</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
