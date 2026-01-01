export type CustomerProfile = {
  deliveryInfo?: {
    name?: string;
    phone?: string;
    address?: string;
    postalCode?: string;
    city?: string;
    note?: string;
  };
  deliveryLat?: number;
  deliveryLng?: number;
  deliveryScheduleMode?: 'ASAP' | 'SCHEDULED';
  desiredDeliveryAt?: string | null;
  desiredDeliverySlotLabel?: string | null;
};

const KEY = 'sf2_customer_v1';

export function loadCustomerProfile(): CustomerProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(KEY);
    if (!saved) return null;
    return JSON.parse(saved) as CustomerProfile;
  } catch {
    return null;
  }
}

export function saveCustomerProfile(next: Partial<CustomerProfile>): void {
  if (typeof window === 'undefined') return;
  const prev = loadCustomerProfile() || {};
  const merged: CustomerProfile = { ...prev, ...next };
  if (next.deliveryInfo) {
    merged.deliveryInfo = { ...(prev.deliveryInfo || {}), ...(next.deliveryInfo || {}) };
  }
  localStorage.setItem(KEY, JSON.stringify(merged));
}

export function clearCustomerProfile(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
}
