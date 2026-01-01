import { closedDates } from '@/src/lib/holidaysBE';

export type OpeningWindow = {
  open: string;
  close: string;
};

export type OpenStatus = {
  isOpen: boolean;
  label: string;
  nextChangeLabel?: string;
};

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  isoDate: string;
  dayOfWeek: number;
};

const TIME_ZONE = 'Europe/Brussels';

const DAILY_SCHEDULE: Record<number, OpeningWindow | null> = {
  0: { open: '16:30', close: '22:30' }, // Dimanche
  1: null, // Lundi
  2: { open: '11:30', close: '22:30' },
  3: { open: '11:30', close: '22:30' },
  4: { open: '11:30', close: '22:30' },
  5: { open: '11:30', close: '22:30' },
  6: { open: '11:30', close: '22:30' }, // Samedi
};

const dateTimeFormatter = new Intl.DateTimeFormat('fr-BE', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const weekdayFormatter = new Intl.DateTimeFormat('fr-BE', {
  timeZone: TIME_ZONE,
  weekday: 'long',
});

const toNumber = (value: string | undefined) => (value ? Number(value) : Number.NaN);

const minutesFromTime = (time: string) => {
  const [hour, minute] = time.split(':').map((part) => Number(part));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
};

const getZonedParts = (date: Date): ZonedParts => {
  const parts = dateTimeFormatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = toNumber(lookup.year);
  const month = toNumber(lookup.month);
  const day = toNumber(lookup.day);
  const hour = toNumber(lookup.hour);
  const minute = toNumber(lookup.minute);
  const isoDate = `${lookup.year}-${lookup.month}-${lookup.day}`;
  const zonedDate = new Date(Date.UTC(year, month - 1, day, hour, minute));

  return {
    year,
    month,
    day,
    hour,
    minute,
    isoDate,
    dayOfWeek: zonedDate.getUTCDay(),
  };
};

const getDayLabel = (parts: ZonedParts) => {
  const baseDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0));
  return weekdayFormatter.format(baseDate);
};

const isHoliday = (isoDate: string) => closedDates.includes(isoDate);

const getScheduleForDay = (dayOfWeek: number) => DAILY_SCHEDULE[dayOfWeek] ?? null;

const getNextOpenSlot = (nowParts: ZonedParts, nowMinutes: number) => {
  const todaySchedule = getScheduleForDay(nowParts.dayOfWeek);
  const todayIsHoliday = isHoliday(nowParts.isoDate);

  if (todaySchedule && !todayIsHoliday) {
    const startMinutes = minutesFromTime(todaySchedule.open);
    if (startMinutes != null && nowMinutes < startMinutes) {
      return { dayOffset: 0, schedule: todaySchedule, parts: nowParts };
    }
  }

  const baseDate = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day, 12, 0));
  for (let offset = 1; offset <= 7; offset += 1) {
    const nextDate = new Date(baseDate);
    nextDate.setUTCDate(baseDate.getUTCDate() + offset);
    const nextParts = getZonedParts(nextDate);
    if (isHoliday(nextParts.isoDate)) continue;
    const schedule = getScheduleForDay(nextParts.dayOfWeek);
    if (!schedule) continue;
    return { dayOffset: offset, schedule, parts: nextParts };
  }

  return null;
};

export const getOpenStatus = (now: Date = new Date()): OpenStatus => {
  const parts = getZonedParts(now);
  const schedule = getScheduleForDay(parts.dayOfWeek);
  const nowMinutes = parts.hour * 60 + parts.minute;
  const isClosedForHoliday = isHoliday(parts.isoDate);

  const startMinutes = schedule ? minutesFromTime(schedule.open) : null;
  const endMinutes = schedule ? minutesFromTime(schedule.close) : null;
  const isOpen =
    !!schedule &&
    !isClosedForHoliday &&
    startMinutes != null &&
    endMinutes != null &&
    nowMinutes >= startMinutes &&
    nowMinutes < endMinutes;

  if (isOpen && schedule) {
    return {
      isOpen,
      label: 'Ouvert',
      nextChangeLabel: `Ferme à ${schedule.close}`,
    };
  }

  const nextOpen = getNextOpenSlot(parts, nowMinutes);
  if (!nextOpen) {
    return {
      isOpen: false,
      label: 'Fermé',
    };
  }

  let nextChangeLabel = `Ouvre à ${nextOpen.schedule.open}`;
  if (nextOpen.dayOffset === 1) {
    nextChangeLabel = `Ouvre demain à ${nextOpen.schedule.open}`;
  } else if (nextOpen.dayOffset > 1) {
    nextChangeLabel = `Ouvre ${getDayLabel(nextOpen.parts)} à ${nextOpen.schedule.open}`;
  }

  return {
    isOpen: false,
    label: 'Fermé',
    nextChangeLabel,
  };
};
