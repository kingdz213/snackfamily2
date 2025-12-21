// src/components/OrderUI.tsx
import React, { useEffect, useMemo, useState } from "react";
import { CartItem } from "../types";
import { startCheckout } from "../lib/stripe";

const MIN_ORDER_EUR = 20;
const DELIVERY_FEE_EUR = 2.5;

function eur(n: number) {
  return n.toFixed(2).replace(".", ",") + " €";
}

function resolveWorkerBase(): string {
  const base = (import.meta.env.VITE_WORKER_BASE_URL as string | undefined)?.trim();
  const endpoint = (import.meta.env.VITE_CHECKOUT_API_URL as string | undefined)?.trim();
  if (endpoint) return endpoint.replace(/\/create-checkout-session\/?$/, "");
  if (base) return base.replace(/\/+$/, "");
  // fallback OK aussi en prod si tu veux (mais idéalement mets VITE_WORKER_BASE_URL)
  return "https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev";
}

async function checkDeliveryAddress(address: string) {
  const base = resolveWorkerBase();
  const url = `${base}/delivery-check?address=${encodeURIComponent(address)}`;
  const res = await fetch(url, { method: "GET" });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false as const, error: data?.error || "CHECK_FAILED" };
  return data as { ok: true; within: boolean; distanceKm: number };
}

export default function OrderUI({
  cartItems,
  onRemoveFromCart,
  onClose,
}: {
  cartItems: CartItem[];
  onRemoveFromCart: (id: string) => void;
  onClose: () => void;
}) {
  const [deliveryEnabled, setDeliveryEnabled] = useState(true);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [checkingZone, setCheckingZone] = useState(false);
  const [zoneOk, setZoneOk] = useState<boolean | null>(null);
  const [zoneDistance, setZoneDistance] = useState<number | null>(null);

  const [loadingOnline, setLoadingOnline] = useState(false);
  const [loadingCash, setLoadingCash] = useState(false);

  const subtotal = useMemo(() => {
    return cartItems.reduce((sum, it) => sum + Number(it.price || 0) * (it.quantity || 1), 0);
  }, [cartItems]);

  const deliveryFee = useMemo(() => (deliveryEnabled && cartItems.length > 0 ? DELIVERY_FEE_EUR : 0), [
    deliveryEnabled,
    cartItems.length,
  ]);

  const total = useMemo(() => subtotal + deliveryFee, [subtotal, deliveryFee]);

  const minOk = subtotal >= MIN_ORDER_EUR; // ✅ minimum sur le sous-total (hors livraison)

  const addressRequired = deliveryEnabled;
  const addressOk = !addressRequired || deliveryAddress.trim().length >= 8;

  // debounce check zone
  useEffect(() => {
    let t: any = null;
    let cancelled = false;

    async function run() {
      if (!deliveryEnabled) {
        setZoneOk(null);
        setZoneDistance(null);
        return;
      }
      if (deliveryAddress.trim().length < 8) {
        setZoneOk(null);
        setZoneDistance(null);
        return;
      }
      setCheckingZone(true);
      const r = await checkDeliveryAddress(deliveryAddress.trim());
      if (cancelled) return;
      setCheckingZone(false);

      if (!r.ok) {
        setZoneOk(false);
        setZoneDistance(null);
        return;
      }
      setZoneOk(!!r.within);
      setZoneDistance(r.distanceKm ?? null);
    }

    t = setTimeout(run, 600);
    return () => {
      cancelled = true;
      if (t) clearTimeout(t);
    };
  }, [deliveryEnabled, deliveryAddress]);

  const zoneAllowed = !deliveryEnabled || zoneOk === true; // si pickup => OK
  const canOrder = cartItems.length > 0 && minOk && addressOk && zoneAllowed && !checkingZone;
  const canPayOnline = canOrder && !loadingOnline && !loadingCash;
  const canPayCash = canOrder && !loadingCash && !loadingOnline;

  const warningMessage = useMemo(() => {
    if (cartItems.length === 0) return "Ton panier est vide.";
    if (!minOk) return "⚠️ Il faut commander un minimum de 20€.";
    if (deliveryEnabled && !addressOk) return "⚠️ Adresse de livraison obligatoire.";
    if (checkingZone) return "⏳ Vérification de la zone de livraison…";
    if (deliveryEnabled && zoneOk === false) {
      const d = zoneDistance != null ? ` (distance: ${zoneDistance} km)` : "";
      return `⚠️ Adresse hors zone: livraison limitée à 10 km${d}.`;
    }
    return null;
  }, [cartItems.length, minOk, deliveryEnabled, addressOk, checkingZone, zoneOk, zoneDistance]);

  const stripeItems = useMemo(() => {
    // On envoie les prix en EUROS au Worker
    return cartItems.map((it) => ({
      name: it.name,
      price: Number(it.price), // EUROS
      quantity: it.quantity || 1,
    }));
  }, [cartItems]);

  async function handlePayOnline() {
    try {
      setLoadingOnline(true);
      await startCheckout({
        items: stripeItems,
        deliveryEnabled,
        deliveryAddress: deliveryEnabled ? deliveryAddress.trim() : "",
      });
    } catch (e: any) {
      alert(e?.message || String(e));
      setLoadingOnline(false);
    }
  }

  async function handlePayCash() {
    // Ici tu peux brancher Firebase / notification au snack plus tard.
    // Pour l’instant: confirmation simple.
    try {
      setLoadingCash(true);

      const summary =
        `Commande (CASH)\n` +
        cartItems.map((it) => `- ${it.quantity}x ${it.name} (${eur(Number(it.price))})`).join("\n") +
        `\n\nSous-total: ${eur(subtotal)}` +
        `\nLivraison: ${eur(deliveryFee)}` +
        `\nTOTAL: ${eur(total)}` +
        (deliveryEnabled ? `\nAdresse: ${deliveryAddress.trim()}` : "\nRetrait sur place");

      alert("✅ Commande cash validée (à brancher sur l’enregistrement/notifications).\n\n" + summary);

      setLoadingCash(false);
      onClose();
    } catch (e: any) {
      alert(e?.message || String(e));
      setLoadingCash(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Commander</h2>
          <button onClick={onClose} className="rounded px-3 py-1 text-sm hover:bg-gray-100">
            Fermer
          </button>
        </div>

        <div className="mt-3 space-y-3">
          {/* Items */}
          <div className="max-h-56 overflow-auto rounded-lg border p-2">
            {cartItems.length === 0 ? (
              <p className="text-sm text-gray-500">Panier vide</p>
            ) : (
              cartItems.map((it) => (
                <div key={it.id} className="flex items-center justify-between border-b py-2 last:border-b-0">
                  <div className="pr-2">
                    <div className="text-sm font-semibold">{it.name}</div>
                    <div className="text-xs text-gray-600">
                      Qté: {it.quantity} • {eur(Number(it.price))}
                    </div>
                  </div>
                  <button
                    className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                    onClick={() => onRemoveFromCart(it.id)}
                  >
                    Supprimer
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Livraison toggle */}
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Mode</div>
                <div className="text-xs text-gray-600">
                  Livraison = +{eur(DELIVERY_FEE_EUR)} • Zone 10 km
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={deliveryEnabled}
                  onChange={(e) => setDeliveryEnabled(e.target.checked)}
                />
                Livraison
              </label>
            </div>

            {deliveryEnabled && (
              <div className="mt-3">
                <label className="text-xs font-semibold text-gray-700">Adresse de livraison</label>
                <textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="mt-1 w-full rounded-md border p-2 text-sm"
                  rows={2}
                  placeholder='Ex: "Rue ..., 7000 Mons"'
                />
                <div className="mt-1 text-xs text-gray-600">
                  {checkingZone
                    ? "Vérification en cours…"
                    : zoneOk === true
                    ? `✅ Dans la zone (${zoneDistance ?? "?"} km)`
                    : zoneOk === false
                    ? "❌ Hors zone (10 km)"
                    : " "}
                </div>
              </div>
            )}
          </div>

          {/* Totaux */}
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between text-sm">
              <span>Sous-total</span>
              <span className="font-semibold">{eur(subtotal)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span>Livraison</span>
              <span className="font-semibold">{eur(deliveryFee)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-base">
              <span className="font-bold">Total</span>
              <span className="text-xl font-black">{eur(total)}</span>
            </div>
          </div>

          {/* Warning */}
          {warningMessage && (
            <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
              {warningMessage}
            </div>
          )}

          {/* Actions */}
          <button
            onClick={handlePayOnline}
            disabled={!canPayOnline}
            className={`w-full rounded-lg py-3 text-sm font-bold ${
              canPayOnline ? "bg-yellow-400 hover:bg-yellow-500" : "bg-gray-200 text-gray-500"
            }`}
          >
            {loadingOnline ? "Paiement..." : "PAYER EN LIGNE"}
          </button>

          <button
            onClick={handlePayCash}
            disabled={!canPayCash}
            className={`w-full rounded-lg py-3 text-sm font-bold ${
              canPayCash ? "bg-gray-900 text-white hover:bg-black" : "bg-gray-200 text-gray-500"
            }`}
          >
            {loadingCash ? "Validation..." : "PAYER EN CASH"}
          </button>

          <p className="text-xs text-gray-500">
            Minimum: 20€ (hors livraison). Livraison: +2,50€. Zone: 10 km autour du snack.
          </p>
        </div>
      </div>
    </div>
  );
}
