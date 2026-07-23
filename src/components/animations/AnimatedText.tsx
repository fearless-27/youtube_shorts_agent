import { useEffect, useRef } from 'react';
import { motion, useInView } from 'framer-motion';

interface AnimatedTextProps {
  text: string;
  className?: string;
  variant?: 'chars' | 'words' | 'gradient' | 'typewriter';
  delay?: number;
  stagger?: number;
  once?: boolean;
}

export default function AnimatedText({
  text,
  className = '',
  variant = 'words',
  delay = 0,
  stagger = 0.04,
  once = true,
}: AnimatedTextProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once, margin: '-50px' });

  if (variant === 'gradient') {
    return (
      <motion.span
        ref={ref}
        className={`inline-block ${className}`}
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.8, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{
          background: 'linear-gradient(135deg, #00F0FF, #A855F7, #EC4899)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          backgroundSize: '200% 200%',
          animation: isInView ? 'gradient-x 4s ease infinite' : 'none',
        }}
      >
        {text}
      </motion.span>
    );
  }

  if (variant === 'typewriter') {
    return <TypewriterText text={text} className={className} delay={delay} />;
  }

  const items = variant === 'chars' ? text.split('') : text.split(' ');

  return (
    <span ref={ref} className={`inline-flex flex-wrap ${className}`}>
      {items.map((item, i) => (
        <motion.span
          key={`${item}-${i}`}
          className="inline-block"
          initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
          animate={
            isInView
              ? { opacity: 1, y: 0, filter: 'blur(0px)' }
              : { opacity: 0, y: 30, filter: 'blur(8px)' }
          }
          transition={{
            duration: 0.5,
            delay: delay + i * stagger,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
        >
          {item}
          {variant === 'words' && <span>&nbsp;</span>}
        </motion.span>
      ))}
    </span>
  );
}

function TypewriterText({
  text,
  className,
  delay,
}: {
  text: string;
  className: string;
  delay: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const displayRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!isInView || !displayRef.current) return;

    let i = 0;
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        if (displayRef.current) {
          displayRef.current.textContent = text.slice(0, i + 1);
          i++;
          if (i >= text.length) clearInterval(interval);
        }
      }, 40);

      return () => clearInterval(interval);
    }, delay * 1000);

    return () => clearTimeout(timeout);
  }, [isInView, text, delay]);

  return (
    <span ref={ref} className={className}>
      <span ref={displayRef} />
      <motion.span
        className="inline-block w-[2px] h-[1em] bg-cyan ml-0.5 align-middle"
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, repeatType: 'reverse' }}
      />
    </span>
  );
}
