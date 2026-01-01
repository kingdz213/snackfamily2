import { MenuCategory } from '@/types';

let cachedUnavailableById: Record<string, boolean> | null = null;

export async function fetchAvailability(endpointBase: string): Promise<Record<string, boolean>> {
  if (cachedUnavailableById) return cachedUnavailableById;
  try {
    const response = await fetch(`${endpointBase.replace(/\/+$/, '')}/menu/availability`);
    if (!response.ok) return {};
    const payload = (await response.json().catch(() => null)) as
      | { unavailableById?: Record<string, boolean> }
      | null;
    if (!payload || typeof payload !== 'object') return {};
    cachedUnavailableById = payload.unavailableById ?? {};
    return cachedUnavailableById;
  } catch {
    return {};
  }
}

export function applyAvailabilityOverrides(
  categories: MenuCategory[],
  unavailableById: Record<string, boolean>
): MenuCategory[] {
  return categories.map((category) => ({
    ...category,
    items: category.items.map((item) => ({
      ...item,
      unavailable: unavailableById[item.id] ?? item.unavailable ?? false,
    })),
  }));
}

export function clearAvailabilityCache() {
  cachedUnavailableById = null;
}
