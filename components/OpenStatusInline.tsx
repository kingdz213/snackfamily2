import React, { useEffect, useState } from 'react';
import { getOpenStatus, OpenStatus } from '@/src/lib/openingHours';

export const OpenStatusInline: React.FC = () => {
  const [status, setStatus] = useState<OpenStatus>(() => getOpenStatus());

  useEffect(() => {
    const refreshStatus = () => setStatus(getOpenStatus());
    refreshStatus();
    const interval = window.setInterval(refreshStatus, 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-1">
      <span className={`text-sm font-semibold ${status.isOpen ? 'text-snack-gold' : 'text-red-700'}`}>
        ● {status.label}
      </span>
      {status.nextChangeLabel && <span className="text-xs text-gray-400">{status.nextChangeLabel}</span>}
    </div>
  );
};
