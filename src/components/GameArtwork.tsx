import { useState } from 'react';
import { Gamepad2 } from 'lucide-react';

interface GameArtworkProps {
  src: string;
  alt: string;
  title: string;
  accentHex?: string;
  className?: string;
}

export function GameArtwork({ src, alt, title, accentHex = '#10B981', className = '' }: GameArtworkProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !src) {
    return (
      <div
        className={`relative flex flex-col items-center justify-center overflow-hidden bg-[#141923] ${className}`}
        style={{
          backgroundImage: `radial-gradient(circle at 25% 20%, ${accentHex}28, transparent 55%), linear-gradient(135deg, #141923 0%, #0B0D12 100%)`,
        }}
        role="img"
        aria-label={alt}
      >
        <Gamepad2 className="h-9 w-9 text-slate-500 mb-2" aria-hidden="true" />
        <span className="text-xs font-medium text-slate-400 px-4 text-center truncate max-w-full">{title}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
      loading="lazy"
    />
  );
}
