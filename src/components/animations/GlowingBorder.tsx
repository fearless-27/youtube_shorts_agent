import { type ReactNode } from 'react';

interface GlowingBorderProps {
  children: ReactNode;
  className?: string;
  borderWidth?: number;
  colors?: string[];
  animated?: boolean;
  rounded?: string;
}

export default function GlowingBorder({
  children,
  className = '',
  borderWidth = 1,
  colors = ['#00F0FF', '#A855F7', '#EC4899', '#00F0FF'],
  animated = true,
  rounded = 'rounded-lg',
}: GlowingBorderProps) {
  const gradient = `conic-gradient(from var(--angle, 0deg), ${colors.join(', ')})`;

  return (
    <div
      className={`relative ${rounded} ${className}`}
      style={{
        padding: borderWidth,
        // @ts-expect-error CSS custom property
        '--angle': '0deg',
        animation: animated ? 'glowing-rotate 4s linear infinite' : 'none',
      }}
    >
      {/* Rotating gradient border */}
      <div
        className={`absolute inset-0 ${rounded}`}
        style={{
          background: gradient,
          opacity: 0.6,
          animation: animated ? 'spin-slow 6s linear infinite' : 'none',
        }}
      />

      {/* Glow effect */}
      <div
        className={`absolute inset-0 ${rounded}`}
        style={{
          background: gradient,
          opacity: 0.15,
          filter: 'blur(12px)',
          animation: animated ? 'spin-slow 6s linear infinite' : 'none',
        }}
      />

      {/* Inner content */}
      <div className={`relative ${rounded} bg-[#0A0A0C]`} style={{ zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}
