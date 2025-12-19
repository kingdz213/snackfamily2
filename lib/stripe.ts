export interface CheckoutItem {
  id?: string;
  name: string;
  price: number; // in cents
  quantity: number;
}

const DEFAULT_WORKER_BASE_URL = 'https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev';

const normalizeBase = (base: string) => base.replace(/\/+$/, '');

const resolveWorkerBaseUrl = () => {
  const configured = import.meta.env.VITE_WORKER_BASE_URL;
  const trimmed = configured?.trim();

  return trimmed && trimmed.length > 0
    ? normalizeBase(trimmed)
    : normalizeBase(DEFAULT_WORKER_BASE_URL);
};

const withDefaultItemIds = (items: CheckoutItem[]) =>
  items.map((item) => ({
    ...item,
    id: item.id || 'menu-item',
  }));

export async function startCheckout(items: CheckoutItem[], customer?: Record<string, unknown>) {
  const workerBaseUrl = resolveWorkerBaseUrl();
  const endpoint = `${workerBaseUrl}/create-checkout-session`;

  try {
    const payload = {
      items: withDefaultItemIds(items),
      ...(customer ? { customer } : {}),
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data: { url?: string; error?: string } = {};

    try {
      data = JSON.parse(text);
    } catch (error) {
      console.error('Invalid JSON from Stripe worker', text);
      throw new Error('Le serveur de paiement a renvoyé une réponse invalide.');
    }

    if (!response.ok) {
      const errorMessage = data.error || `Erreur HTTP: ${response.status}`;
      console.error('Stripe worker error', errorMessage);
      throw new Error(errorMessage);
    }

    if (data.url) {
      window.location.assign(data.url);
      return;
    }

    const errorMessage = data.error || 'Le service de paiement n\'a pas renvoyé d\'URL de redirection.';
    console.error('Stripe worker response missing url', data);
    throw new Error(errorMessage);
  } catch (e) {
    console.error('Checkout Exception:', e);
    alert('Impossible de contacter le serveur de paiement. Veuillez réessayer.');
    throw e;
  }
}

/**
 * DEV ONLY: Test function to verify Worker connectivity
 */
export async function runDevTest() {
  const workerBaseUrl = resolveWorkerBaseUrl();
  const endpoint = `${workerBaseUrl}/create-checkout-session`;

  const payload = {
    items: withDefaultItemIds([
      { name: 'Test Snack (DEV)', price: 500, quantity: 1 }, // 5.00 EUR (500 cents)
    ]),
  };

  console.group('🧪 Stripe Worker Dev Test');
  console.log('Target URL:', endpoint);
  console.log('Payload:', payload);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    console.log('HTTP Status:', response.status);

    const text = await response.text();
    console.log('Raw Response Body:', text);

    let data;
    try {
      data = JSON.parse(text);
      console.log('Parsed JSON:', data);
    } catch (e) {
      throw new Error('Invalid JSON response from Worker');
    }

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${data.error || text}`);
    }

    if (data.url) {
      if (confirm(`Test réussi ! URL reçue : ${data.url}\n\nVoulez-vous être redirigé vers Stripe ?`)) {
        window.location.assign(data.url);
      }
    } else if (data.error) {
      alert(`Erreur retournée par le worker : ${data.error}`);
    } else {
      alert('Réponse reçue mais pas d\'URL: ' + JSON.stringify(data));
    }
  } catch (error) {
    console.error('Test Error:', error);
    alert(`Échec du test: ${error instanceof Error ? error.message : String(error)}`);
  }
  console.groupEnd();
}
