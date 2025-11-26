export interface CheckoutItem {
  name: string;
  price: number; // in cents
  quantity: number;
}

export async function startCheckout(items: CheckoutItem[]) {
  try {
    console.log("Initiating Stripe Checkout...");
    
    // Determine a safe origin for success/cancel redirects
    // Use fallback if window.location.origin is null/about:blank (sandboxes)
    const origin = window.location.origin && window.location.origin !== 'null' && window.location.origin !== 'about:blank'
      ? window.location.origin 
      : 'https://snackfamily2.com'; 

    const WORKER_URL = "https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev/create-checkout-session";

    const payload = {
      items,
      successUrl: `${origin}/success`,
      cancelUrl: `${origin}/cancel`
    };

    console.log("Sending payload to Worker:", payload);

    const response = await fetch(WORKER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
        console.error("Worker response error:", response.status);
        const text = await response.text();
        throw new Error(`Erreur HTTP: ${response.status} - ${text}`);
    }

    const data = await response.json();
    console.log("Session created:", data);

    if (data.url) {
      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } else {
      console.error("No URL in response:", data);
      alert("Erreur: Le service de paiement n'a pas renvoyé d'URL de redirection.");
    }
  } catch (e) {
    console.error("Checkout Exception:", e);
    alert("Impossible de contacter le serveur de paiement. Veuillez réessayer.");
    throw e;
  }
}

/**
 * DEV ONLY: Test function to verify Worker connectivity
 */
export async function runDevTest() {
  const WORKER_URL = "https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev/create-checkout-session";
  
  const origin = window.location.origin && window.location.origin !== 'null' 
      ? window.location.origin 
      : 'http://localhost:3000';

  const payload = {
    items: [
      { name: "Test Snack (DEV)", price: 500, quantity: 1 } // 5.00 EUR (500 cents)
    ],
    successUrl: `${origin}/success`,
    cancelUrl: `${origin}/cancel`
  };

  console.group("🧪 Stripe Worker Dev Test");
  console.log("Target URL:", WORKER_URL);
  console.log("Payload:", payload);

  try {
    const response = await fetch(WORKER_URL, {
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