import { useEffect, useState } from 'react';
import { resolveWorkerBaseUrl } from '@/lib/stripe';

export type StoreMode = 'AUTO' | 'OPEN' | 'CLOSED';

export type StoreStatus = {
  isOpen: boolean;
  statusLabel: 'Ouvert' | 'Fermé';
  detail: string;
  nextChangeAt?: string;
  mode: StoreMode;
};

export async function fetchStoreStatus(baseUrl?: string): Promise<StoreStatus | null> {
  const endpointBase = baseUrl ?? resolveWorkerBaseUrl();
  const response = await fetch(`${endpointBase}/public/store-status`);
  if (!response.ok) {
    throw new Error('Store status fetch failed');
  }
  const payload = (await response.json()) as StoreStatus;
  if (!payload || typeof payload.isOpen !== 'boolean') {
    return null;
  }
  return payload;
}

export function useStoreStatus(pollMs = 60_000) {
  const [status, setStatus] = useState<StoreStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      try {
        const payload = await fetchStoreStatus();
        if (isActive) {
          setStatus(payload);
          setError(null);
        }
      } catch (err) {
        if (isActive) {
          setError(err instanceof Error ? err.message : 'Store status fetch failed');
        }
      }
    };

    void load();
    const interval = window.setInterval(load, pollMs);
    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, [pollMs]);

  return { status, error };
}
