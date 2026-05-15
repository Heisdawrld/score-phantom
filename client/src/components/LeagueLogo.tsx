import React, { useState } from 'react';
import { Shield } from 'lucide-react';
import { cn } from '../lib/utils';

interface LeagueLogoProps {
  leagueId?: string | number | null;
  src?: string | null;
  alt?: string;
  name?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * LeagueLogo — Displays a league badge/shield from the BSD image proxy.
 *
 * URL pattern: https://sports.bzzoiro.com/img/league/{league_id}/
 * This is a public endpoint (no auth required), returns PNG/WebP,
 * cached for 1 year.
 */
export function LeagueLogo({ leagueId, src, alt, name, className, size = 'sm' }: LeagueLogoProps) {
  const [error, setError] = useState(false);

  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-7 h-7',
    lg: 'w-9 h-9',
  };

  const baseClasses = cn(
    'rounded object-contain bg-white/5 shrink-0 transition-opacity duration-300',
    sizeClasses[size],
    className
  );

  // Priority: explicit src > leagueId-based URL > fallback
  const effectiveSrc = src && src.trim() ? src : null;
  const finalSrc = effectiveSrc || (leagueId ? `https://sports.bzzoiro.com/img/league/${leagueId}/` : null);
  const finalAlt = alt || name || "League Badge";

  if (!finalSrc || error) {
    return (
      <div className={cn(baseClasses, 'flex items-center justify-center')}>
        <Shield className="w-3/4 h-3/4 text-white/15" />
      </div>
    );
  }

  return (
    <img
      src={finalSrc}
      alt={finalAlt}
      loading="lazy"
      decoding="async"
      onError={() => setError(true)}
      className={baseClasses}
    />
  );
}
