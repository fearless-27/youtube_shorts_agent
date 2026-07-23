import { useRef, useState, type ReactNode } from 'react';
import { motion, useSpring } from 'framer-motion';

interface MagneticButtonProps {
  children: ReactNode;
  className?: string;
  strength?: number;
  onClick?: () => void;
  disabled?: boolean;
}

export default function MagneticButton({
  children,
  className = '',
  strength = 0.3,
  onClick,
  disabled = false,
}: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const x = useSpring(0, { stiffness: 300, damping: 20 });
  const y = useSpring(0, { stiffness: 300, damping: 20 });

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current || disabled) return;
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    x.set((e.clientX - centerX) * strength);
    y.set((e.clientY - centerY) * strength);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
    setIsHovered(false);
  };

  return (
    <motion.button
      ref={ref}
      className={`relative ${className}`}
      style={{ x, y }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.97 }}
    >
      {/* Glow behind */}
      <motion.div
        className="absolute inset-0 rounded-[inherit] pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(0,240,255,0.2) 0%, transparent 70%)',
          filter: 'blur(20px)',
        }}
        animate={{ opacity: isHovered ? 1 : 0, scale: isHovered ? 1.3 : 1 }}
        transition={{ duration: 0.3 }}
      />
      <span className="relative z-10">{children}</span>
    </motion.button>
  );
}
