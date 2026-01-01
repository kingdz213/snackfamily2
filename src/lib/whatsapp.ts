import { toWhatsAppDigits } from '@/src/lib/phone';

type OrderMessageParams = {
  orderId: string;
  paymentLabel: string;
  publicOrderUrl: string;
  adminHubUrl?: string;
  lines: string[];
  desiredDeliveryAt?: string | null;
  desiredDeliverySlotLabel?: string | null;
  notes?: string | null;
};

export function getWhatsAppPhone(): string {
  return (import.meta.env.VITE_WHATSAPP_ORDER_PHONE || '+32465671893').trim();
}

export function resolvePublicOrigin(): string {
  const fromEnv = (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const sanitized = toWhatsAppDigits(phone);
  const baseUrl = sanitized ? `https://wa.me/${sanitized}` : 'https://wa.me/';
  const encoded = encodeURIComponent(message);
  return `${baseUrl}?text=${encoded}`;
}

export function buildOrderMessage({
  orderId,
  paymentLabel,
  publicOrderUrl,
  adminHubUrl,
  lines,
  desiredDeliveryAt,
  desiredDeliverySlotLabel,
  notes,
}: OrderMessageParams): string {
  const recap = lines.length > 0 ? lines.join('\n') : '- (aucun article)';
  const desiredLabel =
    desiredDeliverySlotLabel ||
    (desiredDeliveryAt ? new Date(desiredDeliveryAt).toLocaleString('fr-BE') : null);
  const scheduledLine = desiredLabel ? `Heure souhaitée: ${desiredLabel}\n` : '';
  const notesLine = notes ? `Instructions: ${notes}\n` : '';
  const adminLine = adminHubUrl ? `✅ Terminer la commande (admin): ${adminHubUrl}\n` : '';
  return (
    `Nouvelle commande #${orderId}\n` +
    `Paiement: ${paymentLabel}\n` +
    scheduledLine +
    notesLine +
    adminLine +
    `📦 Suivi client: ${publicOrderUrl}\n` +
    `\n` +
    `Récapitulatif:\n${recap}`
  );
}
