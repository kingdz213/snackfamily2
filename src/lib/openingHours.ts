import { DELIVERY_STEP_MINUTES, DELIVERY_WINDOWS } from '@/src/config/delivery';

type NextOpenSlot = {
  label: string;
  startTime: string;
  dateISO: string;
};

const minutesFromTime = (time: string) => {
  const [hour, minute] = time.split(':').map((part) => Number(part));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
};

const applyTime = (date: Date, time: string) => {
  const [hour, minute] = time.split(':').map((part) => Number(part));
  const next = new Date(date);
  next.setHours(Number.isFinite(hour) ? hour : 0, Number.isFinite(minute) ? minute : 0, 0, 0);
  return next;
};

const formatLabel = (date: Date) =>
  date.toLocaleString('fr-BE', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export const isOpenNow = (date: Date): boolean => {
  const window = DELIVERY_WINDOWS[date.getDay()] ?? null;
  if (!window) return false;

  const startMinutes = minutesFromTime(window.start);
  const endMinutes = minutesFromTime(window.end);
  if (startMinutes == null || endMinutes == null) return false;

  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
};

export const getNextOpenSlot = (date: Date): NextOpenSlot | null => {
  const current = new Date(date);
  const todayWindow = DELIVERY_WINDOWS[current.getDay()] ?? null;

  if (todayWindow) {
    const startMinutes = minutesFromTime(todayWindow.start);
    if (startMinutes != null) {
      const currentMinutes = current.getHours() * 60 + current.getMinutes();
      if (currentMinutes < startMinutes) {
        const startDate = applyTime(current, todayWindow.start);
        return {
          label: formatLabel(startDate),
          startTime: todayWindow.start,
          dateISO: startDate.toISOString(),
        };
      }
    }
  }

  for (let i = 1; i <= 7; i += 1) {
    const nextDate = new Date(current);
    nextDate.setDate(current.getDate() + i);
    const window = DELIVERY_WINDOWS[nextDate.getDay()] ?? null;
    if (!window) continue;
    const startDate = applyTime(nextDate, window.start);
    const rounded = new Date(
      Math.ceil(startDate.getTime() / (DELIVERY_STEP_MINUTES * 60 * 1000)) * DELIVERY_STEP_MINUTES * 60 * 1000
    );
    return {
      label: formatLabel(rounded),
      startTime: window.start,
      dateISO: rounded.toISOString(),
    };
  }

  return null;
};
