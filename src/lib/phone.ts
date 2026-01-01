export const normalizePhoneDigits = (value: string): string => {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const cleaned = trimmed.replace(/[^+\d]/g, '');
  if (cleaned.startsWith('+')) {
    return `+${cleaned.slice(1).replace(/\+/g, '')}`;
  }
  return cleaned.replace(/\+/g, '');
};

export const toWhatsAppDigits = (value: string): string => {
  return normalizePhoneDigits(value).replace(/\D/g, '');
};

export const isValidPhoneBasic = (value: string): boolean => {
  const normalized = normalizePhoneDigits(value);
  if (!normalized) return false;
  const digits = toWhatsAppDigits(normalized);
  if (digits.length < 9 || digits.length > 15) return false;
  return normalized.startsWith('0') || normalized.startsWith('+32') || normalized.startsWith('32');
};
