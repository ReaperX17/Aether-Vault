import React from 'react';
import {
  Layers,
  FolderOpen,
  Trophy,
  Globe,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  DollarSign,
  Smartphone,
  Copy,
  RefreshCw
} from 'lucide-react';
import { AetherVaultLogo } from './AetherVaultLogo';

interface WhyAetherVaultViewProps {
  isAuthenticated: boolean;
  onExploreCommunity: () => void;
  onOpenAuthModal: (mode: 'login' | 'register') => void;
  onGoToDashboard: () => void;
}

const DIFFERENCE_PILLARS = [
  {
    icon: Layers,
    accent: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
    badge: 'Unified Workflow',
    title: 'True Binder-to-Deck Allocation Tracking',
    description:
      'Instead of keeping your collection in one app and your decklists in another, AetherVault links every deck directly to your physical binders. You can see at a glance which copies are Available vs. In Decks, and pasted decklists automatically match the printings you already own.'
  },
  {
    icon: FolderOpen,
    accent: 'text-sky-400 bg-sky-500/15 border-sky-500/30',
    badge: 'Zero Tab-Switching',
    title: 'Build Decks While Browsing Your Collection',
    description:
      'Pin any target deck while flipping through your collection to add cards in one click—or promote any Legendary Creature or Background directly to Commander of a brand-new deck without leaving your binder.'
  },
  {
    icon: Trophy,
    accent: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
    badge: 'Rule-0 Ready',
    title: 'Commander Bracket (1–5) & Community Salt Engine',
    description:
      'Automatically scans your 100-card list for Game Changers, Fast Mana, 2-Card Infinite Combos, Extra Turns, and Mass Land Denial based on WotC Commander Bracket guidelines—complete with a 0–100 Salt Score thermometer and tips to tune your deck up or down a bracket.'
  },
  {
    icon: DollarSign,
    accent: 'text-violet-400 bg-violet-500/15 border-violet-500/30',
    badge: 'Dual Pricing',
    title: 'Side-by-Side TCGplayer & Card Kingdom Valuation',
    description:
      'View real-time TCGplayer Market and Card Kingdom Retail & Buylist prices on every card, binder, and deck. Missing cards automatically populate an instant Buy List with 1-click "Mark Bought → Send to Binder".'
  },
  {
    icon: Globe,
    accent: 'text-rose-400 bg-rose-500/15 border-rose-500/30',
    badge: 'Community Discovery',
    title: 'Explore Any Builder’s Decks & Instant Vault Match %',
    description:
      'Search any player’s decks across AetherVault—even if you don’t follow them—inspect their read-only card library, see what percentage of their deck you already own in your vault, and copy any decklist in 1 click to customize for your play style.'
  },
  {
    icon: Smartphone,
    accent: 'text-orange-400 bg-orange-500/15 border-orange-500/30',
    badge: 'Built for Game Night',
    title: 'Archidekt-Style Section Inspector & Mobile Binder Grid',
    description:
      'Click any card for a high-resolution blown-up view with a Transform / Double-Faced card flip toggle and section-by-section navigation (Commanders → Creatures → Instants → Lands), optimized for both desktop monitors and a 2-column phone binder view.'
  }
];

const COMPARISON_ROWS = [
  {
    feature: 'Tracks physical binder locations & exact owned printings',
    aethervault: 'Built-in with Available vs. In-Deck allocation',
    traditionalDeckbuilders: 'Separate or unlinked collection list',
    spreadsheets: 'Manual data entry'
  },
  {
    feature: 'Add cards to decks & start new Commanders directly from your binder',
    aethervault: '1-click sticky target-deck bar & Commander buttons',
    traditionalDeckbuilders: 'Requires opening deck editor separately',
    spreadsheets: 'Not available'
  },
  {
    feature: 'Automated Commander Bracket (1–5) & 2-Card Infinite Combo scanner',
    aethervault: 'Automatic with Game Changers, Fast Mana & tuning tips',
    traditionalDeckbuilders: 'Manual bracket tagging on most platforms',
    spreadsheets: 'Not available'
  },
  {
    feature: 'Community Salt Score thermometer & top-salty-card breakdown',
    aethervault: 'Built into every deck & blown-up card view',
    traditionalDeckbuilders: 'Limited or external lookup required',
    spreadsheets: 'Not available'
  },
  {
    feature: 'See "% of this deck you already own" on other users’ community decks',
    aethervault: 'Instant live match against your personal vault',
    traditionalDeckbuilders: 'Rarely cross-checked with your physical binders',
    spreadsheets: 'Not available'
  },
  {
    feature: '1-click Copy / Clone any community deck with owned-printing matching',
    aethervault: 'Clones deck & auto-matches your owned printings',
    traditionalDeckbuilders: 'Copies generic default printings',
    spreadsheets: 'Manual copy/paste'
  },
  {
    feature: 'Dual TCGplayer Market + Card Kingdom Retail & Buylist valuation',
    aethervault: 'Side-by-side on every card, binder & buy list',
    traditionalDeckbuilders: 'Usually single-vendor price display',
    spreadsheets: 'Static / outdated prices'
  },
  {
    feature: '1-click full offline Vault JSON/CSV backup & restore',
    aethervault: 'Instant portable backup anytime',
    traditionalDeckbuilders: 'Per-deck export only on many tools',
    spreadsheets: 'Manual file management'
  }
];

export const WhyAetherVaultView: React.FC<WhyAetherVaultViewProps> = ({
  isAuthenticated,
  onExploreCommunity,
  onOpenAuthModal,
  onGoToDashboard
}) => {
  return (
    <div className="space-y-8 pb-8">
      {/* Hero Banner */}
      <div className="relative rounded-3xl overflow-hidden border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950/60 p-6 sm:p-10 shadow-2xl">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />

        <div className="relative max-w-4xl mx-auto text-center space-y-6">
          <div className="flex justify-center">
            <AetherVaultLogo size="xl" showTagline />
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>The All-in-One Magic: The Gathering Collection &amp; Commander Deck Platform</span>
          </div>

          <h1 className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight text-slate-100 leading-tight">
            Your Binders and Your Decks—
            <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-sky-400 bg-clip-text text-transparent">
              {' '}Connected in One Living Vault.
            </span>
          </h1>

          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Most tools force you to choose between a collection tracker and a visual deckbuilder.{' '}
            <strong className="text-white">AetherVault</strong> brings them together so every deck you build, inspect, or copy from the community automatically knows which cards are sitting in your binders.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={onExploreCommunity}
              className="px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 transition cursor-pointer"
            >
              <Globe className="w-4 h-4" />
              <span>Explore Live Community Decks</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {isAuthenticated ? (
              <button
                type="button"
                onClick={onGoToDashboard}
                className="px-6 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-100 font-bold text-sm flex items-center gap-2 transition cursor-pointer"
              >
                <Layers className="w-4 h-4 text-sky-400" />
                <span>Open My Vault Dashboard</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onOpenAuthModal('register')}
                  className="px-6 py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-sm flex items-center gap-2 shadow-lg shadow-sky-500/15 transition cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Create Free Personal Vault</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuthModal('login')}
                  className="px-5 py-3.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-sm transition cursor-pointer"
                >
                  Sign In
                </button>
              </>
            )}
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              100% Free to Explore &amp; Build
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              Private &amp; Isolated Personal Libraries
            </span>
            <span className="flex items-center gap-1.5">
              <Copy className="w-4 h-4 text-amber-400" />
              1-Click Community Deck Cloning
            </span>
          </div>
        </div>
      </div>

      {/* Section 1: The AetherVault Difference (6 Core Pillars) */}
      <div className="space-y-4">
        <div className="text-center max-w-2xl mx-auto space-y-1.5">
          <div className="text-xs font-extrabold uppercase tracking-widest text-amber-400">
            The AetherVault Difference
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-100">
            Designed Around How Paper Magic Players Actually Build
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Everything you need to organize binders, evaluate power levels for Rule 0 conversations, and share or remix decks with friends.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {DIFFERENCE_PILLARS.map((pillar, idx) => {
            const Icon = pillar.icon;
            return (
              <div
                key={idx}
                className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 transition flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${pillar.accent}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                      {pillar.badge}
                    </span>
                  </div>

                  <h3 className="text-base font-black text-slate-100">{pillar.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{pillar.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: How AetherVault Compares (Factual Comparison Table) */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-extrabold uppercase tracking-wider text-sky-400">
              Side-by-Side Overview
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-100 mt-0.5">
              How AetherVault Compares
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              A look at how AetherVault bridges the gap between standalone deckbuilders and collection spreadsheets.
            </p>
          </div>

          <button
            type="button"
            onClick={onExploreCommunity}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Try the Deck Explorer Live</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/90 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                <th className="py-3.5 px-4 font-bold">Capability / Workflow</th>
                <th className="py-3.5 px-4 font-black text-amber-300 bg-amber-500/5 border-x border-amber-500/20">
                  ✨ AetherVault
                </th>
                <th className="py-3.5 px-4 font-bold">Standard Deckbuilders</th>
                <th className="py-3.5 px-4 font-bold">Binder / CSV Spreadsheets</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {COMPARISON_ROWS.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-950/40 transition">
                  <td className="py-3.5 px-4 font-bold text-slate-200">{row.feature}</td>
                  <td className="py-3.5 px-4 font-semibold text-emerald-300 bg-amber-500/5 border-x border-amber-500/15">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{row.aethervault}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-slate-400">{row.traditionalDeckbuilders}</td>
                  <td className="py-3.5 px-4 text-slate-500">{row.spreadsheets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Call-to-Action Banner */}
      <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/30 border border-amber-500/30 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center md:text-left">
          <h3 className="text-lg font-black text-slate-100">
            Ready to Explore or Start Your Own Vault?
          </h3>
          <p className="text-xs text-slate-300 max-w-xl">
            Browse real community Commander decks and player collections right now without logging in, or create a free account in seconds to import your cards and start building.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onExploreCommunity}
            className="px-5 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-100 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5 text-amber-400" />
            <span>Browse Community Decks</span>
          </button>

          {!isAuthenticated && (
            <button
              type="button"
              onClick={() => onOpenAuthModal('register')}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Create My Free Vault</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
