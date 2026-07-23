import { useRef, type ReactNode, type MouseEvent } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
  borderColor?: string;
}

export default function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'rgba(0, 240, 255, 0.08)',
  borderColor = 'rgba(255, 255, 255, 0.08)',
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springX = useSpring(mouseX, { stiffness: 200, damping: 30 });
  const springY = useSpring(mouseY, { stiffness: 200, damping: 30 });

  const handleMouseMove = (e: MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  };

  return (
    <motion.div
      ref={ref}
      className={`relative overflow-hidden ${className}`}
      onMouseMove={handleMouseMove}
      style={{ border: `1px solid ${borderColor}` }}
      whileHover={{
        borderColor: 'rgba(0, 240, 255, 0.15)',
        transition: { duration: 0.3 },
      }}
    >
      {/* Spotlight gradient */}
      <motion.div
        className="pointer-events-none absolute -inset-px z-0"
        style={{
          background: `radial-gradient(350px circle at ${springX.get()}px ${springY.get()}px, ${spotlightColor}, transparent 60%)`,
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
        }}
      />

      {/* Inner glow on border */}
      <motion.div
        className="pointer-events-none absolute inset-0 z-0 rounded-[inherit]"
        style={{
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
        }}
      />

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
