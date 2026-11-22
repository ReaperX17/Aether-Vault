import React from 'react';

interface AetherVaultLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTagline?: boolean;
  hideTaglineOnSmallScreens?: boolean;
  stacked?: boolean;
  iconOnly?: boolean;
  className?: string;
}

export const AetherVaultIconMark: React.FC<{ className?: string }> = ({ className = 'w-10 h-10' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 128 128"
    fill="none"
    className={`shrink-0 select-none ${className}`}
    aria-label="AetherVault Emblem"
  >
    <defs>
      <linearGradient id="av-logo-bg" x1="12" y1="8" x2="116" y2="120" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#0f172a" />
        <stop offset="50%" stopColor="#020617" />
        <stop offset="100%" stopColor="#1e1b4b" />
      </linearGradient>
      <linearGradient id="av-logo-gold" x1="16" y1="12" x2="112" y2="116" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#fde68a" />
        <stop offset="45%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#b45309" />
      </linearGradient>
      <linearGradient id="av-logo-aether" x1="36" y1="24" x2="92" y2="96" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#38bdf8" />
        <stop offset="100%" stopColor="#6366f1" />
      </linearGradient>
      <linearGradient id="av-logo-card" x1="26" y1="30" x2="64" y2="88" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#1e293b" />
        <stop offset="100%" stopColor="#0f172a" />
      </linearGradient>
    </defs>

    {/* Outer Arcane Vault Shield */}
    <path
      d="M64 6L114 28V70C114 98 92 115 64 122C36 115 14 98 14 70V28L64 6Z"
      fill="url(#av-logo-bg)"
      stroke="url(#av-logo-gold)"
      strokeWidth="6"
      strokeLinejoin="round"
    />

    {/* Inner Vault Engraving Ring */}
    <path
      d="M64 14L106 33V69C106 92 87 107 64 113C41 107 22 92 22 69V33L64 14Z"
      stroke="#38bdf8"
      strokeOpacity="0.35"
      strokeWidth="2"
      strokeLinejoin="round"
    />

    {/* Left Fanned MTG Card */}
    <g transform="rotate(-14 50 60)">
      <rect
        x="32"
        y="30"
        width="36"
        height="50"
        rx="5"
        fill="url(#av-logo-card)"
        stroke="#38bdf8"
        strokeWidth="2.5"
      />
      <rect x="37" y="36" width="26" height="18" rx="2" fill="#38bdf8" fillOpacity="0.25" />
    </g>

    {/* Right Fanned MTG Card */}
    <g transform="rotate(14 78 60)">
      <rect
        x="60"
        y="30"
        width="36"
        height="50"
        rx="5"
        fill="url(#av-logo-card)"
        stroke="#a855f7"
        strokeWidth="2.5"
      />
      <rect x="65" y="36" width="26" height="18" rx="2" fill="#a855f7" fillOpacity="0.25" />
    </g>

    {/* Center Hero Commander Card in Gold Vault Frame */}
    <rect
      x="44"
      y="24"
      width="40"
      height="56"
      rx="6"
      fill="#090d16"
      stroke="url(#av-logo-gold)"
      strokeWidth="3.5"
    />
    <rect
      x="49"
      y="30"
      width="30"
      height="23"
      rx="3"
      fill="url(#av-logo-aether)"
      fillOpacity="0.28"
      stroke="#fbbf24"
      strokeOpacity="0.5"
      strokeWidth="1.5"
    />

    {/* Arcane Aether Compass Star */}
    <path
      d="M64 33L67.5 41.5L76 45L67.5 48.5L64 57L60.5 48.5L52 45L60.5 41.5L64 33Z"
      fill="#fde68a"
    />
    <circle cx="64" cy="45" r="3" fill="#38bdf8" />

    {/* Card Text Lines */}
    <line x1="51" y1="61" x2="77" y2="61" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="55" y1="68" x2="73" y2="68" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" />

    {/* WUBRG 5 Mana Jewels Along the Vault Arch */}
    <circle cx="40" cy="96" r="4.5" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1.5" />
    <circle cx="52" cy="101" r="4.5" fill="#38bdf8" stroke="#0284c7" strokeWidth="1.5" />
    <circle cx="64" cy="103" r="4.5" fill="#a855f7" stroke="#e2e8f0" strokeWidth="1.5" />
    <circle cx="76" cy="101" r="4.5" fill="#f43f5e" stroke="#f59e0b" strokeWidth="1.5" />
    <circle cx="88" cy="96" r="4.5" fill="#10b981" stroke="#a7f3d0" strokeWidth="1.5" />
  </svg>
);

export const AetherVaultLogo: React.FC<AetherVaultLogoProps> = ({
  size = 'md',
  showTagline = true,
  hideTaglineOnSmallScreens = false,
  stacked = false,
  iconOnly = false,
  className = ''
}) => {
  const iconDimensions =
    size === 'sm'
      ? 'w-8 h-8 sm:w-9 sm:h-9'
      : size === 'lg'
        ? 'w-12 h-12 sm:w-14 sm:h-14'
        : size === 'xl'
          ? 'w-16 h-16 sm:w-20 sm:h-20'
          : 'w-9 h-9 sm:w-11 sm:h-11';

  const titleClasses =
    size === 'sm'
      ? 'text-sm sm:text-base'
      : size === 'lg'
        ? 'text-xl sm:text-2xl'
        : size === 'xl'
          ? 'text-2xl sm:text-4xl'
          : 'text-base sm:text-lg';

  const taglineClasses =
    size === 'sm'
      ? 'text-[8px] sm:text-[9px]'
      : size === 'lg'
        ? 'text-[10px] sm:text-xs'
        : size === 'xl'
          ? 'text-xs sm:text-sm'
          : 'text-[9px] sm:text-[10px]';

  return (
    <div
      className={`inline-flex ${
        stacked ? 'flex-col items-center text-center gap-2.5' : 'items-center gap-2.5 sm:gap-3'
      } select-none group ${className}`}
    >
      <div className="relative flex items-center justify-center shrink-0">
        <div className="absolute -inset-1 rounded-2xl bg-gradient-to-tr from-amber-500/20 via-sky-500/15 to-violet-500/20 blur-md opacity-75 group-hover:opacity-100 transition" />
        <AetherVaultIconMark className={`relative ${iconDimensions} drop-shadow-md`} />
      </div>

      {!iconOnly && (
        <div className={`flex flex-col justify-center ${stacked ? 'items-center' : 'items-start'} leading-none`}>
          <div
            className={`font-black tracking-wider uppercase ${titleClasses} flex items-center whitespace-nowrap`}
            style={{ fontFamily: "'Cinzel', Georgia, serif" }}
          >
            <span className="text-slate-100 group-hover:text-white transition">AETHER</span>
            <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 bg-clip-text text-transparent">
              VAULT
            </span>
          </div>
          {showTagline && (
            <span
              className={`font-bold uppercase tracking-[0.12em] text-sky-400/90 mt-1 whitespace-nowrap ${taglineClasses} ${
                hideTaglineOnSmallScreens ? 'hidden xl:inline-block' : ''
              }`}
            >
              MTG Collection &amp; Deck Architect
            </span>
          )}
        </div>
      )}
    </div>
  );
};
