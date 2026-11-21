import React, { useMemo, useState } from 'react';
import {
  Search,
  LayoutGrid,
  List,
  Plus,
  Minus,
  Trash2,
  Download,
  Sparkles,
  Upload,
  Filter,
  CheckSquare,
  Square,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Clock,
  ChevronDown,
  ChevronUp,
  Swords,
  Check,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import { BoardType, ConditionType, DeckSummary, FinishType, InventoryItem } from '../types';
import { ManaCost, ManaSymbol } from './ManaCost';
import { DualPriceBadge, formatUsd } from './PriceBadge';
import { PrintingPickerModal } from './PrintingPickerModal';
import { KeyboardQuickAddBar } from './KeyboardQuickAddBar';
import {
  CardZoomModal,
  getCardFaceImageUrl,
  getCommanderOrBackgroundRole,
  isTransformOrDoubleFacedCard
} from './CardZoomModal';

interface InventoryViewProps {
  items: InventoryItem[];
  decks?: DeckSummary[];
  activeDeckId?: number | null;
  initialLocationFilter?: string;
  onUpdateItem: (id: number, patch: Record<string, any>) => Promise<void>;
  onDeleteItem: (id: number) => Promise<void>;
  onBulkDelete: (payload: { ids?: number[]; location?: string; clearAll?: boolean }) => Promise<void>;
  onRefreshAll?: () => Promise<void>;
  onItemsReplaced?: (items: InventoryItem[]) => void;
  onOpenSearchModal: () => void;
  onOpenImportModal: () => void;
  onNavigateToDeck?: (deckId: number) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  items,
  decks = [],
  activeDeckId = null,
  initialLocationFilter = 'ALL',
  onUpdateItem,
  onDeleteItem,
  onBulkDelete,
  onRefreshAll,
  onItemsReplaced,
  onOpenSearchModal,
  onOpenImportModal,
  onNavigateToDeck
}) => {
  const [availabilityTab, setAvailabilityTab] = useState<'all' | 'available' | 'in_decks'>('all');
  const [deckFilterId, setDeckFilterId] = useState<number | 'ALL'>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState<string>(initialLocationFilter || 'ALL');
  // Multi-select colors & Multi-color mode
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [multiColorOnly, setMultiColorOnly] = useState<boolean>(false);
  const [colorlessOnly, setColorlessOnly] = useState<boolean>(false);
  const [colorMatchMode, setColorMatchMode] = useState<'includes_all' | 'exact' | 'includes_any' | 'commander_identity'>('includes_all');
  // Card Type, Supertype, Subtype, Set, and Mana Value filters
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [supertypeFilter, setSupertypeFilter] = useState<string>('ALL');
  const [subtypeQuery, setSubtypeQuery] = useState<string>('');
  const [setCodeFilter, setSetCodeFilter] = useState<string>('ALL');
  const [cmcFilter, setCmcFilter] = useState<string>('ALL');
  const [finishFilter, setFinishFilter] = useState<string>('ALL');
  const [rarityFilter, setRarityFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<string>('tcg_desc');
  const [printingPickerItem, setPrintingPickerItem] = useState<InventoryItem | null>(null);
  const [zoomedItemId, setZoomedItemId] = useState<number | null>(null);
  const [flippedCardIds, setFlippedCardIds] = useState<Set<number>>(new Set());
  const [showMobileFilters, setShowMobileFilters] = useState<boolean>(false);

  function toggleFlipCardId(id: number, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setFlippedCardIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const zoomedItem = useMemo(
    () => (zoomedItemId !== null ? items.find(i => i.id === zoomedItemId) || null : null),
    [items, zoomedItemId]
  );

  // Target Deck for Quick-Add directly from Collection
  const [targetDeckId, setTargetDeckId] = useState<number | null>(() => {
    const saved = Number(localStorage.getItem('aethervault_collection_target_deck_id'));
    if (Number.isInteger(saved) && saved > 0) return saved;
    return activeDeckId || (decks.length > 0 ? decks[0].id : null);
  });
  const [targetBoard, setTargetBoard] = useState<BoardType>('mainboard');
  const [addingCardId, setAddingCardId] = useState<number | null>(null);
  const [bulkAddingToDeck, setBulkAddingToDeck] = useState<boolean>(false);
  const [justAddedDeckMap, setJustAddedDeckMap] = useState<Record<number, string>>({});
  const [deckAddNotice, setDeckAddNotice] = useState<string | null>(null);
  const [creatingNewDeck, setCreatingNewDeck] = useState<boolean>(false);
  const [newDeckName, setNewDeckName] = useState<string>('');

  React.useEffect(() => {
    if (decks.length > 0) {
      const exists = targetDeckId && decks.some(d => d.id === targetDeckId);
      if (!exists) {
        const nextId = (activeDeckId && decks.some(d => d.id === activeDeckId)) ? activeDeckId : decks[0].id;
        setTargetDeckId(nextId);
      }
    } else {
      setTargetDeckId(null);
    }
  }, [decks, targetDeckId, activeDeckId]);

  React.useEffect(() => {
    if (targetDeckId) {
      localStorage.setItem('aethervault_collection_target_deck_id', String(targetDeckId));
    }
  }, [targetDeckId]);

  const targetDeck = useMemo(
    () => decks.find(d => d.id === targetDeckId) || null,
    [decks, targetDeckId]
  );

  async function handleQuickAddToDeck(
    item: InventoryItem,
    overrideDeckId?: number,
    overrideBoard?: BoardType
  ) {
    const dId = overrideDeckId || targetDeckId;
    if (!dId) return;
    const boardToUse = overrideBoard || targetBoard;
    const savedY = window.scrollY;
    setAddingCardId(item.id);
    try {
      let res: Response | null = null;

      // If setting as Commander (or adding a card that is already in the deck), ensure we MOVE it from Creatures/Mainboard to Commander instead of duplicating!
      if (boardToUse === 'commander') {
        try {
          const detailRes = await fetch(`/api/decks/${dId}`);
          if (detailRes.ok) {
            const detailJson = await detailRes.json();
            const deckCards: Array<{ id: number; scryfall_id: string; name: string; board: string }> =
              detailJson.cards || [];
            const matchingRows = deckCards.filter(
              c =>
                c.scryfall_id === item.scryfall_id ||
                (c.name || '').toLowerCase() === (item.name || '').toLowerCase()
            );
            if (matchingRows.length > 0) {
              const primaryRow =
                matchingRows.find(r => r.board === 'commander') || matchingRows[0];
              for (const extra of matchingRows) {
                if (extra.id !== primaryRow.id) {
                  await fetch(`/api/decks/${dId}/cards/${extra.id}`, { method: 'DELETE' });
                }
              }
              res = await fetch(`/api/decks/${dId}/cards/${primaryRow.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  newCard: item,
                  scryfall_id: item.scryfall_id,
                  board: 'commander',
                  quantity: 1,
                  finish: item.finish || 'nonfoil'
                })
              });
            }
          }
        } catch {
          // fallback to POST below
        }
      }

      if (!res) {
        res = await fetch(`/api/decks/${dId}/cards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            card: item,
            quantity: boardToUse === 'commander' ? 1 : 1,
            board: boardToUse,
            finish: item.finish || 'nonfoil'
          })
        });
      }

      if (res.ok) {
        const deckObj = decks.find(d => d.id === dId);
        const dName = deckObj ? deckObj.name : 'Deck';
        const boardLabel =
          boardToUse === 'commander'
            ? ' as 👑 Commander'
            : boardToUse === 'mainboard'
              ? ''
              : ` (${boardToUse})`;
        setJustAddedDeckMap(prev => ({ ...prev, [item.id]: `Added to ${dName}${boardLabel}` }));
        setDeckAddNotice(`Added 1x ${item.name} (${item.set_code.toUpperCase()}) to "${dName}"${boardLabel}`);
        setTimeout(() => {
          setJustAddedDeckMap(prev => {
            const copy = { ...prev };
            delete copy[item.id];
            return copy;
          });
        }, 2200);
        if (onRefreshAll) {
          await onRefreshAll();
        }
        requestAnimationFrame(() => {
          window.scrollTo({ top: savedY, behavior: 'instant' as ScrollBehavior });
        });
      }
    } finally {
      setAddingCardId(null);
    }
  }

  async function handleBulkAddSelectedToTargetDeck() {
    if (!targetDeckId || selectedIds.size === 0) return;
    const savedY = window.scrollY;
    setBulkAddingToDeck(true);
    try {
      const selectedItems = items.filter(i => selectedIds.has(i.id));
      for (const item of selectedItems) {
        await fetch(`/api/decks/${targetDeckId}/cards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            card: item,
            quantity: 1,
            board: targetBoard,
            finish: item.finish || 'nonfoil'
          })
        });
      }
      const dName = targetDeck ? targetDeck.name : 'Deck';
      setDeckAddNotice(`Added ${selectedItems.length} selected card(s) to "${dName}" (${targetBoard})`);
      setSelectedIds(new Set());
      if (onRefreshAll) {
        await onRefreshAll();
      }
      requestAnimationFrame(() => {
        window.scrollTo({ top: savedY, behavior: 'instant' as ScrollBehavior });
      });
    } finally {
      setBulkAddingToDeck(false);
    }
  }

  async function handleCreateQuickDeck(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newDeckName.trim();
    if (!trimmed) return;
    const res = await fetch('/api/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: trimmed,
        format: 'commander'
      })
    });
    if (res.ok) {
      const json = await res.json();
      setNewDeckName('');
      setCreatingNewDeck(false);
      if (onRefreshAll) {
        await onRefreshAll();
      }
      if (json.deck?.id) {
        setTargetDeckId(json.deck.id);
      }
    }
  }

  async function handleCreateNewDeckWithCommander(item: InventoryItem, customDeckName?: string) {
    const cmdRole = getCommanderOrBackgroundRole(item);
    const defaultName = customDeckName?.trim() || item.name;
    const savedY = window.scrollY;
    setAddingCardId(item.id);
    try {
      const res = await fetch('/api/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: defaultName,
          format: 'commander',
          commanderCard: item
        })
      });
      if (res.ok) {
        const json = await res.json();
        const createdId = json.deck?.id;
        const roleLabel = cmdRole === 'background' ? 'Background' : 'Commander';
        setJustAddedDeckMap(prev => ({
          ...prev,
          [item.id]: `👑 New Deck "${defaultName}"!`
        }));
        setDeckAddNotice(
          `👑 Created new Commander deck "${defaultName}" with ${item.name} as ${roleLabel} — now active as your Target Deck!`
        );
        setTimeout(() => {
          setJustAddedDeckMap(prev => {
            const copy = { ...prev };
            delete copy[item.id];
            return copy;
          });
        }, 2800);
        if (onRefreshAll) {
          await onRefreshAll();
        }
        if (createdId) {
          setTargetDeckId(createdId);
          localStorage.setItem('aethervault_collection_target_deck_id', String(createdId));
        }
        requestAnimationFrame(() => {
          window.scrollTo({ top: savedY, behavior: 'instant' as ScrollBehavior });
        });
      }
    } finally {
      setAddingCardId(null);
    }
  }

  // Multi-select & bulk delete state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmAction, setConfirmAction] = useState<null | 'selected' | 'filtered' | 'binder' | 'all'>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Most Recent Activity & Value Feed state
  const [showRecentActivity, setShowRecentActivity] = useState<boolean>(true);
  const [recentWindowMode, setRecentWindowMode] = useState<'session' | 10 | 25 | 50>(10);
  const [sessionAddedIds, setSessionAddedIds] = useState<number[]>([]);

  // Pagination for 9,000+ card collections
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(100);

  React.useEffect(() => {
    setPage(1);
  }, [
    availabilityTab,
    deckFilterId,
    search,
    locationFilter,
    selectedColors,
    multiColorOnly,
    colorlessOnly,
    colorMatchMode,
    typeFilter,
    supertypeFilter,
    subtypeQuery,
    setCodeFilter,
    cmcFilter,
    finishFilter,
    rarityFilter,
    sortBy,
    pageSize
  ]);

  React.useEffect(() => {
    if (initialLocationFilter) {
      setLocationFilter(initialLocationFilter);
    }
  }, [initialLocationFilter]);

  const allLocations = useMemo(() => {
    const s = new Set<string>(['Main Binder', 'Staples Binder', 'Trade Binder', 'Commander Box', 'Lands Binder']);
    for (const i of items) {
      if (i.location) s.add(i.location);
    }
    return Array.from(s);
  }, [items]);

  const allSetsInCollection = useMemo(() => {
    const map = new Map<string, { code: string; name: string; count: number }>();
    for (const i of items) {
      const code = (i.set_code || '').toUpperCase();
      if (!code) continue;
      const ex = map.get(code);
      if (ex) {
        ex.count += Number(i.quantity || 1);
      } else {
        map.set(code, {
          code,
          name: i.set_name || code,
          count: Number(i.quantity || 1)
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  function toggleColorPill(col: 'W' | 'U' | 'B' | 'R' | 'G') {
    setColorlessOnly(false);
    setSelectedColors(prev => {
      const next = prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col];
      return next;
    });
  }

  function clearAllFilters() {
    setSearch('');
    setLocationFilter('ALL');
    setSelectedColors([]);
    setMultiColorOnly(false);
    setColorlessOnly(false);
    setColorMatchMode('includes_all');
    setTypeFilter('ALL');
    setSupertypeFilter('ALL');
    setSubtypeQuery('');
    setSetCodeFilter('ALL');
    setCmcFilter('ALL');
    setFinishFilter('ALL');
    setRarityFilter('ALL');
  }

  const hasActiveFilters =
    Boolean(search.trim()) ||
    locationFilter !== 'ALL' ||
    selectedColors.length > 0 ||
    multiColorOnly ||
    colorlessOnly ||
    typeFilter !== 'ALL' ||
    supertypeFilter !== 'ALL' ||
    Boolean(subtypeQuery.trim()) ||
    setCodeFilter !== 'ALL' ||
    cmcFilter !== 'ALL' ||
    finishFilter !== 'ALL' ||
    rarityFilter !== 'ALL';

  // Global summary counts across entire collection for the Available & In Decks tabs
  const allocationTotals = useMemo(() => {
    let totalOwned = 0;
    let totalAvailable = 0;
    let totalInDecks = 0;
    let availableEntries = 0;
    let inDecksEntries = 0;
    const decksMap = new Map<number, { deck_id: number; deck_name: string; cardCount: number }>();

    for (const i of items) {
      const qty = Number(i.quantity || 0);
      const avail = Number(i.available_qty ?? qty);
      const inDecks = Number(i.in_decks_qty ?? 0);
      totalOwned += qty;
      totalAvailable += avail;
      totalInDecks += inDecks;
      if (avail > 0) availableEntries++;
      if (inDecks > 0) inDecksEntries++;

      for (const d of i.used_in_decks || []) {
        const ex = decksMap.get(d.deck_id);
        if (ex) ex.cardCount += d.quantity;
        else decksMap.set(d.deck_id, { deck_id: d.deck_id, deck_name: d.deck_name, cardCount: d.quantity });
      }
    }

    return {
      totalOwned,
      totalAvailable,
      totalInDecks,
      availableEntries,
      inDecksEntries,
      decksUsingCollection: Array.from(decksMap.values())
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = items.filter(item => {
      const avail = Number(item.available_qty ?? item.quantity);
      const inDecks = Number(item.in_decks_qty ?? 0);

      if (availabilityTab === 'available' && avail <= 0) return false;
      if (availabilityTab === 'in_decks' && inDecks <= 0) return false;

      if (deckFilterId !== 'ALL') {
        const usedInTargetDeck = (item.used_in_decks || []).some(d => d.deck_id === deckFilterId);
        if (!usedInTargetDeck) return false;
      }

      if (q) {
        const matchName = item.name.toLowerCase().includes(q);
        const matchType = (item.type_line || '').toLowerCase().includes(q);
        const matchSet = (item.set_code || '').toLowerCase().includes(q) || (item.set_name || '').toLowerCase().includes(q);
        const matchOracle = (item.oracle_text || '').toLowerCase().includes(q);
        const matchDeck = (item.used_in_decks || []).some(d => d.deck_name.toLowerCase().includes(q));
        if (!matchName && !matchType && !matchSet && !matchOracle && !matchDeck) return false;
      }
      if (locationFilter !== 'ALL' && item.location !== locationFilter) return false;
      if (finishFilter !== 'ALL' && item.finish !== finishFilter) return false;
      if (rarityFilter !== 'ALL' && (item.rarity || '').toLowerCase() !== rarityFilter) return false;
      if (setCodeFilter !== 'ALL' && (item.set_code || '').toUpperCase() !== setCodeFilter) return false;

      // Mana Value (CMC) filter
      if (cmcFilter !== 'ALL') {
        const mv = Math.floor(Number(item.cmc || 0));
        if (cmcFilter === '6+' ? mv < 6 : mv !== Number(cmcFilter)) return false;
      }

      // Card Type filter (Creature, Artifact, Enchantment, Instant, Sorcery, Planeswalker, Land, Battle)
      const typeLineLower = (item.type_line || '').toLowerCase();
      if (typeFilter !== 'ALL') {
        if (!typeLineLower.includes(typeFilter.toLowerCase())) return false;
      }

      // Supertype filter (Legendary, Basic, Snow, Token)
      if (supertypeFilter !== 'ALL') {
        if (!typeLineLower.includes(supertypeFilter.toLowerCase())) return false;
      }

      // Subtype / Tribe filter (e.g. Dragon, Elf, Equipment, Aura, Zombie)
      const subQ = subtypeQuery.trim().toLowerCase();
      if (subQ) {
        if (!typeLineLower.includes(subQ)) return false;
      }

      // Color & Multi-Color filter
      const cardColors = (item.colors && item.colors.length > 0 ? item.colors : item.color_identity) || [];
      if (colorlessOnly) {
        if (cardColors.length > 0) return false;
      } else {
        if (multiColorOnly && cardColors.length < 2) return false;

        if (selectedColors.length > 0) {
          if (colorMatchMode === 'exact') {
            if (cardColors.length !== selectedColors.length) return false;
            if (!selectedColors.every(c => cardColors.includes(c))) return false;
          } else if (colorMatchMode === 'includes_all') {
            if (!selectedColors.every(c => cardColors.includes(c))) return false;
          } else if (colorMatchMode === 'includes_any') {
            if (!selectedColors.some(c => cardColors.includes(c))) return false;
          } else if (colorMatchMode === 'commander_identity') {
            const ci = (item.color_identity && item.color_identity.length > 0 ? item.color_identity : cardColors) || [];
            if (!ci.every(c => selectedColors.includes(c))) return false;
          }
        }
      }
      return true;
    });

    list.sort((a, b) => {
      switch (sortBy) {
        case 'tcg_desc':
          return b.unit_tcg - a.unit_tcg;
        case 'ck_desc':
          return b.unit_ck_retail - a.unit_ck_retail;
        case 'ck_buy_desc':
          return b.unit_ck_buylist - a.unit_ck_buylist;
        case 'total_desc':
          return b.total_tcg - a.total_tcg;
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'cmc_asc':
          return (a.cmc || 0) - (b.cmc || 0);
        case 'qty_desc':
          return b.quantity - a.quantity;
        case 'avail_desc':
          return Number(b.available_qty ?? b.quantity) - Number(a.available_qty ?? a.quantity);
        default:
          return 0;
      }
    });

    return list;
  }, [
    items,
    availabilityTab,
    deckFilterId,
    search,
    locationFilter,
    selectedColors,
    multiColorOnly,
    colorlessOnly,
    colorMatchMode,
    typeFilter,
    supertypeFilter,
    subtypeQuery,
    setCodeFilter,
    cmcFilter,
    finishFilter,
    rarityFilter,
    sortBy
  ]);

  const filteredTotals = useMemo(() => {
    let qty = 0;
    let availQty = 0;
    let inDecksQty = 0;
    let tcg = 0;
    let ckRetail = 0;
    let ckBuy = 0;
    for (const i of filteredItems) {
      qty += i.quantity;
      availQty += Number(i.available_qty ?? i.quantity);
      inDecksQty += Number(i.in_decks_qty ?? 0);
      tcg += i.total_tcg;
      ckRetail += i.total_ck_retail;
      ckBuy += i.total_ck_buylist;
    }
    return { qty, availQty, inDecksQty, tcg, ckRetail, ckBuy };
  }, [filteredItems]);

  function toggleSelectId(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirmAction(null);
  }

  function handleSelectAllFiltered() {
    const allFilteredIds = filteredItems.map(i => i.id);
    const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allFilteredIds));
    }
    setConfirmAction(null);
  }

  async function executeBulkDelete() {
    if (!confirmAction) return;
    setIsDeleting(true);
    try {
      if (confirmAction === 'selected') {
        await onBulkDelete({ ids: Array.from(selectedIds) });
        setSelectedIds(new Set());
      } else if (confirmAction === 'filtered') {
        await onBulkDelete({ ids: filteredItems.map(i => i.id) });
        setSelectedIds(new Set());
      } else if (confirmAction === 'binder' && locationFilter !== 'ALL') {
        await onBulkDelete({ location: locationFilter });
        setLocationFilter('ALL');
        setSelectedIds(new Set());
      } else if (confirmAction === 'all') {
        await onBulkDelete({ clearAll: true });
        setSelectedIds(new Set());
      }
    } finally {
      setIsDeleting(false);
      setConfirmAction(null);
    }
  }

  function handleExportCsv() {
    const headers = [
      'Quantity',
      'Available Quantity',
      'In Decks Quantity',
      'Decks Used In',
      'Name',
      'Set Code',
      'Set Name',
      'Collector Number',
      'Finish',
      'Condition',
      'Language',
      'Binder Name',
      'TCGplayer Market Unit ($)',
      'Card Kingdom Retail Unit ($)',
      'Card Kingdom Buylist Unit ($)',
      'Scryfall ID'
    ];
    const rows = filteredItems.map(i => [
      i.quantity,
      i.available_qty ?? i.quantity,
      i.in_decks_qty ?? 0,
      `"${(i.used_in_decks || []).map(d => `${d.deck_name} (${d.quantity}x)`).join('; ').replace(/"/g, '""')}"`,
      `"${i.name.replace(/"/g, '""')}"`,
      i.set_code.toUpperCase(),
      `"${(i.set_name || '').replace(/"/g, '""')}"`,
      i.collector_number,
      i.finish,
      i.condition,
      i.language,
      `"${(i.location || '').replace(/"/g, '""')}"`,
      i.unit_tcg.toFixed(2),
      i.unit_ck_retail.toFixed(2),
      i.unit_ck_buylist.toFixed(2),
      i.scryfall_id
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mtg-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const allFilteredSelected =
    filteredItems.length > 0 && filteredItems.every(i => selectedIds.has(i.id));

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  // Compute Most Recent Activity items & combined value
  const recentActivityData = useMemo(() => {
    // items from GET /api/inventory are already ordered by updated_at DESC, id DESC
    let recentList: InventoryItem[] = [];
    if (recentWindowMode === 'session' && sessionAddedIds.length > 0) {
      const idSet = new Set(sessionAddedIds);
      recentList = items.filter(i => idSet.has(i.id));
    } else {
      const limit = typeof recentWindowMode === 'number' ? recentWindowMode : 10;
      recentList = items.slice(0, limit);
    }

    let totalCards = 0;
    let totalTcg = 0;
    let totalCkRetail = 0;
    let totalCkBuylist = 0;
    for (const item of recentList) {
      totalCards += Number(item.quantity || 1);
      totalTcg += Number(item.total_tcg || 0);
      totalCkRetail += Number(item.total_ck_retail || 0);
      totalCkBuylist += Number(item.total_ck_buylist || 0);
    }

    return {
      items: recentList,
      totalCards,
      uniqueEntries: recentList.length,
      totalTcg: Math.round(totalTcg * 100) / 100,
      totalCkRetail: Math.round(totalCkRetail * 100) / 100,
      totalCkBuylist: Math.round(totalCkBuylist * 100) / 100
    };
  }, [items, recentWindowMode, sessionAddedIds]);

  return (
    <div className="space-y-4">
      {/* 100% Keyboard-Driven Rapid Card Adder for Collection */}
      <KeyboardQuickAddBar
        mode="inventory"
        locations={allLocations}
        defaultLocation={locationFilter !== 'ALL' ? locationFilter : 'Main Binder'}
        onAddInventoryCard={async ({ card, quantity, finish, condition, location }) => {
          const res = await fetch('/api/inventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              card,
              quantity,
              finish,
              condition,
              location
            })
          });
          if (res.ok) {
            const json = await res.json();
            const nextItems: InventoryItem[] = json.items || [];
            if (nextItems.length > 0) {
              const newestId = nextItems[0].id;
              setSessionAddedIds(prev => (prev.includes(newestId) ? prev : [newestId, ...prev]));
            }
            if (onItemsReplaced) {
              onItemsReplaced(nextItems);
            } else if (onRefreshAll) {
              await onRefreshAll();
            }
          }
        }}
      />

      {/* MOST RECENT ACTIVITY & VALUE SECTION */}
      <div className="rounded-2xl bg-slate-900/95 border border-emerald-500/35 p-4 space-y-3 shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div className="text-sm font-bold text-slate-100 flex items-center gap-2 flex-wrap">
              <span>Recent Additions</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono text-xs">
                {recentActivityData.totalCards} card(s)
              </span>
            </div>
          </div>

          {/* Right Value Summary & Window Switcher */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 font-mono">
              <span className="text-sky-400" title="Combined TCGplayer Market Value of these recent cards">
                TCG Value: <strong className="text-sm">{formatUsd(recentActivityData.totalTcg)}</strong>
              </span>
              <span className="text-slate-700">|</span>
              <span className="text-amber-400" title="Combined Card Kingdom Retail Value of these recent cards">
                CK Retail: <strong className="text-sm">{formatUsd(recentActivityData.totalCkRetail)}</strong>
              </span>
              <span className="hidden sm:inline text-slate-700">|</span>
              <span className="hidden sm:inline text-emerald-400" title="Combined Card Kingdom Buylist Value of these recent cards">
                CK Buy: <strong>{formatUsd(recentActivityData.totalCkBuylist)}</strong>
              </span>
            </div>

            <div className="inline-flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
              {sessionAddedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setRecentWindowMode('session')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    recentWindowMode === 'session'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  This Session ({sessionAddedIds.length})
                </button>
              )}
              {([10, 25, 50] as const).map(limit => (
                <button
                  key={limit}
                  type="button"
                  onClick={() => setRecentWindowMode(limit)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    recentWindowMode === limit
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Last {limit}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowRecentActivity(v => !v)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold flex items-center gap-1 cursor-pointer"
            >
              {showRecentActivity ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  Hide
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Show
                </>
              )}
            </button>
          </div>
        </div>

        {showRecentActivity && (
          <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/90">
            {recentActivityData.items.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No recent cards in this view yet. Type a card name above to add cards!
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-950 z-10 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="py-2 px-3">Card</th>
                    <th className="py-2 px-3">Set / Printing</th>
                    <th className="py-2 px-3">Foil State</th>
                    <th className="py-2 px-3">Binder</th>
                    <th className="py-2 px-3">Qty</th>
                    <th className="py-2 px-3 text-right text-sky-400">TCGplayer</th>
                    <th className="py-2 px-3 text-right text-amber-400">Card Kingdom</th>
                    <th className="py-2 px-3 text-right">Added / Updated</th>
                    <th className="py-2 px-3 text-right">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {recentActivityData.items.map(item => {
                    const isSessionNew = sessionAddedIds.includes(item.id);
                    return (
                      <tr
                        key={item.id}
                        className={`transition ${
                          isSessionNew ? 'bg-emerald-500/10 hover:bg-emerald-500/15' : 'hover:bg-slate-900/70'
                        }`}
                      >
                        <td className="py-2 px-3">
                          <div
                            onClick={() => setZoomedItemId(item.id)}
                            className="flex items-center gap-2.5 cursor-pointer group/zoom"
                            title="Click to view blown-up card details"
                          >
                            {item.image_small && (
                              <img
                                src={item.image_small}
                                alt={item.name}
                                className="w-7 h-10 rounded object-cover shrink-0 border border-slate-700 group-hover/zoom:border-amber-400 transition"
                              />
                            )}
                            <div className="min-w-0">
                              <div className="font-bold text-slate-100 group-hover/zoom:text-amber-300 truncate flex items-center gap-1.5 transition">
                                <span>{item.name}</span>
                                {isSessionNew && (
                                  <span className="px-1.5 py-0.2 rounded bg-emerald-500 text-slate-950 font-extrabold text-[9px] uppercase">
                                    New
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">{item.set_name || item.type_line}</div>
                            </div>
                          </div>
                        </td>

                        <td className="py-2 px-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setPrintingPickerItem(item)}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-mono text-[11px] font-bold uppercase cursor-pointer"
                            title="Click to switch Set / Printing"
                          >
                            {item.set_code} #{item.collector_number} ▾
                          </button>
                        </td>

                        <td className="py-2 px-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateItem(item.id, {
                                finish: item.finish === 'nonfoil' ? 'foil' : 'nonfoil'
                              })
                            }
                            className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer border ${
                              item.finish === 'foil'
                                ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                                : item.finish === 'etched'
                                  ? 'bg-purple-500/20 border-purple-400/50 text-purple-200'
                                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
                            }`}
                            title="Click to toggle Foil / Non-Foil"
                          >
                            {item.finish === 'foil' ? '✨ Foil' : item.finish === 'etched' ? '🌟 Etched' : 'Non-Foil'}
                          </button>
                        </td>

                        <td className="py-2 px-3 whitespace-nowrap text-slate-300">
                          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px]">
                            {item.location}
                          </span>
                        </td>

                        <td className="py-2 px-3 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-1.5 py-0.5">
                            <button
                              type="button"
                              onClick={() => onUpdateItem(item.id, { quantity: item.quantity - 1 })}
                              className="p-0.5 rounded hover:bg-slate-800 text-slate-300 cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-mono font-bold text-amber-300 px-1">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => onUpdateItem(item.id, { quantity: item.quantity + 1 })}
                              className="p-0.5 rounded hover:bg-slate-800 text-slate-300 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </td>

                        <td className="py-2 px-3 text-right font-mono whitespace-nowrap">
                          <div className="font-bold text-sky-300">{formatUsd(item.total_tcg)}</div>
                          {item.quantity > 1 && (
                            <div className="text-[10px] text-slate-500">{formatUsd(item.unit_tcg)} ea</div>
                          )}
                        </td>

                        <td className="py-2 px-3 text-right font-mono whitespace-nowrap">
                          <div className="font-bold text-amber-300">{formatUsd(item.total_ck_retail)}</div>
                          {item.quantity > 1 && (
                            <div className="text-[10px] text-slate-500">{formatUsd(item.unit_ck_retail)} ea</div>
                          )}
                        </td>

                        <td className="py-2 px-3 text-right font-mono text-[11px] text-slate-400 whitespace-nowrap">
                          {item.updated_at ? item.updated_at.replace('T', ' ').slice(0, 16) : 'Just now'}
                        </td>

                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {targetDeck && (
                              <>
                                {getCommanderOrBackgroundRole(item) && (
                                  <button
                                    type="button"
                                    disabled={addingCardId === item.id}
                                    onClick={() => handleQuickAddToDeck(item, targetDeck.id, 'commander')}
                                    className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/45 text-amber-300 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                                    title={`Set ${item.name} as Commander / Background of ${targetDeck.name}`}
                                  >
                                    <span>👑</span>
                                    <span>
                                      {getCommanderOrBackgroundRole(item) === 'background' ? 'Set BG' : 'Set Cmdr'}
                                    </span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={addingCardId === item.id}
                                  onClick={() => handleQuickAddToDeck(item)}
                                  className="px-2 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/35 border border-sky-500/40 text-sky-300 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                                  title={`Add 1x ${item.name} to ${targetDeck.name} (${targetBoard})`}
                                >
                                  {justAddedDeckMap[item.id] ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-400" />
                                      <span className="text-emerald-300">Added!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Swords className="w-3 h-3" />
                                      <span>+ Deck</span>
                                    </>
                                  )}
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => onDeleteItem(item.id)}
                              className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-600 border border-rose-500/30 text-rose-300 hover:text-white cursor-pointer"
                              title="Remove this entry from Collection"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Header & Valuation Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900/90 border border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100">
            Collection
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1">
            <span>
              Total Owned: <strong className="text-slate-100">{filteredTotals.qty.toLocaleString()}</strong>
            </span>
            <span>•</span>
            <span className="text-emerald-400">
              Available: <strong>{filteredTotals.availQty.toLocaleString()}</strong>
            </span>
            <span>•</span>
            <span className="text-amber-300">
              In Decks: <strong>{filteredTotals.inDecksQty.toLocaleString()}</strong>
            </span>
            <span>•</span>
            <span className="font-mono text-sky-400">
              TCG: <strong>{formatUsd(filteredTotals.tcg)}</strong>
            </span>
            <span>•</span>
            <span className="font-mono text-amber-400">
              CK Retail: <strong>{formatUsd(filteredTotals.ckRetail)}</strong>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenSearchModal}
            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Card to Collection
          </button>

          <button
            type="button"
            onClick={onOpenImportModal}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-amber-400" />
            Bulk Import
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            Export CSV
          </button>

          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                viewMode === 'grid' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Card Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                viewMode === 'table' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Trader Table View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Availability & In-Decks Section Switcher */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => {
            setAvailabilityTab('all');
            setDeckFilterId('ALL');
          }}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer flex items-center justify-between ${
            availabilityTab === 'all'
              ? 'bg-amber-500/15 border-amber-400 text-slate-100 shadow-sm'
              : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700'
          }`}
        >
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">All Collection</div>
            <div className="text-2xl font-bold font-mono text-slate-100 mt-0.5">
              {allocationTotals.totalOwned.toLocaleString()} <span className="text-xs font-sans font-normal text-slate-400">cards</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">{items.length.toLocaleString()} unique entries</div>
          </div>
          <LayoutGrid className={`w-6 h-6 ${availabilityTab === 'all' ? 'text-amber-400' : 'text-slate-600'}`} />
        </button>

        <button
          type="button"
          onClick={() => {
            setAvailabilityTab('available');
            setDeckFilterId('ALL');
          }}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer flex items-center justify-between ${
            availabilityTab === 'available'
              ? 'bg-emerald-500/15 border-emerald-400 text-slate-100 shadow-sm'
              : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700'
          }`}
        >
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Available
            </div>
            <div className="text-2xl font-bold font-mono text-slate-100 mt-0.5">
              {allocationTotals.totalAvailable.toLocaleString()} <span className="text-xs font-sans font-normal text-slate-400">available</span>
            </div>
          </div>
          <CheckCircle2 className={`w-6 h-6 ${availabilityTab === 'available' ? 'text-emerald-400' : 'text-slate-600'}`} />
        </button>

        <button
          type="button"
          onClick={() => setAvailabilityTab('in_decks')}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer flex items-center justify-between ${
            availabilityTab === 'in_decks'
              ? 'bg-sky-500/15 border-sky-400 text-slate-100 shadow-sm'
              : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700'
          }`}
        >
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-sky-400">
              In Decks
            </div>
            <div className="text-2xl font-bold font-mono text-slate-100 mt-0.5">
              {allocationTotals.totalInDecks.toLocaleString()} <span className="text-xs font-sans font-normal text-slate-400">in decks</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Across {allocationTotals.decksUsingCollection.length} deck(s)
            </div>
          </div>
          <Layers className={`w-6 h-6 ${availabilityTab === 'in_decks' ? 'text-sky-400' : 'text-slate-600'}`} />
        </button>
      </div>

      {/* When viewing "In Decks", show quick filter pills for each Deck using collection cards */}
      {availabilityTab === 'in_decks' && allocationTotals.decksUsingCollection.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-sky-950/25 border border-sky-500/30 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-sky-300 mr-1">Filter by Deck:</span>
          <button
            type="button"
            onClick={() => setDeckFilterId('ALL')}
            className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
              deckFilterId === 'ALL'
                ? 'bg-sky-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            All Decks ({allocationTotals.totalInDecks})
          </button>
          {allocationTotals.decksUsingCollection.map(d => (
            <button
              key={d.deck_id}
              type="button"
              onClick={() => setDeckFilterId(d.deck_id)}
              className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                deckFilterId === d.deck_id
                  ? 'bg-sky-500 text-slate-950'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <span>⚔️ {d.deck_name}</span>
              <span className="font-mono text-[11px] opacity-80">({d.cardCount})</span>
            </button>
          ))}
        </div>
      )}

      {/* Active Target Deck Bar — Sticky so you can switch decks anywhere while scrolling */}
      <div className="sticky top-14 sm:top-16 z-20 p-2.5 sm:p-3.5 rounded-2xl bg-slate-900/95 backdrop-blur-md border border-sky-500/50 shadow-xl space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-sky-300">
            <div className="p-1.5 rounded-lg bg-sky-500/20 border border-sky-500/40 text-sky-300">
              <Swords className="w-4 h-4" />
            </div>
            <span>Quick Add to Deck</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs w-full sm:w-auto justify-between sm:justify-end">
            {decks.length > 0 ? (
              <>
                <div className="flex items-center gap-1.5 flex-1 sm:flex-initial min-w-0">
                  <span className="text-slate-400 font-semibold hidden md:inline">Target Deck:</span>
                  <select
                    value={targetDeckId || ''}
                    onChange={e => setTargetDeckId(Number(e.target.value))}
                    className="w-full sm:w-auto max-w-[210px] sm:max-w-none px-2.5 py-1.5 rounded-xl bg-slate-950 border border-sky-500/50 text-amber-300 font-bold text-xs truncate focus:outline-none focus:border-amber-400"
                  >
                    {decks.map(d => (
                      <option key={d.id} value={d.id}>
                        ⚔️ {d.name} ({d.counts.activeTotal}/{d.counts.targetTotal})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-slate-400 font-semibold hidden lg:inline">Section:</span>
                  <select
                    value={targetBoard}
                    onChange={e => setTargetBoard(e.target.value as BoardType)}
                    className="px-2 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 font-semibold text-xs focus:outline-none focus:border-amber-400"
                  >
                    <option value="mainboard">Mainboard</option>
                    <option value="considering">Considering</option>
                    <option value="sideboard">Sideboard</option>
                    <option value="commander">👑 Commander</option>
                  </select>
                </div>

                {targetDeck && targetDeck.color_identity && targetDeck.color_identity.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const deckCols = targetDeck.color_identity;
                      const isAlreadyFilteringDeckCols =
                        colorMatchMode === 'commander_identity' &&
                        selectedColors.slice().sort().join('') === deckCols.slice().sort().join('');
                      if (isAlreadyFilteringDeckCols) {
                        setSelectedColors([]);
                        setColorMatchMode('includes_all');
                      } else {
                        setColorlessOnly(false);
                        setMultiColorOnly(false);
                        setSelectedColors(deckCols);
                        setColorMatchMode('commander_identity');
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      colorMatchMode === 'commander_identity' &&
                      selectedColors.slice().sort().join('') === targetDeck.color_identity.slice().sort().join('')
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-slate-950 hover:bg-slate-900 text-slate-200 border-slate-700'
                    }`}
                    title="Filter your collection to only cards legal in this deck's Commander color identity"
                  >
                    <span>Filter by Deck Colors</span>
                    <span className="flex items-center gap-0.5">
                      {targetDeck.color_identity.map(c => (
                        <ManaSymbol key={c} symbol={c} size="sm" />
                      ))}
                    </span>
                  </button>
                )}

                {targetDeck && onNavigateToDeck && (
                  <button
                    type="button"
                    onClick={() => onNavigateToDeck(targetDeck.id)}
                    className="px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 font-bold flex items-center gap-1 cursor-pointer"
                    title="View this deck in the Deck Studio"
                  >
                    <span>Open Deck ({targetDeck.counts.activeTotal}/{targetDeck.counts.targetTotal})</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            ) : (
              <span className="text-slate-400">No decks created yet. Create one right here to start adding cards!</span>
            )}

            <button
              type="button"
              onClick={() => setCreatingNewDeck(v => !v)}
              className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New Deck
            </button>
          </div>
        </div>

        {creatingNewDeck && (
          <form onSubmit={handleCreateQuickDeck} className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-2 text-xs">
            <input
              type="text"
              value={newDeckName}
              onChange={e => setNewDeckName(e.target.value)}
              placeholder="New Commander Deck Name..."
              className="px-3 py-1.5 rounded-xl bg-slate-950 border border-emerald-500/50 text-slate-100 focus:outline-none"
              autoFocus
            />
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold cursor-pointer"
            >
              Create & Set as Target Deck
            </button>
            <button
              type="button"
              onClick={() => setCreatingNewDeck(false)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
          </form>
        )}

        {deckAddNotice && (
          <div className="px-3 py-1.5 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 text-xs font-semibold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{deckAddNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setDeckAddNotice(null)}
              className="text-emerald-300 hover:text-white text-[11px] cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/75 border border-slate-800 space-y-3">
        {/* Row 1: Search Input + Mobile Filter Toggle + Multi-Select Color Selector */}
        <div className="flex flex-col xl:flex-row gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search collection..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowMobileFilters(v => !v)}
              className={`sm:hidden px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer ${
                showMobileFilters || hasActiveFilters
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-slate-950 text-slate-200 border-slate-800'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filters</span>
            </button>
          </div>

          {/* Multi-Select Color & Multi-Color Combination Pills */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
            <Filter className="w-3.5 h-3.5 text-amber-400 mr-0.5" />
            <span className="text-[11px] font-semibold text-slate-400 mr-1">Colors:</span>

            <button
              type="button"
              onClick={() => {
                setSelectedColors([]);
                setMultiColorOnly(false);
                setColorlessOnly(false);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                selectedColors.length === 0 && !multiColorOnly && !colorlessOnly
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>

            {(['W', 'U', 'B', 'R', 'G'] as const).map(col => {
              const isSelected = selectedColors.includes(col);
              return (
                <button
                  key={col}
                  type="button"
                  onClick={() => toggleColorPill(col)}
                  title={`Toggle ${col} (click multiple colors to combine!)`}
                  className={`px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${
                    isSelected
                      ? 'bg-amber-500/30 text-amber-200 border-amber-400 ring-1 ring-amber-400/50'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <ManaSymbol symbol={col} size="sm" />
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => {
                setColorlessOnly(false);
                setMultiColorOnly(v => !v);
              }}
              title="Filter for Multi-Color (2+ color) cards — click W/U/B/R/G to choose which colors!"
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${
                multiColorOnly
                  ? 'bg-amber-500/30 text-amber-200 border-amber-400 ring-1 ring-amber-400/50'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              Multi (2+)
            </button>

            <button
              type="button"
              onClick={() => {
                const next = !colorlessOnly;
                setColorlessOnly(next);
                if (next) {
                  setSelectedColors([]);
                  setMultiColorOnly(false);
                }
              }}
              title="Colorless cards only"
              className={`px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${
                colorlessOnly
                  ? 'bg-amber-500/30 text-amber-200 border-amber-400 ring-1 ring-amber-400/50'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <ManaSymbol symbol="C" size="sm" />
            </button>

            {(multiColorOnly || selectedColors.length > 0) && (
              <>
                <select
                  value={colorMatchMode}
                  onChange={e => setColorMatchMode(e.target.value as any)}
                  className="ml-1 px-2 py-1 rounded-lg bg-slate-900 border border-amber-500/40 text-[11px] font-semibold text-amber-200"
                  title="Choose how selected colors are matched"
                >
                  <option value="includes_all">Includes All Selected ({selectedColors.join('') || 'Any'})</option>
                  <option value="exact">Exact Colors Only ({selectedColors.join('') || 'Any'})</option>
                  <option value="includes_any">Includes Any Selected</option>
                  <option value="commander_identity">Within Commander Identity (≤ {selectedColors.join('') || 'Any'})</option>
                </select>

                <select
                  value={selectedColors.slice().sort().join('')}
                  onChange={e => {
                    const val = e.target.value;
                    if (!val) {
                      setSelectedColors([]);
                    } else {
                      setColorlessOnly(false);
                      setSelectedColors(val.split(''));
                      if (val.length >= 2) {
                        setMultiColorOnly(true);
                      }
                    }
                  }}
                  className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-[11px] text-slate-200"
                  title="Quick-pick a 2-color Guild or 3-color Shard/Wedge"
                >
                  <option value="">Choose Color Combo / Guild...</option>
                  <optgroup label="2-Color Guilds">
                    <option value="UW">Azorius (W/U)</option>
                    <option value="BU">Dimir (U/B)</option>
                    <option value="BR">Rakdos (B/R)</option>
                    <option value="GR">Gruul (R/G)</option>
                    <option value="GW">Selesnya (G/W)</option>
                    <option value="BW">Orzhov (W/B)</option>
                    <option value="RU">Izzet (U/R)</option>
                    <option value="BG">Golgari (B/G)</option>
                    <option value="RW">Boros (R/W)</option>
                    <option value="GU">Simic (G/U)</option>
                  </optgroup>
                  <optgroup label="3-Color Shards & Wedges">
                    <option value="BUW">Esper (W/U/B)</option>
                    <option value="BRU">Grixis (U/B/R)</option>
                    <option value="BGR">Jund (B/R/G)</option>
                    <option value="GRW">Naya (R/G/W)</option>
                    <option value="GUW">Bant (G/W/U)</option>
                    <option value="BGW">Abzan (W/B/G)</option>
                    <option value="RUW">Jeskai (U/R/W)</option>
                    <option value="BGU">Sultai (B/G/U)</option>
                    <option value="BRW">Mardu (R/W/B)</option>
                    <option value="GRU">Temur (G/U/R)</option>
                  </optgroup>
                  <optgroup label="5-Color">
                    <option value="BGRUW">5-Color (W/U/B/R/G)</option>
                  </optgroup>
                </select>
              </>
            )}
          </div>
        </div>

        {/* Row 2: Card Type Quick-Filter Pills + Supertype + Subtype/Tribe */}
        <div className={`${showMobileFilters ? 'flex' : 'hidden sm:flex'} flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/70 text-xs`}>
          <span className="text-[11px] font-semibold text-slate-400 mr-1">Card Type:</span>
          {(
            [
              { id: 'ALL', label: 'All Types' },
              { id: 'Creature', label: 'Creature' },
              { id: 'Artifact', label: 'Artifact' },
              { id: 'Enchantment', label: 'Enchantment' },
              { id: 'Instant', label: 'Instant' },
              { id: 'Sorcery', label: 'Sorcery' },
              { id: 'Planeswalker', label: 'Planeswalker' },
              { id: 'Land', label: 'Land' },
              { id: 'Battle', label: 'Battle' }
            ] as const
          ).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTypeFilter(t.id)}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer border ${
                typeFilter === t.id
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}

          <div className="flex items-center gap-1.5 ml-1">
            <select
              value={supertypeFilter}
              onChange={e => setSupertypeFilter(e.target.value)}
              className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                supertypeFilter !== 'ALL'
                  ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}
            >
              <option value="ALL">All Supertypes</option>
              <option value="Legendary">👑 Legendary</option>
              <option value="Basic">Basic</option>
              <option value="Snow">❄️ Snow</option>
              <option value="Token">Token</option>
            </select>

            <input
              type="text"
              value={subtypeQuery}
              onChange={e => setSubtypeQuery(e.target.value)}
              placeholder="Subtype..."
              className="w-40 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>
        </div>

        {/* Row 3: Binder, Set, Mana Value, Finish, Rarity, Sort By & Clear Filters */}
        <div className={`${showMobileFilters ? 'flex' : 'hidden sm:flex'} flex-wrap items-center gap-2.5 pt-2 border-t border-slate-800/70 text-xs`}>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Binder:</span>
            <select
              value={locationFilter}
              onChange={e => {
                setLocationFilter(e.target.value);
                setConfirmAction(null);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
            >
              <option value="ALL">All Locations ({items.length})</option>
              {allLocations.map(loc => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Set:</span>
            <select
              value={setCodeFilter}
              onChange={e => setSetCodeFilter(e.target.value)}
              className="max-w-[180px] px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
            >
              <option value="ALL">All Sets ({allSetsInCollection.length})</option>
              {allSetsInCollection.map(s => (
                <option key={s.code} value={s.code}>
                  [{s.code}] {s.name} ({s.count})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Mana Value:</span>
            <select
              value={cmcFilter}
              onChange={e => setCmcFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
            >
              <option value="ALL">All MV</option>
              <option value="0">0 MV</option>
              <option value="1">1 MV</option>
              <option value="2">2 MV</option>
              <option value="3">3 MV</option>
              <option value="4">4 MV</option>
              <option value="5">5 MV</option>
              <option value="6+">6+ MV</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Finish:</span>
            <select
              value={finishFilter}
              onChange={e => setFinishFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
            >
              <option value="ALL">All Finishes</option>
              <option value="nonfoil">Non-Foil</option>
              <option value="foil">✨ Foil</option>
              <option value="etched">🌟 Etched</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Rarity:</span>
            <select
              value={rarityFilter}
              onChange={e => setRarityFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
            >
              <option value="ALL">All Rarities</option>
              <option value="mythic">Mythic</option>
              <option value="rare">Rare</option>
              <option value="uncommon">Uncommon</option>
              <option value="common">Common</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="px-2.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 font-bold cursor-pointer"
            >
              ✕ Reset Filters
            </button>
          )}

          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-slate-400">Sort By:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-amber-300 font-semibold"
            >
              <option value="tcg_desc">TCGplayer Price (High → Low)</option>
              <option value="ck_desc">Card Kingdom Retail (High → Low)</option>
              <option value="ck_buy_desc">Card Kingdom Buylist (High → Low)</option>
              <option value="total_desc">Total Lot Value (High → Low)</option>
              <option value="avail_desc">Available Copies (High → Low)</option>
              <option value="qty_desc">Total Owned Quantity</option>
              <option value="name_asc">Name (A → Z)</option>
              <option value="cmc_asc">Mana Value (Low → High)</option>
            </select>
          </div>
        </div>

        {/* Mass Selection & Bulk Delete Action Bar */}
        {items.length > 0 && (
          <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                {allFilteredSelected ? (
                  <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                )}
                {allFilteredSelected ? 'Deselect All' : `Select All Shown (${filteredItems.length.toLocaleString()})`}
              </button>

              {selectedIds.size > 0 && (
                <>
                  <span className="text-amber-300 font-semibold px-1">
                    {selectedIds.size.toLocaleString()} selected
                  </span>
                  {targetDeck && (
                    <button
                      type="button"
                      disabled={bulkAddingToDeck}
                      onClick={handleBulkAddSelectedToTargetDeck}
                      className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                      title={`Add all ${selectedIds.size} selected cards to ${targetDeck.name} (${targetBoard})`}
                    >
                      <Swords className="w-3.5 h-3.5" />
                      {bulkAddingToDeck
                        ? 'Adding to Deck...'
                        : `Add Selected (${selectedIds.size.toLocaleString()}) to "${targetDeck.name}"`}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmAction('selected')}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Selected ({selectedIds.size.toLocaleString()})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIds(new Set());
                      setConfirmAction(null);
                    }}
                    className="text-slate-400 hover:text-slate-200 underline px-1 cursor-pointer"
                  >
                    Clear Selection
                  </button>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {locationFilter !== 'ALL' && filteredItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmAction('binder')}
                  className="px-3 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-500/40 text-rose-200 font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  Delete Entire "{locationFilter}" Binder ({filteredItems.length.toLocaleString()})
                </button>
              )}

              {filteredItems.length > 0 && filteredItems.length < items.length && (
                <button
                  type="button"
                  onClick={() => setConfirmAction('filtered')}
                  className="px-3 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-500/40 text-rose-200 font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  Delete All Filtered ({filteredItems.length.toLocaleString()})
                </button>
              )}

              <button
                type="button"
                onClick={() => setConfirmAction('all')}
                className="px-3 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-500/40 text-rose-200 font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                Wipe Entire Collection ({items.length.toLocaleString()})
              </button>
            </div>
          </div>
        )}

        {/* Inline Confirmation Banner for Mass Delete */}
        {confirmAction && (
          <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-500/60 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-rose-100 font-semibold">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                {confirmAction === 'selected' && `Permanently delete ${selectedIds.size.toLocaleString()} selected card entry(s) from your collection?`}
                {confirmAction === 'filtered' && `Permanently delete all ${filteredItems.length.toLocaleString()} currently filtered card entries?`}
                {confirmAction === 'binder' && `Permanently delete all ${filteredItems.length.toLocaleString()} cards in "${locationFilter}"?`}
                {confirmAction === 'all' && `Permanently wipe your entire collection (${items.length.toLocaleString()} card entries)?`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={executeBulkDelete}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Confirm Delete'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pagination Bar (Top) */}
      {filteredItems.length > pageSize && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
          <div className="text-slate-400">
            Showing <strong className="text-slate-100">{((currentPage - 1) * pageSize + 1).toLocaleString()}–{Math.min(currentPage * pageSize, filteredItems.length).toLocaleString()}</strong> of <strong className="text-amber-300">{filteredItems.length.toLocaleString()}</strong> entries ({filteredTotals.qty.toLocaleString()} total cards)
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Per page:</span>
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-slate-200"
            >
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
            </select>
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-semibold cursor-pointer"
            >
              ← Prev
            </button>
            <span className="font-mono text-slate-300 px-1">
              Page {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-semibold cursor-pointer"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Results View */}
      {filteredItems.length === 0 ? (
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-12 text-center space-y-3">
          <div className="text-slate-300 font-semibold">No cards in collection matching current filters</div>
          <p className="text-xs text-slate-500">
            Click "Add Card to Collection" or "Bulk Import" to add your cards.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
          {paginatedItems.map(item => {
            const isChecked = selectedIds.has(item.id);
            const availQty = Number(item.available_qty ?? item.quantity);
            const inDecksQty = Number(item.in_decks_qty ?? 0);
            const usedDecks = item.used_in_decks || [];
            const canFlip = isTransformOrDoubleFacedCard(item);
            const isCardFlipped = canFlip && flippedCardIds.has(item.id);
            const displayImageUrl = isCardFlipped
              ? getCardFaceImageUrl(item, 'back', 'normal')
              : item.image_normal;

            return (
              <div
                key={item.id}
                className={`flex flex-col rounded-2xl bg-slate-900/90 border overflow-hidden transition group ${
                  isChecked ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="relative aspect-[63/88] w-full bg-slate-950 overflow-hidden">
                  {displayImageUrl ? (
                    <img
                      src={displayImageUrl}
                      alt={item.name}
                      loading="lazy"
                      onClick={() => setZoomedItemId(item.id)}
                      title="Click to see blown-up card view"
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition duration-200 cursor-zoom-in"
                    />
                  ) : (
                    <div
                      onClick={() => setZoomedItemId(item.id)}
                      title="Click to see blown-up card view"
                      className="w-full h-full flex items-center justify-center text-slate-500 text-xs cursor-zoom-in p-4 text-center"
                    >
                      {item.name}
                    </div>
                  )}

                  {/* Top Left Checkbox + Set & Foil Badges */}
                  <div className="absolute top-2.5 left-2.5 flex items-start gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleSelectId(item.id)}
                      className={`p-1.5 rounded-lg border backdrop-blur-xs transition cursor-pointer ${
                        isChecked
                          ? 'bg-amber-500 border-amber-300 text-slate-950'
                          : 'bg-slate-950/85 border-slate-700 text-slate-300 hover:text-white'
                      }`}
                      title="Select card for bulk action"
                    >
                      {isChecked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>

                    <div className="flex flex-col gap-1">
                      <span className="px-2 py-0.5 rounded-md bg-slate-950/90 border border-slate-700 text-[11px] font-mono font-bold text-amber-300 uppercase">
                        {item.set_code} #{item.collector_number}
                      </span>
                      {item.finish !== 'nonfoil' && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/90 text-slate-950 text-[10px] font-bold uppercase shadow-xs">
                          ✨ {item.finish}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Top Right Flip Toggle (for Transform / DFC cards) + Printing Switcher */}
                  <div className="absolute top-2.5 right-2.5 flex flex-col items-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPrintingPickerItem(item)}
                      className="px-2 py-1 rounded-md bg-slate-950/85 hover:bg-slate-900 border border-slate-700 text-[11px] text-slate-200 flex items-center gap-1 transition cursor-pointer"
                      title="Change Set / Printing"
                    >
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      Set
                    </button>

                    {canFlip && (
                      <button
                        type="button"
                        onClick={e => toggleFlipCardId(item.id, e)}
                        className={`px-2 py-1 rounded-md border text-[11px] font-extrabold flex items-center gap-1 shadow-md transition cursor-pointer ${
                          isCardFlipped
                            ? 'bg-amber-500 text-slate-950 border-amber-300'
                            : 'bg-slate-950/90 hover:bg-sky-500/25 text-sky-300 border-sky-400/60'
                        }`}
                        title="Flip between Front and Back side of this Transform / Double-Faced card"
                      >
                        <RefreshCw className={`w-3 h-3 transition-transform duration-300 ${isCardFlipped ? 'rotate-180' : ''}`} />
                        <span>{isCardFlipped ? 'Back' : 'Flip'}</span>
                      </button>
                    )}
                  </div>

                  {/* Bottom Overlay Quantity Stepper */}
                  <div className="absolute bottom-2.5 inset-x-2.5 flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-950/90 backdrop-blur-md border border-slate-700/80">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onUpdateItem(item.id, { quantity: item.quantity - 1 })}
                        className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-mono font-bold text-sm text-amber-300 px-1.5">
                        {item.quantity}x
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateItem(item.id, { quantity: item.quantity + 1 })}
                        className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => onDeleteItem(item.id)}
                      className="px-2 py-1 rounded-lg text-rose-300 hover:text-white bg-rose-950/70 hover:bg-rose-600 transition cursor-pointer flex items-center gap-1 text-[11px] font-semibold"
                      title="Remove from Collection"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </div>

                <div className="p-2.5 sm:p-3.5 flex-1 flex flex-col justify-between gap-2 sm:gap-3">
                  <div className="space-y-1.5 sm:space-y-2">
                    <div>
                      <div className="flex items-start justify-between gap-1.5">
                        <h3
                          onClick={() => setZoomedItemId(item.id)}
                          title="Click to see blown-up card view"
                          className="font-bold text-xs sm:text-sm text-slate-100 hover:text-amber-300 leading-snug cursor-pointer transition line-clamp-1"
                        >
                          {item.name}
                        </h3>
                        <div className="hidden sm:block shrink-0">
                          <ManaCost cost={item.mana_cost} size="sm" />
                        </div>
                      </div>
                      <p className="text-[10px] sm:text-[11px] text-slate-400 truncate mt-0.5">{item.type_line}</p>
                    </div>

                    {/* Available & In Decks Live Allocation Box */}
                    <div className="p-2 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span
                          className={`font-semibold ${
                            availQty > 0 ? 'text-emerald-400' : 'text-slate-500'
                          }`}
                        >
                          ✓ Available: <strong className="font-mono">{availQty}</strong>
                        </span>
                        <span
                          className={`font-semibold ${
                            inDecksQty > 0 ? 'text-sky-400' : 'text-slate-500'
                          }`}
                        >
                          ⚔️ In Decks: <strong className="font-mono">{inDecksQty}</strong>
                        </span>
                      </div>

                      {usedDecks.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-800/80">
                          {usedDecks.map(d => (
                            <button
                              key={d.deck_id}
                              type="button"
                              onClick={() => onNavigateToDeck && onNavigateToDeck(d.deck_id)}
                              className="px-1.5 py-0.5 rounded bg-sky-500/15 hover:bg-sky-500/30 border border-sky-500/30 text-sky-300 text-[10px] font-medium truncate max-w-full cursor-pointer transition"
                              title={`Open deck: ${d.deck_name}`}
                            >
                              ⚔️ {d.deck_name} ({d.quantity}x)
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* One-Click Quick-Add & On-Card Deck Switcher + Commander/Background New Deck Creator */}
                    {(() => {
                      const inTargetEntry = targetDeck ? usedDecks.find(d => d.deck_id === targetDeck.id) : undefined;
                      const justAddedMsg = justAddedDeckMap[item.id];
                      const cmdRole = getCommanderOrBackgroundRole(item);
                      const isLegendaryCmdrCandidate = cmdRole !== null;

                      return (
                        <div className="space-y-1.5 p-2 rounded-xl bg-slate-950/90 border border-sky-500/30">
                          {/* Row 1: On-Card Target Deck Switcher Dropdown + Add Button */}
                          {decks.length > 0 && targetDeck ? (
                            <div className="flex items-center gap-1.5">
                              <select
                                value={targetDeck.id}
                                onChange={e => setTargetDeckId(Number(e.target.value))}
                                className="w-[46%] px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-amber-300 font-bold text-[11px] truncate focus:outline-none focus:border-amber-400"
                                title="Switch which deck you are adding cards into"
                              >
                                {decks.map(d => (
                                  <option key={d.id} value={d.id}>
                                    ⚔️ {d.name} ({d.counts.activeTotal}/{d.counts.targetTotal})
                                  </option>
                                ))}
                              </select>

                              <button
                                type="button"
                                disabled={addingCardId === item.id}
                                onClick={() => handleQuickAddToDeck(item)}
                                className={`flex-1 px-2 py-1.5 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer border min-w-0 ${
                                  justAddedMsg
                                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                                    : inTargetEntry
                                      ? 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border-sky-500/40'
                                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400 shadow-xs'
                                }`}
                                title={`Add 1x ${item.name} (${item.set_code.toUpperCase()} ${item.finish}) to ${targetDeck.name} (${targetBoard})`}
                              >
                                {justAddedMsg ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate">{justAddedMsg}</span>
                                  </>
                                ) : inTargetEntry ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                                    <span className="truncate">
                                      In Deck ({inTargetEntry.quantity}x) • +1
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Swords className="w-3 h-3 shrink-0" />
                                    <span className="truncate">+ Add to Deck</span>
                                  </>
                                )}
                              </button>
                            </div>
                          ) : null}

                          {/* Row 2: Dedicated Commander & Background Actions */}
                          {isLegendaryCmdrCandidate && (
                            <div className="flex items-center gap-1.5 pt-0.5">
                              <button
                                type="button"
                                disabled={addingCardId === item.id}
                                onClick={() => handleCreateNewDeckWithCommander(item)}
                                className="flex-1 px-2 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-500/45 text-emerald-300 font-bold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer"
                                title={
                                  cmdRole === 'background'
                                    ? `Create a brand-new Commander deck with ${item.name} as Background`
                                    : `Create a brand-new Commander deck with ${item.name} as Commander`
                                }
                              >
                                <span>👑</span>
                                <span className="truncate">
                                  {cmdRole === 'background' ? 'New Deck w/ Background' : 'New Deck as Commander'}
                                </span>
                              </button>

                              {targetDeck && (
                                <button
                                  type="button"
                                  disabled={addingCardId === item.id}
                                  onClick={() => handleQuickAddToDeck(item, targetDeck.id, 'commander')}
                                  className="px-2 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-[11px] font-bold cursor-pointer shrink-0"
                                  title={
                                    cmdRole === 'background'
                                      ? `Add ${item.name} as Background in Commander zone of ${targetDeck.name}`
                                      : `Set ${item.name} as Commander of ${targetDeck.name}`
                                  }
                                >
                                  {cmdRole === 'background' ? '👑 Set BG' : '👑 Set Cmdr'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Editable metadata pills */}
                    <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                      <select
                        value={item.finish}
                        onChange={e => onUpdateItem(item.id, { finish: e.target.value as FinishType })}
                        className="px-1.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-200 truncate"
                      >
                        <option value="nonfoil">Non-Foil</option>
                        <option value="foil">✨ Foil</option>
                        <option value="etched">🌟 Etched</option>
                      </select>

                      <select
                        value={item.condition}
                        onChange={e => onUpdateItem(item.id, { condition: e.target.value as ConditionType })}
                        className="px-1.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-200"
                      >
                        <option value="NM">NM</option>
                        <option value="LP">LP</option>
                        <option value="MP">MP</option>
                        <option value="HP">HP</option>
                        <option value="DMG">DMG</option>
                      </select>

                      <select
                        value={item.location}
                        onChange={e => onUpdateItem(item.id, { location: e.target.value })}
                        className="px-1.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-200 truncate"
                        title={item.location}
                      >
                        {allLocations.map(loc => (
                          <option key={loc} value={loc}>{loc}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <DualPriceBadge card={item} finish={item.finish} quantity={item.quantity} showBuylist />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* High-Density Table View */
        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 uppercase text-[11px]">
                  <th className="py-3 px-3 w-10">
                    <button
                      type="button"
                      onClick={handleSelectAllFiltered}
                      className="text-slate-400 hover:text-amber-400 cursor-pointer"
                    >
                      {allFilteredSelected ? <CheckSquare className="w-4 h-4 text-amber-400" /> : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  <th className="py-3 px-3">Total Owned</th>
                  <th className="py-3 px-3 text-emerald-400">Available</th>
                  <th className="py-3 px-3 text-sky-400">In Decks (Deck List)</th>
                  <th className="py-3 px-4">Card</th>
                  <th className="py-3 px-3">Set</th>
                  <th className="py-3 px-3">Finish / Cond</th>
                  <th className="py-3 px-3">Binder / Location</th>
                  <th className="py-3 px-3 text-right text-sky-400">TCGplayer</th>
                  <th className="py-3 px-3 text-right text-amber-400">CK Retail</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {paginatedItems.map(item => {
                  const isChecked = selectedIds.has(item.id);
                  const availQty = Number(item.available_qty ?? item.quantity);
                  const inDecksQty = Number(item.in_decks_qty ?? 0);
                  const usedDecks = item.used_in_decks || [];

                  return (
                    <tr
                      key={item.id}
                      className={`transition ${isChecked ? 'bg-amber-500/10' : 'hover:bg-slate-800/40'}`}
                    >
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() => toggleSelectId(item.id)}
                          className="text-slate-400 hover:text-amber-400 cursor-pointer"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-amber-400" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="inline-flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg px-1.5 py-0.5">
                          <button
                            type="button"
                            onClick={() => onUpdateItem(item.id, { quantity: item.quantity - 1 })}
                            className="text-slate-400 hover:text-slate-100 p-0.5 cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono font-bold text-amber-300 w-6 text-center">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateItem(item.id, { quantity: item.quantity + 1 })}
                            className="text-slate-400 hover:text-slate-100 p-0.5 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded font-mono font-bold ${
                            availQty > 0
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-slate-900 text-slate-500 border border-slate-800'
                          }`}
                        >
                          {availQty} avail
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {inDecksQty > 0 ? (
                          <div className="flex flex-wrap items-center gap-1">
                            {usedDecks.map(d => (
                              <button
                                key={d.deck_id}
                                type="button"
                                onClick={() => onNavigateToDeck && onNavigateToDeck(d.deck_id)}
                                className="px-2 py-0.5 rounded bg-sky-500/15 hover:bg-sky-500/30 border border-sky-500/30 text-sky-300 text-[11px] font-semibold cursor-pointer transition"
                              >
                                ⚔️ {d.deck_name} ({d.quantity}x)
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <div
                          onClick={() => setZoomedItemId(item.id)}
                          title="Click to see blown-up card view"
                          className="flex items-center gap-2.5 cursor-pointer group/zoom"
                        >
                          {item.image_small && (
                            <img
                              src={item.image_small}
                              alt={item.name}
                              className="w-8 h-11 object-cover rounded border border-slate-700 group-hover/zoom:border-amber-400 transition"
                            />
                          )}
                          <div>
                            <div className="font-bold text-slate-100 group-hover/zoom:text-amber-300 text-sm transition">
                              {item.name}
                            </div>
                            <div className="text-[11px] text-slate-400">{item.type_line}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() => setPrintingPickerItem(item)}
                          className="px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 border border-slate-700 font-mono font-bold text-amber-300 uppercase cursor-pointer"
                          title="Click to switch printing"
                        >
                          {item.set_code} #{item.collector_number}
                        </button>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <select
                            value={item.finish}
                            onChange={e => onUpdateItem(item.id, { finish: e.target.value })}
                            className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-200"
                          >
                            <option value="nonfoil">Non-Foil</option>
                            <option value="foil">✨ Foil</option>
                            <option value="etched">🌟 Etched</option>
                          </select>
                          <select
                            value={item.condition}
                            onChange={e => onUpdateItem(item.id, { condition: e.target.value })}
                            className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-200"
                          >
                            <option value="NM">NM</option>
                            <option value="LP">LP</option>
                            <option value="MP">MP</option>
                            <option value="HP">HP</option>
                            <option value="DMG">DMG</option>
                          </select>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={item.location}
                          onChange={e => onUpdateItem(item.id, { location: e.target.value })}
                          className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-200"
                        >
                          {allLocations.map(loc => (
                            <option key={loc} value={loc}>{loc}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        <a
                          href={item.tcgplayer_url || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-300 hover:underline font-bold block"
                        >
                          {formatUsd(item.total_tcg)}
                        </a>
                        {item.quantity > 1 && (
                          <span className="text-[10px] text-slate-500">{formatUsd(item.unit_tcg)} ea</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        <a
                          href={item.cardkingdom_url || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="text-amber-300 hover:underline font-bold block"
                        >
                          {formatUsd(item.total_ck_retail)}
                        </a>
                        {item.quantity > 1 && (
                          <span className="text-[10px] text-slate-500">{formatUsd(item.unit_ck_retail)} ea</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {(() => {
                            const inTargetEntry = targetDeck ? usedDecks.find(d => d.deck_id === targetDeck.id) : undefined;
                            const justAddedMsg = justAddedDeckMap[item.id];
                            const cmdRole = getCommanderOrBackgroundRole(item);

                            return (
                              <>
                                {cmdRole && (
                                  <button
                                    type="button"
                                    disabled={addingCardId === item.id}
                                    onClick={() => handleCreateNewDeckWithCommander(item)}
                                    className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-500/45 text-emerald-300 font-bold text-xs inline-flex items-center gap-1 cursor-pointer"
                                    title={
                                      cmdRole === 'background'
                                        ? `Start a new Commander deck with ${item.name} as Background`
                                        : `Start a new Commander deck with ${item.name} as Commander`
                                    }
                                  >
                                    <span>👑</span>
                                    <span>{cmdRole === 'background' ? 'New Deck w/ BG' : 'New Deck as Cmdr'}</span>
                                  </button>
                                )}

                                {cmdRole && targetDeck && (
                                  <button
                                    type="button"
                                    disabled={addingCardId === item.id}
                                    onClick={() => handleQuickAddToDeck(item, targetDeck.id, 'commander')}
                                    className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/45 text-amber-300 font-bold text-xs inline-flex items-center gap-1 cursor-pointer"
                                    title={
                                      cmdRole === 'background'
                                        ? `Set ${item.name} as Background of ${targetDeck.name}`
                                        : `Set ${item.name} as Commander of ${targetDeck.name}`
                                    }
                                  >
                                    <span>👑</span>
                                    <span>{cmdRole === 'background' ? 'Set BG' : 'Set Cmdr'}</span>
                                  </button>
                                )}

                                {decks.length > 0 && targetDeck && (
                                  <>
                                    <select
                                      value={targetDeck.id}
                                      onChange={e => setTargetDeckId(Number(e.target.value))}
                                      className="max-w-[140px] px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-amber-300 font-bold text-xs truncate"
                                      title="Switch Target Deck"
                                    >
                                      {decks.map(d => (
                                        <option key={d.id} value={d.id}>
                                          ⚔️ {d.name} ({d.counts.activeTotal}/{d.counts.targetTotal})
                                        </option>
                                      ))}
                                    </select>

                                    <button
                                      type="button"
                                      disabled={addingCardId === item.id}
                                      onClick={() => handleQuickAddToDeck(item)}
                                      className={`px-2.5 py-1 rounded-lg font-bold text-xs inline-flex items-center gap-1 transition cursor-pointer border ${
                                        justAddedMsg
                                          ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                                          : inTargetEntry
                                            ? 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border-sky-500/40'
                                            : 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400'
                                      }`}
                                      title={`Add 1x ${item.name} to ${targetDeck.name} (${targetBoard})`}
                                    >
                                      {justAddedMsg ? (
                                        <>
                                          <Check className="w-3.5 h-3.5" />
                                          <span>Added!</span>
                                        </>
                                      ) : inTargetEntry ? (
                                        <>
                                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                                          <span>In Deck ({inTargetEntry.quantity}x) +1</span>
                                        </>
                                      ) : (
                                        <>
                                          <Swords className="w-3.5 h-3.5" />
                                          <span>+ Add</span>
                                        </>
                                      )}
                                    </button>
                                  </>
                                )}
                              </>
                            );
                          })()}
                          <button
                            type="button"
                            onClick={() => onDeleteItem(item.id)}
                            className="px-2 py-1 rounded-lg text-rose-300 hover:text-white bg-rose-950/60 hover:bg-rose-600 transition cursor-pointer inline-flex items-center gap-1"
                            title="Delete row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {zoomedItem && (
        <CardZoomModal
          card={zoomedItem}
          cardsList={filteredItems}
          decks={decks}
          defaultTargetDeckId={targetDeckId}
          defaultBoard={targetBoard}
          onClose={() => setZoomedItemId(null)}
          onSelectCard={next => {
            if (next.id !== undefined) setZoomedItemId(next.id);
          }}
          onTargetDeckChange={nextDeckId => setTargetDeckId(nextDeckId)}
          onAddToDeck={async (c, dId, b) => {
            await handleQuickAddToDeck(c as InventoryItem, dId, b);
          }}
          onCreateNewDeckWithCommander={async (c, deckTitle) => {
            await handleCreateNewDeckWithCommander(c as InventoryItem, deckTitle);
          }}
          onUpdateInventoryQty={(id, nextQty) => {
            if (nextQty <= 0) setZoomedItemId(null);
            onUpdateItem(id, { quantity: nextQty });
          }}
          onOpenPrintingPicker={c => {
            const found = items.find(i => i.id === c.id);
            if (found) setPrintingPickerItem(found);
          }}
          onNavigateToDeck={onNavigateToDeck}
        />
      )}

      {printingPickerItem && (
        <PrintingPickerModal
          cardName={printingPickerItem.name}
          currentScryfallId={printingPickerItem.scryfall_id}
          onClose={() => setPrintingPickerItem(null)}
          onSelectPrinting={newCard => {
            onUpdateItem(printingPickerItem.id, { newCard });
          }}
        />
      )}
    </div>
  );
};
