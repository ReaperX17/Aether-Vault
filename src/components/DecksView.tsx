import React, { useEffect, useState, useMemo } from 'react';
import {
  Plus,
  Minus,
  Trash2,
  Crown,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Copy,
  Check,
  ArrowLeft,
  BarChart3,
  ShoppingBag,
  Layers,
  ExternalLink,
  Search,
  Download,
  FolderPlus,
  Folder,
  FolderOpen,
  ArrowUpDown,
  Edit3,
  CheckSquare,
  Square,
  Swords,
  RefreshCw
} from 'lucide-react';
import {
  BoardType,
  DeckAnalysis,
  DeckCardItem,
  DeckSummary,
  FormatType,
  MissingCardEntry,
  MtgCard
} from '../types';
import { ColorIdentityBadges, ManaCost, ManaSymbol } from './ManaCost';
import { DualPriceBadge, formatUsd } from './PriceBadge';
import { PrintingPickerModal } from './PrintingPickerModal';
import { KeyboardQuickAddBar } from './KeyboardQuickAddBar';
import {
  CardZoomModal,
  ZoomableCard,
  getCardFaceImageUrl,
  getCommanderOrBackgroundRole,
  isTransformOrDoubleFacedCard
} from './CardZoomModal';
import { applyForcedBuylistToDeckDetail, setCardForcedOnBuylist } from '../forcedBuylist';
import { evaluateDeckBracketAndSalt, getSingleCardBracketBadges } from '../deckBracketAndSalt';

interface DecksViewProps {
  decks: DeckSummary[];
  folders?: string[];
  selectedDeckId: number | null;
  liveVersion?: number;
  onSelectDeck: (id: number | null) => void;
  onOpenSearchForDeck: (deckId: number, board?: BoardType) => void;
  onRefreshGlobal: () => Promise<void>;
}

export const DecksView: React.FC<DecksViewProps> = ({
  decks,
  folders = [],
  selectedDeckId,
  liveVersion = 0,
  onSelectDeck,
  onOpenSearchForDeck,
  onRefreshGlobal
}) => {
  const [deckDetail, setDeckDetail] = useState<{
    deck: any;
    cards: DeckCardItem[];
    analysis: DeckAnalysis;
  } | null>(null);
  const [loadingDeck, setLoadingDeck] = useState(false);
  const [librarySection, setLibrarySection] = useState<'decks' | 'master_buylist'>('decks');
  const [masterBuylistDeckFilter, setMasterBuylistDeckFilter] = useState<number | 'ALL'>('ALL');
  const [activeSubTab, setActiveSubTab] = useState<'cards' | 'missing' | 'bracket_salt' | 'analytics'>('cards');
  const [groupBy, setGroupBy] = useState<'type' | 'cmc' | 'board'>('type');
  const [activeSectionFilter, setActiveSectionFilter] = useState<string>('ALL');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'owned' | 'missing'>('all');
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [printingPickerCard, setPrintingPickerCard] = useState<DeckCardItem | null>(null);
  const [zoomedDeckCard, setZoomedDeckCard] = useState<ZoomableCard | null>(null);
  const [flippedDeckCardIds, setFlippedDeckCardIds] = useState<Set<number>>(new Set());

  function toggleFlipDeckCard(id: number, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setFlippedDeckCardIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Deck list multi-select & delete states
  const [selectedDeckIds, setSelectedDeckIds] = useState<Set<number>>(new Set());
  const [confirmDeleteDecks, setConfirmDeleteDecks] = useState<null | 'selected' | 'all' | number>(null);

  // Deck Folders & Sorting state
  const [selectedFolder, setSelectedFolder] = useState<string>('ALL');
  const [groupDecksByFolder, setGroupDecksByFolder] = useState<boolean>(false);
  const [deckSearch, setDeckSearch] = useState<string>('');
  const [deckFormatFilter, setDeckFormatFilter] = useState<string>('ALL');
  const [deckSortBy, setDeckSortBy] = useState<string>('updated_desc');
  const [showNewFolderInput, setShowNewFolderInput] = useState<boolean>(false);
  const [newFolderInputName, setNewFolderInputName] = useState<string>('');
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameFolderValue, setRenameFolderValue] = useState<string>('');
  const [folderPromptState, setFolderPromptState] = useState<
    | { mode: 'move_single'; deckId: number }
    | { mode: 'move_bulk' }
    | { mode: 'paste_folder' }
    | { mode: 'create_folder' }
    | null
  >(null);
  const [folderPromptInput, setFolderPromptInput] = useState<string>('');

  // Inside-deck card multi-select & delete states
  const [selectedCardRowIds, setSelectedCardRowIds] = useState<Set<number>>(new Set());
  const [selectedMasterBuylistKeys, setSelectedMasterBuylistKeys] = useState<Set<string>>(new Set());
  const [confirmInsideAction, setConfirmInsideAction] = useState<null | 'delete_deck' | 'delete_selected_cards' | 'clear_all_cards'>(null);
  const [markingBoughtLoading, setMarkingBoughtLoading] = useState<boolean>(false);
  const [buylistFeedback, setBuylistFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Inline Quick-Add to Deck / Buy List states
  const [quickAddQuery, setQuickAddQuery] = useState<string>('');
  const [quickAddResults, setQuickAddResults] = useState<MtgCard[]>([]);
  const [quickAddLoading, setQuickAddLoading] = useState<boolean>(false);
  const [quickAddQty, setQuickAddQty] = useState<number>(1);
  const [quickAddFinish, setQuickAddFinish] = useState<'nonfoil' | 'foil'>('nonfoil');
  const [quickAddBoard, setQuickAddBoard] = useState<'mainboard' | 'commander' | 'sideboard'>('mainboard');
  const [quickAddPrintingCard, setQuickAddPrintingCard] = useState<MtgCard | null>(null);

  // Create Deck Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFormat, setNewFormat] = useState<FormatType>('commander');
  const [newFolder, setNewFolder] = useState<string>('Uncategorized');
  const [newDescription, setNewDescription] = useState('');
  const [newDeckInitialList, setNewDeckInitialList] = useState('');
  const [cmdSearchQuery, setCmdSearchQuery] = useState('');
  const [cmdSearchResults, setCmdSearchResults] = useState<MtgCard[]>([]);
  const [selectedCommander, setSelectedCommander] = useState<MtgCard | null>(null);

  // Paste Decklist Modal state (works both for creating a new deck or pasting into an open deck)
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteTargetMode, setPasteTargetMode] = useState<'current_deck' | 'new_deck'>('current_deck');
  const [pasteDeckName, setPasteDeckName] = useState('');
  const [pasteDeckFormat, setPasteDeckFormat] = useState<FormatType>('commander');
  const [pasteDeckFolder, setPasteDeckFolder] = useState<string>('Uncategorized');
  const [pasteCommanderName, setPasteCommanderName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [pasteReplaceExisting, setPasteReplaceExisting] = useState(false);
  const [pastingDeck, setPastingDeck] = useState(false);
  const [pasteProgressMsg, setPasteProgressMsg] = useState('');
  const [lastPasteSummary, setLastPasteSummary] = useState<{
    deckId: number;
    deckName: string;
    totalRequired: number;
    pulledFromInventoryCount: number;
    addedToBuyListCount: number;
    completionPct: number;
    missingCostTcg: number;
    missingCostCkRetail: number;
  } | null>(null);

  const activeDeckSummaryTotalCards = useMemo(
    () => (selectedDeckId ? decks.find(d => d.id === selectedDeckId)?.total_cards ?? null : null),
    [decks, selectedDeckId]
  );

  useEffect(() => {
    setSelectedCardRowIds(new Set());
    setConfirmInsideAction(null);
    if (selectedDeckId) {
      loadDeckDetail(selectedDeckId, !deckDetail || deckDetail.deck?.id !== selectedDeckId);
    } else {
      setDeckDetail(null);
    }
  }, [selectedDeckId]);

  // Automatically refresh open deck detail when cards are added externally via global Add Cards modal, Import modal, or remote SSE event
  useEffect(() => {
    if (!selectedDeckId) return;
    if (deckDetail && deckDetail.deck?.id === selectedDeckId && activeDeckSummaryTotalCards !== null) {
      const currentLoadedTotal =
        (deckDetail.analysis?.counts?.commander || 0) +
        (deckDetail.analysis?.counts?.mainboard || 0) +
        (deckDetail.analysis?.counts?.sideboard || 0);
      if (currentLoadedTotal !== activeDeckSummaryTotalCards) {
        loadDeckDetail(selectedDeckId, false);
      }
    }
  }, [activeDeckSummaryTotalCards]);

  useEffect(() => {
    if (selectedDeckId && liveVersion > 0) {
      loadDeckDetail(selectedDeckId, false);
    }
  }, [liveVersion]);

  function preserveScrollPosition(savedY: number) {
    requestAnimationFrame(() => {
      window.scrollTo({ top: savedY, behavior: 'instant' as ScrollBehavior });
    });
  }

  async function loadDeckDetail(id: number, showSpinner = false) {
    if (showSpinner) setLoadingDeck(true);
    try {
      const res = await fetch(`/api/decks/${id}`);
      if (res.ok) {
        const json = await res.json();
        setDeckDetail(applyForcedBuylistToDeckDetail(json));
      } else if (res.status === 404) {
        onSelectDeck(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (showSpinner) setLoadingDeck(false);
    }
  }

  useEffect(() => {
    const onForcedChanged = () => {
      setDeckDetail(prev => applyForcedBuylistToDeckDetail(prev));
    };
    window.addEventListener('aethervault-forced-buylist-changed', onForcedChanged);
    return () => window.removeEventListener('aethervault-forced-buylist-changed', onForcedChanged);
  }, []);

  useEffect(() => {
    if (!showCreateModal || !cmdSearchQuery.trim()) {
      setCmdSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/scryfall/search?q=${encodeURIComponent(cmdSearchQuery)}`);
        const json = await res.json();
        setCmdSearchResults((json.data || []).slice(0, 8));
      } catch {
        // ignore
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [cmdSearchQuery, showCreateModal]);

  useEffect(() => {
    if (!selectedDeckId || !quickAddQuery.trim()) {
      setQuickAddResults([]);
      setQuickAddLoading(false);
      return;
    }
    setQuickAddLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/scryfall/search?q=${encodeURIComponent(quickAddQuery.trim())}`);
        const json = await res.json();
        setQuickAddResults((json.data || []).slice(0, 8));
      } catch {
        // ignore
      } finally {
        setQuickAddLoading(false);
      }
    }, 240);
    return () => clearTimeout(timer);
  }, [quickAddQuery, selectedDeckId]);

  async function handleQuickAddCardToDeck(card: MtgCard, forceBuy: boolean) {
    if (!selectedDeckId) return;
    const savedY = window.scrollY;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (forceBuy) {
      setCardForcedOnBuylist(selectedDeckId, card.name, true);
    }
    try {
      const isCommander = (deckDetail?.deck?.format || 'commander').toLowerCase() === 'commander';
      const existingInDeck = isCommander
        ? deckDetail?.cards.find(
            c => c.name.toLowerCase() === card.name.toLowerCase() && c.board === quickAddBoard
          )
        : undefined;

      let res: Response;
      if (existingInDeck && forceBuy && quickAddQty === 1) {
        res = await fetch(`/api/decks/${selectedDeckId}/cards/${existingInDeck.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            newCard: card,
            scryfall_id: card.scryfall_id,
            finish: quickAddFinish,
            force_buy: 1
          })
        });
      } else {
        res = await fetch(`/api/decks/${selectedDeckId}/cards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            card,
            quantity: quickAddQty,
            board: quickAddBoard,
            finish: quickAddFinish,
            force_buy: forceBuy
          })
        });
      }
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        if (json.deckDetail) {
          setDeckDetail(applyForcedBuylistToDeckDetail(json.deckDetail));
        } else {
          await loadDeckDetail(selectedDeckId, false);
        }
        preserveScrollPosition(savedY);
        await onRefreshGlobal();
        preserveScrollPosition(savedY);
        showBuylistToast(
          'success',
          forceBuy
            ? `🛒 Added ${quickAddQty}x ${card.name} (${card.set_code.toUpperCase()} #${card.collector_number}) to your Deck & Buy List!`
            : `✓ Added ${quickAddQty}x ${card.name} (${card.set_code.toUpperCase()} #${card.collector_number}) to your Deck!`
        );
      }
    } catch {
      showBuylistToast('error', 'Failed to add card to deck.');
    }
  }

  async function handleCreateDeck(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;

    // If the user also pasted a decklist right inside Create New Deck, run the full deck paste flow!
    if (newDeckInitialList.trim()) {
      setPastingDeck(true);
      setPasteProgressMsg('Matching your Available Collection & resolving missing cards...');
      try {
        const res = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: newDeckInitialList,
            target: 'deck',
            newDeckName: newName.trim(),
            newDeckFormat: newFormat,
            newDeckFolder: newFolder || 'Uncategorized',
            commanderName: newFormat === 'commander' && selectedCommander ? selectedCommander.name : '',
            preferInventoryPrinting: true
          })
        });
        const json = await res.json();
        if (res.ok && json.deckId) {
          setShowCreateModal(false);
          setNewName('');
          setNewDescription('');
          setNewDeckInitialList('');
          setSelectedCommander(null);
          setCmdSearchQuery('');
          if (json.deckBreakdown) {
            setLastPasteSummary(json.deckBreakdown);
          }
          await onRefreshGlobal();
          onSelectDeck(json.deckId);
        }
      } finally {
        setPastingDeck(false);
        setPasteProgressMsg('');
      }
      return;
    }

    const res = await fetch('/api/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newName.trim(),
        format: newFormat,
        folder: newFolder || 'Uncategorized',
        description: newDescription.trim(),
        commanderCard: newFormat === 'commander' ? selectedCommander : null
      })
    });
    if (res.ok) {
      const json = await res.json();
      setShowCreateModal(false);
      setNewName('');
      setNewDescription('');
      setNewDeckInitialList('');
      setSelectedCommander(null);
      setCmdSearchQuery('');
      await onRefreshGlobal();
      onSelectDeck(json.deckId);
    }
  }

  async function handlePasteDecklistSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pasteText.trim()) return;

    const isNew = pasteTargetMode === 'new_deck' || !selectedDeckId;
    if (isNew && !pasteDeckName.trim()) return;

    setPastingDeck(true);
    setPasteProgressMsg('Matching cards against your Available Collection & resolving Buy List...');

    const pollInterval = setInterval(async () => {
      try {
        const r = await fetch('/api/import/progress');
        if (r.ok) {
          const p = await r.json();
          if (p.active && p.message) {
            setPasteProgressMsg(p.message);
          }
        }
      } catch {
        // ignore
      }
    }, 400);

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: pasteText,
          target: 'deck',
          deckId: isNew ? null : selectedDeckId,
          newDeckName: isNew ? pasteDeckName.trim() : undefined,
          newDeckFormat: isNew ? pasteDeckFormat : undefined,
          newDeckFolder: isNew ? (pasteDeckFolder || 'Uncategorized') : undefined,
          commanderName: pasteCommanderName.trim(),
          replaceExisting: !isNew && pasteReplaceExisting,
          preferInventoryPrinting: true
        })
      });

      const json = await res.json();
      if (res.ok && json.deckId) {
        setShowPasteModal(false);
        setPasteText('');
        setPasteCommanderName('');
        setPasteReplaceExisting(false);
        if (json.deckBreakdown) {
          setLastPasteSummary(json.deckBreakdown);
        }
        await onRefreshGlobal();
        if (selectedDeckId === json.deckId) {
          await loadDeckDetail(json.deckId);
        } else {
          onSelectDeck(json.deckId);
        }
      } else if (json.error) {
        alert(json.error);
      }
    } finally {
      clearInterval(pollInterval);
      setPastingDeck(false);
      setPasteProgressMsg('');
    }
  }

  async function handleDeleteSingleDeck(id: number) {
    await fetch(`/api/decks/${id}`, { method: 'DELETE' });
    if (selectedDeckId === id) onSelectDeck(null);
    setConfirmDeleteDecks(null);
    setConfirmInsideAction(null);
    await onRefreshGlobal();
  }

  async function handleBulkDeleteDecks(mode: 'selected' | 'all') {
    await fetch('/api/decks/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        mode === 'all' ? { clearAll: true } : { ids: Array.from(selectedDeckIds) }
      )
    });
    setSelectedDeckIds(new Set());
    setConfirmDeleteDecks(null);
    onSelectDeck(null);
    await onRefreshGlobal();
  }

  const allFolderOptions = useMemo(() => {
    const s = new Set<string>([
      'Commander Pods',
      'Competitive / cEDH',
      'Brewing / WiP',
      'Precons',
      'Uncategorized'
    ]);
    for (const f of folders) {
      if (f && f.trim()) s.add(f.trim());
    }
    for (const d of decks) {
      if (d.folder && d.folder.trim()) s.add(d.folder.trim());
    }
    return Array.from(s).sort((a, b) => {
      if (a === 'Uncategorized') return 1;
      if (b === 'Uncategorized') return -1;
      return a.localeCompare(b);
    });
  }, [folders, decks]);

  const filteredAndSortedDecks = useMemo(() => {
    const q = deckSearch.trim().toLowerCase();
    const list = decks.filter(d => {
      const dFolder = (d.folder || 'Uncategorized').trim() || 'Uncategorized';
      if (selectedFolder !== 'ALL' && dFolder !== selectedFolder) return false;
      if (deckFormatFilter !== 'ALL' && d.format !== deckFormatFilter) return false;
      if (q) {
        const matchName = d.name.toLowerCase().includes(q);
        const matchDesc = (d.description || '').toLowerCase().includes(q);
        const matchFolder = dFolder.toLowerCase().includes(q);
        const matchFmt = d.format.toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchFolder && !matchFmt) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      switch (deckSortBy) {
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        case 'completion_desc':
          return (b.ownership?.completionPct || 0) - (a.ownership?.completionPct || 0);
        case 'completion_asc':
          return (a.ownership?.completionPct || 0) - (b.ownership?.completionPct || 0);
        case 'missing_asc':
          return (a.ownership?.totalMissing || 0) - (b.ownership?.totalMissing || 0);
        case 'cost_to_finish_asc':
          return (a.ownership?.missingCostTcg || 0) - (b.ownership?.missingCostTcg || 0);
        case 'tcg_desc':
          return (b.valuation?.tcg || 0) - (a.valuation?.tcg || 0);
        case 'ck_desc':
          return (b.valuation?.ckRetail || 0) - (a.valuation?.ckRetail || 0);
        case 'folder_asc': {
          const fa = (a.folder || 'Uncategorized').trim();
          const fb = (b.folder || 'Uncategorized').trim();
          return fa.localeCompare(fb) || a.name.localeCompare(b.name);
        }
        case 'updated_desc':
        default:
          return (b.updated_at || '').localeCompare(a.updated_at || '') || b.id - a.id;
      }
    });

    return list;
  }, [decks, selectedFolder, deckFormatFilter, deckSearch, deckSortBy]);

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    const clean = newFolderInputName.trim();
    if (!clean) return;
    await fetch('/api/decks/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: clean })
    });
    setNewFolderInputName('');
    setShowNewFolderInput(false);
    setSelectedFolder(clean);
    await onRefreshGlobal();
  }

  async function handleRenameFolder(e: React.FormEvent) {
    e.preventDefault();
    const clean = renameFolderValue.trim();
    if (!clean || !renamingFolder) return;
    await fetch('/api/decks/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: clean, oldName: renamingFolder })
    });
    setRenamingFolder(null);
    setRenameFolderValue('');
    setSelectedFolder(clean);
    await onRefreshGlobal();
  }

  async function handleDeleteFolder(folderName: string) {
    await fetch('/api/decks/folders', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: folderName, deleteDecksInside: false })
    });
    if (selectedFolder === folderName) {
      setSelectedFolder('ALL');
    }
    await onRefreshGlobal();
  }

  async function handleMoveDeckToFolder(deckId: number, targetFolder: string) {
    if (targetFolder === '__NEW__') {
      setFolderPromptInput('');
      setFolderPromptState({ mode: 'move_single', deckId });
      return;
    }
    const savedY = window.scrollY;
    await fetch(`/api/decks/${deckId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: targetFolder })
    });
    if (selectedDeckId === deckId) {
      await loadDeckDetail(deckId, false);
    }
    preserveScrollPosition(savedY);
    await onRefreshGlobal();
    preserveScrollPosition(savedY);
  }

  async function handleBulkMoveDecksToFolder(targetFolder: string) {
    if (!targetFolder || selectedDeckIds.size === 0) return;
    if (targetFolder === '__NEW__') {
      setFolderPromptInput('');
      setFolderPromptState({ mode: 'move_bulk' });
      return;
    }
    const savedY = window.scrollY;
    await fetch('/api/decks/bulk-move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedDeckIds), folder: targetFolder })
    });
    setSelectedDeckIds(new Set());
    preserveScrollPosition(savedY);
    await onRefreshGlobal();
    preserveScrollPosition(savedY);
  }

  async function handleConfirmFolderPrompt(e: React.FormEvent) {
    e.preventDefault();
    const clean = folderPromptInput.trim();
    if (!clean || !folderPromptState) return;
    const currentMode = folderPromptState;
    setFolderPromptState(null);
    setFolderPromptInput('');

    if (currentMode.mode === 'move_single') {
      await handleMoveDeckToFolder(currentMode.deckId, clean);
    } else if (currentMode.mode === 'move_bulk') {
      await handleBulkMoveDecksToFolder(clean);
    } else if (currentMode.mode === 'paste_folder') {
      setPasteDeckFolder(clean);
    } else if (currentMode.mode === 'create_folder') {
      setNewFolder(clean);
    }
  }

  function renderFolderPromptModal() {
    if (!folderPromptState) return null;
    return (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4"
        onClick={() => setFolderPromptState(null)}
      >
        <form
          onSubmit={handleConfirmFolderPrompt}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-5 shadow-2xl space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <h3 className="text-sm font-black text-slate-100 flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-amber-400" />
              <span>Create New Deck Folder</span>
            </h3>
            <button
              type="button"
              onClick={() => setFolderPromptState(null)}
              className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">Folder Name</label>
            <input
              type="text"
              required
              autoFocus
              placeholder="e.g., cEDH, Precons, Brewing..."
              value={folderPromptInput}
              onChange={e => setFolderPromptInput(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setFolderPromptState(null)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer"
            >
              Use Folder
            </button>
          </div>
        </form>
      </div>
    );
  }

  async function handleBulkDeleteDeckCards(mode: 'selected' | 'all') {
    if (!selectedDeckId) return;
    const savedY = window.scrollY;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    await fetch(`/api/decks/${selectedDeckId}/cards/bulk-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        mode === 'all' ? { clearAll: true } : { ids: Array.from(selectedCardRowIds) }
      )
    });
    setSelectedCardRowIds(new Set());
    setConfirmInsideAction(null);
    await loadDeckDetail(selectedDeckId, false);
    preserveScrollPosition(savedY);
    await onRefreshGlobal();
    preserveScrollPosition(savedY);
  }

  function toggleSelectDeck(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedDeckIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirmDeleteDecks(null);
  }

  function toggleSelectCardRow(rowId: number) {
    setSelectedCardRowIds(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
    setConfirmInsideAction(null);
  }

  async function handleUpdateDeckCard(cardRowId: number, patch: Record<string, any>) {
    if (!selectedDeckId) return;
    const savedY = window.scrollY;
    if (patch.quantity !== undefined && patch.quantity <= 0 && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const targetCard = deckDetail?.cards.find(c => c.id === cardRowId);
    if (targetCard && patch.force_buy !== undefined) {
      setCardForcedOnBuylist(selectedDeckId, targetCard.name, Boolean(patch.force_buy));
    }

    // If moving a card to the Commander slot, remove any other duplicate row of the same card name in Mainboard/Creatures
    const duplicateRowIdsToRemove: number[] = [];
    if (patch.board === 'commander' && targetCard && deckDetail) {
      for (const c of deckDetail.cards) {
        if (
          c.id !== cardRowId &&
          (c.scryfall_id === targetCard.scryfall_id ||
            c.name.toLowerCase() === targetCard.name.toLowerCase())
        ) {
          duplicateRowIdsToRemove.push(c.id);
        }
      }
      patch = { ...patch, quantity: 1 };
    }

    setDeckDetail(prev => {
      if (!prev) return prev;
      if (patch.quantity !== undefined && patch.quantity <= 0) {
        return { ...prev, cards: prev.cards.filter(c => c.id !== cardRowId) };
      }
      const next = {
        ...prev,
        cards: prev.cards
          .filter(c => !duplicateRowIdsToRemove.includes(c.id))
          .map(c => {
            if (c.id !== cardRowId) return c;
            const extra: Record<string, any> = {};
            if (patch.force_buy === 1) {
              extra.missing_qty = patch.quantity ?? c.quantity;
            } else if (patch.force_buy === 0 && (c.owned_qty || 0) >= (patch.quantity ?? c.quantity)) {
              extra.missing_qty = 0;
            }
            return { ...c, ...patch, ...extra };
          })
      };
      return applyForcedBuylistToDeckDetail(next);
    });
    preserveScrollPosition(savedY);

    for (const dupId of duplicateRowIdsToRemove) {
      await fetch(`/api/decks/${selectedDeckId}/cards/${dupId}`, { method: 'DELETE' });
    }

    const res = await fetch(`/api/decks/${selectedDeckId}/cards/${cardRowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      if (json.deckDetail) {
        setDeckDetail(applyForcedBuylistToDeckDetail(json.deckDetail));
      } else {
        await loadDeckDetail(selectedDeckId, false);
      }
      if (patch.force_buy === 1 && targetCard) {
        showBuylistToast('success', `🛒 Added ${targetCard.name} to this deck's Buy List!`);
      } else if (patch.force_buy === 0 && targetCard) {
        showBuylistToast('success', `✓ Switched ${targetCard.name} to use your existing Vault copy!`);
      }
    } else {
      await loadDeckDetail(selectedDeckId, false);
    }
    preserveScrollPosition(savedY);
    await onRefreshGlobal();
    preserveScrollPosition(savedY);
  }

  async function handleRemoveDeckCard(cardRowId: number) {
    if (!selectedDeckId) return;
    const savedY = window.scrollY;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setDeckDetail(prev =>
      prev ? { ...prev, cards: prev.cards.filter(c => c.id !== cardRowId) } : prev
    );
    preserveScrollPosition(savedY);

    await fetch(`/api/decks/${selectedDeckId}/cards/${cardRowId}`, { method: 'DELETE' });
    await loadDeckDetail(selectedDeckId, false);
    preserveScrollPosition(savedY);
    await onRefreshGlobal();
    preserveScrollPosition(savedY);
  }

  function showBuylistToast(type: 'success' | 'error', message: string) {
    setBuylistFeedback({ type, message });
    setTimeout(() => {
      setBuylistFeedback(prev => (prev && prev.message === message ? null : prev));
    }, 4500);
  }

  function getMissingItemRowId(missingItem: MissingCardEntry, deckCards?: DeckCardItem[]): number | undefined {
    if (typeof missingItem.deck_card_id === 'number' && missingItem.deck_card_id > 0) {
      return missingItem.deck_card_id;
    }
    const list = deckCards || deckDetail?.cards || [];
    const found =
      list.find(c => c.scryfall_id === missingItem.scryfall_id && (!missingItem.board || c.board === missingItem.board)) ||
      list.find(c => c.scryfall_id === missingItem.scryfall_id) ||
      list.find(c => c.name.toLowerCase() === missingItem.name.toLowerCase());
    return found?.id;
  }

  async function submitMarkBoughtItems(
    targetDeckId: number | null,
    items: Array<{
      deck_card_id?: number;
      deck_id?: number;
      scryfall_id?: string;
      name: string;
      set_code?: string;
      collector_number?: string;
      finish?: string;
      quantity: number;
    }>
  ): Promise<boolean> {
    if (items.length === 0) return false;
    setMarkingBoughtLoading(true);
    try {
      for (const item of items) {
        const dId = item.deck_id || targetDeckId || selectedDeckId;
        if (dId && item.name) {
          setCardForcedOnBuylist(dId, item.name, false);
        }
      }

      const res = await fetch('/api/decks/mark-bought', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: targetDeckId,
          items
        })
      });

      if (res.status === 404) {
        // Fallback if an older server instance is running without /api/decks/mark-bought
        for (const item of items) {
          const dId = item.deck_id || targetDeckId || selectedDeckId;
          const fullCard =
            deckDetail?.cards.find(
              c =>
                (item.deck_card_id && c.id === item.deck_card_id) ||
                c.scryfall_id === item.scryfall_id ||
                c.name.toLowerCase() === item.name.toLowerCase()
            ) || item;
          await fetch('/api/inventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              card: {
                ...fullCard,
                scryfall_id: item.scryfall_id || (fullCard as any).scryfall_id,
                name: item.name
              },
              quantity: Math.max(1, Number(item.quantity) || 1),
              finish: item.finish || 'nonfoil',
              condition: 'NM',
              location: 'Commander Box',
              notes: dId ? `Deck #${dId}` : ''
            })
          });
        }
        if (selectedDeckId) {
          await loadDeckDetail(selectedDeckId, false);
        }
      } else if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        showBuylistToast('error', errJson.error || `Failed to mark cards bought (HTTP ${res.status})`);
        return false;
      } else {
        const data = await res.json();
        if (data.deckDetail && targetDeckId && selectedDeckId === targetDeckId) {
          setDeckDetail(applyForcedBuylistToDeckDetail(data.deckDetail));
        } else if (selectedDeckId) {
          await loadDeckDetail(selectedDeckId, false);
        }
      }

      const totalAdded = items.reduce((s, i) => s + (Number(i.quantity) || 1), 0);
      showBuylistToast(
        'success',
        `✓ Marked ${totalAdded} card(s) (${items.length} unique) as bought and added to your Collection!`
      );
      return true;
    } catch (err) {
      showBuylistToast(
        'error',
        '⚠️ Could not connect to local AetherVault server (http://localhost:3000). Double-click Start-AetherVault.bat in your project folder to start it.'
      );
      return false;
    } finally {
      setMarkingBoughtLoading(false);
    }
  }

  async function handleAcquireMissingCard(missingItem: MissingCardEntry, customQty?: number) {
    const rowId = getMissingItemRowId(missingItem);
    const fullCard =
      deckDetail?.cards.find(
        c =>
          (rowId && c.id === rowId) ||
          c.scryfall_id === missingItem.scryfall_id ||
          c.name.toLowerCase() === missingItem.name.toLowerCase()
      ) || missingItem;
    const targetDeckId = selectedDeckId || missingItem.deck_id || null;
    const qtyToAcquire = Math.max(1, customQty ?? missingItem.missing_qty ?? 1);
    const savedY = window.scrollY;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const ok = await submitMarkBoughtItems(targetDeckId, [
      {
        deck_card_id: rowId,
        deck_id: targetDeckId ?? undefined,
        scryfall_id: fullCard.scryfall_id || missingItem.scryfall_id,
        name: fullCard.name || missingItem.name,
        set_code: fullCard.set_code || missingItem.set_code,
        collector_number: fullCard.collector_number || missingItem.collector_number,
        finish: missingItem.finish || fullCard.finish || 'nonfoil',
        quantity: qtyToAcquire
      }
    ]);
    if (ok && rowId && qtyToAcquire >= (missingItem.missing_qty || 1)) {
      setSelectedCardRowIds(prev => {
        if (!prev.has(rowId)) return prev;
        const next = new Set(prev);
        next.delete(rowId);
        return next;
      });
    }
    preserveScrollPosition(savedY);
    await onRefreshGlobal();
    preserveScrollPosition(savedY);
  }

  async function handleAcquireSelectedMissing() {
    if (!deckDetail || !selectedDeckId || selectedCardRowIds.size === 0) return;
    const savedY = window.scrollY;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const selectedMissing = (deckDetail.analysis.ownership.missingCards || []).filter(m => {
      const rowId = getMissingItemRowId(m, deckDetail.cards);
      return typeof rowId === 'number' && selectedCardRowIds.has(rowId);
    });
    if (selectedMissing.length === 0) {
      showBuylistToast('error', 'No missing cards are currently selected.');
      return;
    }

    const payloadItems = selectedMissing.map(m => {
      const rowId = getMissingItemRowId(m, deckDetail.cards);
      const fullCard =
        deckDetail.cards.find(
          c =>
            (rowId && c.id === rowId) ||
            c.scryfall_id === m.scryfall_id ||
            c.name.toLowerCase() === m.name.toLowerCase()
        ) || m;
      return {
        deck_card_id: rowId,
        deck_id: selectedDeckId,
        scryfall_id: fullCard.scryfall_id || m.scryfall_id,
        name: fullCard.name || m.name,
        set_code: fullCard.set_code || m.set_code,
        collector_number: fullCard.collector_number || m.collector_number,
        finish: m.finish || fullCard.finish || 'nonfoil',
        quantity: Math.max(1, m.missing_qty || 1)
      };
    });

    const ok = await submitMarkBoughtItems(selectedDeckId, payloadItems);
    if (ok) {
      setSelectedCardRowIds(new Set());
    }
    preserveScrollPosition(savedY);
    await onRefreshGlobal();
    preserveScrollPosition(savedY);
  }

  async function handleRemoveMissingCard(missingItem: MissingCardEntry) {
    if (!selectedDeckId) return;
    const rowId = getMissingItemRowId(missingItem);
    if (!rowId) return;
    await handleRemoveDeckCard(rowId);
  }

  async function handleAcquireMasterBuylistItem(
    item: {
      key?: string;
      scryfall_id: string;
      name: string;
      set_code: string;
      collector_number: string;
      finish: string;
      missing_qty: number;
      neededByDecks: Array<{ deck_id: number; deck_name: string; missing_qty: number; deck_card_id?: number }>;
    },
    customQty?: number
  ) {
    const savedY = window.scrollY;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const payloadItems = customQty
      ? [
          {
            deck_card_id: item.neededByDecks[0]?.deck_card_id,
            deck_id: item.neededByDecks[0]?.deck_id,
            scryfall_id: item.scryfall_id,
            name: item.name,
            set_code: item.set_code,
            collector_number: item.collector_number,
            finish: item.finish || 'nonfoil',
            quantity: customQty
          }
        ]
      : item.neededByDecks.map(d => ({
          deck_card_id: d.deck_card_id,
          deck_id: d.deck_id,
          scryfall_id: item.scryfall_id,
          name: item.name,
          set_code: item.set_code,
          collector_number: item.collector_number,
          finish: item.finish || 'nonfoil',
          quantity: Math.max(1, d.missing_qty || 1)
        }));

    const ok = await submitMarkBoughtItems(null, payloadItems);
    if (ok && item.key && !customQty) {
      setSelectedMasterBuylistKeys(prev => {
        if (!prev.has(item.key!)) return prev;
        const next = new Set(prev);
        next.delete(item.key!);
        return next;
      });
    }
    preserveScrollPosition(savedY);
    await onRefreshGlobal();
    preserveScrollPosition(savedY);
  }

  async function handleAcquireSelectedMasterBuylist() {
    const selectedItems = masterBuyList.items.filter(m => selectedMasterBuylistKeys.has(m.key));
    if (selectedItems.length === 0) return;
    const savedY = window.scrollY;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const payloadItems = selectedItems.flatMap(item =>
      item.neededByDecks.map(d => ({
        deck_card_id: d.deck_card_id,
        deck_id: d.deck_id,
        scryfall_id: item.scryfall_id,
        name: item.name,
        set_code: item.set_code,
        collector_number: item.collector_number,
        finish: item.finish || 'nonfoil',
        quantity: Math.max(1, d.missing_qty || 1)
      }))
    );
    const ok = await submitMarkBoughtItems(null, payloadItems);
    if (ok) {
      setSelectedMasterBuylistKeys(new Set());
    }
    preserveScrollPosition(savedY);
    await onRefreshGlobal();
    preserveScrollPosition(savedY);
  }

  async function handleRemoveSelectedMasterBuylist() {
    const selectedItems = masterBuyList.items.filter(m => selectedMasterBuylistKeys.has(m.key));
    if (selectedItems.length === 0) return;
    const savedY = window.scrollY;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    for (const item of selectedItems) {
      for (const d of item.neededByDecks) {
        if (d.deck_card_id) {
          await fetch(`/api/decks/${d.deck_id}/cards/${d.deck_card_id}`, { method: 'DELETE' });
        }
      }
    }
    setSelectedMasterBuylistKeys(new Set());
    preserveScrollPosition(savedY);
    await onRefreshGlobal();
    preserveScrollPosition(savedY);
  }

  async function handleAcquireAllMasterBuylist() {
    const savedY = window.scrollY;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const payloadItems = masterBuyList.items.flatMap(item =>
      item.neededByDecks.map(d => ({
        deck_card_id: d.deck_card_id,
        deck_id: d.deck_id,
        scryfall_id: item.scryfall_id,
        name: item.name,
        set_code: item.set_code,
        collector_number: item.collector_number,
        finish: item.finish || 'nonfoil',
        quantity: Math.max(1, d.missing_qty || 1)
      }))
    );
    const ok = await submitMarkBoughtItems(null, payloadItems);
    if (ok) {
      setSelectedMasterBuylistKeys(new Set());
    }
    preserveScrollPosition(savedY);
    await onRefreshGlobal();
    preserveScrollPosition(savedY);
  }

  async function handleRemoveMasterBuylistItem(item: {
    neededByDecks: Array<{ deck_id: number; deck_name: string; missing_qty: number; deck_card_id?: number }>;
  }) {
    const savedY = window.scrollY;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    for (const d of item.neededByDecks) {
      if (d.deck_card_id) {
        await fetch(`/api/decks/${d.deck_id}/cards/${d.deck_card_id}`, { method: 'DELETE' });
      }
    }
    preserveScrollPosition(savedY);
    await onRefreshGlobal();
    preserveScrollPosition(savedY);
  }

  function handleCopyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopiedType(label);
    setTimeout(() => setCopiedType(null), 2200);
  }

  function downloadBuylistCsv(rows: Array<{
    name: string;
    set_code: string;
    collector_number: string;
    finish: string;
    missing_qty: number;
    owned_total_qty?: number;
    unit_tcg: number;
    total_tcg: number;
    unit_ck_retail: number;
    total_ck_retail: number;
    decks_label?: string;
  }>, filename: string) {
    const headers = [
      'Quantity Needed',
      'Card Name',
      'Set Code',
      'Collector Number',
      'Finish',
      'Owned in Vault',
      'Unit TCGplayer ($)',
      'Total TCGplayer ($)',
      'Unit Card Kingdom ($)',
      'Total Card Kingdom ($)',
      'Decks Needing Card'
    ];
    const escapeCsv = (val: any) => {
      const s = String(val ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const csvLines = [
      headers.join(','),
      ...rows.map(r =>
        [
          r.missing_qty,
          r.name,
          (r.set_code || '').toUpperCase(),
          r.collector_number || '',
          r.finish || 'nonfoil',
          r.owned_total_qty || 0,
          Number(r.unit_tcg || 0).toFixed(2),
          Number(r.total_tcg || 0).toFixed(2),
          Number(r.unit_ck_retail || 0).toFixed(2),
          Number(r.total_ck_retail || 0).toFixed(2),
          r.decks_label || ''
        ].map(escapeCsv).join(',')
      )
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Aggregate master buy list across all decks (or filtered deck)
  const masterBuyList = useMemo(() => {
    const targetDecks = masterBuylistDeckFilter === 'ALL'
      ? decks
      : decks.filter(d => d.id === masterBuylistDeckFilter);

    const map = new Map<string, {
      key: string;
      scryfall_id: string;
      name: string;
      set_code: string;
      collector_number: string;
      finish: string;
      image_small: string | null;
      owned_total_qty: number;
      missing_qty: number;
      unit_tcg: number;
      total_tcg: number;
      unit_ck_retail: number;
      total_ck_retail: number;
      tcgplayer_url: string | null;
      cardkingdom_url: string | null;
      neededByDecks: Array<{ deck_id: number; deck_name: string; missing_qty: number; deck_card_id?: number }>;
    }>();

    for (const d of targetDecks) {
      for (const m of d.ownership?.missingCards || []) {
        const key = (m.name || '').toLowerCase();
        const existing = map.get(key);
        if (!existing) {
          map.set(key, {
            key,
            scryfall_id: m.scryfall_id,
            name: m.name,
            set_code: m.set_code,
            collector_number: m.collector_number,
            finish: m.finish || 'nonfoil',
            image_small: m.image_small,
            owned_total_qty: m.owned_total_qty || 0,
            missing_qty: m.missing_qty,
            unit_tcg: m.unit_tcg || 0,
            total_tcg: m.total_tcg || 0,
            unit_ck_retail: m.unit_ck_retail || 0,
            total_ck_retail: m.total_ck_retail || 0,
            tcgplayer_url: m.tcgplayer_url,
            cardkingdom_url: m.cardkingdom_url,
            neededByDecks: [{ deck_id: d.id, deck_name: d.name, missing_qty: m.missing_qty, deck_card_id: m.deck_card_id }]
          });
        } else {
          existing.missing_qty += m.missing_qty;
          existing.total_tcg = Number((existing.missing_qty * existing.unit_tcg).toFixed(2));
          existing.total_ck_retail = Number((existing.missing_qty * existing.unit_ck_retail).toFixed(2));
          const deckRef = existing.neededByDecks.find(x => x.deck_id === d.id);
          if (deckRef) deckRef.missing_qty += m.missing_qty;
          else existing.neededByDecks.push({ deck_id: d.id, deck_name: d.name, missing_qty: m.missing_qty, deck_card_id: m.deck_card_id });
        }
      }
    }

    const items = Array.from(map.values()).sort((a, b) => b.total_tcg - a.total_tcg);
    const totalCardsNeeded = items.reduce((s, i) => s + i.missing_qty, 0);
    const totalTcg = Number(items.reduce((s, i) => s + i.total_tcg, 0).toFixed(2));
    const totalCk = Number(items.reduce((s, i) => s + i.total_ck_retail, 0).toFixed(2));

    return { items, totalCardsNeeded, totalTcg, totalCk };
  }, [decks, masterBuylistDeckFilter]);

  const groupedCards = useMemo(() => {
    if (!deckDetail) return {};
    const list = deckDetail.cards.filter(c => {
      if (ownershipFilter === 'owned') return (c.missing_qty || 0) === 0;
      if (ownershipFilter === 'missing') return (c.missing_qty || 0) > 0;
      return true;
    });

    const rawGroups: Record<string, DeckCardItem[]> = {};

    for (const card of list) {
      let key = 'Other';
      if (card.board === 'commander') {
        key = '👑 Commander';
      } else if (card.board === 'sideboard') {
        key = 'Sideboard';
      } else if (card.board === 'considering') {
        key = 'Considering / Maybeboard';
      } else if (groupBy === 'cmc') {
        const tl = (card.type_line || '').toLowerCase();
        if (tl.includes('land')) key = 'Lands (0 MV)';
        else {
          const mv = Math.floor(card.cmc || 0);
          key = mv >= 6 ? '6+ Mana Value' : `${mv} Mana Value`;
        }
      } else if (groupBy === 'board') {
        key = 'Mainboard';
      } else {
        const tl = (card.type_line || '').toLowerCase();
        if (tl.includes('land')) key = 'Lands';
        else if (tl.includes('creature')) key = 'Creatures';
        else if (tl.includes('planeswalker')) key = 'Planeswalkers';
        else if (tl.includes('instant')) key = 'Instants';
        else if (tl.includes('sorcery')) key = 'Sorceries';
        else if (tl.includes('artifact')) key = 'Artifacts';
        else if (tl.includes('enchantment')) key = 'Enchantments';
        else if (tl.includes('battle')) key = 'Battles';
        else key = 'Other Spells';
      }

      if (!rawGroups[key]) rawGroups[key] = [];
      rawGroups[key].push(card);
    }

    // Sort sections in canonical Archidekt category order (and sort cards inside each section A->Z)
    const ARCHIDEKT_SECTION_ORDER = [
      '👑 Commander',
      'Creatures',
      'Planeswalkers',
      'Instants',
      'Sorceries',
      'Artifacts',
      'Enchantments',
      'Battles',
      'Other Spells',
      'Lands',
      '0 Mana Value',
      '1 Mana Value',
      '2 Mana Value',
      '3 Mana Value',
      '4 Mana Value',
      '5 Mana Value',
      '6+ Mana Value',
      'Lands (0 MV)',
      'Mainboard',
      'Sideboard',
      'Considering / Maybeboard'
    ];

    const orderedKeys = Object.keys(rawGroups).sort((a, b) => {
      const idxA = ARCHIDEKT_SECTION_ORDER.indexOf(a);
      const idxB = ARCHIDEKT_SECTION_ORDER.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    const orderedGroups: Record<string, DeckCardItem[]> = {};
    for (const k of orderedKeys) {
      orderedGroups[k] = rawGroups[k].slice().sort((a, b) => a.name.localeCompare(b.name));
    }

    return orderedGroups;
  }, [deckDetail, groupBy, ownershipFilter]);

  // Flatten cards in exact Archidekt section-by-section order for CardZoomModal navigation
  const sectionOrderedDeckCards = useMemo<ZoomableCard[]>(() => {
    const out: ZoomableCard[] = [];
    for (const [secTitle, secItems] of Object.entries(groupedCards)) {
      for (const item of secItems) {
        out.push({ ...item, sectionTitle: secTitle });
      }
    }
    return out;
  }, [groupedCards]);

  useEffect(() => {
    setActiveSectionFilter('ALL');
  }, [selectedDeckId, groupBy]);

  const bracketReport = useMemo(() => {
    if (!deckDetail) return null;
    return evaluateDeckBracketAndSalt(deckDetail.cards, deckDetail.analysis.stats.avgCmc);
  }, [deckDetail]);

  function renderPasteDeckModal() {
    if (!showPasteModal) return null;
    const isNew = pasteTargetMode === 'new_deck' || !selectedDeckId;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4">
        <form
          onSubmit={handlePasteDecklistSubmit}
          className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Copy className="w-5 h-5 text-amber-400" />
                {isNew
                  ? 'Paste Decklist — Auto-Pull from Collection & Build Buy List'
                  : `Paste Decklist into "${deckDetail?.deck?.name || 'Deck'}"`}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Paste any decklist (Moxfield, Archidekt, EDHREC, MTGGoldfish, Arena, or plain lines). Cards you own are automatically pulled from your Available Collection, and any missing cards are added to your Buy List.
              </p>
            </div>
            <button
              type="button"
              disabled={pastingDeck}
              onClick={() => setShowPasteModal(false)}
              className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded-lg bg-slate-800 cursor-pointer"
            >
              ✕
            </button>
          </div>

          {selectedDeckId && (
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setPasteTargetMode('current_deck')}
                className={`py-2 px-3 rounded-lg font-bold transition cursor-pointer ${
                  pasteTargetMode === 'current_deck'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Paste into "{deckDetail?.deck?.name || 'Current Deck'}"
              </button>
              <button
                type="button"
                onClick={() => setPasteTargetMode('new_deck')}
                className={`py-2 px-3 rounded-lg font-bold transition cursor-pointer ${
                  pasteTargetMode === 'new_deck'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Create a Brand New Deck Instead
              </button>
            </div>
          )}

          {isNew ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">New Deck Name *</label>
                <input
                  type="text"
                  required
                  value={pasteDeckName}
                  onChange={e => setPasteDeckName(e.target.value)}
                  placeholder="e.g., Lathril Elfball, Mono-Red Burn..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Format</label>
                <select
                  value={pasteDeckFormat}
                  onChange={e => setPasteDeckFormat(e.target.value as FormatType)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100"
                >
                  <option value="commander">Commander / EDH (100-Card Singleton)</option>
                  <option value="standard">Standard (60-Card)</option>
                  <option value="pioneer">Pioneer (60-Card)</option>
                  <option value="modern">Modern (60-Card)</option>
                  <option value="legacy">Legacy (60-Card)</option>
                  <option value="pauper">Pauper (60-Card Commons)</option>
                  <option value="freeform">Freeform / Casual</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Folder</label>
                <select
                  value={pasteDeckFolder}
                  onChange={e => {
                    if (e.target.value === '__NEW__') {
                      setFolderPromptInput('');
                      setFolderPromptState({ mode: 'paste_folder' });
                    } else {
                      setPasteDeckFolder(e.target.value);
                    }
                  }}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100"
                >
                  {allFolderOptions.map(f => (
                    <option key={f} value={f}>
                      📁 {f}
                    </option>
                  ))}
                  {!allFolderOptions.includes(pasteDeckFolder) && (
                    <option value={pasteDeckFolder}>📁 {pasteDeckFolder}</option>
                  )}
                  <option value="__NEW__">+ Create New Folder...</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-300 font-medium">How should pasted cards be added?</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPasteReplaceExisting(false)}
                  className={`px-3 py-1 rounded-lg font-semibold cursor-pointer ${
                    !pasteReplaceExisting
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Add / Merge with Existing Cards
                </button>
                <button
                  type="button"
                  onClick={() => setPasteReplaceExisting(true)}
                  className={`px-3 py-1 rounded-lg font-semibold cursor-pointer ${
                    pasteReplaceExisting
                      ? 'bg-rose-500 text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Replace Current Decklist
                </button>
              </div>
            </div>
          )}

          {((isNew && pasteDeckFormat === 'commander') || (!isNew && deckDetail?.deck?.format === 'commander')) && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Commander Card Name (Optional — or include a "Commander" header in your pasted list)
              </label>
              <input
                type="text"
                value={pasteCommanderName}
                onChange={e => setPasteCommanderName(e.target.value)}
                placeholder="e.g., Atraxa, Praetors' Voice"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-300">
                Paste Decklist Lines *
              </label>
              <span className="text-[11px] text-emerald-400 font-medium">
                ✓ Automatically pulls owned cards from your Collection & sends missing to Buy List
              </span>
            </div>
            <textarea
              required
              rows={11}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder={`Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Sol Ring\n1 Arcane Signet\n1 Rhystic Study\n1 Command Tower\n14 Forest\n...`}
              className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-100 focus:outline-none focus:border-amber-400"
            />
          </div>

          {pastingDeck && (
            <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-xs text-amber-200 flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
              <span>{pasteProgressMsg || 'Matching collection & building Buy List...'}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={pastingDeck}
              onClick={() => setShowPasteModal(false)}
              className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pastingDeck || !pasteText.trim()}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              {pastingDeck
                ? 'Pulling from Inventory & Building Buy List...'
                : 'Build Deck, Pull Owned & Add Missing to Buy List'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  function renderDeckCard(d: DeckSummary) {
    const isDeckChecked = selectedDeckIds.has(d.id);
    const deckFolder = (d.folder || 'Uncategorized').trim() || 'Uncategorized';

    return (
      <div
        key={d.id}
        onClick={() => onSelectDeck(d.id)}
        className={`group cursor-pointer rounded-2xl bg-slate-900/90 border overflow-hidden flex flex-col justify-between transition shadow-lg ${
          isDeckChecked ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-slate-800 hover:border-amber-500/60'
        }`}
      >
        <div>
          <div className="relative h-36 bg-slate-950 overflow-hidden">
            {d.cover_image ? (
              <img
                src={d.cover_image}
                alt={d.name}
                className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition duration-300"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-950" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />

            <div className="absolute top-3 left-3 flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={e => toggleSelectDeck(d.id, e)}
                className={`p-1.5 rounded-lg border backdrop-blur-xs transition cursor-pointer ${
                  isDeckChecked
                    ? 'bg-amber-500 border-amber-300 text-slate-950'
                    : 'bg-slate-950/85 border-slate-700 text-slate-200 hover:text-white'
                }`}
                title="Select deck for bulk move or delete"
              >
                {isDeckChecked ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
              </button>

              <span className="px-2.5 py-0.5 rounded-md bg-slate-950/90 border border-slate-700 text-[11px] font-bold uppercase text-amber-300">
                {d.format}
              </span>
              {d.isValid ? (
                <span className="px-2 py-0.5 rounded-md bg-emerald-950/90 border border-emerald-500/40 text-[10px] font-semibold text-emerald-300">
                  Format Legal
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md bg-amber-950/90 border border-amber-500/40 text-[10px] font-semibold text-amber-300">
                  {d.counts.activeTotal}/{d.counts.targetTotal} Cards
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                setConfirmDeleteDecks(d.id);
              }}
              className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-rose-950/90 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-500/40 transition flex items-center gap-1 text-xs font-semibold cursor-pointer"
              title="Delete Deck"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>

            <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-bold text-lg text-slate-100 group-hover:text-amber-300 transition leading-tight truncate">
                  {d.name}
                </h3>
              </div>
              <ColorIdentityBadges colors={d.color_identity} size="sm" />
            </div>
          </div>

          <div className="p-4 space-y-3">
            {/* Folder Selector Row */}
            <div
              onClick={e => e.stopPropagation()}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                <Folder className="w-3.5 h-3.5 text-amber-400" />
                Folder:
              </span>
              <select
                value={deckFolder}
                onChange={e => handleMoveDeckToFolder(d.id, e.target.value)}
                className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-amber-200 text-xs font-semibold cursor-pointer"
                title="Move deck to folder"
              >
                {allFolderOptions.map(f => (
                  <option key={f} value={f}>
                    📁 {f}
                  </option>
                ))}
                {!allFolderOptions.includes(deckFolder) && (
                  <option value={deckFolder}>📁 {deckFolder}</option>
                )}
                <option value="__NEW__">+ New Folder...</option>
              </select>
            </div>

            {d.description && (
              <p className="text-xs text-slate-400 line-clamp-2">{d.description}</p>
            )}

            {/* Pricing comparison */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-sans text-sky-400 block">TCGplayer Value</span>
                <span className="font-bold text-slate-100">{formatUsd(d.valuation.tcg)}</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-sans text-amber-400 block">Card Kingdom Retail</span>
                <span className="font-bold text-slate-100">{formatUsd(d.valuation.ckRetail)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Ownership Readiness Footer */}
        <div className="px-4 py-3 bg-slate-950/80 border-t border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Inventory Readiness:</span>
            {d.ownership.totalMissing === 0 ? (
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> 100% Owned
              </span>
            ) : (
              <span className="text-rose-300 font-bold">
                {d.ownership.completionPct}% Owned ({d.ownership.totalMissing} to buy)
              </span>
            )}
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full ${d.ownership.totalMissing === 0 ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${d.ownership.completionPct}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // If no deck is selected, show the Deck Library Grid + Master Buy List Section
  if (!selectedDeckId) {
    const allDecksSelected =
      filteredAndSortedDecks.length > 0 && filteredAndSortedDecks.every(d => selectedDeckIds.has(d.id));
    const totalMissingAcrossAllDecks = decks.reduce((s, d) => s + (d.ownership?.totalMissing || 0), 0);

    return (
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900/90 border border-slate-800">
          <div>
            <h1 className="text-xl font-bold text-slate-100">
              Decks
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {decks.length > 0 && librarySection === 'decks' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (allDecksSelected) setSelectedDeckIds(new Set());
                    else setSelectedDeckIds(new Set(filteredAndSortedDecks.map(d => d.id)));
                    setConfirmDeleteDecks(null);
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer"
                >
                  {allDecksSelected ? (
                    <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  {allDecksSelected ? 'Deselect All' : `Select Shown (${filteredAndSortedDecks.length})`}
                </button>

                {selectedDeckIds.size > 0 && (
                  <>
                    <select
                      value=""
                      onChange={e => {
                        if (e.target.value) handleBulkMoveDecksToFolder(e.target.value);
                      }}
                      className="px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs font-bold cursor-pointer"
                    >
                      <option value="">📁 Move {selectedDeckIds.size} Selected to Folder...</option>
                      {allFolderOptions.map(f => (
                        <option key={f} value={f} className="bg-slate-900 text-slate-100">
                          📁 {f}
                        </option>
                      ))}
                      <option value="__NEW__" className="bg-slate-900 text-amber-300">
                        + Create New Folder...
                      </option>
                    </select>

                    <button
                      type="button"
                      onClick={() => setConfirmDeleteDecks('selected')}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Selected ({selectedDeckIds.size})
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setConfirmDeleteDecks('all')}
                  className="px-3 py-2 rounded-xl bg-rose-950/70 hover:bg-rose-900 border border-rose-500/40 text-rose-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  Delete All Decks ({decks.length})
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                setPasteTargetMode('new_deck');
                setPasteDeckName('');
                setPasteDeckFormat('commander');
                setPasteDeckFolder(selectedFolder !== 'ALL' ? selectedFolder : 'Uncategorized');
                setPasteCommanderName('');
                setPasteText('');
                setShowPasteModal(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-sm"
            >
              <Copy className="w-4 h-4" />
              Paste Decklist
            </button>

            <button
              type="button"
              onClick={() => {
                setNewFolder(selectedFolder !== 'ALL' ? selectedFolder : 'Uncategorized');
                setShowCreateModal(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Create New Deck
            </button>
          </div>
        </div>

        {/* Section Switcher: Deck Library vs Cards Needed to Buy Across Decks */}
        {decks.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setLibrarySection('decks')}
              className={`p-4 rounded-2xl border text-left transition flex items-center justify-between cursor-pointer ${
                librarySection === 'decks'
                  ? 'bg-amber-500/15 border-amber-400 ring-1 ring-amber-400/50'
                  : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-300">
                  <Layers className="w-4 h-4" />
                  Decks
                </div>
                <div className="text-2xl font-bold font-mono text-slate-100 mt-1">
                  {decks.length} <span className="text-xs font-sans font-normal text-slate-400">Decks</span>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setLibrarySection('master_buylist')}
              className={`p-4 rounded-2xl border text-left transition flex items-center justify-between cursor-pointer ${
                librarySection === 'master_buylist'
                  ? 'bg-rose-500/15 border-rose-400 ring-1 ring-rose-400/50'
                  : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-300">
                  <ShoppingBag className="w-4 h-4" />
                  Buy List
                </div>
                <div className="text-2xl font-bold font-mono text-slate-100 mt-1">
                  {totalMissingAcrossAllDecks}{' '}
                  <span className="text-xs font-sans font-normal text-slate-400">
                    Cards Needed
                  </span>
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Deck Delete Confirmation Banner */}
        {confirmDeleteDecks !== null && (
          <div className="p-4 rounded-xl bg-rose-950/85 border border-rose-500/60 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-rose-100 font-semibold">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                {confirmDeleteDecks === 'all' && `Permanently delete all ${decks.length} deck(s)? (Cards in your collection will automatically return to Available)`}
                {confirmDeleteDecks === 'selected' && `Permanently delete ${selectedDeckIds.size} selected deck(s)?`}
                {typeof confirmDeleteDecks === 'number' && `Permanently delete deck "${decks.find(d => d.id === confirmDeleteDecks)?.name}"?`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteDecks(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (typeof confirmDeleteDecks === 'number') {
                    handleDeleteSingleDeck(confirmDeleteDecks);
                  } else {
                    handleBulkDeleteDecks(confirmDeleteDecks);
                  }
                }}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
              >
                Yes, Delete Deck(s)
              </button>
            </div>
          </div>
        )}

        {decks.length === 0 ? (
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-12 text-center space-y-3">
            <div className="text-slate-200 font-bold text-base">No Decks Created Yet</div>
            <p className="text-xs text-slate-400">
              Click "Create New Deck" above or use the Bulk Importer to import a decklist from Moxfield, Archidekt, or Arena.
            </p>
          </div>
        ) : librarySection === 'master_buylist' ? (
          /* MASTER BUY LIST ACROSS ALL DECKS */
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-rose-400" />
                  Cards Needed to Buy to Finish Out Decks
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Automatically compares every deck against your Available Collection. As you add cards to your collection, this list updates automatically.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={masterBuylistDeckFilter === 'ALL' ? 'ALL' : String(masterBuylistDeckFilter)}
                  onChange={e =>
                    setMasterBuylistDeckFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
                  }
                  className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200 font-semibold"
                >
                  <option value="ALL">All Decks Combined ({decks.length} decks)</option>
                  {decks.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.ownership.totalMissing} needed)
                    </option>
                  ))}
                </select>

                {masterBuyList.items.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const allSelected =
                          masterBuyList.items.length > 0 &&
                          masterBuyList.items.every(i => selectedMasterBuylistKeys.has(i.key));
                        if (allSelected) {
                          setSelectedMasterBuylistKeys(new Set());
                        } else {
                          setSelectedMasterBuylistKeys(new Set(masterBuyList.items.map(i => i.key)));
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      {masterBuyList.items.length > 0 &&
                      masterBuyList.items.every(i => selectedMasterBuylistKeys.has(i.key)) ? (
                        <CheckSquare className="w-4 h-4 text-amber-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                      {masterBuyList.items.length > 0 &&
                      masterBuyList.items.every(i => selectedMasterBuylistKeys.has(i.key))
                        ? 'Deselect All'
                        : 'Select All'}
                    </button>

                    {selectedMasterBuylistKeys.size > 0 && (
                      <>
                        <button
                          type="button"
                          disabled={markingBoughtLoading}
                          onClick={handleAcquireSelectedMasterBuylist}
                          className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <FolderPlus className="w-4 h-4" />
                          {markingBoughtLoading
                            ? 'Marking Bought...'
                            : `Mark Selected Bought (${selectedMasterBuylistKeys.size})`}
                        </button>

                        <button
                          type="button"
                          onClick={handleRemoveSelectedMasterBuylist}
                          className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                          Remove Selected ({selectedMasterBuylistKeys.size})
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText(
                          masterBuyList.items
                            .map(m => `${m.missing_qty} ${m.name} [${m.set_code.toUpperCase()}]`)
                            .join('\n'),
                          'master_missing'
                        )
                      }
                      className="px-3.5 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedType === 'master_missing' ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-400" />
                          Copied Buy List!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy Mass Entry (TCG / CK)
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        downloadBuylistCsv(
                          masterBuyList.items.map(m => ({
                            ...m,
                            decks_label: m.neededByDecks.map(d => `${d.deck_name} (${d.missing_qty}x)`).join('; ')
                          })),
                          'aethervault-decks-buylist.csv'
                        )
                      }
                      className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      Export Buy List CSV
                    </button>

                    <button
                      type="button"
                      disabled={markingBoughtLoading}
                      onClick={handleAcquireAllMasterBuylist}
                      className="px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-50 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <FolderPlus className="w-4 h-4" />
                      Mark All Bought (+Add All to Vault)
                    </button>
                  </>
                )}
              </div>
            </div>

            {buylistFeedback && (
              <div
                className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-3 ${
                  buylistFeedback.type === 'success'
                    ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                    : 'bg-rose-950/70 border-rose-500/60 text-rose-200'
                }`}
              >
                <span>{buylistFeedback.message}</span>
                <button
                  type="button"
                  onClick={() => setBuylistFeedback(null)}
                  className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Summary KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[11px] font-semibold uppercase text-slate-400">Total Cards to Buy</div>
                <div className="text-2xl font-bold font-mono text-rose-400 mt-1">
                  {masterBuyList.totalCardsNeeded}{' '}
                  <span className="text-xs font-sans font-normal text-slate-400">
                    ({masterBuyList.items.length} unique cards)
                  </span>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-950 border border-sky-500/30">
                <div className="text-[11px] font-semibold uppercase text-sky-400">Estimated TCGplayer Cost</div>
                <div className="text-2xl font-bold font-mono text-slate-100 mt-1">
                  {formatUsd(masterBuyList.totalTcg)}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-950 border border-amber-500/30">
                <div className="text-[11px] font-semibold uppercase text-amber-400">Estimated Card Kingdom Cost</div>
                <div className="text-2xl font-bold font-mono text-slate-100 mt-1">
                  {formatUsd(masterBuyList.totalCk)}
                </div>
              </div>
            </div>

            {masterBuyList.items.length === 0 ? (
              <div className="p-10 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <div className="text-base font-bold text-slate-100">
                  All Selected Decks Are 100% Complete!
                </div>
                <p className="text-xs text-slate-300">
                  You already own all required cards in your collection for the selected deck(s).
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                      <th className="py-2.5 px-2.5 w-8">
                        <button
                          type="button"
                          onClick={() => {
                            const allSelected =
                              masterBuyList.items.length > 0 &&
                              masterBuyList.items.every(i => selectedMasterBuylistKeys.has(i.key));
                            if (allSelected) {
                              setSelectedMasterBuylistKeys(new Set());
                            } else {
                              setSelectedMasterBuylistKeys(new Set(masterBuyList.items.map(i => i.key)));
                            }
                          }}
                          className="text-slate-400 hover:text-white cursor-pointer flex items-center"
                          title="Select all cards on Buy List"
                        >
                          {masterBuyList.items.length > 0 &&
                          masterBuyList.items.every(i => selectedMasterBuylistKeys.has(i.key)) ? (
                            <CheckSquare className="w-4 h-4 text-amber-400" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </th>
                      <th className="py-2.5 px-3">Buy Qty</th>
                      <th className="py-2.5 px-3">Card</th>
                      <th className="py-2.5 px-3">Printing</th>
                      <th className="py-2.5 px-3">Needed For Deck(s)</th>
                      <th className="py-2.5 px-3 text-right text-sky-400">TCGplayer</th>
                      <th className="py-2.5 px-3 text-right text-amber-400">Card Kingdom</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {masterBuyList.items.map(m => {
                      const isRowSelected = selectedMasterBuylistKeys.has(m.key);
                      const toggleMasterRow = () => {
                        setSelectedMasterBuylistKeys(prev => {
                          const next = new Set(prev);
                          if (next.has(m.key)) next.delete(m.key);
                          else next.add(m.key);
                          return next;
                        });
                      };
                      return (
                        <tr
                          key={m.key}
                          className={`transition ${
                            isRowSelected ? 'bg-amber-500/10' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-3 px-2.5">
                            <button
                              type="button"
                              onClick={toggleMasterRow}
                              className="text-slate-400 hover:text-white cursor-pointer flex items-center"
                            >
                              {isRowSelected ? (
                                <CheckSquare className="w-4 h-4 text-amber-400" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-rose-400 text-sm">
                            {m.missing_qty}x
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              {m.image_small && (
                                <img
                                  src={m.image_small}
                                  alt={m.name}
                                  onClick={toggleMasterRow}
                                  className="w-8 h-11 rounded object-cover cursor-pointer"
                                />
                              )}
                              <div>
                                <div className="font-bold text-slate-100 text-sm">{m.name}</div>
                                <div className="text-[11px] text-slate-400">
                                  Owned in Vault: <strong className="text-slate-200 font-mono">{m.owned_total_qty}</strong>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono uppercase text-amber-300">
                            {m.set_code} #{m.collector_number}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-wrap gap-1.5">
                              {m.neededByDecks.map(d => (
                                <button
                                  key={d.deck_id}
                                  type="button"
                                  onClick={() => onSelectDeck(d.deck_id)}
                                  className="px-2 py-0.5 rounded-md bg-amber-500/15 hover:bg-amber-500/30 border border-amber-500/30 text-amber-200 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Swords className="w-3 h-3 text-amber-400" />
                                  {d.deck_name} ({d.missing_qty}x)
                                </button>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            <a
                              href={m.tcgplayer_url || '#'}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-sky-300 hover:underline font-bold"
                            >
                              {formatUsd(m.total_tcg)}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            <a
                              href={m.cardkingdom_url || '#'}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-amber-300 hover:underline font-bold"
                            >
                              {formatUsd(m.total_ck_retail)}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {m.missing_qty > 1 && (
                                <button
                                  type="button"
                                  disabled={markingBoughtLoading}
                                  onClick={() => handleAcquireMasterBuylistItem(m, 1)}
                                  className="px-2 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 disabled:opacity-50 border border-emerald-500/40 text-emerald-300 font-semibold text-xs cursor-pointer"
                                  title="Mark 1 copy bought and add to Collection"
                                >
                                  +1 Bought
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={markingBoughtLoading}
                                onClick={() => handleAcquireMasterBuylistItem(m)}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 disabled:opacity-50 border border-emerald-500/40 text-emerald-300 font-semibold text-xs inline-flex items-center gap-1 cursor-pointer"
                                title="Mark bought and add to your Collection"
                              >
                                <FolderPlus className="w-3.5 h-3.5" />
                                Mark Bought
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveMasterBuylistItem(m)}
                                className="p-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-600 border border-rose-500/40 text-rose-300 hover:text-white cursor-pointer"
                                title="Remove from Deck(s)"
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
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* DECK FOLDERS & SORTING BAR */}
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3.5">
              {/* Top Row: Folder Pills + New Folder Button + Group by Folder Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1">
                    <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                    Folders:
                  </span>

                  <button
                    type="button"
                    onClick={() => setSelectedFolder('ALL')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      selectedFolder === 'ALL'
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span>All Decks</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                        selectedFolder === 'ALL' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {decks.length}
                    </span>
                  </button>

                  {allFolderOptions.map(folderName => {
                    const countInFolder = decks.filter(
                      d => ((d.folder || 'Uncategorized').trim() || 'Uncategorized') === folderName
                    ).length;
                    // Show folder pill if it has decks, was explicitly created in `folders`, or is currently selected
                    if (countInFolder === 0 && !folders.includes(folderName) && selectedFolder !== folderName) {
                      return null;
                    }
                    const isActive = selectedFolder === folderName;
                    return (
                      <button
                        key={folderName}
                        type="button"
                        onClick={() => setSelectedFolder(folderName)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                          isActive
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <Folder className={`w-3.5 h-3.5 ${isActive ? 'text-slate-950' : 'text-amber-400'}`} />
                        <span>{folderName}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                            isActive ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {countInFolder}
                        </span>
                      </button>
                    );
                  })}

                  {showNewFolderInput ? (
                    <form onSubmit={handleCreateFolder} className="inline-flex items-center gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        value={newFolderInputName}
                        onChange={e => setNewFolderInputName(e.target.value)}
                        placeholder="New folder name..."
                        className="px-2.5 py-1 rounded-lg bg-slate-950 border border-amber-400 text-xs text-slate-100 focus:outline-none w-36"
                      />
                      <button
                        type="submit"
                        className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold cursor-pointer"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewFolderInput(false);
                          setNewFolderInputName('');
                        }}
                        className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300 text-xs cursor-pointer"
                      >
                        ✕
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowNewFolderInput(true)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-dashed border-slate-700 text-amber-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      + New Folder
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {selectedFolder !== 'ALL' && selectedFolder !== 'Uncategorized' && (
                    <>
                      {renamingFolder === selectedFolder ? (
                        <form onSubmit={handleRenameFolder} className="inline-flex items-center gap-1.5">
                          <input
                            type="text"
                            autoFocus
                            value={renameFolderValue}
                            onChange={e => setRenameFolderValue(e.target.value)}
                            className="px-2.5 py-1 rounded-lg bg-slate-950 border border-amber-400 text-xs text-slate-100 w-36"
                          />
                          <button
                            type="submit"
                            className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingFolder(null)}
                            className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300 text-xs cursor-pointer"
                          >
                            ✕
                          </button>
                        </form>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingFolder(selectedFolder);
                              setRenameFolderValue(selectedFolder);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3 text-amber-400" />
                            Rename Folder
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteFolder(selectedFolder)}
                            className="px-2.5 py-1 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-1 cursor-pointer"
                            title="Delete folder and move its decks to Uncategorized"
                          >
                            <Trash2 className="w-3 h-3 text-rose-400" />
                            Delete Folder
                          </button>
                        </>
                      )}
                    </>
                  )}

                  {selectedFolder === 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setGroupDecksByFolder(v => !v)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
                        groupDecksByFolder
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                      {groupDecksByFolder ? 'Grouped by Folder: ON' : 'Group by Folder'}
                    </button>
                  )}
                </div>
              </div>

              {/* Bottom Row: Search Decks + Format Filter + Sort Decks By */}
              <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={deckSearch}
                    onChange={e => setDeckSearch(e.target.value)}
                    placeholder="Search decks by name, description, folder, or format..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={deckFormatFilter}
                    onChange={e => setDeckFormatFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200"
                  >
                    <option value="ALL">All Formats</option>
                    <option value="commander">Commander / EDH</option>
                    <option value="standard">Standard</option>
                    <option value="pioneer">Pioneer</option>
                    <option value="modern">Modern</option>
                    <option value="legacy">Legacy</option>
                    <option value="pauper">Pauper</option>
                    <option value="freeform">Freeform</option>
                  </select>

                  <div className="flex items-center gap-1.5">
                    <ArrowUpDown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-slate-400 font-medium">Sort:</span>
                    <select
                      value={deckSortBy}
                      onChange={e => setDeckSortBy(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 font-semibold"
                    >
                      <option value="updated_desc">Recently Updated</option>
                      <option value="name_asc">Deck Name (A → Z)</option>
                      <option value="name_desc">Deck Name (Z → A)</option>
                      <option value="completion_desc">Completion % (High → Low)</option>
                      <option value="completion_asc">Completion % (Low → High)</option>
                      <option value="missing_asc">Cards Needed to Buy (Fewest → Most)</option>
                      <option value="cost_to_finish_asc">Cost to Finish on TCG (Low → High)</option>
                      <option value="tcg_desc">Deck Value TCGplayer (High → Low)</option>
                      <option value="ck_desc">Deck Value Card Kingdom (High → Low)</option>
                      <option value="folder_asc">Folder Name (A → Z)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {filteredAndSortedDecks.length === 0 ? (
              <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-10 text-center space-y-2">
                <div className="text-slate-200 font-bold text-sm">No Decks Match Current Folder / Filter</div>
                <p className="text-xs text-slate-400">
                  {selectedFolder !== 'ALL'
                    ? `Folder "${selectedFolder}" has no decks matching your filters. Move a deck into "${selectedFolder}" using the Folder dropdown on any deck card, or click "Create New Deck".`
                    : 'Try clearing your search or format filter.'}
                </p>
              </div>
            ) : groupDecksByFolder && selectedFolder === 'ALL' ? (
              <div className="space-y-6">
                {Array.from(
                  filteredAndSortedDecks.reduce((acc, d) => {
                    const f = (d.folder || 'Uncategorized').trim() || 'Uncategorized';
                    if (!acc.has(f)) acc.set(f, []);
                    acc.get(f)!.push(d);
                    return acc;
                  }, new Map<string, DeckSummary[]>())
                ).map(([folderTitle, folderDecks]) => (
                  <div key={folderTitle} className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                        <FolderOpen className="w-4 h-4 text-amber-400" />
                        <span>{folderTitle}</span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono text-xs">
                          {folderDecks.length}
                        </span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => setSelectedFolder(folderTitle)}
                        className="text-xs text-slate-400 hover:text-amber-300 cursor-pointer"
                      >
                        Open Folder →
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {folderDecks.map(d => renderDeckCard(d))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredAndSortedDecks.map(d => renderDeckCard(d))}
              </div>
            )}
          </div>
        )}

        {/* Create New Deck Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
            <form
              onSubmit={handleCreateDeck}
              className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl"
            >
              <h3 className="text-lg font-bold text-slate-100">Create New Deck</h3>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Deck Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g., Ur-Dragon Tribal, Dimir Control..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Format</label>
                  <select
                    value={newFormat}
                    onChange={e => setNewFormat(e.target.value as FormatType)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100"
                  >
                    <option value="commander">Commander / EDH (100-Card Singleton)</option>
                    <option value="standard">Standard (60-Card)</option>
                    <option value="pioneer">Pioneer (60-Card)</option>
                    <option value="modern">Modern (60-Card)</option>
                    <option value="legacy">Legacy (60-Card)</option>
                    <option value="pauper">Pauper (60-Card Commons)</option>
                    <option value="freeform">Freeform / Casual</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Folder</label>
                  <select
                    value={newFolder}
                    onChange={e => {
                      if (e.target.value === '__NEW__') {
                        setFolderPromptInput('');
                        setFolderPromptState({ mode: 'create_folder' });
                      } else {
                        setNewFolder(e.target.value);
                      }
                    }}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100"
                  >
                    {allFolderOptions.map(f => (
                      <option key={f} value={f}>
                        📁 {f}
                      </option>
                    ))}
                    {!allFolderOptions.includes(newFolder) && (
                      <option value={newFolder}>📁 {newFolder}</option>
                    )}
                    <option value="__NEW__">+ Create New Folder...</option>
                  </select>
                </div>
              </div>

              {newFormat === 'commander' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Commander (Optional — can also be assigned later)
                  </label>
                  {selectedCommander ? (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40">
                      <div className="flex items-center gap-2.5">
                        {selectedCommander.image_small && (
                          <img src={selectedCommander.image_small} alt="" className="w-8 h-11 rounded object-cover" />
                        )}
                        <div>
                          <div className="font-bold text-sm text-slate-100">{selectedCommander.name}</div>
                          <div className="text-xs text-slate-400">{selectedCommander.type_line}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedCommander(null)}
                        className="text-xs text-amber-300 hover:underline"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={cmdSearchQuery}
                        onChange={e => setCmdSearchQuery(e.target.value)}
                        placeholder="Search Commander card name..."
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100"
                      />
                      {cmdSearchResults.length > 0 && (
                        <div className="max-h-44 overflow-y-auto rounded-xl bg-slate-950 border border-slate-800 divide-y divide-slate-800">
                          {cmdSearchResults.map(c => (
                            <button
                              key={c.scryfall_id}
                              type="button"
                              onClick={() => setSelectedCommander(c)}
                              className="w-full p-2 text-left hover:bg-slate-900 flex items-center justify-between text-xs"
                            >
                              <span className="font-semibold text-slate-200">{c.name}</span>
                              <ManaCost cost={c.mana_cost} size="sm" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description / Primer Notes</label>
                <textarea
                  rows={2}
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder="Strategy notes, power level, key combos..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    Paste Decklist Now (Optional)
                  </label>
                  <span className="text-[10px] text-emerald-400">
                    Auto-pulls owned cards from Collection & adds missing to Buy List
                  </span>
                </div>
                <textarea
                  rows={5}
                  value={newDeckInitialList}
                  onChange={e => setNewDeckInitialList(e.target.value)}
                  placeholder={`1 Sol Ring\n1 Arcane Signet\n1 Command Tower\n...`}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-100"
                />
              </div>

              {pastingDeck && (
                <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-xs text-amber-200 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                  <span>{pasteProgressMsg || 'Matching collection & building Buy List...'}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={pastingDeck}
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pastingDeck}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer"
                >
                  {pastingDeck ? 'Building Deck & Buy List...' : 'Create Deck'}
                </button>
              </div>
            </form>
          </div>
        )}

        {renderPasteDeckModal()}
        {renderFolderPromptModal()}
      </div>
    );
  }

  if (loadingDeck || !deckDetail) {
    return (
      <div className="p-12 text-center text-slate-400">
        Loading deck workspace...
      </div>
    );
  }

  const { deck, cards, analysis } = deckDetail;
  const { ownership, valuation, stats, counts, issues } = analysis;

  function buildExportDecklistText() {
    const lines: string[] = [];
    const cmd = cards.filter(c => c.board === 'commander');
    const main = cards.filter(c => c.board === 'mainboard');
    const side = cards.filter(c => c.board === 'sideboard');

    if (cmd.length > 0) {
      lines.push('Commander');
      for (const c of cmd) {
        lines.push(`${c.quantity} ${c.name} (${c.set_code.toUpperCase()}) ${c.collector_number}${c.finish === 'foil' ? ' *F*' : ''}`);
      }
      lines.push('');
    }
    lines.push('Deck');
    for (const c of main) {
      lines.push(`${c.quantity} ${c.name} (${c.set_code.toUpperCase()}) ${c.collector_number}${c.finish === 'foil' ? ' *F*' : ''}`);
    }
    if (side.length > 0) {
      lines.push('');
      lines.push('Sideboard');
      for (const c of side) {
        lines.push(`${c.quantity} ${c.name} (${c.set_code.toUpperCase()}) ${c.collector_number}`);
      }
    }
    return lines.join('\n');
  }

  function buildMissingCardsMassEntry() {
    return ownership.missingCards
      .map(m => `${m.missing_qty} ${m.name} [${m.set_code.toUpperCase()}]`)
      .join('\n');
  }

  async function handleAcquireAllMissing() {
    if (!deckDetail || !selectedDeckId) return;
    const savedY = window.scrollY;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const payloadItems = ownership.missingCards.map(m => {
      const rowId = getMissingItemRowId(m, deckDetail.cards);
      const fullCard =
        deckDetail.cards.find(
          c =>
            (rowId && c.id === rowId) ||
            c.scryfall_id === m.scryfall_id ||
            c.name.toLowerCase() === m.name.toLowerCase()
        ) || m;
      return {
        deck_card_id: rowId,
        deck_id: selectedDeckId,
        scryfall_id: fullCard.scryfall_id || m.scryfall_id,
        name: fullCard.name || m.name,
        set_code: fullCard.set_code || m.set_code,
        collector_number: fullCard.collector_number || m.collector_number,
        finish: m.finish || fullCard.finish || 'nonfoil',
        quantity: Math.max(1, m.missing_qty || 1)
      };
    });
    const ok = await submitMarkBoughtItems(selectedDeckId, payloadItems);
    if (ok) {
      setSelectedCardRowIds(new Set());
    }
    preserveScrollPosition(savedY);
    await onRefreshGlobal();
    preserveScrollPosition(savedY);
  }

  const missingRowIds = ownership.missingCards
    .map(m => getMissingItemRowId(m, cards))
    .filter((id): id is number => typeof id === 'number');

  const selectedMissingCount = missingRowIds.filter(id => selectedCardRowIds.has(id)).length;
  const allMissingSelected =
    missingRowIds.length > 0 && missingRowIds.every(id => selectedCardRowIds.has(id));

  function toggleSelectAllMissing() {
    if (allMissingSelected) {
      setSelectedCardRowIds(prev => {
        const next = new Set(prev);
        for (const id of missingRowIds) next.delete(id);
        return next;
      });
    } else {
      setSelectedCardRowIds(prev => {
        const next = new Set(prev);
        for (const id of missingRowIds) next.add(id);
        return next;
      });
    }
  }

  function renderQuickAddBuylistBar(defaultToBuylistLabel = false) {
    return (
      <KeyboardQuickAddBar
        mode="deck"
        deckName={deck.name}
        defaultToBuylist={defaultToBuylistLabel}
        onAddDeckCard={async ({ card, quantity, board, finish, forceBuy }) => {
          if (!selectedDeckId) return;
          const savedY = window.scrollY;
          if (forceBuy) {
            setCardForcedOnBuylist(selectedDeckId, card.name, true);
          }
          const isCommander = (deckDetail?.deck?.format || 'commander').toLowerCase() === 'commander';
          // Check if card already exists in any board (so moving/adding as Commander moves it from Creatures instead of duplicating)
          const existingMatchingRows = (deckDetail?.cards || []).filter(
            c =>
              c.scryfall_id === card.scryfall_id ||
              c.name.toLowerCase() === card.name.toLowerCase()
          );
          const existingInDeck = isCommander
            ? existingMatchingRows.find(c => c.board === board) ||
              (board === 'commander' ? existingMatchingRows[0] : existingMatchingRows.find(c => c.board === 'commander'))
            : undefined;

          let res: Response;
          if (board === 'commander' && existingMatchingRows.length > 0) {
            const primary = existingMatchingRows.find(c => c.board === 'commander') || existingMatchingRows[0];
            for (const extra of existingMatchingRows) {
              if (extra.id !== primary.id) {
                await fetch(`/api/decks/${selectedDeckId}/cards/${extra.id}`, { method: 'DELETE' });
              }
            }
            res = await fetch(`/api/decks/${selectedDeckId}/cards/${primary.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                newCard: card,
                scryfall_id: card.scryfall_id,
                board: 'commander',
                quantity: 1,
                finish,
                force_buy: forceBuy ? 1 : primary.force_buy || 0
              })
            });
          } else if (existingInDeck && forceBuy && quantity === 1) {
            res = await fetch(`/api/decks/${selectedDeckId}/cards/${existingInDeck.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                newCard: card,
                scryfall_id: card.scryfall_id,
                finish,
                force_buy: 1
              })
            });
          } else {
            res = await fetch(`/api/decks/${selectedDeckId}/cards`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                card,
                quantity: board === 'commander' ? 1 : quantity,
                board,
                finish,
                force_buy: forceBuy
              })
            });
          }
          if (res.ok) {
            const json = await res.json().catch(() => ({}));
            if (json.deckDetail) {
              setDeckDetail(applyForcedBuylistToDeckDetail(json.deckDetail));
            } else {
              await loadDeckDetail(selectedDeckId, false);
            }
            preserveScrollPosition(savedY);
            await onRefreshGlobal();
            preserveScrollPosition(savedY);
          }
        }}
      />
    );
  }

  function renderDeckBuyListTable(copyKey: string) {
    return (
      <div className="space-y-4">
        {buylistFeedback && (
          <div
            className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-3 ${
              buylistFeedback.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                : 'bg-rose-950/70 border-rose-500/60 text-rose-200'
            }`}
          >
            <span>{buylistFeedback.message}</span>
            <button
              type="button"
              onClick={() => setBuylistFeedback(null)}
              className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-rose-400" />
              Cards to Buy to Finish "{deck.name}" ({ownership.totalMissing} needed)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {ownership.totalMissing === 0
                ? 'You own 100% of the cards needed for this deck in your Available Collection!'
                : `Estimated cost to finish deck: ${formatUsd(ownership.missingCostTcg)} on TCGplayer / ${formatUsd(ownership.missingCostCkRetail)} on Card Kingdom`}
            </p>
          </div>

          {ownership.missingCards.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleSelectAllMissing}
                className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                {allMissingSelected ? (
                  <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                )}
                {allMissingSelected ? 'Deselect All' : 'Select All'}
              </button>

              {selectedMissingCount > 0 && (
                <>
                  <button
                    type="button"
                    disabled={markingBoughtLoading}
                    onClick={handleAcquireSelectedMissing}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    {markingBoughtLoading
                      ? 'Marking Bought...'
                      : `Mark Selected Bought (${selectedMissingCount})`}
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmInsideAction('delete_selected_cards')}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove Selected ({selectedMissingCount})
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => handleCopyText(buildMissingCardsMassEntry(), copyKey)}
                className="px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                {copiedType === copyKey ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Copied Buy List!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy Buy List (TCG / CK)
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  downloadBuylistCsv(
                    ownership.missingCards.map(m => ({ ...m, decks_label: deck.name })),
                    `${deck.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-buylist.csv`
                  )
                }
                className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>

              <button
                type="button"
                disabled={markingBoughtLoading}
                onClick={handleAcquireAllMissing}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-50 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                Mark All Bought (+Add All to Vault)
              </button>
            </div>
          )}
        </div>

        {ownership.missingCards.length === 0 ? (
          <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-center gap-2.5 text-xs text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>No cards needed to buy — all {ownership.totalRequired} cards in this deck are covered by your collection!</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                  <th className="py-2.5 px-2.5 w-8">
                    <button
                      type="button"
                      onClick={toggleSelectAllMissing}
                      className="text-slate-400 hover:text-white cursor-pointer flex items-center"
                      title="Select all cards on Buy List"
                    >
                      {allMissingSelected ? (
                        <CheckSquare className="w-4 h-4 text-amber-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-2.5 px-3">Card & Printing</th>
                  <th className="py-2.5 px-3">Buy Qty / Deck Qty</th>
                  <th className="py-2.5 px-3">Vault Status</th>
                  <th className="py-2.5 px-3 text-right text-sky-400">TCGplayer</th>
                  <th className="py-2.5 px-3 text-right text-amber-400">Card Kingdom</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {ownership.missingCards.map(m => {
                  const rowId = getMissingItemRowId(m, cards);
                  const fullCard = cards.find(
                    c =>
                      (rowId && c.id === rowId) ||
                      (c.scryfall_id === m.scryfall_id && c.board === m.board) ||
                      c.scryfall_id === m.scryfall_id ||
                      c.name.toLowerCase() === m.name.toLowerCase()
                  );
                  const isRowSelected = typeof rowId === 'number' ? selectedCardRowIds.has(rowId) : false;

                  return (
                    <tr
                      key={`${rowId || m.scryfall_id}-${m.board}`}
                      className={`transition ${
                        isRowSelected ? 'bg-amber-500/10' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2.5 px-2.5">
                        {rowId && (
                          <button
                            type="button"
                            onClick={() => toggleSelectCardRow(rowId)}
                            className="text-slate-400 hover:text-white cursor-pointer flex items-center"
                          >
                            {isRowSelected ? (
                              <CheckSquare className="w-4 h-4 text-amber-400" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5">
                          {m.image_small && (
                            <img
                              src={m.image_small}
                              alt={m.name}
                              onClick={() => rowId && toggleSelectCardRow(rowId)}
                              className="w-8 h-11 rounded object-cover shrink-0 cursor-pointer"
                            />
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-slate-100 text-sm">{m.name}</div>
                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                              {fullCard ? (
                                <button
                                  type="button"
                                  onClick={() => setPrintingPickerCard(fullCard)}
                                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-mono text-[10px] font-bold uppercase cursor-pointer"
                                  title="Switch Set / Printing"
                                >
                                  {m.set_code} #{m.collector_number}
                                </button>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[10px] uppercase">
                                  {m.set_code} #{m.collector_number}
                                </span>
                              )}

                              {rowId && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateDeckCard(rowId, {
                                      finish: m.finish === 'nonfoil' ? 'foil' : 'nonfoil'
                                    })
                                  }
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                                    m.finish !== 'nonfoil'
                                      ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700'
                                  }`}
                                  title="Toggle Foil / Non-Foil"
                                >
                                  {m.finish !== 'nonfoil' ? '✨ Foil' : 'Non-Foil'}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-rose-500/20 border border-rose-500/40 font-mono font-bold text-rose-300 text-xs">
                            Buy {m.missing_qty}x
                          </span>
                          {rowId && fullCard && (
                            <div className="inline-flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg px-1.5 py-0.5">
                              <button
                                type="button"
                                onClick={() => handleUpdateDeckCard(rowId, { quantity: fullCard.quantity - 1 })}
                                className="p-0.5 rounded hover:bg-slate-800 text-slate-300 cursor-pointer"
                                title="Decrease deck quantity"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="font-mono text-[11px] text-slate-200 px-1">
                                {fullCard.quantity} in deck
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateDeckCard(rowId, { quantity: fullCard.quantity + 1 })}
                                className="p-0.5 rounded hover:bg-slate-800 text-slate-300 cursor-pointer"
                                title="Increase deck quantity"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-slate-300">
                        <div>
                          Own <strong className="font-mono">{m.owned_total_qty || 0}</strong> in Vault
                        </div>
                        {m.other_decks && m.other_decks.length > 0 && (
                          <div
                            className="text-[10px] text-amber-300 max-w-[220px] truncate"
                            title={`In other decks: ${m.other_decks.map(d => `${d.deck_name} (${d.quantity}x)`).join(', ')}`}
                          >
                            In {m.other_decks.length} other deck(s): {m.other_decks.map(d => d.deck_name).join(', ')}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                        <a
                          href={m.tcgplayer_url || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sky-300 hover:underline font-bold"
                        >
                          {formatUsd(m.total_tcg)}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                        <a
                          href={m.cardkingdom_url || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-amber-300 hover:underline font-bold"
                        >
                          {formatUsd(m.total_ck_retail)}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {rowId && (m.force_buy || 0) > 0 && (m.owned_total_qty || 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => handleUpdateDeckCard(rowId, { force_buy: 0 })}
                              className="px-2 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 font-semibold text-xs cursor-pointer"
                              title="Pull existing copy from your Vault instead of buying"
                            >
                              Use Vault Copy
                            </button>
                          )}
                          {m.missing_qty > 1 && (
                            <button
                              type="button"
                              onClick={() => handleAcquireMissingCard(m, 1)}
                              className="px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-semibold text-xs cursor-pointer"
                              title="Mark 1 copy bought and add to Collection"
                            >
                              +1 Bought
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleAcquireMissingCard(m)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-500/40 text-emerald-300 font-semibold text-xs inline-flex items-center gap-1 cursor-pointer"
                            title="Mark bought and add to your Collection"
                          >
                            <FolderPlus className="w-3.5 h-3.5" />
                            Mark Bought
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRemoveMissingCard(m)}
                            className="p-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-600 border border-rose-500/40 text-rose-300 hover:text-white cursor-pointer"
                            title="Remove card from Deck & Buy List"
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
          </div>
        )}
      </div>
    );
  }

  const maxCurveVal = Math.max(1, ...Object.values(stats.manaCurve));
  const allDeckCardsSelected = cards.length > 0 && cards.every(c => selectedCardRowIds.has(c.id));

  return (
    <div className="space-y-5">
      {/* Top Deck Banner */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-900">
        {deck.cover_image && (
          <div
            className="absolute inset-0 opacity-20 bg-cover bg-center blur-xs"
            style={{ backgroundImage: `url(${deck.cover_image})` }}
          />
        )}
        <div className="relative p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => onSelectDeck(null)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950/80 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                All Decks
              </button>
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold uppercase">
                {deck.format}
              </span>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/80 border border-slate-700 text-xs text-slate-300">
                <Folder className="w-3.5 h-3.5 text-amber-400" />
                <select
                  value={deck.folder || 'Uncategorized'}
                  onChange={e => handleMoveDeckToFolder(deck.id, e.target.value)}
                  className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
                  title="Assign deck to folder"
                >
                  {allFolderOptions.map(f => (
                    <option key={f} value={f} className="bg-slate-900 text-slate-200">
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <ColorIdentityBadges colors={deck.color_identity} size="sm" />
              <span className="px-2.5 py-1 rounded-lg bg-slate-950/80 border border-slate-800 text-xs font-mono text-slate-200">
                {counts.activeTotal} / {counts.targetTotal} Cards
              </span>
              {bracketReport && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('bracket_salt')}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
                      bracketReport.bracket === 5
                        ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 hover:bg-rose-500/30'
                        : bracketReport.bracket === 4
                          ? 'bg-orange-500/20 border-orange-500/50 text-orange-300 hover:bg-orange-500/30'
                          : bracketReport.bracket === 3
                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30'
                            : bracketReport.bracket === 2
                              ? 'bg-sky-500/20 border-sky-500/50 text-sky-300 hover:bg-sky-500/30'
                              : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30'
                    }`}
                    title="Click to view Official WotC Commander Bracket (1–5), Game Changers, Infinite Combos & Fast Mana analysis"
                  >
                    <span>🏆 {bracketReport.bracketName}</span>
                    {bracketReport.gameChangers.length > 0 && (
                      <span className="px-1.5 py-0.2 rounded bg-slate-950/60 font-mono text-[10px]">
                        ⚡{bracketReport.gameChangers.length} GC
                      </span>
                    )}
                    {bracketReport.infiniteCombos.length > 0 && (
                      <span className="px-1.5 py-0.2 rounded bg-slate-950/60 font-mono text-[10px]">
                        ♾️{bracketReport.infiniteCombos.length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveSubTab('bracket_salt')}
                    className="px-2.5 py-1 rounded-lg bg-slate-950/85 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
                    title="Click to view Community Salt Score & Most Hated Cards in this deck"
                  >
                    <span>{bracketReport.salt.tierEmoji}</span>
                    <span>
                      Salt: <strong className="font-mono text-amber-300">{bracketReport.salt.totalSaltSum}</strong>
                    </span>
                    <span className="text-[10px] text-slate-400">({bracketReport.salt.tierLabel})</span>
                  </button>
                </>
              )}
            </div>

            <h1 className="text-2xl font-bold text-slate-100">{deck.name}</h1>
            {deck.description && <p className="text-xs text-slate-300 max-w-2xl">{deck.description}</p>}
          </div>

          {/* Right Valuation & Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="px-3.5 py-2 rounded-xl bg-slate-950/85 border border-sky-500/30">
              <div className="text-[10px] font-semibold uppercase text-sky-400">TCGplayer Total</div>
              <div className="font-mono font-bold text-base text-slate-100">{formatUsd(valuation.tcg)}</div>
            </div>

            <div className="px-3.5 py-2 rounded-xl bg-slate-950/85 border border-amber-500/30">
              <div className="text-[10px] font-semibold uppercase text-amber-400">Card Kingdom Retail</div>
              <div className="font-mono font-bold text-base text-slate-100">{formatUsd(valuation.ckRetail)}</div>
            </div>

            <button
              type="button"
              onClick={() => {
                setPasteTargetMode('current_deck');
                setPasteCommanderName('');
                setPasteText('');
                setPasteReplaceExisting(false);
                setShowPasteModal(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md transition cursor-pointer"
            >
              <Copy className="w-4 h-4" />
              Paste Decklist
            </button>

            <button
              type="button"
              onClick={() => onOpenSearchForDeck(deck.id, 'mainboard')}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md transition cursor-pointer"
            >
              <Search className="w-4 h-4" />
              Add Cards to Deck
            </button>

            <button
              type="button"
              onClick={() => handleCopyText(buildExportDecklistText(), 'decklist')}
              className="px-3.5 py-2.5 rounded-xl bg-slate-950/85 hover:bg-slate-800 text-slate-200 border border-slate-700 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              {copiedType === 'decklist' ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  Copied List!
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-amber-400" />
                  Export List
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setConfirmInsideAction('delete_deck')}
              className="px-3.5 py-2.5 rounded-xl bg-rose-950/85 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-500/40 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
              title="Delete Entire Deck"
            >
              <Trash2 className="w-4 h-4" />
              Delete Deck
            </button>
          </div>
        </div>

        {/* Sub-navigation bar */}
        <div className="relative px-3 sm:px-6 py-2.5 bg-slate-950/80 border-t border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0 sm:flex-wrap">
            <button
              type="button"
              onClick={() => setActiveSubTab('cards')}
              className={`shrink-0 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                activeSubTab === 'cards'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Decklist ({counts.activeTotal})
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('missing')}
              className={`shrink-0 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                activeSubTab === 'missing'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              Buy List ({ownership.totalMissing})
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  ownership.totalMissing === 0
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {ownership.completionPct}%
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('bracket_salt')}
              className={`shrink-0 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                activeSubTab === 'bracket_salt'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Crown className="w-3.5 h-3.5" />
              <span>Bracket & Salt</span>
              {bracketReport && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    activeSubTab === 'bracket_salt'
                      ? 'bg-slate-950/20 text-slate-950 font-extrabold'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  B{bracketReport.bracket} • 🧂{bracketReport.salt.totalSaltSum}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('analytics')}
              className={`shrink-0 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                activeSubTab === 'analytics'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Mana Curve ({issues.length})
            </button>
          </div>

          {activeSubTab === 'cards' && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {cards.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (allDeckCardsSelected) setSelectedCardRowIds(new Set());
                      else setSelectedCardRowIds(new Set(cards.map(c => c.id)));
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    {allDeckCardsSelected ? (
                      <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    {allDeckCardsSelected ? 'Deselect All' : 'Select All Cards'}
                  </button>

                  {selectedCardRowIds.size > 0 && (
                    <>
                      {selectedMissingCount > 0 && (
                        <button
                          type="button"
                          onClick={handleAcquireSelectedMissing}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <FolderPlus className="w-3.5 h-3.5" />
                          Mark Selected Bought ({selectedMissingCount})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirmInsideAction('delete_selected_cards')}
                        className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove Selected ({selectedCardRowIds.size})
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setConfirmInsideAction('clear_all_cards')}
                    className="px-2.5 py-1 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-500/40 text-rose-200 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    Clear All Cards
                  </button>
                </>
              )}

              <span className="text-slate-400 ml-1">Filter:</span>
              <select
                value={ownershipFilter}
                onChange={e => setOwnershipFilter(e.target.value as any)}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200"
              >
                <option value="all">All Deck Cards</option>
                <option value="owned">✓ Owned in Vault ({ownership.totalOwned})</option>
                <option value="missing">🛒 Need to Buy ({ownership.totalMissing})</option>
              </select>

              <span className="text-slate-400 ml-1">Group By:</span>
              <select
                value={groupBy}
                onChange={e => setGroupBy(e.target.value as any)}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200"
              >
                <option value="type">Card Type</option>
                <option value="cmc">Mana Value (CMC)</option>
                <option value="board">Board Zone</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Paste Decklist Breakdown Banner */}
      {lastPasteSummary && lastPasteSummary.deckId === deck.id && (
        <div className="p-4 rounded-2xl bg-slate-900 border border-emerald-500/40 flex flex-wrap items-center justify-between gap-4 text-xs shadow-lg">
          <div className="space-y-1">
            <div className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Decklist Pasted & Auto-Allocated Against Your Collection!
            </div>
            <div className="flex flex-wrap items-center gap-3 text-slate-300">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold">
                ✓ Pulled {lastPasteSummary.pulledFromInventoryCount} card(s) from your Available Collection
              </span>
              {lastPasteSummary.addedToBuyListCount > 0 ? (
                <span className="px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold">
                  🛒 Added {lastPasteSummary.addedToBuyListCount} missing card(s) to Buy List ({formatUsd(lastPasteSummary.missingCostTcg)} TCG / {formatUsd(lastPasteSummary.missingCostCkRetail)} CK)
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold">
                  🎉 0 Missing — 100% Owned in Collection!
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {lastPasteSummary.addedToBuyListCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveSubTab('missing')}
                className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                View Buy List ({lastPasteSummary.addedToBuyListCount})
              </button>
            )}
            <button
              type="button"
              onClick={() => setLastPasteSummary(null)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Banner Inside Deck */}
      {confirmInsideAction && (
        <div className="p-4 rounded-xl bg-rose-950/85 border border-rose-500/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-rose-100 font-semibold">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              {confirmInsideAction === 'delete_deck' && `Permanently delete this entire deck ("${deck.name}")?`}
              {confirmInsideAction === 'delete_selected_cards' && `Remove ${selectedCardRowIds.size} selected card entry(s) from this deck?`}
              {confirmInsideAction === 'clear_all_cards' && `Remove all ${cards.length} card entries from "${deck.name}"?`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmInsideAction(null)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirmInsideAction === 'delete_deck') {
                  handleDeleteSingleDeck(deck.id);
                } else if (confirmInsideAction === 'delete_selected_cards') {
                  handleBulkDeleteDeckCards('selected');
                } else if (confirmInsideAction === 'clear_all_cards') {
                  handleBulkDeleteDeckCards('all');
                }
              }}
              className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
            >
              Yes, Confirm
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: DECKLIST CARDS + INLINE BUY LIST SECTION */}
      {activeSubTab === 'cards' && (
        <div className="space-y-6">
          {renderQuickAddBuylistBar(false)}
          {cards.length === 0 ? (
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-12 text-center space-y-3">
              <div className="text-slate-300 font-semibold">This deck has no cards yet</div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Paste a decklist to automatically pull owned cards from your Available Collection and add any missing cards to your Buy List, or search Scryfall to add cards one by one.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setPasteTargetMode('current_deck');
                    setPasteCommanderName('');
                    setPasteText('');
                    setPasteReplaceExisting(false);
                    setShowPasteModal(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-4 h-4" />
                  Paste Decklist (Auto-Pull & Buy List)
                </button>
                <button
                  type="button"
                  onClick={() => onOpenSearchForDeck(deck.id, 'mainboard')}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Search & Add Cards
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Archidekt-Style Section Navigator Bar */}
              {Object.keys(groupedCards).length > 0 && (() => {
                const sectionKeys = Object.keys(groupedCards);
                const activeSecIdx = activeSectionFilter === 'ALL' ? -1 : sectionKeys.indexOf(activeSectionFilter);

                return (
                  <div className="p-3.5 rounded-2xl bg-slate-900/95 border border-slate-800 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-bold text-amber-300 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-amber-400" />
                        <span>Sections</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            if (activeSecIdx <= 0) {
                              setActiveSectionFilter(sectionKeys[sectionKeys.length - 1]);
                            } else {
                              setActiveSectionFilter(sectionKeys[activeSecIdx - 1]);
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold cursor-pointer"
                          title="Previous Deck Section"
                        >
                          ◀ Prev Section
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (activeSecIdx === -1 || activeSecIdx >= sectionKeys.length - 1) {
                              setActiveSectionFilter(sectionKeys[0]);
                            } else {
                              setActiveSectionFilter(sectionKeys[activeSecIdx + 1]);
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold cursor-pointer"
                          title="Next Deck Section"
                        >
                          Next Section ▶
                        </button>
                        {activeSectionFilter !== 'ALL' && (
                          <button
                            type="button"
                            onClick={() => setActiveSectionFilter('ALL')}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold cursor-pointer"
                          >
                            Show All Sections
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0 sm:flex-wrap">
                      <button
                        type="button"
                        onClick={() => setActiveSectionFilter('ALL')}
                        className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border ${
                          activeSectionFilter === 'ALL'
                            ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                            : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'
                        }`}
                      >
                        <span>All Sections</span>
                        <span
                          className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] ${
                            activeSectionFilter === 'ALL'
                              ? 'bg-slate-950/20 text-slate-950 font-extrabold'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {counts.activeTotal}
                        </span>
                      </button>

                      {Object.entries(groupedCards).map(([secTitle, secCards]) => {
                        const secQty = secCards.reduce((s, c) => s + c.quantity, 0);
                        const isSelected = activeSectionFilter === secTitle;
                        return (
                          <button
                            key={secTitle}
                            type="button"
                            onClick={() =>
                              setActiveSectionFilter(prev => (prev === secTitle ? 'ALL' : secTitle))
                            }
                            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border ${
                              isSelected
                                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                                : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'
                            }`}
                          >
                            <span>{secTitle}</span>
                            <span
                              className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] ${
                                isSelected
                                  ? 'bg-slate-950/20 text-slate-950 font-extrabold'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {secQty}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {Object.entries(groupedCards)
                .filter(([groupTitle]) => activeSectionFilter === 'ALL' || groupTitle === activeSectionFilter)
                .map(([groupTitle, groupItems]) => {
                const groupCount = groupItems.reduce((s, i) => s + i.quantity, 0);
                return (
                  <div key={groupTitle} className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                      <h3 className="font-bold text-sm text-amber-300 flex items-center gap-2">
                        <span>{groupTitle}</span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono text-xs">
                          {groupCount}
                        </span>
                      </h3>
                      {groupTitle === '👑 Commander' && (
                        <button
                          type="button"
                          onClick={() => onOpenSearchForDeck(deck.id, 'commander')}
                          className="text-xs text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Change / Add Partner Commander
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {groupItems.map(item => {
                        const isMissing = (item.missing_qty || 0) > 0;
                        const isRowSelected = selectedCardRowIds.has(item.id);
                        return (
                          <div
                            key={item.id}
                            className={`rounded-xl p-3 border flex gap-3 transition ${
                              isRowSelected
                                ? 'bg-amber-500/10 border-amber-400 ring-1 ring-amber-400/50'
                                : isMissing
                                  ? 'bg-rose-950/15 border-rose-500/30 hover:border-rose-500/50'
                                  : 'bg-slate-950/75 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="relative shrink-0">
                              {(() => {
                                const canFlip = isTransformOrDoubleFacedCard(item);
                                const isFlipped = canFlip && flippedDeckCardIds.has(item.id);
                                const thumbImg = isFlipped
                                  ? getCardFaceImageUrl(item, 'back', 'small')
                                  : item.image_small;
                                return (
                                  <>
                                    {thumbImg && (
                                      <img
                                        src={thumbImg}
                                        alt={item.name}
                                        onClick={() => setZoomedDeckCard(item)}
                                        title="Click to see blown-up card view"
                                        className="w-16 h-22 object-cover rounded-lg border border-slate-700 hover:border-amber-400 cursor-zoom-in transition"
                                      />
                                    )}
                                    {canFlip && (
                                      <button
                                        type="button"
                                        onClick={e => toggleFlipDeckCard(item.id, e)}
                                        className={`absolute -bottom-1.5 -right-1.5 px-1.5 py-0.5 rounded-md border text-[9px] font-extrabold flex items-center gap-0.5 shadow-md transition cursor-pointer ${
                                          isFlipped
                                            ? 'bg-amber-500 text-slate-950 border-amber-300'
                                            : 'bg-slate-950/90 hover:bg-sky-500/30 text-sky-300 border-sky-400/60'
                                        }`}
                                        title="Flip Transform / Double-Faced card"
                                      >
                                        <RefreshCw className={`w-2.5 h-2.5 ${isFlipped ? 'rotate-180' : ''}`} />
                                        <span>{isFlipped ? 'Back' : 'Flip'}</span>
                                      </button>
                                    )}
                                  </>
                                );
                              })()}
                              <button
                                type="button"
                                onClick={() => toggleSelectCardRow(item.id)}
                                className={`absolute -top-1.5 -left-1.5 p-1 rounded-md border transition cursor-pointer ${
                                  isRowSelected
                                    ? 'bg-amber-500 border-amber-300 text-slate-950'
                                    : 'bg-slate-950/90 border-slate-700 text-slate-400 hover:text-white'
                                }`}
                                title="Select card for bulk removal"
                              >
                                {isRowSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                              </button>
                            </div>

                            <div className="flex-1 min-w-0 flex flex-col justify-between">
                              <div>
                                <div className="flex items-start justify-between gap-1.5">
                                  <h4
                                    onClick={() => setZoomedDeckCard(item)}
                                    className="font-bold text-sm text-slate-100 hover:text-amber-300 truncate cursor-pointer transition"
                                    title={`Click to see blown-up view of ${item.name}`}
                                  >
                                    {item.name}
                                  </h4>
                                  <ManaCost cost={item.mana_cost} size="sm" />
                                </div>

                                <div className="text-[11px] text-slate-400 truncate mt-0.5">{item.type_line}</div>

                                {/* Ownership & Set Badges */}
                                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setPrintingPickerCard(item)}
                                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-mono text-[10px] font-bold uppercase cursor-pointer"
                                    title="Switch Set / Printing"
                                  >
                                    {item.set_code} #{item.collector_number}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateDeckCard(item.id, {
                                        finish: item.finish === 'nonfoil' ? 'foil' : 'nonfoil'
                                      })
                                    }
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                                      item.finish !== 'nonfoil'
                                        ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                                        : 'bg-slate-900 text-slate-400 border border-slate-800'
                                    }`}
                                  >
                                    {item.finish !== 'nonfoil' ? '✨ Foil' : 'Non-Foil'}
                                  </button>

                                  {isMissing ? (
                                    <>
                                      <span className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-semibold">
                                        Need to Buy {item.missing_qty} (Own {item.owned_qty || 0})
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleAcquireMissingCard({
                                            deck_card_id: item.id,
                                            deck_id: deck.id,
                                            scryfall_id: item.scryfall_id,
                                            name: item.name,
                                            set_code: item.set_code,
                                            collector_number: item.collector_number,
                                            finish: item.finish,
                                            board: item.board,
                                            missing_qty: item.missing_qty || 1,
                                            owned_total_qty: item.owned_qty || 0,
                                            unit_tcg: item.unit_tcg || 0,
                                            unit_ck_retail: item.unit_ck_retail || 0,
                                            total_tcg: (item.unit_tcg || 0) * (item.missing_qty || 1),
                                            total_ck_retail: (item.unit_ck_retail || 0) * (item.missing_qty || 1),
                                            tcgplayer_url: item.tcgplayer_url,
                                            cardkingdom_url: item.cardkingdom_url,
                                            image_small: item.image_small
                                          })
                                        }
                                        className="px-1.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                                        title="Mark this card as bought and add to your Collection"
                                      >
                                        <FolderPlus className="w-3 h-3" />
                                        Mark Bought
                                      </button>
                                      {(item.force_buy || 0) > 0 && (item.owned_qty || 0) > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateDeckCard(item.id, { force_buy: 0 })}
                                          className="px-1.5 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/35 border border-sky-500/40 text-sky-200 text-[10px] font-semibold cursor-pointer"
                                          title="Pull existing copy from your Vault instead of buying"
                                        >
                                          Use Vault Copy
                                        </button>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold">
                                        ✓ Owned ({item.owned_qty || 1} in Vault)
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateDeckCard(item.id, { force_buy: 1 })}
                                        className="px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/40 text-rose-200 text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                                        title="Send this card to the Buy List so you can buy a dedicated copy for this deck"
                                      >
                                        <ShoppingBag className="w-2.5 h-2.5 text-rose-400" />
                                        + Buy List
                                      </button>
                                    </>
                                  )}

                                  {item.other_decks && item.other_decks.length > 0 && (
                                    <span
                                      className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-200 text-[10px] font-semibold"
                                      title={`Also used in: ${item.other_decks.map(d => `${d.deck_name} (${d.quantity}x)`).join(', ')}`}
                                    >
                                      Also in {item.other_decks.map(d => d.deck_name).join(', ')}
                                    </span>
                                  )}

                                  {/* Prominent One-Click Move to Commander / Background Badge right on the card */}
                                  {deck.format === 'commander' &&
                                    item.board !== 'commander' &&
                                    getCommanderOrBackgroundRole(item) && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleUpdateDeckCard(item.id, { board: 'commander', quantity: 1 })
                                        }
                                        className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-amber-300 text-[10px] font-extrabold inline-flex items-center gap-1 cursor-pointer transition"
                                        title={`Move ${item.name} from ${groupTitle} to the 👑 Commander slot`}
                                      >
                                        <span>👑</span>
                                        <span>
                                          {getCommanderOrBackgroundRole(item) === 'background'
                                            ? 'Move to Background'
                                            : 'Move to Commander'}
                                        </span>
                                      </button>
                                    )}

                                  {deck.format === 'commander' && item.board === 'commander' && (
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateDeckCard(item.id, { board: 'mainboard' })}
                                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer transition"
                                      title={`Move ${item.name} from Commander slot back to the 99 (Mainboard)`}
                                    >
                                      <span>Move to 99</span>
                                    </button>
                                  )}

                                  {/* Official WotC Game Changer / Fast Mana / MLD / High-Salt Badges */}
                                  {(() => {
                                    const bInfo = getSingleCardBracketBadges(item);
                                    return (
                                      <>
                                        {bInfo.isGameChanger && (
                                          <span
                                            className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-amber-200 text-[10px] font-extrabold"
                                            title={`Official WotC Game Changer (${bInfo.gameChangerCategory})`}
                                          >
                                            ⚡ Game Changer
                                          </span>
                                        )}
                                        {bInfo.isFastMana && (
                                          <span
                                            className="px-1.5 py-0.5 rounded bg-sky-500/20 border border-sky-400/40 text-sky-200 text-[10px] font-bold"
                                            title="Fast Mana Acceleration"
                                          >
                                            💎 Fast Mana
                                          </span>
                                        )}
                                        {bInfo.isMld && (
                                          <span
                                            className="px-1.5 py-0.5 rounded bg-rose-500/25 border border-rose-400/50 text-rose-200 text-[10px] font-extrabold"
                                            title="Mass Land Denial (Bracket 4+)"
                                          >
                                            🌋 MLD
                                          </span>
                                        )}
                                        {bInfo.saltScore >= 2.25 && (
                                          <span
                                            className="px-1.5 py-0.5 rounded bg-orange-500/20 border border-orange-400/40 text-orange-200 text-[10px] font-mono font-bold"
                                            title={`High Community Salt Score (${bInfo.saltScore} / 4.00): ${bInfo.saltReasons.join(' • ')}`}
                                          >
                                            🧂 {bInfo.saltScore}
                                          </span>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-800/80">
                                <DualPriceBadge card={item} finish={item.finish} quantity={item.quantity} compact />

                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateDeckCard(item.id, { quantity: item.quantity - 1 })}
                                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="font-mono font-bold text-xs text-amber-300 px-1">
                                    {item.quantity}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateDeckCard(item.id, { quantity: item.quantity + 1 })}
                                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>

                                  {deck.format === 'commander' && item.board !== 'commander' && (
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateDeckCard(item.id, { board: 'commander' })}
                                      className="p-1 rounded text-slate-400 hover:text-amber-400 hover:bg-slate-800 cursor-pointer"
                                      title="Set as Commander"
                                    >
                                      <Crown className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleRemoveDeckCard(item.id)}
                                    className="p-1 rounded text-rose-400 hover:text-white hover:bg-rose-600 cursor-pointer"
                                    title="Remove from Deck"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* INLINE SECTION IN DECKLIST: CARDS THAT NEED TO BE BOUGHT TO FINISH THIS DECK */}
              <div className="rounded-2xl bg-slate-900 border border-rose-500/35 p-5">
                {renderDeckBuyListTable('missing_inline')}
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: DEDICATED BUY LIST & INVENTORY CHECKER */}
      {activeSubTab === 'missing' && (
        <div className="space-y-5">
          {renderQuickAddBuylistBar(true)}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="text-xs font-semibold uppercase text-slate-400">Deck Completion vs. Vault</div>
              <div className="text-3xl font-bold font-mono text-slate-100 mt-1">
                {ownership.completionPct}% ({ownership.totalOwned}/{ownership.totalRequired})
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden mt-3">
                <div
                  className={`h-full ${ownership.totalMissing === 0 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                  style={{ width: `${ownership.completionPct}%` }}
                />
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900 border border-sky-500/30">
              <div className="text-xs font-semibold uppercase text-sky-400">
                Cost to Complete on TCGplayer
              </div>
              <div className="text-3xl font-bold font-mono text-slate-100 mt-1">
                {formatUsd(ownership.missingCostTcg)}
              </div>
              <div className="text-xs text-slate-400 mt-2">
                For {ownership.totalMissing} missing card(s) across {ownership.missingCards.length} unique entries
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900 border border-amber-500/30">
              <div className="text-xs font-semibold uppercase text-amber-400">
                Cost to Complete on Card Kingdom
              </div>
              <div className="text-3xl font-bold font-mono text-slate-100 mt-1">
                {formatUsd(ownership.missingCostCkRetail)}
              </div>
              <div className="text-xs text-slate-400 mt-2">
                Single-package retail fulfillment estimate
              </div>
            </div>
          </div>

          {ownership.missingCards.length === 0 ? (
            <div className="p-10 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <h3 className="text-lg font-bold text-slate-100">
                You Own 100% of This Deck in Your Collection!
              </h3>
              <p className="text-xs text-slate-300">
                Every card in this decklist is accounted for in your local SQLite inventory.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
              {renderDeckBuyListTable('missing')}
            </div>
          )}
        </div>
      )}

      {/* TAB 2B: OFFICIAL WIZARDS OF THE COAST COMMANDER BRACKET (1-5) & COMMUNITY SALT SCORE */}
      {activeSubTab === 'bracket_salt' && bracketReport && (
        <div className="space-y-5">
          {/* Top Row: Official WotC Bracket 1-5 Rating Card + Community Salt Score Thermometer */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Official WotC Commander Bracket 1-5 Panel (7 cols) */}
            <div className="lg:col-span-7 rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-400">
                    Commander Bracket Evaluation (Based on WotC Guidelines)
                  </div>
                  <h2 className="text-2xl font-black text-slate-100 mt-0.5 flex items-center gap-2">
                    <span>🏆 {bracketReport.bracketName}</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">{bracketReport.bracketSubtitle}</p>
                </div>

                <div className="px-3.5 py-2 rounded-2xl bg-slate-950 border border-amber-500/40 text-center shrink-0">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Bracket Tier</div>
                  <div className="text-2xl font-black font-mono text-amber-400">
                    Bracket {bracketReport.bracket} <span className="text-xs text-slate-500">/ 5</span>
                  </div>
                </div>
              </div>

              {/* Visual 1-5 Bracket Scale Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-1.5 text-center text-xs">
                {(
                  [
                    { b: 1, title: '1: Exhibition', rule: '0 GC • Casual Theme' },
                    { b: 2, title: '2: Core', rule: '0 GC • Precon Level' },
                    { b: 3, title: '3: Upgraded', rule: '≤ 3 GC • Late Combos' },
                    { b: 4, title: '4: Optimized', rule: 'No GC Cap • Fast Combos' },
                    { b: 5, title: '5: cEDH', rule: 'Tournament Metagame' }
                  ] as const
                ).map(tier => {
                  const isCurrent = bracketReport.bracket === tier.b;
                  return (
                    <div
                      key={tier.b}
                      className={`p-2.5 rounded-xl border transition ${
                        isCurrent
                          ? 'bg-amber-500 text-slate-950 border-amber-300 font-black shadow-lg shadow-amber-500/15'
                          : 'bg-slate-950/80 border-slate-800 text-slate-400'
                      }`}
                    >
                      <div className="text-xs font-extrabold truncate">{tier.title}</div>
                      <div
                        className={`text-[10px] mt-0.5 truncate ${
                          isCurrent ? 'text-slate-900 font-bold' : 'text-slate-500'
                        }`}
                      >
                        {tier.rule}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* KPI Pill Summary Row */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Game Changers</div>
                  <div className="text-base font-black font-mono text-amber-300 mt-0.5">
                    ⚡ {bracketReport.gameChangers.length}
                    <span className="text-[10px] font-sans font-normal text-slate-400">
                      {' '}
                      ({bracketReport.gameChangers.length === 0 ? 'B1–2 OK' : bracketReport.gameChangers.length <= 3 ? '≤3 B3 OK' : '4+ B4+'})
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Infinite Combos</div>
                  <div className="text-base font-black font-mono text-sky-300 mt-0.5">
                    ♾️ {bracketReport.infiniteCombos.length}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Fast Mana</div>
                  <div className="text-base font-black font-mono text-emerald-300 mt-0.5">
                    💎 {bracketReport.fastManaCards.length}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Land Denial</div>
                  <div className="text-base font-black font-mono text-rose-300 mt-0.5">
                    🌋 {bracketReport.mldCards.length}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Tutors / Turns</div>
                  <div className="text-base font-black font-mono text-purple-300 mt-0.5">
                    🔎 {bracketReport.tutorCards.length} / ⏳ {bracketReport.extraTurnCards.length}
                  </div>
                </div>
              </div>

              {/* Why This Deck Is in Bracket X */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <div className="font-bold text-slate-200 uppercase text-[11px] tracking-wider">
                  Why This Deck Rated as {bracketReport.bracketName}:
                </div>
                <ul className="list-disc list-inside space-y-1.5 text-slate-300">
                  {bracketReport.bracketReasons.map((reason, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Actionable Tuning Advice to Lower Bracket */}
              {bracketReport.howToLowerBracket.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/40 space-y-1.5 text-xs">
                  <div className="font-bold text-amber-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" />
                    <span>Want to Play This Deck in a Lower Bracket?</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-amber-100/90">
                    {bracketReport.howToLowerBracket.map((tip, idx) => (
                      <li key={idx}>{tip}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Community Salt Score Thermometer & Most Hated Cards Panel (5 cols) */}
            <div className="lg:col-span-5 rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
                  <div>
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-orange-400">
                      Community Salt Score & Opponent Hate Meter
                    </div>
                    <h2 className="text-xl font-black text-slate-100 mt-0.5 flex items-center gap-2">
                      <span>{bracketReport.salt.tierEmoji}</span>
                      <span>{bracketReport.salt.tierLabel}</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">{bracketReport.salt.tierDescription}</p>
                  </div>

                  <div className="px-3.5 py-2 rounded-2xl bg-slate-950 border border-orange-500/40 text-center shrink-0">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Total Salt</div>
                    <div className="text-2xl font-black font-mono text-orange-400">
                      🧂 {bracketReport.salt.totalSaltSum}
                    </div>
                  </div>
                </div>

                {/* Salt Thermometer Bar (0 to 100) */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-semibold">
                      Table Groan / Salt Index:{' '}
                      <strong className="text-orange-300 font-mono">{bracketReport.salt.saltIndex100} / 100</strong>
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">
                      Avg Card Salt: <strong className="text-slate-200">{bracketReport.salt.avgCardSalt}</strong> / 4.00
                    </span>
                  </div>
                  <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 transition-all duration-300"
                      style={{ width: `${Math.max(5, bracketReport.salt.saltIndex100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 font-semibold">
                    <span>🧊 0 Chill</span>
                    <span>🥨 30 Precon</span>
                    <span>🧂 55 Salty</span>
                    <span>🌶️ 75 Archenemy</span>
                    <span>☠️ 100 Salt Mine</span>
                  </div>
                </div>

                {/* Most Hated / Saltiest Cards in This Deck */}
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
                    <span>Most Hated / Saltiest Cards in Your Deck</span>
                    <span className="text-[10px] text-slate-500 font-mono">EDHREC 0–4.00 Scale</span>
                  </div>

                  {bracketReport.salt.topSaltyCards.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-emerald-300">
                      🧊 Zero high-salt cards detected! Your playgroup will have zero complaints playing against this list.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                      {bracketReport.salt.topSaltyCards.map(sItem => (
                        <div
                          key={sItem.name}
                          onClick={() => sItem.card && setZoomedDeckCard(sItem.card)}
                          className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-900/90 border border-slate-800 hover:border-orange-500/40 flex items-center justify-between gap-2.5 transition cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {sItem.card?.image_small && (
                              <img
                                src={sItem.card.image_small}
                                alt={sItem.name}
                                className="w-7 h-10 rounded object-cover shrink-0 border border-slate-700"
                              />
                            )}
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-slate-100 truncate flex items-center gap-1.5">
                                <span>{sItem.name}</span>
                                {sItem.isGameChanger && (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-extrabold">
                                    ⚡GC
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 truncate">
                                {sItem.reasons.join(' • ')}
                              </div>
                            </div>
                          </div>

                          <span className="px-2 py-1 rounded-lg bg-orange-500/15 border border-orange-500/40 font-mono font-extrabold text-xs text-orange-300 shrink-0">
                            🧂 {sItem.saltScore.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Grid: 1. Infinite Combos, 2. Official WotC Game Changers, 3. Fast Mana, 4. MLD / Tutors / Extra Turns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Panel 1: Infinite Combos & 1-Card-Away Combos */}
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <span>♾️ Infinite Combos & 2-Card Win Conditions</span>
                    <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-mono text-xs">
                      {bracketReport.infiniteCombos.length} Active
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Official WotC rules forbid 2-card infinite combos in Brackets 1 & 2, and forbid early-game 2-card combos in Bracket 3.
                  </p>
                </div>
              </div>

              {bracketReport.infiniteCombos.length === 0 ? (
                <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>No known 2-card or 3-card infinite combos detected in this decklist (Safe for Brackets 1–3).</span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {bracketReport.infiniteCombos.map(combo => (
                    <div
                      key={combo.id}
                      className="p-3.5 rounded-xl bg-slate-950 border border-sky-500/40 space-y-1.5 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-black text-sm text-amber-300">
                          {combo.names.join(' + ')}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-md bg-sky-500/20 border border-sky-500/40 text-sky-300 font-bold text-[10px]">
                            {combo.result}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                              combo.speed === 'early_2card'
                                ? 'bg-rose-500/20 border border-rose-500/40 text-rose-300'
                                : 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                            }`}
                          >
                            {combo.speed === 'early_2card' ? 'Early 2-Card (Bracket 4+)' : 'Late / 3-Card (Bracket 3+)'}
                          </span>
                        </div>
                      </div>
                      <p className="text-slate-300 leading-relaxed">{combo.explanation}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Near-Combos (1 Card Away) */}
              {bracketReport.nearCombos.length > 0 && (
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    💡 Potential Combos (You Run 1 Piece — Missing 1 Partner Card):
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {bracketReport.nearCombos.map(nc => (
                      <div
                        key={nc.id}
                        className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1"
                      >
                        <div className="font-semibold text-slate-200">
                          <span className="text-emerald-400">✓ {nc.ownedPiece}</span>
                          <span className="text-slate-500"> + </span>
                          <span className="text-amber-300">{nc.missingPiece}</span>
                        </div>
                        <div className="text-[10px] text-slate-400">{nc.result}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Panel 2: Official WotC Game Changers, Fast Mana, MLD, Extra Turns & Tutors */}
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
              {/* Official Game Changers */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <span>⚡ Official WotC Game Changers</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-xs">
                      {bracketReport.gameChangers.length}
                    </span>
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    B1–2: 0 Allowed • B3: Up to 3 • B4–5: Unlimited
                  </span>
                </div>

                {bracketReport.gameChangers.length === 0 ? (
                  <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-200">
                    ✓ 0 cards from the Official Wizards of the Coast Game Changers list (Eligible for Brackets 1 & 2!).
                  </div>
                ) : (
                  <div className="space-y-2">
                    {bracketReport.gameChangers.map(gc => (
                      <div
                        key={gc.name}
                        onClick={() => gc.card && setZoomedDeckCard(gc.card)}
                        className="p-3 rounded-xl bg-slate-950 hover:bg-slate-900 border border-amber-500/40 flex items-start justify-between gap-3 text-xs cursor-pointer transition"
                      >
                        <div>
                          <div className="font-bold text-amber-300 flex items-center gap-2">
                            <span>⚡ {gc.name}</span>
                            <span className="px-2 py-0.2 rounded bg-slate-900 border border-slate-700 text-[10px] text-slate-300">
                              {gc.category}
                            </span>
                          </div>
                          <div className="text-slate-300 mt-1">{gc.reason}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Fast Mana Section */}
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-sky-300 flex items-center justify-between">
                  <span>💎 Fast Mana & Explosive Acceleration ({bracketReport.fastManaCards.length})</span>
                </div>
                {bracketReport.fastManaCards.length === 0 ? (
                  <div className="text-xs text-slate-400">No fast mana rocks or rituals detected.</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {bracketReport.fastManaCards.map(fm => (
                      <button
                        key={fm.name}
                        type="button"
                        onClick={() => fm.card && setZoomedDeckCard(fm.card)}
                        className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-sky-500/35 text-xs text-sky-200 font-semibold cursor-pointer"
                        title={fm.note}
                      >
                        💎 {fm.name} <span className="text-[10px] text-slate-400">({fm.note})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Mass Land Denial, Extra Turns & Tutors Section */}
              <div className="pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="font-bold text-rose-300">
                    🌋 Mass Land Denial ({bracketReport.mldCards.length})
                  </div>
                  {bracketReport.mldCards.length === 0 ? (
                    <div className="text-[11px] text-slate-500">None (Safe for B1–B3)</div>
                  ) : (
                    <div className="space-y-1">
                      {bracketReport.mldCards.map(m => (
                        <div key={m.name} className="text-[11px] text-rose-200 font-semibold">
                          • {m.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="font-bold text-amber-300">
                    ⏳ Extra Turn Spells ({bracketReport.extraTurnCards.length})
                  </div>
                  {bracketReport.extraTurnCards.length === 0 ? (
                    <div className="text-[11px] text-slate-500">None</div>
                  ) : (
                    <div className="space-y-1">
                      {bracketReport.extraTurnCards.map(e => (
                        <div key={e.name} className="text-[11px] text-amber-200 font-semibold">
                          • {e.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="font-bold text-purple-300">
                    🔎 Non-Land Tutors ({bracketReport.tutorCards.length})
                  </div>
                  {bracketReport.tutorCards.length === 0 ? (
                    <div className="text-[11px] text-slate-500">None</div>
                  ) : (
                    <div className="space-y-1 max-h-28 overflow-y-auto">
                      {bracketReport.tutorCards.map(t => (
                        <div key={t.name} className="text-[11px] text-purple-200 font-semibold">
                          • {t.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MANA CURVE, COLOR DISTRIBUTION & FORMAT RULES */}
      {activeSubTab === 'analytics' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Format Validation Diagnostics */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Format Rule Engine ({deck.format.toUpperCase()})
            </h3>

            {issues.length === 0 ? (
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>
                  This deck passes all {deck.format.toUpperCase()} deckbuilding rules (card count, copy limits, format legality, and Commander color identity)!
                </span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {issues.map((iss, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                      iss.type === 'error'
                        ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                        : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <div>
                      <div className="font-bold">{iss.category}</div>
                      <div className="text-slate-300 mt-0.5">{iss.message}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Type Breakdown */}
            <div className="pt-3 border-t border-slate-800">
              <h4 className="text-xs font-bold uppercase text-slate-400 mb-2.5">
                Card Type Composition (Avg Non-Land MV: {stats.avgCmc})
              </h4>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {Object.entries(stats.typeBreakdown)
                  .filter(([, count]) => count > 0)
                  .map(([type, count]) => (
                    <div
                      key={type}
                      className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                    >
                      <span className="text-slate-300">{type}</span>
                      <span className="font-mono font-bold text-amber-300">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Mana Curve & Color Pips */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Mana Value Curve (Non-Land Spells)
              </h3>
              <p className="text-xs text-slate-400">
                Average Mana Value: <strong className="text-amber-300 font-mono">{stats.avgCmc}</strong>
              </p>

              <div className="grid grid-cols-7 gap-2 items-end h-40 pt-6 px-2 mt-2 bg-slate-950 rounded-xl border border-slate-800">
                {Object.entries(stats.manaCurve).map(([bucket, count]) => {
                  const heightPct = Math.round((count / maxCurveVal) * 100);
                  return (
                    <div key={bucket} className="flex flex-col items-center gap-1.5 h-full justify-end">
                      <span className="text-[11px] font-mono font-bold text-amber-300">{count}</span>
                      <div className="w-full bg-slate-800/60 rounded-t-lg h-24 flex items-end overflow-hidden">
                        <div
                          className="w-full bg-gradient-to-t from-amber-600 to-amber-400 rounded-t-lg transition-all"
                          style={{ height: `${Math.max(count > 0 ? 10 : 0, heightPct)}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-slate-400 pb-1">{bucket}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mana Pips vs Mana Production */}
            <div>
              <h4 className="text-xs font-bold uppercase text-slate-400 mb-2.5">
                Mana Symbol Pips (Cost Demand) vs. Mana Sources (Production)
              </h4>
              <div className="grid grid-cols-6 gap-2 text-center text-xs">
                {(['W', 'U', 'B', 'R', 'G', 'C'] as const).map(col => (
                  <div key={col} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <ManaSymbol symbol={col} size="sm" />
                    <div className="text-[11px] text-slate-400">
                      Pips: <strong className="text-slate-100 font-mono">{stats.colorPips[col] || 0}</strong>
                    </div>
                    <div className="text-[11px] text-emerald-400">
                      Sources: <strong className="font-mono">{stats.manaSources[col] || 0}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {zoomedDeckCard && (
        <CardZoomModal
          card={
            sectionOrderedDeckCards.find(c =>
              zoomedDeckCard.id !== undefined && c.id !== undefined
                ? c.id === zoomedDeckCard.id
                : c.scryfall_id === zoomedDeckCard.scryfall_id
            ) || zoomedDeckCard
          }
          cardsList={sectionOrderedDeckCards}
          decks={decks}
          defaultTargetDeckId={deck.id}
          onClose={() => setZoomedDeckCard(null)}
          onSelectCard={next => setZoomedDeckCard(next)}
          onOpenPrintingPicker={c => {
            const found = cards.find(x => x.id === c.id);
            if (found) setPrintingPickerCard(found);
          }}
        />
      )}

      {printingPickerCard && (
        <PrintingPickerModal
          cardName={printingPickerCard.name}
          currentScryfallId={printingPickerCard.scryfall_id}
          onClose={() => setPrintingPickerCard(null)}
          onSelectPrinting={newCard => {
            handleUpdateDeckCard(printingPickerCard.id, { newCard });
          }}
        />
      )}

      {quickAddPrintingCard && (
        <PrintingPickerModal
          cardName={quickAddPrintingCard.name}
          currentScryfallId={quickAddPrintingCard.scryfall_id}
          onClose={() => setQuickAddPrintingCard(null)}
          onSelectPrinting={newPrinting => {
            setQuickAddResults(prev =>
              prev.map(c => (c.scryfall_id === quickAddPrintingCard.scryfall_id ? newPrinting : c))
            );
            setQuickAddPrintingCard(null);
          }}
        />
      )}

      {renderPasteDeckModal()}
      {renderFolderPromptModal()}
    </div>
  );
};
