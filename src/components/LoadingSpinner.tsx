import React from 'react';
import { prefersReducedMotion } from '@/src/lib/motion';

interface LoadingSpinnerProps {
  label?: string;
  size?: number;
  className?: string;
  iconClassName?: string;
  labelClassName?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  label,
  size = 24,
  className = '',
  iconClassName = '',
  labelClassName = '',
}) => {
  const reduceMotion = prefersReducedMotion();

  const labelStyles = labelClassName || 'text-sm font-semibold text-gray-600';

  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <span
        className={`inline-flex items-center justify-center text-snack-gold ${iconClassName} ${
          reduceMotion ? '' : 'skewer-spin'
        }`.trim()}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 64 64"
          width={size}
          height={size}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 14c6 4 14 6 22 6s16-2 22-6" />
          <path d="M12 28c6 4 13 6 20 6s14-2 20-6" />
          <path d="M14 42c5 3 12 5 18 5s13-2 18-5" />
          <path d="M8 8l48 48" />
          <path d="M50 52l6 6" />
          <path d="M44 44l6 6" />
        </svg>
      </span>
      {label && <span className={labelStyles}>{label}</span>}
    </span>
  );
};
