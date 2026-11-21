import { DeckAnalysis, DeckCardItem, DeckSummary, MissingCardEntry } from './types';

const STORAGE_KEY = 'aethervault_forced_buylist_v1';

function makeKey(deckId: number, cardName: string): string {
  return `${Number(deckId)}:${(cardName || '').toLowerCase().trim()}`;
}

function readMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Seed Seedborn Muse in Deck 18 from user's recent click
      return { '18:seedborn muse': true };
    }
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent('aethervault-forced-buylist-changed'));
  } catch {
    // ignore storage errors
  }
}

export function isCardForcedOnBuylist(deckId: number, cardName: string, serverForceBuy?: number): boolean {
  const map = readMap();
  const key = makeKey(deckId, cardName);
  if (key in map) {
    return Boolean(map[key]);
  }
  return Boolean(serverForceBuy && Number(serverForceBuy) > 0);
}

export function setCardForcedOnBuylist(deckId: number, cardName: string, forced: boolean): void {
  const map = readMap();
  const key = makeKey(deckId, cardName);
  map[key] = forced;
  writeMap(map);
}

export function applyForcedBuylistToDeckDetail(detail: {
  deck: DeckSummary;
  cards: DeckCardItem[];
  analysis: DeckAnalysis;
} | null): {
  deck: DeckSummary;
  cards: DeckCardItem[];
  analysis: DeckAnalysis;
} | null {
  if (!detail || !detail.deck || !detail.analysis) return detail;
  const deckId = detail.deck.id;

  const missingMap = new Map<string, MissingCardEntry>();
  for (const m of detail.analysis.ownership.missingCards || []) {
    const k = `${m.deck_card_id || m.scryfall_id}:${m.board || 'mainboard'}`;
    missingMap.set(k, { ...m });
  }

  const updatedCards = detail.cards.map(c => {
    const isActiveBoard = c.board === 'commander' || c.board === 'mainboard' || c.board === 'sideboard';
    const forced = isActiveBoard && isCardForcedOnBuylist(deckId, c.name, c.force_buy);
    if (!forced) {
      return c;
    }

    const forcedMissingQty = Math.max(1, Number(c.quantity || 1));
    const unitTcg = Number(c.unit_tcg || 0);
    const unitCk = Number(c.unit_ck_retail || 0);
    const k = `${c.id || c.scryfall_id}:${c.board || 'mainboard'}`;
    // Also remove any existing entry keyed by scryfall_id if id was used
    for (const [existKey, existVal] of missingMap.entries()) {
      if (
        existVal.deck_card_id === c.id ||
        (existVal.scryfall_id === c.scryfall_id && existVal.board === c.board) ||
        existVal.name.toLowerCase() === c.name.toLowerCase()
      ) {
        missingMap.delete(existKey);
      }
    }

    missingMap.set(k, {
      deck_card_id: c.id,
      deck_id: deckId,
      scryfall_id: c.scryfall_id,
      name: c.name,
      set_code: c.set_code || '',
      collector_number: c.collector_number || '',
      finish: c.finish || 'nonfoil',
      board: c.board || 'mainboard',
      missing_qty: forcedMissingQty,
      force_buy: 1,
      owned_total_qty: c.owned_qty ?? 0,
      in_other_decks_qty: c.in_other_decks_qty ?? 0,
      other_decks: c.other_decks || [],
      unit_tcg: unitTcg,
      unit_ck_retail: unitCk,
      total_tcg: Math.round(unitTcg * forcedMissingQty * 100) / 100,
      total_ck_retail: Math.round(unitCk * forcedMissingQty * 100) / 100,
      tcgplayer_url: c.tcgplayer_url || null,
      cardkingdom_url: c.cardkingdom_url || null,
      image_small: c.image_small || null
    });

    return {
      ...c,
      force_buy: 1,
      missing_qty: forcedMissingQty
    };
  });

  const nextMissingCards = Array.from(missingMap.values());
  const activeCards = updatedCards.filter(
    c => c.board === 'commander' || c.board === 'mainboard' || c.board === 'sideboard'
  );
  const totalRequired = activeCards.reduce((s, c) => s + Number(c.quantity || 1), 0);
  const totalMissing = nextMissingCards.reduce((s, m) => s + Number(m.missing_qty || 0), 0);
  const totalOwned = Math.max(0, totalRequired - totalMissing);
  const completionPct = totalRequired > 0 ? Math.round((totalOwned / totalRequired) * 100) : 100;
  const missingCostTcg = Math.round(nextMissingCards.reduce((s, m) => s + Number(m.total_tcg || 0), 0) * 100) / 100;
  const missingCostCkRetail =
    Math.round(nextMissingCards.reduce((s, m) => s + Number(m.total_ck_retail || 0), 0) * 100) / 100;

  return {
    ...detail,
    cards: updatedCards,
    analysis: {
      ...detail.analysis,
      ownership: {
        ...detail.analysis.ownership,
        totalRequired,
        totalOwned,
        totalMissing,
        completionPct,
        canBuildRightNow: totalMissing === 0 && totalRequired > 0,
        missingCostTcg,
        missingCostCkRetail,
        missingCards: nextMissingCards
      }
    }
  };
}
