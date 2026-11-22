import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Globe,
  Users,
  Search,
  UserPlus,
  UserCheck,
  Copy,
  Eye,
  Layers,
  FolderOpen,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import {
  CommunityDeckSummary,
  CommunityPlayerProfile,
  DeckAnalysis,
  DeckCardItem,
  InventoryItem
} from '../types';
import { ColorIdentityBadges, ManaCost } from './ManaCost';
import { formatUsd, DualPriceBadge } from './PriceBadge';
import { CardZoomModal, isTransformOrDoubleFacedCard, getCardFaceImageUrl } from './CardZoomModal';
import { evaluateDeckBracketAndSalt } from '../deckBracketAndSalt';

interface CommunityViewProps {
  currentUserId: number;
  isAuthenticated?: boolean;
  liveVersion?: number;
  onRequireAuth?: (mode: 'login' | 'register') => void;
  onDeckCloned: (newDeckId: number) => void;
}

const AVATAR_COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  amber: { bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'border-amber-500/40' },
  emerald: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/40' },
  sky: { bg: 'bg-sky-500/20', text: 'text-sky-300', border: 'border-sky-500/40' },
  violet: { bg: 'bg-violet-500/20', text: 'text-violet-300', border: 'border-violet-500/40' },
  rose: { bg: 'bg-rose-500/20', text: 'text-rose-300', border: 'border-rose-500/40' },
  orange: { bg: 'bg-orange-500/20', text: 'text-orange-300', border: 'border-orange-500/40' }
};

function getPrimarySection(card: DeckCardItem): string {
  if (card.board === 'commander') return '👑 Commander';
  if (card.board === 'sideboard') return 'Sideboard';
  if (card.board === 'considering') return 'Considering';
  const tl = (card.type_line || '').toLowerCase();
  if (tl.includes('creature')) return 'Creatures';
  if (tl.includes('planeswalker')) return 'Planeswalkers';
  if (tl.includes('instant')) return 'Instants';
  if (tl.includes('sorcery')) return 'Sorceries';
  if (tl.includes('artifact')) return 'Artifacts';
  if (tl.includes('enchantment')) return 'Enchantments';
  if (tl.includes('battle')) return 'Battles';
  if (tl.includes('land')) return 'Lands';
  return 'Other';
}

const SECTION_ORDER = [
  '👑 Commander',
  'Creatures',
  'Planeswalkers',
  'Instants',
  'Sorceries',
  'Artifacts',
  'Enchantments',
  'Battles',
  'Lands',
  'Other',
  'Sideboard',
  'Considering'
];

export const CommunityView: React.FC<CommunityViewProps> = ({
  currentUserId,
  isAuthenticated = true,
  liveVersion = 0,
  onRequireAuth,
  onDeckCloned
}) => {
  const [subTab, setSubTab] = useState<'all_decks' | 'following' | 'players'>('all_decks');
  const [searchQuery, setSearchQuery] = useState('');
  const [colorFilter, setColorFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(false);

  const [communityDecks, setCommunityDecks] = useState<CommunityDeckSummary[]>([]);
  const [players, setPlayers] = useState<CommunityPlayerProfile[]>([]);

  // Drill-down: Inspecting a specific Player's Vault (Decks & Card Collection)
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [playerDetail, setPlayerDetail] = useState<{
    profile: CommunityPlayerProfile;
    decks: CommunityDeckSummary[];
    inventory: InventoryItem[];
  } | null>(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerVaultTab, setPlayerVaultTab] = useState<'decks' | 'collection'>('decks');
  const [playerInvSearch, setPlayerInvSearch] = useState('');
  const [playerInvColor, setPlayerInvColor] = useState('ALL');
  const [playerInvLocation, setPlayerInvLocation] = useState('ALL');

  // Drill-down: Inspecting a specific Community Deck
  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(null);
  const [deckDetail, setDeckDetail] = useState<{
    deck: any;
    cards: DeckCardItem[];
    analysis: DeckAnalysis;
  } | null>(null);
  const [deckLoading, setDeckLoading] = useState(false);

  // Clone / Copy Deck Status & Prompt
  const [cloningDeckId, setCloningDeckId] = useState<number | null>(null);
  const [cloneToast, setCloneToast] = useState<string | null>(null);

  // Blown-up Card Zoom Modal + Transform Flip states
  const [zoomCardIndex, setZoomCardIndex] = useState<number | null>(null);
  const [zoomContext, setZoomContext] = useState<'deck' | 'player_collection'>('deck');
  const [flippedCardKeys, setFlippedCardKeys] = useState<Record<string, boolean>>({});

  const fetchCommunityExplore = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/community/explore');
      if (res.ok) {
        const json = await res.json();
        setCommunityDecks(json.decks || []);
        setPlayers(json.players || []);
      }
    } catch (e) {
      console.error('Failed to load community explore:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCommunityExplore(false);
  }, [fetchCommunityExplore, currentUserId, isAuthenticated]);

  // Real-time refresh whenever SSE broadcasts a vault_update (new user, new deck, follow/unfollow, card added)
  useEffect(() => {
    if (liveVersion === 0) return;
    fetchCommunityExplore(true);
    if (selectedPlayerId !== null) {
      fetch(`/api/community/users/${selectedPlayerId}`)
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (data) setPlayerDetail(data);
        })
        .catch(() => {});
    }
    if (selectedDeckId !== null) {
      fetch(`/api/community/decks/${selectedDeckId}`)
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (data) setDeckDetail(data);
        })
        .catch(() => {});
    }
  }, [liveVersion, fetchCommunityExplore, selectedPlayerId, selectedDeckId]);

  // Background heartbeat poll fallback every 8 seconds so even behind buffering proxies new users & decks appear automatically
  useEffect(() => {
    const timer = setInterval(() => {
      fetchCommunityExplore(true);
    }, 8000);
    return () => clearInterval(timer);
  }, [fetchCommunityExplore]);

  function pushCommunityHistory(next: {
    subTab?: 'all_decks' | 'following' | 'players';
    playerId?: number | null;
    playerVaultTab?: 'decks' | 'collection';
    deckId?: number | null;
  }) {
    try {
      const current = window.history.state || {};
      window.history.pushState(
        {
          ...current,
          __aethervault: true,
          activeTab: 'community',
          communitySubTab: next.subTab !== undefined ? next.subTab : subTab,
          communityPlayerId: next.playerId !== undefined ? next.playerId : selectedPlayerId,
          communityPlayerTab: next.playerVaultTab !== undefined ? next.playerVaultTab : playerVaultTab,
          communityDeckId: next.deckId !== undefined ? next.deckId : selectedDeckId
        },
        ''
      );
    } catch {
      // ignore
    }
  }

  // Handle Browser Back / Forward buttons inside Community Explorer
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      if (zoomCardIndex !== null) {
        setZoomCardIndex(null);
        return;
      }
      const st = e.state;
      if (st && st.__aethervault && st.activeTab === 'community') {
        if (st.communitySubTab) setSubTab(st.communitySubTab);
        const nextDeckId = st.communityDeckId ?? null;
        const nextPlayerId = st.communityPlayerId ?? null;
        if (st.communityPlayerTab) setPlayerVaultTab(st.communityPlayerTab);

        if (nextDeckId !== selectedDeckId) {
          setSelectedDeckId(nextDeckId);
          if (nextDeckId !== null) {
            setDeckLoading(true);
            fetch(`/api/community/decks/${nextDeckId}`)
              .then(r => (r.ok ? r.json() : null))
              .then(d => {
                if (d) setDeckDetail(d);
              })
              .finally(() => setDeckLoading(false));
          } else {
            setDeckDetail(null);
          }
        }

        if (nextPlayerId !== selectedPlayerId) {
          setSelectedPlayerId(nextPlayerId);
          if (nextPlayerId !== null) {
            setPlayerLoading(true);
            fetch(`/api/community/users/${nextPlayerId}`)
              .then(r => (r.ok ? r.json() : null))
              .then(d => {
                if (d) setPlayerDetail(d);
              })
              .finally(() => setPlayerLoading(false));
          } else {
            setPlayerDetail(null);
          }
        }
      } else {
        setSelectedDeckId(null);
        setSelectedPlayerId(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [zoomCardIndex, selectedDeckId, selectedPlayerId]);

  async function handleInspectPlayer(targetUserId: number, initialTab: 'decks' | 'collection' = 'decks') {
    pushCommunityHistory({ playerId: targetUserId, playerVaultTab: initialTab, deckId: null });
    setSelectedDeckId(null);
    setSelectedPlayerId(targetUserId);
    setPlayerVaultTab(initialTab);
    setPlayerInvSearch('');
    setPlayerInvColor('ALL');
    setPlayerInvLocation('ALL');
    setPlayerLoading(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const res = await fetch(`/api/community/users/${targetUserId}`);
      if (res.ok) {
        setPlayerDetail(await res.json());
      }
    } finally {
      setPlayerLoading(false);
    }
  }

  async function handleInspectDeck(deckId: number) {
    pushCommunityHistory({ deckId });
    setSelectedDeckId(deckId);
    setDeckLoading(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const res = await fetch(`/api/community/decks/${deckId}`);
      if (res.ok) {
        setDeckDetail(await res.json());
      }
    } finally {
      setDeckLoading(false);
    }
  }

  async function handleToggleFollow(targetUserId: number, currentlyFollowing: boolean) {
    if (!isAuthenticated) {
      onRequireAuth?.('register');
      return;
    }
    if (targetUserId === currentUserId) return;
    const method = currentlyFollowing ? 'DELETE' : 'POST';
    const res = await fetch(`/api/community/follow/${targetUserId}`, { method });
    if (res.ok) {
      const json = await res.json();
      const nextFollow = Boolean(json.isFollowing);
      const nextCount = Number(json.followerCount || 0);

      setPlayers(prev =>
        prev.map(p => {
          if (p.id === targetUserId) {
            return { ...p, isFollowing: nextFollow, followerCount: nextCount };
          }
          if (p.id === currentUserId) {
            const delta = nextFollow ? 1 : -1;
            return { ...p, followingCount: Math.max(0, (p.followingCount || 0) + delta) };
          }
          return p;
        })
      );
      setCommunityDecks(prev =>
        prev.map(d =>
          d.author_id === targetUserId ? { ...d, is_following_author: nextFollow } : d
        )
      );
      if (playerDetail && playerDetail.profile.id === targetUserId) {
        setPlayerDetail({
          ...playerDetail,
          profile: {
            ...playerDetail.profile,
            isFollowing: nextFollow,
            followerCount: nextCount
          }
        });
      }
      if (deckDetail && deckDetail.deck.author_id === targetUserId) {
        setDeckDetail({
          ...deckDetail,
          deck: {
            ...deckDetail.deck,
            is_following_author: nextFollow
          }
        });
      }
      await fetchCommunityExplore();
    }
  }

  async function handleCloneDeck(deckId: number, deckName: string, authorName: string) {
    if (!isAuthenticated) {
      onRequireAuth?.('register');
      return;
    }
    const customName = window.prompt(
      `Copy "${deckName}" (by ${authorName}) into your own personal Decks so you can modify it freely.\n\nChoose a name for your copy:`,
      `${deckName} (${authorName} Copy)`
    );
    if (customName === null) return;

    setCloningDeckId(deckId);
    try {
      const res = await fetch(`/api/community/decks/${deckId}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: customName.trim() || `${deckName} (${authorName} Copy)`,
          folder: 'Community Copies'
        })
      });
      const json = await res.json();
      if (res.ok && json.deckId) {
        setCloneToast(json.message || `Copied "${deckName}" to your Decks!`);
        setTimeout(() => setCloneToast(null), 4000);
        onDeckCloned(Number(json.deckId));
      }
    } finally {
      setCloningDeckId(null);
    }
  }

  // Group inspected deck cards by Archidekt-style sections
  const deckSections = useMemo(() => {
    if (!deckDetail) return [];
    const grouped: Record<string, DeckCardItem[]> = {};
    for (const c of deckDetail.cards) {
      const sec = getPrimarySection(c);
      if (!grouped[sec]) grouped[sec] = [];
      grouped[sec].push(c);
    }
    return SECTION_ORDER.filter(sec => grouped[sec] && grouped[sec].length > 0).map(sec => ({
      title: sec,
      cards: grouped[sec],
      totalQty: grouped[sec].reduce((sum, item) => sum + (item.quantity || 1), 0)
    }));
  }, [deckDetail]);

  const orderedDeckCards = useMemo(() => {
    return deckSections.flatMap(s => s.cards);
  }, [deckSections]);

  const deckZoomSections = useMemo(() => {
    let runningIdx = 0;
    return deckSections.map(s => {
      const startIndex = runningIdx;
      runningIdx += s.cards.length;
      return {
        label: s.title,
        count: s.totalQty,
        startIndex,
        cardCount: s.cards.length
      };
    });
  }, [deckSections]);

  const deckBracketReport = useMemo(() => {
    if (!deckDetail) return null;
    return evaluateDeckBracketAndSalt(deckDetail.cards);
  }, [deckDetail]);

  // Filter inspected player's collection
  const filteredPlayerInventory = useMemo(() => {
    if (!playerDetail) return [];
    const q = playerInvSearch.trim().toLowerCase();
    return playerDetail.inventory.filter(item => {
      if (playerInvLocation !== 'ALL' && item.location !== playerInvLocation) return false;
      if (playerInvColor !== 'ALL') {
        const cols = item.color_identity || item.colors || [];
        if (playerInvColor === 'C') {
          if (cols.length > 0) return false;
        } else if (!cols.includes(playerInvColor)) {
          return false;
        }
      }
      if (q) {
        const matchName = (item.name || '').toLowerCase().includes(q);
        const matchType = (item.type_line || '').toLowerCase().includes(q);
        const matchOracle = (item.oracle_text || '').toLowerCase().includes(q);
        const matchSet = (item.set_name || '').toLowerCase().includes(q) || (item.set_code || '').toLowerCase().includes(q);
        if (!matchName && !matchType && !matchOracle && !matchSet) return false;
      }
      return true;
    });
  }, [playerDetail, playerInvSearch, playerInvColor, playerInvLocation]);

  const playerLocations = useMemo(() => {
    if (!playerDetail) return [];
    return Array.from(new Set(playerDetail.inventory.map(i => i.location).filter(Boolean)));
  }, [playerDetail]);

  const followedPlayers = useMemo(() => {
    return players.filter(p => p.isFollowing);
  }, [players]);

  const displayedPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return players;
    return players.filter(p => (p.name || '').toLowerCase().includes(q));
  }, [players, searchQuery]);

  const displayedDecks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return communityDecks.filter(d => {
      if (subTab === 'following' && !d.is_following_author) return false;
      if (colorFilter !== 'ALL') {
        const cols = d.color_identity || [];
        if (colorFilter === 'C') {
          if (cols.length > 0) return false;
        } else if (!cols.includes(colorFilter)) {
          return false;
        }
      }
      if (q) {
        const matchName = (d.name || '').toLowerCase().includes(q);
        const matchAuthor = (d.author_name || '').toLowerCase().includes(q);
        const matchCmd = (d.commander_name || '').toLowerCase().includes(q);
        const matchTag = Array.isArray(d.tags) && d.tags.some(t => String(t).toLowerCase().includes(q));
        const matchFormat = (d.format || '').toLowerCase().includes(q);
        if (!matchName && !matchAuthor && !matchCmd && !matchTag && !matchFormat) return false;
      }
      return true;
    });
  }, [communityDecks, subTab, colorFilter, searchQuery]);

  // Determine active card list for Blown-Up Card View
  const activeZoomList = zoomContext === 'deck' ? orderedDeckCards : filteredPlayerInventory;
  const activeZoomCard =
    zoomCardIndex !== null && activeZoomList[zoomCardIndex] ? activeZoomList[zoomCardIndex] : null;

  // ============================================================================
  // VIEW 1: READ-ONLY COMMUNITY DECK INSPECTOR
  // ============================================================================
  if (selectedDeckId !== null) {
    const deck = deckDetail?.deck;
    const analysis = deckDetail?.analysis;
    const authorStyle = AVATAR_COLOR_MAP[deck?.author_avatar_color || 'amber'] || AVATAR_COLOR_MAP.amber;

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setSelectedDeckId(null);
              setDeckDetail(null);
            }}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-amber-400" />
            <span>{selectedPlayerId ? `Back to ${deck?.author_name || 'Player'}'s Vault` : 'Back to Community Decks'}</span>
          </button>

          {deck && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleInspectPlayer(deck.author_id)}
                className={`px-3 py-1.5 rounded-xl border ${authorStyle.bg} ${authorStyle.border} ${authorStyle.text} font-bold text-xs flex items-center gap-1.5 cursor-pointer`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>View {deck.author_name}&apos;s Full Vault &amp; Cards</span>
              </button>

              {!deck.is_own_deck && (
                <button
                  type="button"
                  onClick={() => handleToggleFollow(deck.author_id, Boolean(deck.is_following_author))}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 border transition cursor-pointer ${
                    deck.is_following_author
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                  }`}
                >
                  {deck.is_following_author ? (
                    <>
                      <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Following {deck.author_name}</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5 text-amber-400" />
                      <span>Follow {deck.author_name}</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                disabled={cloningDeckId === deck.id}
                onClick={() => handleCloneDeck(deck.id, deck.name, deck.author_name)}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/10 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{cloningDeckId === deck.id ? 'Copying...' : 'Copy Deck to My Vault'}</span>
              </button>
            </div>
          )}
        </div>

        {deckLoading || !deckDetail ? (
          <div className="p-12 rounded-2xl bg-slate-900 border border-slate-800 text-center text-sm text-slate-400">
            Loading community decklist...
          </div>
        ) : (
          <>
            {/* Deck Banner & Ownership Comparison */}
            <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-900">
              {deck.cover_image && (
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-20 blur-[1px]"
                  style={{ backgroundImage: `url(${deck.cover_image})` }}
                />
              )}
              <div className="relative p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-950/95 via-slate-950/85 to-slate-950/70">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-bold uppercase">
                      {deck.format}
                    </span>
                    <ColorIdentityBadges colors={deck.color_identity} size="sm" />
                    <span className="text-xs text-slate-400">
                      Built by <strong className="text-slate-100">{deck.author_name}</strong>
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-800/90 text-slate-400 text-[10px] font-semibold">
                      Read-Only View
                    </span>
                  </div>

                  <h2 className="text-xl sm:text-2xl font-black text-slate-100">{deck.name}</h2>
                  {deck.description && (
                    <p className="text-xs text-slate-300 max-w-2xl whitespace-pre-line">{deck.description}</p>
                  )}

                  {deckBracketReport && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="px-2.5 py-1 rounded-xl bg-slate-900/90 border border-amber-500/40 text-amber-300 font-bold text-xs">
                        🏆 Bracket {deckBracketReport.bracket}: {deckBracketReport.bracketName}
                      </span>
                      <span className="px-2.5 py-1 rounded-xl bg-slate-900/90 border border-rose-500/40 text-rose-300 font-bold text-xs">
                        🧂 Salt Score: {deckBracketReport.salt.saltIndex100}/100 ({deckBracketReport.salt.tierLabel})
                      </span>
                      {deckBracketReport.gameChangers.length > 0 && (
                        <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold">
                          ⚡ {deckBracketReport.gameChangers.length} Game Changers
                        </span>
                      )}
                      {deckBracketReport.infiniteCombos.length > 0 && (
                        <span className="px-2.5 py-1 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-300 text-xs font-semibold">
                          ♾️ {deckBracketReport.infiniteCombos.length} Combos
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {analysis && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 shrink-0 text-xs">
                    <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800">
                      <div className="text-[10px] uppercase text-slate-400 font-bold">Total Cards</div>
                      <div className="text-base font-black font-mono text-slate-100 mt-0.5">
                        {analysis.counts.commander + analysis.counts.mainboard}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950/90 border border-emerald-500/30">
                      <div className="text-[10px] uppercase text-emerald-400 font-bold">You Already Own</div>
                      <div className="text-base font-black font-mono text-emerald-300 mt-0.5">
                        {analysis.ownership.totalOwned}/{analysis.ownership.totalRequired} ({analysis.ownership.completionPct}%)
                      </div>
                    </div>
                    <div className="col-span-2 sm:col-span-1 p-3 rounded-xl bg-slate-950/90 border border-slate-800">
                      <div className="text-[10px] uppercase text-sky-400 font-bold">Deck Value</div>
                      <div className="text-sm font-black font-mono text-sky-300 mt-0.5">
                        TCG: {formatUsd(analysis.valuation.totalTcg)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section Jump Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {deckSections.map(sec => (
                <a
                  key={sec.title}
                  href={`#comm-sec-${sec.title.replace(/[^a-zA-Z0-9]/g, '-')}`}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 whitespace-nowrap transition"
                >
                  {sec.title} <span className="text-amber-400 font-mono">({sec.totalQty})</span>
                </a>
              ))}
            </div>

            {/* Read-Only Visual Card Grid by Section */}
            <div className="space-y-6">
              {deckSections.map(sec => (
                <div
                  key={sec.title}
                  id={`comm-sec-${sec.title.replace(/[^a-zA-Z0-9]/g, '-')}`}
                  className="rounded-2xl bg-slate-900/70 border border-slate-800/90 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="font-bold text-sm text-amber-300 flex items-center gap-2">
                      <span>{sec.title}</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono text-xs">
                        {sec.totalQty}
                      </span>
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {sec.cards.map(card => {
                      const flatIdx = orderedDeckCards.findIndex(c => c.id === card.id);
                      const flipKey = `comm-deck-${card.id}`;
                      const isFlipped = Boolean(flippedCardKeys[flipKey]);
                      const canFlip = isTransformOrDoubleFacedCard(card);
                      const imgUrl = getCardFaceImageUrl(card, isFlipped ? 'back' : 'front');
                      const youOwnIt = (card.owned_qty || 0) >= card.quantity;

                      return (
                        <div
                          key={card.id}
                          className="rounded-xl bg-slate-950 border border-slate-800/90 overflow-hidden flex flex-col group hover:border-amber-500/50 transition"
                        >
                          <div
                            onClick={() => {
                              setZoomContext('deck');
                              setZoomCardIndex(flatIdx >= 0 ? flatIdx : 0);
                            }}
                            className="relative aspect-[63/88] bg-slate-900 cursor-zoom-in overflow-hidden"
                          >
                            {imgUrl ? (
                              <img
                                src={imgUrl}
                                alt={card.name}
                                loading="lazy"
                                className="w-full h-full object-cover group-hover:scale-[1.03] transition duration-200"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center p-3 text-center text-xs text-slate-400 font-bold">
                                {card.name}
                              </div>
                            )}

                            <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-slate-950/90 border border-slate-700 font-mono font-black text-xs text-amber-300">
                              {card.quantity}x
                            </span>

                            <span
                              className={`absolute top-2 right-2 px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${
                                youOwnIt
                                  ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-300'
                                  : 'bg-slate-950/90 border-slate-700 text-slate-400'
                              }`}
                              title={
                                youOwnIt
                                  ? 'You already own this card in your collection!'
                                  : 'Not currently in your collection'
                              }
                            >
                              {youOwnIt ? '✓ In Your Vault' : 'Missing'}
                            </span>

                            {canFlip && (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  setFlippedCardKeys(prev => ({ ...prev, [flipKey]: !prev[flipKey] }));
                                }}
                                className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-slate-950/90 hover:bg-amber-500 hover:text-slate-950 text-amber-300 border border-amber-500/40 text-[10px] font-bold cursor-pointer"
                              >
                                🔄 Flip
                              </button>
                            )}
                          </div>

                          <div className="p-2.5 flex-1 flex flex-col justify-between gap-1.5 text-xs">
                            <div className="font-bold text-slate-100 truncate" title={card.name}>
                              {card.name}
                            </div>
                            <div className="flex items-center justify-between">
                              <ManaCost cost={card.mana_cost} size="sm" />
                              <span className="font-mono text-[11px] text-sky-400">
                                {formatUsd(card.unit_tcg)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <CardZoomModal
          card={activeZoomCard}
          isOpen={zoomCardIndex !== null}
          onClose={() => setZoomCardIndex(null)}
          currentIndex={zoomCardIndex ?? undefined}
          totalCards={activeZoomList.length}
          onPrev={
            zoomCardIndex !== null && zoomCardIndex > 0
              ? () => setZoomCardIndex(zoomCardIndex - 1)
              : undefined
          }
          onNext={
            zoomCardIndex !== null && zoomCardIndex < activeZoomList.length - 1
              ? () => setZoomCardIndex(zoomCardIndex + 1)
              : undefined
          }
          sections={zoomContext === 'deck' ? deckZoomSections : undefined}
          onJumpToIndex={idx => setZoomCardIndex(idx)}
        />
      </div>
    );
  }

  // ============================================================================
  // VIEW 2: PLAYER VAULT INSPECTOR (SEE ANOTHER USER'S DECKS & CARD COLLECTION)
  // ============================================================================
  if (selectedPlayerId !== null) {
    const profile = playerDetail?.profile;
    const cStyle = AVATAR_COLOR_MAP[profile?.avatar_color || 'amber'] || AVATAR_COLOR_MAP.amber;

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setSelectedPlayerId(null);
              setPlayerDetail(null);
            }}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-amber-400" />
            <span>Back to Community</span>
          </button>
        </div>

        {playerLoading || !playerDetail || !profile ? (
          <div className="p-12 rounded-2xl bg-slate-900 border border-slate-800 text-center text-sm text-slate-400">
            Loading player&apos;s vault...
          </div>
        ) : (
          <>
            {/* Player Header Card */}
            <div className="p-5 sm:p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div
                  className={`w-14 h-14 rounded-2xl border ${cStyle.bg} ${cStyle.border} ${cStyle.text} flex items-center justify-center font-black text-xl shrink-0`}
                >
                  {profile.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-black text-slate-100">{profile.name}&apos;s Vault</h2>
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 text-[10px] font-bold">
                      Read-Only Library
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono mt-1">
                    <span>
                      <strong className="text-slate-200">{profile.totalCards.toLocaleString()}</strong> cards
                    </span>
                    <span>•</span>
                    <span>
                      <strong className="text-slate-200">{profile.totalDecks}</strong> decks
                    </span>
                    <span>•</span>
                    <span>
                      <strong className="text-amber-300">{profile.followerCount}</strong> followers
                    </span>
                    <span>•</span>
                    <span>
                      <strong className="text-slate-300">{profile.followingCount}</strong> following
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {profile.totalTcg !== undefined && (
                  <div className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
                    <span className="text-slate-400">Vault Value: </span>
                    <strong className="text-sky-400">{formatUsd(profile.totalTcg)}</strong>
                  </div>
                )}

                {!profile.isSelf && (
                  <button
                    type="button"
                    onClick={() => handleToggleFollow(profile.id, profile.isFollowing)}
                    className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 border transition cursor-pointer ${
                      profile.isFollowing
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                        : 'bg-amber-500 hover:bg-amber-400 border-amber-500 text-slate-950'
                    }`}
                  >
                    {profile.isFollowing ? (
                      <>
                        <UserCheck className="w-4 h-4" />
                        <span>Following</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        <span>Follow {profile.name}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Sub-Tabs: Built Decks vs Card Collection */}
            <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-800 pb-3">
              <button
                type="button"
                onClick={() => {
                  pushCommunityHistory({ playerVaultTab: 'decks' });
                  setPlayerVaultTab('decks');
                }}
                className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition whitespace-nowrap cursor-pointer ${
                  playerVaultTab === 'decks'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                <Layers className="w-4 h-4 shrink-0" />
                <span>Built Decks ({playerDetail.decks.length})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  pushCommunityHistory({ playerVaultTab: 'collection' });
                  setPlayerVaultTab('collection');
                }}
                className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition whitespace-nowrap cursor-pointer ${
                  playerVaultTab === 'collection'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                <FolderOpen className="w-4 h-4 shrink-0" />
                <span>Card Collection ({profile.totalCards.toLocaleString()} cards)</span>
              </button>
            </div>

            {playerVaultTab === 'decks' ? (
              playerDetail.decks.length === 0 ? (
                <div className="p-10 rounded-2xl bg-slate-900 border border-slate-800 text-center text-xs text-slate-400">
                  {profile.name} hasn&apos;t built any decks yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {playerDetail.decks.map(deck => (
                    <div
                      key={deck.id}
                      className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden flex flex-col justify-between hover:border-amber-500/50 transition group"
                    >
                      <div>
                        <div
                          onClick={() => handleInspectDeck(deck.id)}
                          className="h-32 bg-slate-950 bg-cover bg-center relative cursor-pointer"
                          style={deck.cover_image ? { backgroundImage: `url(${deck.cover_image})` } : undefined}
                        >
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/50 to-transparent" />
                          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-md bg-slate-950/90 border border-slate-700 text-[10px] font-bold uppercase text-amber-300">
                              {deck.format}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-slate-950/90 border border-slate-700 text-[10px] font-mono text-slate-300">
                              {deck.total_cards} cards
                            </span>
                          </div>
                          <div className="absolute top-2.5 right-2.5">
                            <span className="px-2 py-0.5 rounded-md bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold">
                              You own {deck.viewer_owned_pct}%
                            </span>
                          </div>
                          <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between gap-2">
                            <div>
                              <h3 className="font-black text-base text-slate-100 group-hover:text-amber-300 transition truncate">
                                {deck.name}
                              </h3>
                              {deck.commander_name && (
                                <div className="text-[11px] text-amber-300/90 font-semibold truncate">
                                  👑 {deck.commander_name}
                                </div>
                              )}
                            </div>
                            <ColorIdentityBadges colors={deck.color_identity} size="sm" />
                          </div>
                        </div>

                        <div className="p-3.5 text-xs text-slate-400 flex items-center justify-between">
                          <span>Folder: {deck.folder}</span>
                          <span className="font-mono text-sky-400 font-bold">
                            {formatUsd(deck.total_tcg)}
                          </span>
                        </div>
                      </div>

                      <div className="p-3 pt-0 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleInspectDeck(deck.id)}
                          className="py-2 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-sky-400" />
                          <span>View Deck</span>
                        </button>
                        <button
                          type="button"
                          disabled={cloningDeckId === deck.id}
                          onClick={() => handleCloneDeck(deck.id, deck.name, deck.author_name)}
                          className="py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Deck</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              /* Read-Only Card Collection Browser for Selected Player */
              <div className="space-y-4">
                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center gap-3">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder={`Search ${profile.name}'s cards...`}
                      value={playerInvSearch}
                      onChange={e => setPlayerInvSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    {['ALL', 'W', 'U', 'B', 'R', 'G', 'C'].map(col => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => setPlayerInvColor(col)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                          playerInvColor === col
                            ? 'bg-amber-500 border-amber-400 text-slate-950'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {col}
                      </button>
                    ))}
                  </div>

                  {playerLocations.length > 1 && (
                    <select
                      value={playerInvLocation}
                      onChange={e => setPlayerInvLocation(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200"
                    >
                      <option value="ALL">All Binders ({playerLocations.length})</option>
                      {playerLocations.map(loc => (
                        <option key={loc} value={loc}>
                          {loc}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-4">
                  {filteredPlayerInventory.slice(0, 120).map((item, idx) => {
                    const flipKey = `player-inv-${item.id}`;
                    const isFlipped = Boolean(flippedCardKeys[flipKey]);
                    const canFlip = isTransformOrDoubleFacedCard(item);
                    const imgUrl = getCardFaceImageUrl(item, isFlipped ? 'back' : 'front');

                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden flex flex-col hover:border-amber-500/50 transition group"
                      >
                        <div
                          onClick={() => {
                            setZoomContext('player_collection');
                            setZoomCardIndex(idx);
                          }}
                          className="relative aspect-[63/88] bg-slate-950 cursor-zoom-in overflow-hidden"
                        >
                          {imgUrl ? (
                            <img
                              src={imgUrl}
                              alt={item.name}
                              loading="lazy"
                              className="w-full h-full object-cover group-hover:scale-[1.03] transition duration-200"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center p-3 text-center text-xs text-slate-400 font-bold">
                              {item.name}
                            </div>
                          )}

                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-slate-950/90 border border-slate-700 font-mono font-black text-xs text-amber-300">
                            {item.quantity}x
                          </span>

                          {item.finish !== 'nonfoil' && (
                            <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-amber-500/90 text-slate-950 font-black text-[10px] uppercase">
                              ✨ {item.finish}
                            </span>
                          )}

                          {canFlip && (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                setFlippedCardKeys(prev => ({ ...prev, [flipKey]: !prev[flipKey] }));
                              }}
                              className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-slate-950/90 hover:bg-amber-500 hover:text-slate-950 text-amber-300 border border-amber-500/40 text-[10px] font-bold cursor-pointer"
                            >
                              🔄 Flip
                            </button>
                          )}
                        </div>

                        <div className="p-3 flex-1 flex flex-col justify-between gap-2 text-xs">
                          <div>
                            <div className="font-bold text-slate-100 truncate" title={item.name}>
                              {item.name}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {item.set_name || 'MTG'}
                              {item.set_code ? ` (${String(item.set_code).toUpperCase()})` : ''} • {item.location || 'Main Binder'}
                            </div>
                          </div>
                          <DualPriceBadge
                            card={item}
                            finish={item.finish}
                            tcgUsd={item.unit_tcg}
                            ckRetail={item.unit_ck_retail}
                            tcgUrl={item.tcgplayer_url}
                            ckUrl={item.cardkingdom_url}
                            compact
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        <CardZoomModal
          card={activeZoomCard}
          isOpen={zoomCardIndex !== null}
          onClose={() => setZoomCardIndex(null)}
          currentIndex={zoomCardIndex ?? undefined}
          totalCards={activeZoomList.length}
          onPrev={
            zoomCardIndex !== null && zoomCardIndex > 0
              ? () => setZoomCardIndex(zoomCardIndex - 1)
              : undefined
          }
          onNext={
            zoomCardIndex !== null && zoomCardIndex < activeZoomList.length - 1
              ? () => setZoomCardIndex(zoomCardIndex + 1)
              : undefined
          }
        />
      </div>
    );
  }

  // ============================================================================
  // VIEW 3: MAIN COMMUNITY HUB (DISCOVER ALL DECKS, FOLLOWING FEED, PLAYERS)
  // ============================================================================
  return (
    <div className="space-y-5">
      {cloneToast && (
        <div className="p-3.5 rounded-2xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 text-xs font-bold flex items-center gap-2 shadow-lg">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{cloneToast}</span>
        </div>
      )}

      {/* Top Community Header & Search Bar */}
      <div className="p-5 sm:p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-lg sm:text-xl font-black text-slate-100 flex items-center gap-2">
                <Globe className="w-5 h-5 text-amber-400 shrink-0" />
                <span>AetherVault Community &amp; Deck Explorer</span>
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Live Real-Time Sync</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Search any player&apos;s decks across AetherVault, follow builders, inspect their card libraries, and copy any decklist to customize in your own vault.
            </p>
          </div>

          {/* Sub-Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 self-start shrink-0">
            <button
              type="button"
              onClick={() => {
                pushCommunityHistory({ subTab: 'all_decks' });
                setSubTab('all_decks');
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer ${
                subTab === 'all_decks'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span>All Decks ({communityDecks.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                pushCommunityHistory({ subTab: 'following' });
                setSubTab('following');
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer ${
                subTab === 'following'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Following ({followedPlayers.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                pushCommunityHistory({ subTab: 'players' });
                setSubTab('players');
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer ${
                subTab === 'players'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>Players ({players.length})</span>
            </button>
          </div>
        </div>

        {/* Search & Color Identity Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={
                subTab === 'players'
                  ? 'Search players by username...'
                  : 'Search any user’s deck by name, commander, creator, or tag...'
              }
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          {subTab !== 'players' && (
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {['ALL', 'W', 'U', 'B', 'R', 'G', 'C'].map(col => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setColorFilter(col)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                    colorFilter === col
                      ? 'bg-amber-500 border-amber-400 text-slate-950'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {col === 'ALL' ? 'All Colors' : col}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => fetchCommunityExplore(false)}
            className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 cursor-pointer"
            title="Refresh Community"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Players Directory View */}
      {subTab === 'players' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedPlayers.map(player => {
            const cStyle = AVATAR_COLOR_MAP[player.avatar_color || 'amber'] || AVATAR_COLOR_MAP.amber;
            return (
              <div
                key={player.id}
                className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-amber-500/40 transition flex flex-col justify-between gap-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div
                    onClick={() => handleInspectPlayer(player.id)}
                    className="flex items-center gap-3 min-w-0 cursor-pointer group"
                  >
                    <div
                      className={`w-11 h-11 rounded-xl border ${cStyle.bg} ${cStyle.border} ${cStyle.text} flex items-center justify-center font-black text-sm shrink-0`}
                    >
                      {player.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-100 group-hover:text-amber-300 transition truncate flex items-center gap-1.5">
                        <span>{player.name}</span>
                        {player.isSelf && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px]">
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {player.followerCount} followers • {player.followingCount} following
                      </div>
                    </div>
                  </div>

                  {!player.isSelf && (
                    <button
                      type="button"
                      onClick={() => handleToggleFollow(player.id, player.isFollowing)}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 border transition cursor-pointer shrink-0 ${
                        player.isFollowing
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-amber-500 hover:bg-amber-400 border-amber-500 text-slate-950'
                      }`}
                    >
                      {player.isFollowing ? (
                        <>
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Following</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Follow</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">Collection</div>
                    <div className="text-slate-100 font-bold mt-0.5">
                      {player.totalCards.toLocaleString()} cards
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">Built Decks</div>
                    <div className="text-amber-300 font-bold mt-0.5">
                      {player.totalDecks} decks
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleInspectPlayer(player.id, 'decks')}
                    className="py-2 px-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    <span>View Decks</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInspectPlayer(player.id, 'collection')}
                    className="py-2 px-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
                    <span>View Cards</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Community Decks Grid (All Decks or Following Feed) */
        <div className="space-y-6">
          {subTab === 'following' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-amber-400" />
                  <span>Players You Follow ({followedPlayers.length})</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setSubTab('players')}
                  className="text-xs font-bold text-sky-400 hover:text-sky-300 cursor-pointer"
                >
                  + Discover More Players →
                </button>
              </div>

              {followedPlayers.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-3">
                  <div className="text-sm font-bold text-slate-200">
                    You aren&apos;t following any players yet.
                  </div>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Follow other players to pin their card collections and Commander decks here for quick access.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSubTab('players')}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
                  >
                    Browse Players to Follow
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {followedPlayers.map(player => {
                    const cStyle = AVATAR_COLOR_MAP[player.avatar_color || 'amber'] || AVATAR_COLOR_MAP.amber;
                    return (
                      <div
                        key={player.id}
                        className="p-4 rounded-2xl bg-slate-900 border border-emerald-500/30 hover:border-amber-500/50 transition flex flex-col justify-between gap-3.5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div
                            onClick={() => handleInspectPlayer(player.id, 'decks')}
                            className="flex items-center gap-3 min-w-0 cursor-pointer group"
                          >
                            <div
                              className={`w-10 h-10 rounded-xl border ${cStyle.bg} ${cStyle.border} ${cStyle.text} flex items-center justify-center font-black text-sm shrink-0`}
                            >
                              {player.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-sm text-slate-100 group-hover:text-amber-300 transition truncate">
                                {player.name}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono">
                                {player.totalCards.toLocaleString()} cards • {player.totalDecks} decks
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleToggleFollow(player.id, true)}
                            className="px-2.5 py-1 rounded-xl bg-emerald-500/20 hover:bg-rose-500/20 border border-emerald-500/40 hover:border-rose-500/40 text-emerald-300 hover:text-rose-300 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer shrink-0"
                            title="Click to unfollow"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Following</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => handleInspectPlayer(player.id, 'collection')}
                            className="py-2 px-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
                            <span>View Collection ({player.totalCards.toLocaleString()})</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleInspectPlayer(player.id, 'decks')}
                            className="py-2 px-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Layers className="w-3.5 h-3.5 text-amber-400" />
                            <span>View Decks ({player.totalDecks})</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {subTab === 'following' && followedPlayers.length > 0 && (
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5 pt-1">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>Decks by Players You Follow ({displayedDecks.length})</span>
            </h2>
          )}

          {displayedDecks.length === 0 ? (
            subTab === 'following' ? (
              followedPlayers.length > 0 ? (
                <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 text-center text-xs text-slate-400">
                  The player(s) you follow haven&apos;t built any decks matching your filter yet — click <strong className="text-slate-200">View Collection</strong> on their card above to browse their card inventory!
                </div>
              ) : null
            ) : (
              <div className="p-10 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-3">
                <div className="text-sm font-bold text-slate-200">
                  No matching community decks found.
                </div>
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedDecks.map(deck => {
                const authorStyle = AVATAR_COLOR_MAP[deck.author_avatar_color || 'amber'] || AVATAR_COLOR_MAP.amber;
                return (
                  <div
                    key={deck.id}
                    className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden flex flex-col justify-between hover:border-amber-500/50 transition group"
                  >
                    <div>
                      {/* Deck Cover Banner */}
                      <div
                        onClick={() => handleInspectDeck(deck.id)}
                        className="h-36 bg-slate-950 bg-cover bg-center relative cursor-pointer"
                        style={deck.cover_image ? { backgroundImage: `url(${deck.cover_image})` } : undefined}
                      >
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/55 to-transparent" />
                        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-md bg-slate-950/90 border border-slate-700 text-[10px] font-bold uppercase text-amber-300">
                            {deck.format}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-950/90 border border-slate-700 text-[10px] font-mono text-slate-300">
                            {deck.total_cards} cards
                          </span>
                        </div>
                        <div className="absolute top-2.5 right-2.5">
                          <span
                            className="px-2 py-0.5 rounded-md bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold"
                            title={`You own ${deck.viewer_owned_cards} of ${deck.total_cards} cards in this deck`}
                          >
                            You own {deck.viewer_owned_pct}%
                          </span>
                        </div>

                        <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-black text-base text-slate-100 group-hover:text-amber-300 transition truncate">
                              {deck.name}
                            </h3>
                            {deck.commander_name && (
                              <div className="text-[11px] text-amber-300/90 font-semibold truncate">
                                👑 {deck.commander_name}
                              </div>
                            )}
                          </div>
                          <ColorIdentityBadges colors={deck.color_identity} size="sm" />
                        </div>
                      </div>

                      {/* Creator Row & Follow Toggle */}
                      <div className="p-3.5 flex items-center justify-between gap-2 border-b border-slate-800/80">
                        <button
                          type="button"
                          onClick={() => handleInspectPlayer(deck.author_id)}
                          className="flex items-center gap-2 min-w-0 cursor-pointer group/author"
                          title={`View ${deck.author_name}'s cards & decks`}
                        >
                          <span
                            className={`w-6 h-6 rounded-lg border ${authorStyle.bg} ${authorStyle.border} ${authorStyle.text} flex items-center justify-center font-black text-[10px] shrink-0`}
                          >
                            {deck.author_name.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="text-xs font-bold text-slate-200 group-hover/author:text-amber-300 truncate">
                            {deck.author_name}
                          </span>
                        </button>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-xs text-sky-400 font-bold">
                            {formatUsd(deck.total_tcg)}
                          </span>
                          {!deck.is_own_deck && (
                            <button
                              type="button"
                              onClick={() => handleToggleFollow(deck.author_id, deck.is_following_author)}
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                                deck.is_following_author
                                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                  : 'bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-300'
                              }`}
                            >
                              {deck.is_following_author ? '✓ Following' : '+ Follow'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons: View Decklist & 1-Click Copy to My Vault */}
                    <div className="p-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleInspectDeck(deck.id)}
                        className="py-2 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-sky-400" />
                        <span>View Deck</span>
                      </button>

                      <button
                        type="button"
                        disabled={cloningDeckId === deck.id}
                        onClick={() => handleCloneDeck(deck.id, deck.name, deck.author_name)}
                        className="py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        title="Copy this decklist into your own Decks so you can modify it freely"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{cloningDeckId === deck.id ? 'Copying...' : 'Copy Deck'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
