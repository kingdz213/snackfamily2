import React, { useMemo } from 'react';
import { prefersReducedMotion } from '@/src/lib/motion';

interface EmbersProps {
  count?: number;
  maxOpacity?: number;
  speed?: number;
  className?: string;
}

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;

export const Embers: React.FC<EmbersProps> = ({ count = 8, maxOpacity = 0.18, speed = 18, className = '' }) => {
  const reduceMotion = prefersReducedMotion();

  const embers = useMemo(
    () =>
      Array.from({ length: count }).map((_, index) => {
        const size = randomBetween(4, 10);
        return {
          id: `ember-${index}`,
          size,
          left: randomBetween(5, 95),
          delay: randomBetween(0, speed * 0.6),
          duration: randomBetween(speed * 0.85, speed * 1.4),
          opacity: randomBetween(maxOpacity * 0.4, maxOpacity),
        };
      }),
    [count, maxOpacity, speed]
  );

  if (reduceMotion) return null;

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`.trim()} aria-hidden="true">
      {embers.map((ember) => (
        <span
          key={ember.id}
          className="ember"
          style={{
            left: `${ember.left}%`,
            width: `${ember.size}px`,
            height: `${ember.size}px`,
            opacity: ember.opacity,
            animationDelay: `${ember.delay}s`,
            animationDuration: `${ember.duration}s`,
          }}
        />
      ))}
    </div>
  );
};
