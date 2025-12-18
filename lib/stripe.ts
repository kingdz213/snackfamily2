export interface CheckoutPayloadItem {
  id: string;
  qty: number;
  extras?: string[];
}

export interface CheckoutCustomer {
  name?: string;
  phone?: string;
}

const DEFAULT_WORKER_BASE = "https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev";

const getWorkerBaseUrl = (): string => {
  const raw = import.meta.env.VITE_WORKER_BASE_URL || DEFAULT_WORKER_BASE;
  return raw.replace(/\/+$/, "");
};

const getWorkerEndpoint = (path: string) =>
  `${getWorkerBaseUrl()}${path.startsWith("/") ? "" : "/"}${path}`;

export async function startCheckout(items: CheckoutPayloadItem[], customer?: CheckoutCustomer) {
  if (!items.length) {
    throw new Error("Aucun article dans le panier.");
  }

  const payload = {
    items: items.map(it => ({
      id: it.id,
      qty: Math.max(1, Number(it.qty || 1)),
      ...(Array.isArray(it.extras) && it.extras.length ? { extras: it.extras } : {})
    })),
    ...(customer ? { customer } : {})
  };

  const response = await fetch(getWorkerEndpoint("/create-checkout-session"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const textBody = await response.text();
  if (!response.ok) {
    try {
      const errorData = JSON.parse(textBody);
      if (errorData?.error) {
        throw new Error(`Erreur paiement: ${errorData.error}`);
      }
    } catch (_) {
      /* fall through */
    }
    throw new Error(`Erreur HTTP: ${response.status} - ${textBody}`);
  }

  let data: any;
  try {
    data = JSON.parse(textBody);
  } catch {
    throw new Error("Réponse invalide du serveur de paiement.");
  }

  if (data.url) {
    window.location.assign(data.url);
    return;
  }

  if (data.error) {
    throw new Error(`Erreur paiement: ${data.error}`);
  }

  throw new Error("Réponse inattendue du serveur de paiement (URL absente).");
}

export async function runDevTest() {
  const payload = {
    items: [
      { id: "assiettes__assiette_pita", qty: 1 }
    ]
  };

  console.group("🧪 Stripe Worker Dev Test");
  const target = getWorkerEndpoint("/create-checkout-session");
  console.log("Target URL:", target);
  console.log("Payload:", payload);

  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    console.log("HTTP Status:", response.status);
    
    const text = await response.text();
    console.log("Raw Response Body:", text);

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${text}`);
    }

    let data;
    try {
      data = JSON.parse(text);
      console.log("Parsed JSON:", data);
    } catch(e) {
      throw new Error("Invalid JSON response from Worker");
    }

    if (data.url) {
      if (confirm(`Test réussi ! URL reçue : ${data.url}\n\nVoulez-vous être redirigé vers Stripe ?`)) {
        window.location.href = data.url;
      }
    } else {
      alert("Réponse reçue mais pas d'URL: " + JSON.stringify(data));
    }

  } catch (error) {
    console.error("Test Error:", error);
    alert(`Échec du test: ${error instanceof Error ? error.message : String(error)}`);
  }
  console.groupEnd();
}
