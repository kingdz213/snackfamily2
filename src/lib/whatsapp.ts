type OrderMessageParams = {
  orderId: string;
  paymentLabel: string;
  verifyUrl: string;
  deliveredUrl?: string;
  lines: string[];
};

const ADMIN_PIN_STORAGE_KEY = 'adminPin';

function sanitizePhone(phone: string) {
  return phone.replace(/\s+/g, '').replace(/[^+\d]/g, '').replace(/^\+/, '');
}

function normalizeOrigin(origin: string) {
  return origin.replace(/\/+$/, '');
}

export function getWhatsAppPhone(): string {
  return (import.meta.env.VITE_WHATSAPP_ORDER_PHONE || '+32465671893').trim();
}

export function resolvePublicOrigin(): string {
  const fromEnv = (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)?.trim();
  if (fromEnv) return normalizeOrigin(fromEnv);
  if (typeof window !== 'undefined' && window.location?.origin) {
    return normalizeOrigin(window.location.origin);
  }
  return '';
}

export function getStoredAdminPin(): string | null {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(ADMIN_PIN_STORAGE_KEY);
  return value?.trim() ? value.trim() : null;
}

export function storeAdminPin(pin: string) {
  if (typeof window === 'undefined') return;
  const trimmed = pin.trim();
  if (!trimmed) {
    window.localStorage.removeItem(ADMIN_PIN_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(ADMIN_PIN_STORAGE_KEY, trimmed);
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const sanitized = sanitizePhone(phone);
  const baseUrl = sanitized ? `https://wa.me/${sanitized}` : 'https://wa.me/';
  const encoded = encodeURIComponent(message);
  return `${baseUrl}?text=${encoded}`;
}

export function buildOrderMessage({ orderId, paymentLabel, verifyUrl, deliveredUrl, lines }: OrderMessageParams): string {
  const recap = lines.length > 0 ? lines.join('\n') : '- (aucun article)';
  const deliveredLine = deliveredUrl ? `\nMarquer livrée (1 clic): ${deliveredUrl}` : '';
  return (
    `Nouvelle commande #${orderId}\n` +
    `Mode de paiement: ${paymentLabel}\n` +
    `Lien de vérification: ${verifyUrl}` +
    `${deliveredLine}\n\n` +
    `Récapitulatif:\n${recap}`
  );
}
