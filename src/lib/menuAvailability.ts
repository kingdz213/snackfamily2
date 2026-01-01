import { MenuCategory, MenuItem } from '@/types';

export type MenuAvailabilityOverride = {
  unavailable: boolean;
  until?: string | null;
};

export type MenuAvailabilityMap = Record<string, MenuAvailabilityOverride>;

const CACHE_TTL_MS = 60_000;
const STORAGE_KEY = 'sf2_menu_availability_v1';
const BRUSSELS_TIME_ZONE = 'Europe/Brussels';

let cachedAvailability: { fetchedAt: number; data: MenuAvailabilityMap } | null = null;

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

export const resolveMenuItemKey = (item: MenuItem, category?: MenuCategory) =>
  item.id || (category ? `${category.id}:${slugify(item.name)}` : slugify(item.name));

const brusselsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BRUSSELS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const timeZoneOffsetMs = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const utcDate = Date.UTC(
    Number(lookup.year),
    Number(lookup.month) - 1,
    Number(lookup.day),
    Number(lookup.hour),
    Number(lookup.minute),
    Number(lookup.second)
  );
  return utcDate - date.getTime();
};

const zonedTimeToUtc = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  timeZone: string
) => {
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  const offset = timeZoneOffsetMs(utcDate, timeZone);
  return new Date(utcDate.getTime() - offset);
};

export const getBrusselsEndOfDayIso = (now: Date = new Date()) => {
  const parts = brusselsFormatter.formatToParts(now);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(lookup.year);
  const month = Number(lookup.month);
  const day = Number(lookup.day);
  const endUtc = zonedTimeToUtc(year, month, day, 23, 59, 59, 999, BRUSSELS_TIME_ZONE);
  return endUtc.toISOString();
};

const normalizeAvailabilityEntry = (value: unknown): MenuAvailabilityOverride | null => {
  if (typeof value === 'boolean') {
    return { unavailable: value, until: null };
  }
  if (!value || typeof value !== 'object') return null;
  const raw = value as { unavailable?: unknown; until?: unknown };
  if (typeof raw.unavailable !== 'boolean') return null;
  let until: string | null | undefined;
  if (raw.until === null) {
    until = null;
  } else if (typeof raw.until === 'string') {
    until = raw.until;
  }
  return { unavailable: raw.unavailable, ...(until !== undefined ? { until } : {}) };
};

export const normalizeAvailabilityMap = (value: unknown): MenuAvailabilityMap => {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => {
        const normalized = normalizeAvailabilityEntry(entry);
        return normalized ? [key, normalized] : null;
      })
      .filter((entry): entry is [string, MenuAvailabilityOverride] => Boolean(entry))
  );
};

const isOverrideActive = (override?: MenuAvailabilityOverride, nowMs: number = Date.now()) => {
  if (!override || !override.unavailable) return false;
  if (override.until == null) return true;
  const untilMs = Date.parse(override.until);
  if (!Number.isFinite(untilMs)) return true;
  return nowMs < untilMs;
};

export const isItemUnavailable = (item: MenuItem, overrides: MenuAvailabilityMap, now: Date = new Date()) => {
  const override = overrides[resolveMenuItemKey(item)];
  return isOverrideActive(override, now.getTime()) || item.unavailable === true;
};

const readStorage = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fetchedAt?: number; data?: MenuAvailabilityMap };
    if (!parsed || typeof parsed.fetchedAt !== 'number' || !parsed.data) return null;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return { fetchedAt: parsed.fetchedAt, data: normalizeAvailabilityMap(parsed.data) };
  } catch {
    return null;
  }
};

const writeStorage = (payload: { fetchedAt: number; data: MenuAvailabilityMap }) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
};

export async function fetchMenuAvailability(endpointBase: string): Promise<MenuAvailabilityMap> {
  const now = Date.now();
  if (cachedAvailability && now - cachedAvailability.fetchedAt < CACHE_TTL_MS) {
    return cachedAvailability.data;
  }
  const stored = readStorage();
  if (stored) {
    cachedAvailability = stored;
    return stored.data;
  }

  try {
    const response = await fetch(`${endpointBase.replace(/\/+$/, '')}/store/menu-availability`);
    if (!response.ok) return {};
    const payload = (await response.json().catch(() => null)) as
      | { availability?: MenuAvailabilityMap; overrides?: MenuAvailabilityMap }
      | MenuAvailabilityMap
      | null;
    if (!payload || typeof payload !== 'object') return {};
    const map = normalizeAvailabilityMap(
      'availability' in payload
        ? payload.availability
        : 'overrides' in payload
        ? payload.overrides
        : payload
    );
    cachedAvailability = { fetchedAt: now, data: map };
    writeStorage(cachedAvailability);
    return map;
  } catch {
    return {};
  }
}

export function applyAvailabilityToMenu(
  categories: MenuCategory[],
  overrides: MenuAvailabilityMap,
  now: Date = new Date()
): MenuCategory[] {
  return categories.map((category) => ({
    ...category,
    items: category.items.map((item) => ({
      ...item,
      unavailable: isItemUnavailable(item, overrides, now),
    })),
  }));
}

export function clearAvailabilityCache() {
  cachedAvailability = null;
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
