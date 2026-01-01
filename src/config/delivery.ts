export type DeliveryWindow = {
  start: string;
  end: string;
};

export const DELIVERY_WINDOWS: Record<number, DeliveryWindow | null> = {
  0: { start: '16:30', end: '23:00' },
  1: null,
  2: { start: '11:00', end: '23:00' },
  3: { start: '11:00', end: '23:00' },
  4: { start: '11:00', end: '23:00' },
  5: { start: '11:00', end: '23:00' },
  6: { start: '11:00', end: '23:00' },
};

export const DELIVERY_STEP_MINUTES = 15;
