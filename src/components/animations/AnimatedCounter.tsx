import { useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';

interface AnimatedCounterProps {
  end: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  decimals?: number;
}

export default function AnimatedCounter({
  end,
  duration = 2,
  prefix = '',
  suffix = '',
  className = '',
  decimals = 0,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    if (!isInView) return;

    const startTime = Date.now();
    const durationMs = duration * 1000;

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = eased * end;

      if (decimals > 0) {
        setDisplay(current.toFixed(decimals));
      } else {
        setDisplay(Math.floor(current).toLocaleString());
      }

      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    };

    requestAnimationFrame(tick);
  }, [isInView, end, duration, decimals]);

  return (
    <span ref={ref} className={className}>
      {prefix}{display}{suffix}
    </span>
  );
}
