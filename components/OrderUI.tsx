import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Minus, Plus, ShoppingBag, Trash2, CreditCard, AlertTriangle, Truck, Store, User, Phone, MapPin } from 'lucide-react';
import { MenuItem, MenuCategory, SAUCES, SUPPLEMENTS, VEGGIES, CartItem } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { startCheckout, runDevTest } from '../lib/stripe';
import { Portal } from './Portal';

interface OrderUIProps {
  isOrderModalOpen: boolean;
  selectedItem: MenuItem | null;
  selectedCategory: MenuCategory | null;
  closeOrderModal: () => void;
  addToCart: (item: CartItem) => void;

  isCartOpen: boolean;
  closeCart: () => void;
  cartItems: CartItem[];
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  screenW: number;
}

const MIN_ORDER_EUR = 20;
const DELIVERY_FEE_EUR = 2.5;

// ✅ Zone livraison (sans API): whitelist codes postaux ~10km autour de Wasmes/Colfontaine
// Ajuste si tu veux élargir/rétrécir.
const ALLOWED_POSTAL_CODES = new Set([
  '7340', // Colfontaine
  '7390', // Quaregnon
  '7080', // Frameries
  '7330', // Saint-Ghislain
  '7300', // Boussu
  '7370', // Dour
  '7000', // Mons
  '7012', // Jemappes
  '7011', // Ghlin
  '7020', // Nimy / Maisières (selon communes)
]);

type DeliveryMode = 'delivery' | 'pickup';

export const OrderUI: React.FC<OrderUIProps> = ({
  isOrderModalOpen,
  selectedItem,
  selectedCategory,
  closeOrderModal,
  addToCart,
  isCartOpen,
  closeCart,
  cartItems,
  removeFromCart,
  clearCart,
  screenW
}) => {
  const [quantity, setQuantity] = useState(1);
  const [selectedSauce, setSelectedSauce] = useState<string>('Sans sauce');
  const [selectedSupplements, setSelectedSupplements] = useState<string[]>([]);
  const [selectedVeggies, setSelectedVeggies] = useState<string[]>([]);

  const [variant, setVariant] = useState<'Menu/Frites' | 'Solo'>('Menu/Frites');

  // ✅ Livraison / Adresse
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('delivery');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');

  // ✅ Cash confirmation (sans backend)
  const [cashConfirm, setCashConfirm] = useState<string | null>(null);

  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const bodyStyleRestoreRef = useRef<null | { overflow: string; filter: string }>(null);

  const dev = import.meta.env.DEV;
  const logDev = (...args: any[]) => dev && console.log(...args);
  const warnDev = (...args: any[]) => dev && console.warn(...args);

  const safeW =
    Number.isFinite(screenW) && screenW > 0
      ? screenW
      : (typeof window !== 'undefined' ? window.innerWidth : 0);

  const safeH =
    typeof window !== 'undefined' && Number.isFinite(window.innerHeight)
      ? window.innerHeight
      : 0;

  const hiddenCartX = Math.max(safeW, 480);
  const hiddenModalY = Math.max(safeH, 900);

  const overlayOpen = isCartOpen || (isOrderModalOpen && !!selectedItem && !!selectedCategory);

  useEffect(() => {
    logDev('[OrderUI] state', { isCartOpen, isOrderModalOpen, screenW, overlayOpen });
  }, [isCartOpen, isOrderModalOpen, screenW, overlayOpen]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const restore = () => {
      const prev = bodyStyleRestoreRef.current;
      if (!prev) {
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('filter');
        return;
      }

      if (prev.overflow) document.body.style.overflow = prev.overflow;
      else document.body.style.removeProperty('overflow');

      if (prev.filter) document.body.style.filter = prev.filter;
      else document.body.style.removeProperty('filter');

      bodyStyleRestoreRef.current = null;
    };

    if (overlayOpen) {
      if (!bodyStyleRestoreRef.current) {
        bodyStyleRestoreRef.current = {
          overflow: document.body.style.overflow || '',
          filter: document.body.style.filter || '',
        };
      }
      document.body.style.overflow = 'hidden';
    } else {
      restore();
    }

    return restore;
  }, [overlayOpen]);

  useEffect(() => {
    if (!overlayOpen && dev) {
      const hasOverflow = document.body.style.overflow;
      if (hasOverflow) {
        warnDev('[OrderUI][DEV] Body overflow should be cleared when overlay is hidden', { overflow: hasOverflow });
      }
    }
  }, [overlayOpen, dev]);

  useEffect(() => {
    if (isOrderModalOpen) {
      setQuantity(1);
      setSelectedSauce('Sans sauce');
      setSelectedSupplements([]);
      setSelectedVeggies([]);
      setVariant('Menu/Frites');
    }
  }, [isOrderModalOpen, selectedItem]);

  const handleSupplementToggle = (suppName: string) => {
    setSelectedSupplements((prev) =>
      prev.includes(suppName) ? prev.filter(s => s !== suppName) : [...prev, suppName]
    );
  };

  const handleVeggieToggle = (vegName: string) => {
    setSelectedVeggies((prev) =>
      prev.includes(vegName) ? prev.filter(v => v !== vegName) : [...prev, vegName]
    );
  };

  const getSupplementPrice = (name: string) =>
    SUPPLEMENTS.find((sup) => sup.name === name)?.price ?? 0;

  const supplementLabelPrice = SUPPLEMENTS[0]?.price ?? 0;

  const handleOverlayClick = () => {
    if (isCartOpen) closeCart();
    if (isOrderModalOpen) closeOrderModal();
  };

  const getCurrentItemPrice = () => {
    if (!selectedItem) return 0;
    const base =
      variant === 'Solo' && selectedItem.priceSecondary
        ? Number(selectedItem.priceSecondary)
        : Number(selectedItem.price);

    const suppsCost = selectedSupplements.reduce((total, name) => total + getSupplementPrice(name), 0);
    return base + suppsCost;
  };

  function toCents(euros: number): number {
    if (!Number.isFinite(euros)) throw new Error("Prix invalide (NaN/Infinity)");
    return Math.round(euros * 100);
  }

  const handleAddToCart = () => {
    if (!selectedItem) return;

    const itemTotal = getCurrentItemPrice();

    const newItem: CartItem = {
      id: Math.random().toString(36).substr(2, 9),
      name: selectedItem.name,
      price: itemTotal, // ✅ EUROS dans le panier
      quantity: quantity,
      selectedSauce: selectedCategory?.hasSauces ? selectedSauce : undefined,
      selectedSupplements: selectedCategory?.hasSupplements ? selectedSupplements : undefined,
      selectedVeggies: selectedCategory?.hasVeggies ? selectedVeggies : undefined,
      variant: selectedItem.priceSecondary ? variant : undefined
    };

    logDev('[Checkout][DEV] Ajout panier', { name: newItem.name, quantity: newItem.quantity, total: itemTotal * quantity });

    addToCart(newItem);
    closeOrderModal();
  };

  // ✅ Totaux
  const itemsSubtotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0),
    [cartItems]
  );

  const deliveryFee = deliveryMode === 'delivery' ? DELIVERY_FEE_EUR : 0;
  const grandTotal = itemsSubtotal + deliveryFee;

  // ✅ Minimum sur le sous-total (sans livraison)
  const minOk = itemsSubtotal >= MIN_ORDER_EUR;

  // ✅ Adresse requise seulement si livraison
  const cleanedPostal = postalCode.trim().replace(/\s+/g, '');
  const addressRequiredOk =
    deliveryMode === 'pickup' ||
    (
      customerName.trim().length >= 2 &&
      customerPhone.trim().length >= 6 &&
      addressLine.trim().length >= 4 &&
      cleanedPostal.length >= 4 &&
      city.trim().length >= 2
    );

  // ✅ Zone livraison (sans API): on contrôle le code postal
  const zoneOk =
    deliveryMode === 'pickup' ||
    (ALLOWED_POSTAL_CODES.has(cleanedPostal));

  const canPay = cartItems.length > 0 && minOk && addressRequiredOk && zoneOk && !isCheckingOut;

  const buildOrderSummaryText = () => {
    const lines: string[] = [];
    lines.push(`Snack Family 2 - Nouvelle commande (${deliveryMode === 'delivery' ? 'Livraison' : 'À emporter'})`);
    lines.push(`Nom: ${customerName || '-'}`);
    lines.push(`Téléphone: ${customerPhone || '-'}`);

    if (deliveryMode === 'delivery') {
      lines.push(`Adresse: ${addressLine}, ${cleanedPostal} ${city}`);
      lines.push(`Frais livraison: ${DELIVERY_FEE_EUR.toFixed(2)}€`);
    } else {
      lines.push(`Retrait sur place`);
    }

    lines.push(`--- Articles ---`);
    cartItems.forEach((it) => {
      lines.push(`- ${it.quantity}x ${it.name} = ${(it.price * it.quantity).toFixed(2)}€`);
    });

    lines.push(`Sous-total: ${itemsSubtotal.toFixed(2)}€`);
    lines.push(`Total: ${grandTotal.toFixed(2)}€`);
    return lines.join('\n');
  };

  const handleCashOrder = async () => {
    setCheckoutError(null);
    setCashConfirm(null);

    if (cartItems.length === 0) {
      setCheckoutError('Votre panier est vide.');
      return;
    }
    if (!minOk) {
      setCheckoutError(`Il faut commander un minimum de ${MIN_ORDER_EUR.toFixed(2)}€ (hors livraison).`);
      return;
    }
    if (!addressRequiredOk) {
      setCheckoutError(`Merci de remplir vos informations ${deliveryMode === 'delivery' ? 'de livraison' : 'client'} avant de valider.`);
      return;
    }
    if (!zoneOk) {
      setCheckoutError(`Zone de livraison limitée : 10 km autour du snack (7340 et alentours).`);
      return;
    }

    const text = buildOrderSummaryText();
    setCashConfirm(text);

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // si clipboard pas dispo, on affiche juste le texte
    }
  };

  const handleStripeCheckout = async () => {
    setIsCheckingOut(true);
    setCheckoutError(null);
    setCashConfirm(null);

    try {
      if (cartItems.length === 0) throw new Error('Votre panier est vide.');
      if (!minOk) throw new Error(`Il faut commander un minimum de ${MIN_ORDER_EUR.toFixed(2)}€ (hors livraison).`);
      if (!addressRequiredOk) throw new Error(`Merci de remplir vos informations ${deliveryMode === 'delivery' ? 'de livraison' : 'client'} avant de payer.`);
      if (!zoneOk) throw new Error(`Zone de livraison limitée : 10 km autour du snack (7340 et alentours).`);

      // ✅ On envoie les items en CENTIMES au Worker (il est “flexible” mais ça reste propre)
      const checkoutItems: Array<{ name: string; price: number; quantity: number }> =
        cartItems.map(item => {
          let description = item.name;
          if (item.variant) description += ` (${item.variant})`;
          if (item.selectedSauce) description += ` - ${item.selectedSauce}`;
          if (item.selectedSupplements && item.selectedSupplements.length > 0) {
            description += ` + ${item.selectedSupplements.join(', ')}`;
          }

          const price = toCents(item.price); // ✅ item.price est en euros
          const quantity = Math.max(1, Math.trunc(item.quantity));
          return { name: description, price, quantity };
        });

      logDev('[Checkout][DEV] Items envoyés', checkoutItems);
      logDev('[Checkout][DEV] Sous-total', itemsSubtotal.toFixed(2));
      logDev('[Checkout][DEV] DeliveryMode', deliveryMode);

      await startCheckout(checkoutItems, {
        deliveryMode,
        customer: { name: customerName.trim(), phone: customerPhone.trim() },
        address: deliveryMode === 'delivery'
          ? { line1: addressLine.trim(), postalCode: cleanedPostal, city: city.trim(), country: 'BE' }
          : undefined
      });
      // redirection Stripe si OK
    } catch (error) {
      console.error("Checkout failed", error);
      const message = error instanceof Error ? error.message : 'Impossible de finaliser le paiement.';
      setCheckoutError(message);
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {overlayOpen && (
          <Portal>
            <motion.div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm"
              style={{ zIndex: 9998 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0 } }}
              onClick={handleOverlayClick}
            />
          </Portal>
        )}
      </AnimatePresence>

      {/* --- ORDER MODAL --- */}
      <AnimatePresence>
        {isOrderModalOpen && selectedItem && selectedCategory && (
          <Portal>
            <div
              className="fixed inset-0 flex items-end md:items-center justify-center pointer-events-none"
              style={{ zIndex: 9999 }}
            >
              <motion.div
                initial={{ y: hiddenModalY }}
                animate={{ y: 0 }}
                exit={{ y: hiddenModalY }}
                transition={{ type: 'tween', duration: 0.35, ease: 'easeOut' }}
                className="relative bg-white w-full md:w-[600px] max-h-[90vh] md:rounded-xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bg-snack-black text-white p-5 flex justify-between items-center">
                  <div>
                    <h3 className="font-display font-bold text-2xl uppercase tracking-wide">{selectedItem.name}</h3>
                    <span className="text-snack-gold text-sm font-medium uppercase tracking-wider">{selectedCategory.title}</span>
                  </div>
                  <button onClick={closeOrderModal} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                    <X size={24} />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-8 bg-gray-50">
                  {selectedItem.priceSecondary && (
                    <div className="bg-white p-4 rounded border border-gray-200 shadow-sm">
                      <h4 className="font-bold text-snack-black uppercase mb-3 text-sm tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 bg-snack-gold rounded-full"></span> Format
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => setVariant('Menu/Frites')}
                          className={`p-3 rounded border-2 text-sm font-bold uppercase flex flex-col items-center justify-center gap-1 transition-all ${variant === 'Menu/Frites' ? 'border-snack-gold bg-snack-gold/10 text-black' : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}
                        >
                          <span>{selectedCategory.id === 'mitraillettes' ? 'Mitraillette (+Frites)' : 'Menu / Frites'}</span>
                          <span className="text-lg">{Number(selectedItem.price).toFixed(2)} €</span>
                        </button>
                        <button
                          onClick={() => setVariant('Solo')}
                          className={`p-3 rounded border-2 text-sm font-bold uppercase flex flex-col items-center justify-center gap-1 transition-all ${variant === 'Solo' ? 'border-snack-gold bg-snack-gold/10 text-black' : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}
                        >
                          <span>{selectedCategory.id === 'mitraillettes' ? 'Pain Seul' : 'Seul / Pain'}</span>
                          <span className="text-lg">{Number(selectedItem.priceSecondary).toFixed(2)} €</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedCategory.hasSauces && (
                    <div className="bg-white p-4 rounded border border-gray-200 shadow-sm">
                      <h4 className="font-bold text-snack-black uppercase mb-3 text-sm tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 bg-snack-gold rounded-full"></span> Sauce
                      </h4>
                      <select
                        value={selectedSauce}
                        onChange={(e) => setSelectedSauce(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded focus:border-snack-gold focus:ring-1 focus:ring-snack-gold outline-none bg-white font-medium"
                      >
                        {SAUCES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}

                  {selectedCategory.hasVeggies && (
                    <div className="bg-white p-4 rounded border border-gray-200 shadow-sm">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="font-bold text-snack-black uppercase text-sm tracking-wider flex items-center gap-2">
                          <span className="w-2 h-2 bg-snack-gold rounded-full"></span> Crudités
                        </h4>
                        <div className="text-xs space-x-2 font-bold">
                          <button onClick={() => setSelectedVeggies(VEGGIES)} className="text-snack-gold hover:underline uppercase">Tout</button>
                          <span className="text-gray-300">|</span>
                          <button onClick={() => setSelectedVeggies([])} className="text-gray-400 hover:underline uppercase">Rien</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {VEGGIES.map(veg => (
                          <label key={veg} className="flex items-center space-x-2 cursor-pointer select-none p-2 rounded hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-colors">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedVeggies.includes(veg) ? 'bg-snack-black border-snack-black' : 'border-gray-300'}`}>
                              {selectedVeggies.includes(veg) && <div className="w-2 h-2 bg-snack-gold rounded-full"></div>}
                            </div>
                            <input
                              type="checkbox"
                              checked={selectedVeggies.includes(veg)}
                              onChange={() => handleVeggieToggle(veg)}
                              className="hidden"
                            />
                            <span className={`text-sm ${selectedVeggies.includes(veg) ? 'text-snack-black font-bold' : 'text-gray-500'}`}>{veg}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedCategory.hasSupplements && (
                    <div className="bg-white p-4 rounded border border-gray-200 shadow-sm">
                      <h4 className="font-bold text-snack-black uppercase mb-3 text-sm tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 bg-snack-gold rounded-full"></span> Suppléments (+{supplementLabelPrice.toFixed(2)}€)
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {SUPPLEMENTS.map(sup => (
                          <label
                            key={sup.name}
                            className={`flex items-center justify-between cursor-pointer select-none p-3 border rounded transition-all ${selectedSupplements.includes(sup.name) ? 'border-snack-gold bg-yellow-50/50' : 'border-gray-200 hover:border-gray-300'}`}
                          >
                            <div className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={selectedSupplements.includes(sup.name)}
                                onChange={() => handleSupplementToggle(sup.name)}
                                className="accent-snack-gold w-4 h-4"
                              />
                              <span className="text-sm font-bold text-snack-black">{sup.name}</span>
                            </div>
                            <span className="text-xs font-bold text-snack-gold bg-black px-1.5 py-0.5 rounded">+{sup.price.toFixed(2)}€</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-5 border-t border-gray-200 bg-white flex items-center gap-4 shadow-up-lg">
                  <div className="flex items-center border-2 border-gray-200 rounded-lg bg-white h-12">
                    <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-10 h-full flex items-center justify-center hover:bg-gray-100 text-gray-500">
                      <Minus size={18} />
                    </button>
                    <span className="w-10 text-center font-bold text-lg text-snack-black">{quantity}</span>
                    <button onClick={() => setQuantity(quantity + 1)} className="w-10 h-full flex items-center justify-center hover:bg-gray-100 text-gray-500">
                      <Plus size={18} />
                    </button>
                  </div>

                  <button
                    onClick={handleAddToCart}
                    className="flex-1 bg-snack-gold text-snack-black h-14 rounded-lg font-display font-bold text-lg uppercase tracking-wide hover:bg-black hover:text-snack-gold transition-all duration-200 flex items-center justify-between px-6 shadow-lg active:scale-95 active:bg-green-600 active:text-white"
                  >
                    <span>Ajouter</span>
                    <span>{(getCurrentItemPrice() * quantity).toFixed(2)} €</span>
                  </button>
                </div>
              </motion.div>
            </div>
          </Portal>
        )}
      </AnimatePresence>

      {/* --- CART DRAWER --- */}
      <AnimatePresence>
        {isCartOpen && (
          <Portal>
            <div className="fixed inset-0 flex justify-end pointer-events-none" style={{ zIndex: 9999 }}>
              <motion.div
                initial={{ x: hiddenCartX }}
                animate={{ x: 0 }}
                exit={{ x: hiddenCartX }}
                transition={{ type: 'tween', duration: 0.35, ease: 'easeOut' }}
                className="fixed top-0 right-0 h-full w-full md:w-[450px] bg-white shadow-2xl flex flex-col relative pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <AnimatePresence>
                  {isClearConfirmOpen && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
                      style={{ zIndex: 10000 }}
                    >
                      <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-xs text-center">
                        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
                          <Trash2 size={24} />
                        </div>
                        <h3 className="font-display font-bold text-xl uppercase text-snack-black mb-2">Vider le panier ?</h3>
                        <p className="text-gray-500 text-sm mb-6">Cette action supprimera tous les articles de votre commande.</p>
                        <div className="grid grid-cols-2 gap-3">
                          <button onClick={() => setIsClearConfirmOpen(false)} className="py-2 rounded-lg border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors">Annuler</button>
                          <button onClick={() => { clearCart(); setIsClearConfirmOpen(false); }} className="py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 transition-colors">Vider</button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="p-5 bg-snack-black text-white flex justify-between items-center shadow-md relative z-10">
                  <div className="flex items-center gap-3">
                    <ShoppingBag className="text-snack-gold" />
                    <h2 className="font-display font-bold text-xl uppercase">Votre Panier</h2>
                  </div>
                  <div className="flex items-center gap-4">
                    {cartItems.length > 0 && (
                      <button onClick={() => setIsClearConfirmOpen(true)} className="text-xs font-bold text-gray-400 hover:text-red-500 uppercase tracking-wider transition-colors">Vider</button>
                    )}
                    <button onClick={closeCart} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X /></button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50">
                  {cartItems.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                      <ShoppingBag size={64} className="mb-4 opacity-20" />
                      <p className="text-lg font-medium">Votre panier est vide</p>
                      <button onClick={closeCart} className="mt-4 text-snack-gold underline font-bold uppercase text-sm">Continuer mes achats</button>

                      {dev && (
                        <div className="mt-12 text-center">
                          <button
                            onClick={() => runDevTest()}
                            className="text-xs text-gray-300 hover:text-red-500 underline"
                          >
                            Test paiement (DEV)
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    cartItems.map((item) => (
                      <div key={item.id} className="border border-gray-200 rounded-lg p-4 shadow-sm bg-white relative group hover:border-snack-gold transition-colors">
                        <button onClick={() => removeFromCart(item.id)} className="absolute top-3 right-3 text-gray-300 hover:text-red-500 transition-colors p-1">
                          <Trash2 size={18} />
                        </button>

                        <div>
                          <h4 className="font-bold text-snack-black text-lg">{item.name}</h4>
                          {item.variant && (
                            <span className="text-[10px] font-bold text-black uppercase bg-snack-gold px-1.5 py-0.5 rounded mr-2">
                              {item.variant === 'Menu/Frites' ? 'Menu/Frites' : 'Seul'}
                            </span>
                          )}
                        </div>

                        <div className="mt-2 text-sm text-gray-500 space-y-1 border-l-2 border-gray-100 pl-3">
                          {item.selectedSauce && <p><span className="font-bold text-xs uppercase">Sauce:</span> {item.selectedSauce}</p>}
                          {item.selectedVeggies && (
                            <p>
                              <span className="font-bold text-xs uppercase">Crudités:</span>{' '}
                              {item.selectedVeggies.length === VEGGIES.length ? 'Tout' : item.selectedVeggies.length === 0 ? 'Aucune' : item.selectedVeggies.join(', ')}
                            </p>
                          )}
                          {item.selectedSupplements && item.selectedSupplements.length > 0 && (
                            <p className="text-snack-black font-bold">+ {item.selectedSupplements.join(', ')}</p>
                          )}
                        </div>

                        <div className="mt-3 pt-3 border-t border-gray-50 flex justify-between items-center">
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Qté: {item.quantity}</span>
                          <span className="font-bold text-lg text-snack-black">{(item.price * item.quantity).toFixed(2)} €</span>
                        </div>
                      </div>
                    ))
                  )}

                  {/* ✅ Infos livraison + client */}
                  {cartItems.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold uppercase text-sm text-snack-black">Mode</h3>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setDeliveryMode('delivery')}
                            className={`px-3 py-2 rounded-lg text-xs font-bold uppercase flex items-center gap-2 border ${
                              deliveryMode === 'delivery' ? 'border-snack-gold bg-snack-gold/10 text-snack-black' : 'border-gray-200 text-gray-500'
                            }`}
                          >
                            <Truck size={16} /> Livraison (+{DELIVERY_FEE_EUR.toFixed(2)}€)
                          </button>
                          <button
                            onClick={() => setDeliveryMode('pickup')}
                            className={`px-3 py-2 rounded-lg text-xs font-bold uppercase flex items-center gap-2 border ${
                              deliveryMode === 'pickup' ? 'border-snack-gold bg-snack-gold/10 text-snack-black' : 'border-gray-200 text-gray-500'
                            }`}
                          >
                            <Store size={16} /> À emporter
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        <div className="flex items-center gap-2">
                          <User size={16} className="text-gray-400" />
                          <input
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            placeholder="Nom"
                            className="w-full p-3 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone size={16} className="text-gray-400" />
                          <input
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                            placeholder="Téléphone"
                            className="w-full p-3 border border-gray-300 rounded-lg"
                          />
                        </div>

                        {deliveryMode === 'delivery' && (
                          <>
                            <div className="flex items-center gap-2">
                              <MapPin size={16} className="text-gray-400" />
                              <input
                                value={addressLine}
                                onChange={(e) => setAddressLine(e.target.value)}
                                placeholder="Adresse (rue + numéro)"
                                className="w-full p-3 border border-gray-300 rounded-lg"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <input
                                value={postalCode}
                                onChange={(e) => setPostalCode(e.target.value)}
                                placeholder="Code postal"
                                className="w-full p-3 border border-gray-300 rounded-lg"
                              />
                              <input
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                placeholder="Ville"
                                className="w-full p-3 border border-gray-300 rounded-lg"
                              />
                            </div>

                            {!zoneOk && cleanedPostal.length > 0 && (
                              <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
                                <AlertTriangle className="mt-0.5" size={18} />
                                <div>
                                  <div className="font-bold">Zone de livraison limitée</div>
                                  <div>Livraison uniquement à ~10 km autour du snack (7340 et alentours).</div>
                                </div>
                              </div>
                            )}
                          </>
                        )}

                        {!minOk && (
                          <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
                            <AlertTriangle className="mt-0.5" size={18} />
                            <div>
                              <div className="font-bold">Minimum de commande</div>
                              <div>Il faut commander un minimum de {MIN_ORDER_EUR.toFixed(2)}€ (hors livraison).</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {cartItems.length > 0 && (
                  <div className="p-6 border-t border-gray-200 bg-white shadow-[0_-5px_15px_rgba(0,0,0,0.05)] space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500 font-bold uppercase tracking-wider">Sous-total</span>
                        <span className="font-bold text-snack-black">{itemsSubtotal.toFixed(2)} €</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500 font-bold uppercase tracking-wider">Livraison</span>
                        <span className="font-bold text-snack-black">{deliveryFee.toFixed(2)} €</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500 uppercase font-bold tracking-wider text-sm">Total</span>
                        <span className="text-3xl font-display font-bold text-snack-black">{grandTotal.toFixed(2)} €</span>
                      </div>
                    </div>

                    {/* ✅ Paiement Stripe */}
                    <button
                      id="stripe-checkout-btn"
                      onClick={handleStripeCheckout}
                      disabled={!canPay}
                      className={`w-full py-4 rounded font-display font-bold text-xl uppercase tracking-wide border border-transparent transition-all shadow-lg flex items-center justify-center gap-2 group ${
                        canPay ? 'bg-snack-gold text-snack-black hover:bg-white hover:border-snack-black' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {isCheckingOut ? (
                        <span>Chargement...</span>
                      ) : (
                        <>
                          <CreditCard size={24} className="group-hover:scale-110 transition-transform" />
                          <span>Payer en ligne</span>
                        </>
                      )}
                    </button>

                    {/* ✅ Paiement cash */}
                    <button
                      onClick={handleCashOrder}
                      disabled={cartItems.length === 0 || !minOk || !addressRequiredOk || !zoneOk}
                      className={`w-full py-3 rounded-lg font-bold uppercase tracking-wide border transition-all ${
                        (cartItems.length > 0 && minOk && addressRequiredOk && zoneOk)
                          ? 'bg-snack-black text-white hover:bg-white hover:text-snack-black hover:border-snack-black'
                          : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                      }`}
                    >
                      Payer en cash
                    </button>

                    {checkoutError && (
                      <p className="text-sm text-red-600 text-center font-semibold">
                        {checkoutError}
                      </p>
                    )}

                    {cashConfirm && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                        <div className="font-bold mb-1">Commande cash prête ✅</div>
                        <div className="text-gray-700">
                          Le récapitulatif a été copié (si possible). Tu peux aussi le copier ci-dessous :
                        </div>
                        <pre className="mt-2 whitespace-pre-wrap text-xs bg-white border border-green-200 rounded p-2 max-h-44 overflow-auto">
{cashConfirm}
                        </pre>
                      </div>
                    )}

                    {dev && (
                      <div className="text-center">
                        <button
                          onClick={() => runDevTest()}
                          className="text-xs text-gray-300 hover:text-red-500 underline"
                        >
                          Test paiement (DEV)
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            </div>
          </Portal>
        )}
      </AnimatePresence>
    </>
  );
};
