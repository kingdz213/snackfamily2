import React from 'react';
import { useStoreStatus } from '@/src/lib/storeStatus';

type StoreStatusBadgeProps = {
  className?: string;
  size?: 'sm' | 'md';
};

export const StoreStatusBadge: React.FC<StoreStatusBadgeProps> = ({ className = '', size = 'md' }) => {
  const { status } = useStoreStatus();

  if (!status) {
    return null;
  }

  const isOpen = status.isOpen;
  const titleSize = size === 'sm' ? 'text-xs' : 'text-sm';
  const detailSize = size === 'sm' ? 'text-[11px]' : 'text-xs';
  const dotColor = isOpen ? 'bg-emerald-400' : 'bg-red-500';
  const textColor = isOpen ? 'text-snack-gold' : 'text-red-400';

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className={`inline-flex items-center gap-2 font-semibold ${titleSize} ${textColor}`}>
        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
        {status.statusLabel}
      </span>
      <span className={`${detailSize} text-gray-400`}>{status.detail}</span>
    </div>
  );
};
