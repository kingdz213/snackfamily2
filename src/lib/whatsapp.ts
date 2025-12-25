type OrderMessageParams = {
  orderId: string;
  paymentLabel: string;
  verifyUrl: string;
  deliveredUrl?: string;
  lines: string[];
};

function sanitizePhone(phone: string) {
  return phone.replace(/\s+/g, '').replace(/[^+\d]/g, '').replace(/^\+/, '');
}

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
  const sanitized = sanitizePhone(phone);
  const baseUrl = sanitized ? `https://wa.me/${sanitized}` : 'https://wa.me/';
  const encoded = encodeURIComponent(message);
  return `${baseUrl}?text=${encoded}`;
}

export function buildOrderMessage({ orderId, paymentLabel, verifyUrl, deliveredUrl, lines }: OrderMessageParams): string {
  const recap = lines.length > 0 ? lines.join('\n') : '- (aucun article)';
  const deliveredLine = deliveredUrl ? `Lien 1 clic (livrée): ${deliveredUrl}\n` : '';
  return (
    `Nouvelle commande #${orderId}\n` +
    `Paiement: ${paymentLabel}\n` +
    `Lien de vérification: ${verifyUrl}\n` +
    deliveredLine +
    `\n` +
    `Récapitulatif:\n${recap}`
  );
}
