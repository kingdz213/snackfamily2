export interface WhatsAppOrderParams {
  orderId: string;
  paymentLabel: string;
  verificationUrl: string;
}

function sanitizePhone(phone: string) {
  return phone.replace(/\s+/g, '').replace(/[^+\d]/g, '').replace(/^\+/, '');
}

export function getWhatsAppPhone(): string {
  return import.meta.env.VITE_WHATSAPP_ORDER_PHONE || '';
}

export function getPublicOrigin(): string {
  const envOrigin = (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)?.trim();
  if (envOrigin) return envOrigin.replace(/\/+$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export function buildOrderVerificationUrl(orderId: string): string {
  const base = getPublicOrigin();
  return `${base}/order/${encodeURIComponent(orderId)}`;
}

export function buildOrderWhatsAppMessage(params: WhatsAppOrderParams): string {
  const orderId = params.orderId.trim();
  const verificationUrl = params.verificationUrl.trim();

  return (
    `Nouvelle commande #${orderId}\n` +
    `Paiement: ${params.paymentLabel}\n` +
    `Lien de vérification: ${verificationUrl}`
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
