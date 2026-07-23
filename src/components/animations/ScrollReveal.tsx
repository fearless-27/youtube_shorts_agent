import { type ReactNode } from 'react';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  direction?: 'up' | 'down' | 'left' | 'right' | 'scale' | 'none';
  delay?: number;
  duration?: number;
  once?: boolean;
  distance?: number;
  staggerChildren?: number;
}

export default function ScrollReveal({
  children,
  className = '',
  direction = 'up',
  delay = 0,
  duration = 0.7,
  once = true,
  distance = 40,
  staggerChildren,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once, margin: '-80px' });

  const getInitial = () => {
    switch (direction) {
      case 'up': return { opacity: 0, y: distance };
      case 'down': return { opacity: 0, y: -distance };
      case 'left': return { opacity: 0, x: distance };
      case 'right': return { opacity: 0, x: -distance };
      case 'scale': return { opacity: 0, scale: 0.9 };
      case 'none': return { opacity: 0 };
    }
  };

  const getAnimate = () => {
    switch (direction) {
      case 'up': case 'down': return { opacity: 1, y: 0 };
      case 'left': case 'right': return { opacity: 1, x: 0 };
      case 'scale': return { opacity: 1, scale: 1 };
      case 'none': return { opacity: 1 };
    }
  };

  if (staggerChildren) {
    return (
      <motion.div
        ref={ref}
        className={className}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren, delayChildren: delay } },
        }}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={getInitial()}
      animate={isInView ? getAnimate() : getInitial()}
      transition={{
        duration,
        delay,
        ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
      }}
    >
      {children}
    </motion.div>
  );
}

// Child variant for use inside staggered ScrollReveal
export function ScrollRevealItem({
  children,
  className = '',
  direction = 'up',
  distance = 30,
}: {
  children: ReactNode;
  className?: string;
  direction?: 'up' | 'down' | 'left' | 'right' | 'scale';
  distance?: number;
}) {
  const getVariants = () => {
    switch (direction) {
      case 'up': return {
        hidden: { opacity: 0, y: distance },
        visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
      };
      case 'down': return {
        hidden: { opacity: 0, y: -distance },
        visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
      };
      case 'left': return {
        hidden: { opacity: 0, x: distance },
        visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
      };
      case 'right': return {
        hidden: { opacity: 0, x: -distance },
        visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
      };
      case 'scale': return {
        hidden: { opacity: 0, scale: 0.9 },
        visible: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
      };
    }
  };

  return (
    <motion.div className={className} variants={getVariants()}>
      {children}
    </motion.div>
  );
}
