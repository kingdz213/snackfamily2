export type PaymentStatus = 'stripe' | 'cash';

export interface WhatsAppOrderItem {
  label: string;
  quantity: number;
  unitPrice: number;
}

export interface WhatsAppOrderParams {
  paymentStatus: PaymentStatus;
  customerName: string;
  customerPhone: string;
  address: string;
  postalCode: string;
  city: string;
  distanceKm?: number | null;
  items: WhatsAppOrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  notes?: string;
  timestampIso?: string;
}

export const LAST_ORDER_STORAGE_KEY = 'sf2_last_order_payload';

function formatCurrency(value: number) {
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatTimestamp(timestampIso?: string) {
  const date = timestampIso ? new Date(timestampIso) : new Date();
  return date.toLocaleString('fr-FR', { hour12: false });
}

function sanitizePhone(phone: string) {
  return phone.replace(/\s+/g, '').replace(/[^+\d]/g, '');
}

export function getWhatsAppPhone(): string {
  return import.meta.env.VITE_ORDER_WHATSAPP_PHONE || '';
}

export function buildOrderWhatsAppMessage(params: WhatsAppOrderParams): string {
  const paymentLabel =
    params.paymentStatus === 'stripe' ? 'PAYÉ (Stripe)' : 'À PAYER (Cash à la livraison)';

  const itemsLines = params.items.length
    ? params.items
        .map((item) => `- ${item.quantity}x ${item.label} — ${formatCurrency(item.unitPrice * item.quantity)}`)
        .join('\n')
    : '- (aucun article)';

  const notes = params.notes?.trim() || 'Aucune';
  const distanceLine =
    params.distanceKm != null && Number.isFinite(params.distanceKm)
      ? `Distance estimée: ${params.distanceKm.toFixed(1)} km\n`
      : '';

  const header = '🧾 NOUVELLE COMMANDE — Snack Family 2';

  return (
    `${header}\n` +
    `Statut paiement: ${paymentLabel}\n` +
    `Nom: ${params.customerName || 'Inconnu'}\n` +
    `Téléphone: ${params.customerPhone || '-'}\n` +
    `Adresse: ${params.address || '-'}\n` +
    `Ville: ${params.postalCode} ${params.city}` +
    (distanceLine ? `\n${distanceLine}` : '\n') +
    `Articles:\n${itemsLines}\n` +
    `Sous-total: ${formatCurrency(params.subtotal)}\n` +
    `Livraison: ${formatCurrency(params.deliveryFee)}\n` +
    `Total: ${formatCurrency(params.total)}\n` +
    `Notes: ${notes}\n` +
    `Heure: ${formatTimestamp(params.timestampIso)}`
  );
}

export function openWhatsAppOrder(params: WhatsAppOrderParams): void {
  const phone = sanitizePhone(getWhatsAppPhone());
  const message = buildOrderWhatsAppMessage(params);
  const encoded = encodeURIComponent(message);
  const baseUrl = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
  const url = `${baseUrl}?text=${encoded}`;

  window.open(url, '_blank');
}
