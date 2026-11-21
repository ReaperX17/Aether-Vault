import React from 'react';

const COLOR_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  W: { bg: 'bg-amber-100', text: 'text-amber-950', border: 'border-amber-300', label: 'White' },
  U: { bg: 'bg-sky-500', text: 'text-white', border: 'border-sky-300', label: 'Blue' },
  B: { bg: 'bg-zinc-800', text: 'text-zinc-100', border: 'border-zinc-500', label: 'Black' },
  R: { bg: 'bg-rose-600', text: 'text-white', border: 'border-rose-400', label: 'Red' },
  G: { bg: 'bg-emerald-600', text: 'text-white', border: 'border-emerald-400', label: 'Green' },
  C: { bg: 'bg-slate-400', text: 'text-slate-950', border: 'border-slate-300', label: 'Colorless' }
};

export const ManaSymbol: React.FC<{ symbol: string; size?: 'sm' | 'md' }> = ({ symbol, size = 'sm' }) => {
  const clean = symbol.replace(/[{}]/g, '').toUpperCase();
  const dim = size === 'sm' ? 'w-5 h-5 text-[11px]' : 'w-6 h-6 text-xs';

  if (COLOR_STYLES[clean]) {
    const st = COLOR_STYLES[clean];
    return (
      <span
        title={st.label}
        className={`inline-flex items-center justify-center rounded-full font-bold border shadow-xs select-none ${dim} ${st.bg} ${st.text} ${st.border}`}
      >
        {clean}
      </span>
    );
  }

  // Hybrid mana like G/U or 2/W
  if (clean.includes('/')) {
    const parts = clean.split('/');
    const st = COLOR_STYLES[parts[1]] || COLOR_STYLES[parts[0]] || {
      bg: 'bg-amber-500/80',
      text: 'text-slate-950',
      border: 'border-amber-300'
    };
    return (
      <span
        title={clean}
        className={`inline-flex items-center justify-center rounded-full font-bold border shadow-xs select-none px-1 h-5 text-[10px] ${st.bg} ${st.text} ${st.border}`}
      >
        {clean}
      </span>
    );
  }

  // Generic mana or X
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-mono font-bold bg-slate-700 text-slate-100 border border-slate-500 shadow-xs select-none ${dim}`}
    >
      {clean}
    </span>
  );
};

export const ManaCost: React.FC<{ cost?: string | null; size?: 'sm' | 'md' }> = ({ cost, size = 'sm' }) => {
  if (!cost) return null;
  const matches = cost.match(/\{[^}]+\}/g);
  if (!matches || matches.length === 0) return null;

  return (
    <div className="inline-flex items-center gap-0.5 flex-wrap">
      {matches.map((sym, idx) => (
        <ManaSymbol key={idx} symbol={sym} size={size} />
      ))}
    </div>
  );
};

export const ColorIdentityBadges: React.FC<{ colors?: string[]; size?: 'sm' | 'md' }> = ({ colors = [], size = 'sm' }) => {
  if (!colors || colors.length === 0) {
    return <ManaSymbol symbol="C" size={size} />;
  }
  const order = ['W', 'U', 'B', 'R', 'G'];
  const sorted = [...colors].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return (
    <div className="inline-flex items-center gap-1">
      {sorted.map(c => (
        <ManaSymbol key={c} symbol={c} size={size} />
      ))}
    </div>
  );
};
