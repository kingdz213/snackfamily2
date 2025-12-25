type OrderMessageParams = {
  orderId: string;
  paymentLabel: string;
  verifyUrl: string;
  lines: string[];
};

function sanitizePhone(phone: string) {
  return phone.replace(/\s+/g, '').replace(/[^+\d]/g, '').replace(/^\+/, '');
}

export function getWhatsAppPhone(): string {
  return (import.meta.env.VITE_WHATSAPP_ORDER_PHONE || '+32465671893').trim();
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const sanitized = sanitizePhone(phone);
  const baseUrl = sanitized ? `https://wa.me/${sanitized}` : 'https://wa.me/';
  const encoded = encodeURIComponent(message);
  return `${baseUrl}?text=${encoded}`;
}

export function buildOrderMessage({ orderId, paymentLabel, verifyUrl, lines }: OrderMessageParams): string {
  const recap = lines.length > 0 ? lines.join('\n') : '- (aucun article)';
  return (
    `Nouvelle commande #${orderId}\n` +
    `Paiement: ${paymentLabel}\n` +
    `Lien de vérification: ${verifyUrl}\n\n` +
    `Récapitulatif:\n${recap}`
  );
}
