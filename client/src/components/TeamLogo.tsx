import React, { useState } from 'react';
import { Shield } from 'lucide-react';
import { cn } from '../lib/utils';

interface TeamLogoProps {
  src: string | undefined | null;
  alt: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function TeamLogo({ src, alt, className, size = 'md' }: TeamLogoProps) {
  const [error, setError] = useState(false);

  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
    xl: 'w-12 h-12'
  };

  const baseClasses = cn(
    'rounded-full object-contain bg-white/5 shrink-0 transition-opacity duration-300',
    sizeClasses[size],
    className
  );

  if (!src || error) {
    return (
      <div className={cn(baseClasses, 'flex items-center justify-center border border-white/10')}>
        <Shield className="w-1/2 h-1/2 text-white/20" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setError(true)}
      className={baseClasses}
    />
  );
}
