import React, { useState } from 'react';
import {
  TrendingUp,
  RefreshCw,
  FolderOpen,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Database,
  DollarSign,
  Plus,
  Upload,
  Trash2,
  Clock
} from 'lucide-react';
import { DashboardData, DeckSummary } from '../types';
import { DualPriceBadge, formatUsd } from './PriceBadge';
import { ColorIdentityBadges, ManaCost } from './ManaCost';
import { CardZoomModal, ZoomableCard } from './CardZoomModal';

interface DashboardViewProps {
  data: DashboardData | null;
  decks: DeckSummary[];
  onNavigateInventory: (locationFilter?: string) => void;
  onSelectDeck: (deckId: number) => void;
  onDeleteBinder: (location: string) => Promise<void>;
  onDeleteDeck: (deckId: number) => Promise<void>;
  onOpenSearchModal: () => void;
  onOpenImportModal: () => void;
  onRefreshAll: () => Promise<void>;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  data,
  decks,
  onNavigateInventory,
  onSelectDeck,
  onDeleteBinder,
  onDeleteDeck,
  onOpenSearchModal,
  onOpenImportModal,
  onRefreshAll
}) => {
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [zoomedCard, setZoomedCard] = useState<ZoomableCard | null>(null);
  const [zoomedCardList, setZoomedCardList] = useState<ZoomableCard[]>([]);
  const [syncingCk, setSyncingCk] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  if (!data) {
    return (
      <div className="p-8 text-center text-slate-400">
        Loading collection analytics...
      </div>
    );
  }

  const { summary, topCards, recentCards = [], locations, byRarity, syncMeta } = data;
  const recentTotalQty = recentCards.reduce((s, c) => s + Number(c.quantity || 1), 0);
  const recentTotalTcg = Math.round(recentCards.reduce((s, c) => s + Number(c.total_tcg || 0), 0) * 100) / 100;
  const recentTotalCk = Math.round(recentCards.reduce((s, c) => s + Number(c.total_ck_retail || 0), 0) * 100) / 100;

  async function handleRefreshPrices() {
    setRefreshingPrices(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/prices/refresh', { method: 'POST' });
      const json = await res.json();
      await onRefreshAll();
      setSyncMessage(`Updated live TCGplayer & Card Kingdom prices for ${json.updatedCount || 0} unique printings.`);
    } catch (e: any) {
      setSyncMessage(`Price refresh note: ${e.message || 'Using cached prices'}`);
    } finally {
      setRefreshingPrices(false);
    }
  }

  async function handleSyncCardKingdom() {
    setSyncingCk(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/prices/sync-cardkingdom', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to sync Card Kingdom API');
      await onRefreshAll();
      setSyncMessage(`Synced ${Number(json.syncedRecords || 0).toLocaleString()} Card Kingdom Retail & Buylist prices!`);
    } catch (e: any) {
      setSyncMessage(`Card Kingdom sync note: ${e.message}`);
    } finally {
      setSyncingCk(false);
    }
  }

  const netGainTcg = summary.totalCostBasis > 0 ? summary.totalTcg - summary.totalCostBasis : null;

  return (
    <div className="space-y-6">
      {/* Top Action & Sync Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/30 border border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            Dashboard
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={onOpenSearchModal}
            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Cards
          </button>

          <button
            onClick={onOpenImportModal}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <Upload className="w-4 h-4 text-amber-400" />
            Import CSV / List
          </button>

          <button
            onClick={handleRefreshPrices}
            disabled={refreshingPrices}
            className="px-3.5 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshingPrices ? 'animate-spin' : ''}`} />
            {refreshingPrices ? 'Refreshing...' : 'Refresh Prices'}
          </button>

          <button
            onClick={handleSyncCardKingdom}
            disabled={syncingCk}
            title="Downloads Card Kingdom's official API v2 Pricelist into your local SQLite database"
            className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <Database className={`w-3.5 h-3.5 ${syncingCk ? 'animate-bounce' : ''}`} />
            {syncingCk ? 'Syncing CK API...' : 'Sync Card Kingdom DB'}
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className="px-4 py-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center justify-between">
          <span>{syncMessage}</span>
          <button onClick={() => setSyncMessage(null)} className="text-emerald-400 hover:underline ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* 4 Valuation Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-sky-500/25 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-400">
              TCGplayer Market Value
            </span>
            <div className="p-2 rounded-lg bg-sky-500/15 text-sky-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold font-mono text-slate-100">
              {formatUsd(summary.totalTcg)}
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center justify-between">
              <span>{summary.totalCards} total cards ({summary.uniqueEntries} lots)</span>
              {netGainTcg !== null && (
                <span className={netGainTcg >= 0 ? 'text-emerald-400 font-mono' : 'text-rose-400 font-mono'}>
                  {netGainTcg >= 0 ? '+' : ''}{formatUsd(netGainTcg)} vs cost
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/90 border border-amber-500/25 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
              Card Kingdom Retail
            </span>
            <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold font-mono text-slate-100">
              {formatUsd(summary.totalCkRetail)}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Replacement retail value on Card Kingdom
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/90 border border-emerald-500/25 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Card Kingdom Buylist
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold font-mono text-slate-100">
              {formatUsd(summary.totalCkBuylist)}
            </div>
            <div className="text-xs text-emerald-300/80 mt-1 font-mono">
              Est. Store Credit (+30%): {formatUsd(summary.totalCkBuylist * 1.3)}
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Rarity Breakdown
            </span>
            <div className="p-2 rounded-lg bg-slate-800 text-amber-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
            <div className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 flex justify-between">
              <span className="text-orange-400 font-semibold">Mythic</span>
              <span className="font-mono text-slate-100">{byRarity.mythic || 0}</span>
            </div>
            <div className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 flex justify-between">
              <span className="text-amber-300 font-semibold">Rare</span>
              <span className="font-mono text-slate-100">{byRarity.rare || 0}</span>
            </div>
            <div className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 flex justify-between">
              <span className="text-slate-300 font-semibold">Uncommon</span>
              <span className="font-mono text-slate-100">{byRarity.uncommon || 0}</span>
            </div>
            <div className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 flex justify-between">
              <span className="text-slate-400 font-semibold">Common</span>
              <span className="font-mono text-slate-100">{byRarity.common || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Two-Column Grid: Decks Readiness + Binders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Decks & "Can I Build This?" Status */}
        <div className="lg:col-span-2 rounded-2xl bg-slate-900/90 border border-slate-800 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  Decks
                </h2>
              </div>
            </div>

            <div className="space-y-3">
              {decks.map(deck => (
                <div
                  key={deck.id}
                  onClick={() => onSelectDeck(deck.id)}
                  className="group cursor-pointer rounded-xl bg-slate-950/80 border border-slate-800 hover:border-amber-500/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition"
                >
                  <div className="flex items-center gap-3.5">
                    {deck.cover_image ? (
                      <img
                        src={deck.cover_image}
                        alt={deck.name}
                        className="w-16 h-12 object-cover rounded-lg border border-slate-700 shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-12 rounded-lg bg-slate-800 flex items-center justify-center text-xs text-slate-500">
                        MTG
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-100 group-hover:text-amber-300 transition">
                          {deck.name}
                        </h3>
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] font-bold uppercase text-amber-300 border border-slate-700">
                          {deck.format}
                        </span>
                        <ColorIdentityBadges colors={deck.color_identity} size="sm" />
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                        <span>
                          {deck.counts.activeTotal}/{deck.counts.targetTotal} cards
                        </span>
                        <span>•</span>
                        <span className="text-sky-400 font-mono">
                          TCG: {formatUsd(deck.valuation.tcg)}
                        </span>
                        <span>•</span>
                        <span className="text-amber-400 font-mono">
                          CK: {formatUsd(deck.valuation.ckRetail)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:items-end gap-1.5 min-w-[200px]">
                    <div className="flex items-center gap-2 text-xs">
                      {deck.ownership.totalMissing === 0 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-4 h-4" />
                          100% Owned — Ready to Play!
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-300 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                          {deck.ownership.completionPct}% Owned ({deck.ownership.totalMissing} missing)
                        </span>
                      )}
                    </div>

                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          deck.ownership.totalMissing === 0 ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${deck.ownership.completionPct}%` }}
                      />
                    </div>

                    {deck.ownership.totalMissing > 0 && (
                      <div className="text-[11px] text-slate-400 font-mono">
                        Cost to complete: <span className="text-sky-300">{formatUsd(deck.ownership.missingCostTcg)} TCG</span> / <span className="text-amber-300">{formatUsd(deck.ownership.missingCostCkRetail)} CK</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onDeleteDeck(deck.id);
                      }}
                      className="mt-1 px-2 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                      title="Delete Deck"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete Deck
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Binders & Storage Locations */}
        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-amber-400" />
                  Binders & Locations
                </h2>
              </div>
            </div>

            <div className="space-y-2.5">
              {locations.map(loc => (
                <div
                  key={loc.location}
                  onClick={() => onNavigateInventory(loc.location)}
                  className="cursor-pointer p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-amber-500/40 flex items-center justify-between gap-2 transition group"
                >
                  <div>
                    <div className="font-semibold text-sm text-slate-200 group-hover:text-amber-300 flex items-center gap-1.5">
                      <span>{loc.location}</span>
                      <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition" />
                    </div>
                    <div className="text-xs text-slate-400">{loc.count} cards</div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="text-right font-mono text-xs">
                      <div className="text-sky-300 font-bold">{formatUsd(loc.valueTcg)} TCG</div>
                      <div className="text-amber-400/90 text-[11px]">{formatUsd(loc.valueCkRetail)} CK</div>
                    </div>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onDeleteBinder(loc.location);
                      }}
                      className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 transition cursor-pointer"
                      title={`Delete all ${loc.count} cards in "${loc.location}"`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
            <span>CK Indexed Printings: {Number(syncMeta?.ckIndexedCount || 0).toLocaleString()}</span>
            <button
              onClick={() => onNavigateInventory()}
              className="text-amber-400 hover:underline font-medium"
            >
              View All Inventory →
            </button>
          </div>
        </div>
      </div>

      {/* Most Recent Activity — Latest Cards Added & Value */}
      {recentCards.length > 0 && (
        <div className="rounded-2xl bg-slate-900/90 border border-emerald-500/35 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400" />
                Recent Additions
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono flex items-center gap-3">
                <span className="text-sky-400">
                  Recent TCG Value: <strong>{formatUsd(recentTotalTcg)}</strong>
                </span>
                <span className="text-slate-700">|</span>
                <span className="text-amber-400">
                  Recent CK Value: <strong>{formatUsd(recentTotalCk)}</strong>
                </span>
              </div>

              <button
                onClick={() => onNavigateInventory()}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer"
              >
                Add More in Vault <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {recentCards.slice(0, 8).map(item => (
              <div
                key={item.id}
                onClick={() => {
                  setZoomedCardList(recentCards);
                  setZoomedCard(item);
                }}
                title="Click to see blown-up card view"
                className="rounded-xl bg-slate-950/80 border border-slate-800 p-3 flex items-center justify-between gap-2.5 hover:border-emerald-500/40 transition cursor-zoom-in"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {item.image_small && (
                    <img
                      src={item.image_small}
                      alt={item.name}
                      className="w-10 h-14 object-cover rounded border border-slate-700 shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="font-bold text-xs text-slate-100 truncate" title={item.name}>
                      {item.quantity}x {item.name}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <span className="px-1.5 py-0.2 rounded bg-slate-800 text-amber-300 font-mono text-[10px] font-bold uppercase">
                        {item.set_code} #{item.collector_number}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                          item.finish === 'foil'
                            ? 'bg-amber-500/20 text-amber-300'
                            : item.finish === 'etched'
                              ? 'bg-purple-500/20 text-purple-300'
                              : 'bg-slate-900 text-slate-400'
                        }`}
                      >
                        {item.finish === 'foil' ? '✨ Foil' : item.finish === 'etched' ? '🌟 Etched' : 'Non-Foil'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 truncate mt-0.5">
                      📁 {item.location}
                    </div>
                  </div>
                </div>

                <div className="text-right font-mono text-xs shrink-0">
                  <div className="font-bold text-sky-300">{formatUsd(item.total_tcg)}</div>
                  <div className="text-[10px] text-amber-400">CK {formatUsd(item.total_ck_retail)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Valuable Cards in Vault */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Top Value Cards
            </h2>
          </div>
          <button
            onClick={() => onNavigateInventory()}
            className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 cursor-pointer"
          >
            Open Full Vault <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {topCards.map(item => (
            <div
              key={item.id}
              onClick={() => {
                setZoomedCardList(topCards);
                setZoomedCard(item);
              }}
              title="Click to see blown-up card view"
              className="rounded-xl bg-slate-950/80 border border-slate-800 p-3 flex flex-col justify-between gap-3 hover:border-amber-500/40 transition cursor-zoom-in"
            >
              <div className="flex gap-3">
                {item.image_small && (
                  <img
                    src={item.image_small}
                    alt={item.name}
                    className="w-16 h-22 object-cover rounded-lg border border-slate-700 shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[10px] font-bold uppercase">
                      {item.set_code}
                    </span>
                    {item.finish !== 'nonfoil' && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-semibold capitalize">
                        ✨ {item.finish}
                      </span>
                    )}
                    <span className="text-[11px] font-mono text-slate-400 ml-auto">
                      {item.quantity}x ({item.condition})
                    </span>
                  </div>
                  <h3 className="font-bold text-sm text-slate-100 truncate mt-1" title={item.name}>
                    {item.name}
                  </h3>
                  <div className="mt-1">
                    <ManaCost cost={item.mana_cost} size="sm" />
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 truncate">
                    📁 {item.location}
                  </div>
                </div>
              </div>

              <DualPriceBadge card={item} finish={item.finish} quantity={1} showBuylist />
            </div>
          ))}
        </div>
      </div>

      {zoomedCard && (
        <CardZoomModal
          card={zoomedCard}
          cardsList={zoomedCardList}
          decks={decks}
          onClose={() => setZoomedCard(null)}
          onSelectCard={next => setZoomedCard(next)}
          onAddToDeck={async (c, dId, b) => {
            await fetch(`/api/decks/${dId}/cards`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                card: c,
                quantity: 1,
                board: b,
                finish: c.finish || 'nonfoil'
              })
            });
            await onRefreshAll();
          }}
          onNavigateToDeck={onSelectDeck}
        />
      )}
    </div>
  );
};
