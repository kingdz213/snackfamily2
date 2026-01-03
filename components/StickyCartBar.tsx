import React from 'react';
import { prefersReducedMotion } from '@/src/lib/motion';

interface StickyCartBarProps {
  totalItems: number;
  totalPrice: number;
  onOpenCart: () => void;
  buttonLabel?: string;
}

export const StickyCartBar: React.FC<StickyCartBarProps> = ({
  totalItems,
  totalPrice,
  onOpenCart,
  buttonLabel = 'Voir panier',
}) => {
  const reduceMotion = prefersReducedMotion();

  if (totalItems < 1) {
    return null;
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-3 pt-2 lg:hidden"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
    >
      <button
        type="button"
        onClick={onOpenCart}
        className={`sticky-cart-bar w-full rounded-2xl border border-snack-gold/60 bg-snack-black text-white shadow-lg ${
          reduceMotion ? '' : 'sticky-cart-slide-up'
        }`}
      >
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="text-sm font-semibold tracking-wide">
            {totalItems} article(s) • {totalPrice.toFixed(2)}€
          </div>
          <span className="rounded-full bg-snack-gold px-4 py-2 text-xs font-bold uppercase tracking-wider text-snack-black shadow-md">
            {buttonLabel}
          </span>
        </div>
      </button>
    </div>
  );
};
