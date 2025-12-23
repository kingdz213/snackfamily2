// components/OrderUI.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Minus, Plus, ShoppingBag, Trash2, CreditCard, AlertTriangle, MapPin, Banknote } from 'lucide-react';
import { MenuItem, MenuCategory, SAUCES, SUPPLEMENTS, VEGGIES, CartItem } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { startCheckout } from '../lib/stripe';
import { Portal } from './Portal';
import { getRecommendations, MIN_ORDER_EUR } from '../lib/recommendations';
import { MENU_CATEGORIES } from '../data/menuData';

interface OrderUIProps {
  isOrderModalOpen: boolean;
  selectedItem: MenuItem | null;
  selectedCategory: MenuCategory | null;
  closeOrderModal: () => void;
  openOrderModal: (item: MenuItem, category: MenuCategory) => void;
  addToCart: (item: CartItem) => void;

  isCartOpen: boolean;
  closeCart: () => void;
  cartItems: CartItem[];
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  screenW: number;
}

const DELIVERY_FEE_EUR = 2.5;
const MAX_DELIVERY_KM = 10;

// ⚠️ Coordonnées approx du snack (ajuste si besoin)
const SHOP_LAT = 50.425226;
const SHOP_LNG = 3.846433;

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const OrderUI: React.FC<OrderUIProps> = ({
  isOrderModalOpen,
  selectedItem,
  selectedCategory,
  closeOrderModal,
  openOrderModal,
  addToCart,
  isCartOpen,
  closeCart,
  cartItems,
  removeFromCart,
  clearCart,
  screenW,
}) => {
  const [quantity, setQuantity] = useState(1);
  const [selectedSauce, setSelectedSauce] = useState<string>('Sans sauce');
  const [selectedSupplements, setSelectedSupplements] = useState<string[]>([]);
  const [selectedVeggies, setSelectedVeggies] = useState<string[]>([]);
  const [variant, setVariant] = useState<'Menu/Frites' | 'Solo'>('Menu/Frites');

  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutInfo, setCheckoutInfo] = useState<string | null>(null);

  // Paiement
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'cash'>('stripe');

  // Adresse + position obligatoires
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryLat, setDeliveryLat] = useState<number | undefined>(undefined);
  const [deliveryLng, setDeliveryLng] = useState<number | undefined>(undefined);
  const [isLocating, setIsLocating] = useState(false);
  const geoRequestLockRef = useRef(false);

  const bodyStyleRestoreRef = useRef<null | { overflow: string; filter: string }>(null);

  const dev = import.meta.env.DEV;
  const logDev = (...args: any[]) => dev && console.log(...args);
  const warnDev = (...args: any[]) => dev && console.warn(...args);

  const safeW =
    Number.isFinite(screenW) && screenW > 0 ? screenW : typeof window !== 'undefined' ? window.innerWidth : 0;

  const safeH = typeof window !== 'undefined' && Number.isFinite(window.innerHeight) ? window.innerHeight : 0;

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
      setCheckoutError(null);
      setCheckoutInfo(null);
    }
  }, [isOrderModalOpen, selectedItem]);

  const handleSupplementToggle = (suppName: string) => {
    setSelectedSupplements((prev) => (prev.includes(suppName) ? prev.filter((s) => s !== suppName) : [...prev, suppName]));
  };

  const handleVeggieToggle = (vegName: string) => {
    setSelectedVeggies((prev) => (prev.includes(vegName) ? prev.filter((v) => v !== vegName) : [...prev, vegName]));
  };

  const getSupplementPrice = (name: string) => SUPPLEMENTS.find((sup) => sup.name === name)?.price ?? 0;
  const supplementLabelPrice = SUPPLEMENTS[0]?.price ?? 0;

  const handleOverlayClick = () => {
    if (isCartOpen) closeCart();
    if (isOrderModalOpen) closeOrderModal();
  };

  const getCurrentItemPrice = () => {
    if (!selectedItem) return 0;
    const base =
      variant === 'Solo' && selectedItem.priceSecondary ? Number(selectedItem.priceSecondary) : Number(selectedItem.price);

    const suppsCost = selectedSupplements.reduce((total, name) => total + getSupplementPrice(name), 0);
    return base + suppsCost;
  };

  const handleAddToCart = () => {
    if (!selectedItem) return;

    const itemTotal = getCurrentItemPrice();

    const newItem: CartItem = {
      id: Math.random().toString(36).substr(2, 9),
      name: selectedItem.name,
      price: itemTotal, // EUROS
      quantity: quantity,
      selectedSauce: selectedCategory?.hasSauces ? selectedSauce : undefined,
      selectedSupplements: selectedCategory?.hasSupplements ? selectedSupplements : undefined,
      selectedVeggies: selectedCategory?.hasVeggies ? selectedVeggies : undefined,
      variant: selectedItem.priceSecondary ? variant : undefined,
    };

    addToCart(newItem);
    closeOrderModal();
  };

  const itemsSubtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalWithDelivery = itemsSubtotal + DELIVERY_FEE_EUR;
  const recommendations = useMemo(() => getRecommendations(cartItems, MENU_CATEGORIES), [cartItems]);
  const recommendationMissing = recommendations.missing;
  const hasCompletionSuggestions = recommendationMissing > 0 && recommendations.suggestions.length > 0;
  const hasUpsellSuggestions = recommendationMissing <= 0 && recommendations.suggestions.length > 0;

  // Minimum 20€ hors livraison
  const minOk = itemsSubtotal + 1e-9 >= MIN_ORDER_EUR;
  const disableStripeCheckout = paymentMethod === 'stripe' && !minOk;

  // Livraison obligatoire: adresse + position + distance <= 10km
  const hasAddress = deliveryAddress.trim().length > 0;
  const hasGeo = Number.isFinite(deliveryLat) && Number.isFinite(deliveryLng);

  const km =
    hasGeo && deliveryLat != null && deliveryLng != null
      ? distanceKm(SHOP_LAT, SHOP_LNG, deliveryLat, deliveryLng)
      : null;

  const inRange = km == null ? false : km <= MAX_DELIVERY_KM;
  const deliveryOk = hasAddress && hasGeo && inRange;

  const buildLineItemName = (item: CartItem) => {
    let description = item.name;
    if (item.variant) description += ` (${item.variant})`;
    if (item.selectedSauce) description += ` - ${item.selectedSauce}`;
    if (item.selectedVeggies) {
      const vegTxt =
        item.selectedVeggies.length === VEGGIES.length
          ? 'Tout'
          : item.selectedVeggies.length === 0
          ? 'Aucune'
          : item.selectedVeggies.join(', ');
      description += ` - Crudités: ${vegTxt}`;
    }
    if (item.selectedSupplements && item.selectedSupplements.length > 0) {
      description += ` + ${item.selectedSupplements.join(', ')}`;
    }
    return description;
  };

  const handleSuggestionAdd = (item: MenuItem, category: MenuCategory) => {
    const basePrice = Number(item.price);
    const hasOptions = category.hasSauces || category.hasSupplements || category.hasVeggies || item.priceSecondary !== undefined;

    if (hasOptions) {
      openOrderModal(item, category);
      return;
    }

    const quickItem: CartItem = {
      id: Math.random().toString(36).slice(2, 10),
      name: item.name,
      price: Number.isFinite(basePrice) ? basePrice : 0,
      quantity: 1,
    };

    addToCart(quickItem);
  };

  const requestGeolocation = () => {
    setCheckoutError(null);
    setCheckoutInfo('Demande de localisation…');

    if (!navigator.geolocation) {
      setIsLocating(false);
      setCheckoutInfo(null);
      setCheckoutError('La géolocalisation n’est pas disponible sur ce navigateur.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        setDeliveryLat(pos.coords.latitude);
        setDeliveryLng(pos.coords.longitude);
        setCheckoutInfo('Position détectée ✅');
      },
      (err) => {
        setIsLocating(false);
        let msg = err.message;
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Permission de localisation refusée.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'Position indisponible.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'La demande de localisation a expiré.';
        }
        setCheckoutInfo(null);
        setCheckoutError(`Erreur géoloc: ${msg}`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleGeoButton = (event: React.PointerEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (geoRequestLockRef.current) return;
    geoRequestLockRef.current = true;
    setTimeout(() => {
      geoRequestLockRef.current = false;
    }, 800);
    requestGeolocation();
  };

  const validateBeforeCheckout = (): boolean => {
    if (cartItems.length === 0) {
      setCheckoutError('Votre panier est vide.');
      return false;
    }
    if (!minOk) {
      setCheckoutError('Il faut commander un minimum de 20€.');
      return false;
    }
    if (!hasAddress) {
      setCheckoutError('Adresse de livraison obligatoire.');
      return false;
    }
    if (!hasGeo) {
      setCheckoutError('Position obligatoire. Cliquez sur « Utiliser ma position ».');
      return false;
    }
    if (!inRange) {
      setCheckoutError(`Livraison disponible uniquement dans un rayon de ${MAX_DELIVERY_KM} km.`);
      return false;
    }

    setCheckoutError(null);
    return true;
  };

  const handleStripeCheckout = async () => {
    setCheckoutError(null);
    setCheckoutInfo(null);

    if (!validateBeforeCheckout()) return;

    setIsCheckingOut(true);

    try {
      const items = cartItems.map((item) => ({
        name: buildLineItemName(item),
        price: Number(item.price), // EUROS (le worker gère la conversion)
        quantity: Math.max(1, Math.trunc(item.quantity)),
      }));

      await startCheckout({
        origin: window.location.origin,
        items,
        deliveryAddress: deliveryAddress.trim(),
        deliveryLat: Number(deliveryLat),
        deliveryLng: Number(deliveryLng),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de finaliser le paiement.';
      setCheckoutError(message);
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleCashCheckout = async () => {
    setCheckoutError(null);
    setCheckoutInfo(null);

    if (!validateBeforeCheckout()) return;

    setIsCheckingOut(true);

    try {
      const lines = cartItems
        .map((it) => `- ${buildLineItemName(it)} x${it.quantity} = ${(it.price * it.quantity).toFixed(2)}€`)
        .join('\n');

      const summary =
        `🧾 Commande (CASH - Livraison)\n\n` +
        `${lines}\n\n` +
        `Sous-total: ${itemsSubtotal.toFixed(2)}€\n` +
        `Livraison: +${DELIVERY_FEE_EUR.toFixed(2)}€\n` +
        `Total: ${totalWithDelivery.toFixed(2)}€\n\n` +
        `Adresse: ${deliveryAddress.trim()}\n` +
        (km != null ? `Distance: ${km.toFixed(1)} km\n` : '');

      const canClipboard = typeof navigator !== 'undefined' && (navigator as any).clipboard?.writeText;
      if (canClipboard) {
        await (navigator as any).clipboard.writeText(summary);
        setCheckoutInfo('Commande CASH copiée ✅ (tu peux la coller/envoyer)');
      } else {
        setCheckoutInfo('Commande CASH prête ✅ (copie manuelle nécessaire)');
        console.log(summary);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de valider la commande.';
      setCheckoutError(message);
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <>
      {/* OVERLAY */}
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
            <div className="fixed inset-0 flex items-end md:items-center justify-center pointer-events-none" style={{ zIndex: 9999 }}>
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
                          className={`p-3 rounded border-2 text-sm font-bold uppercase flex flex-col items-center justify-center gap-1 transition-all ${
                            variant === 'Menu/Frites'
                              ? 'border-snack-gold bg-snack-gold/10 text-black'
                              : 'border-gray-200 text-gray-400 hover:border-gray-300'
                          }`}
                        >
                          <span>{selectedCategory.id === 'mitraillettes' ? 'Mitraillette (+Frites)' : 'Menu / Frites'}</span>
                          <span className="text-lg">{Number(selectedItem.price).toFixed(2)} €</span>
                        </button>
                        <button
                          onClick={() => setVariant('Solo')}
                          className={`p-3 rounded border-2 text-sm font-bold uppercase flex flex-col items-center justify-center gap-1 transition-all ${
                            variant === 'Solo'
                              ? 'border-snack-gold bg-snack-gold/10 text-black'
                              : 'border-gray-200 text-gray-400 hover:border-gray-300'
                          }`}
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
                        {SAUCES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
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
                          <button onClick={() => setSelectedVeggies(VEGGIES)} className="text-snack-gold hover:underline uppercase">
                            Tout
                          </button>
                          <span className="text-gray-300">|</span>
                          <button onClick={() => setSelectedVeggies([])} className="text-gray-400 hover:underline uppercase">
                            Rien
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {VEGGIES.map((veg) => (
                          <label
                            key={veg}
                            className="flex items-center space-x-2 cursor-pointer select-none p-2 rounded hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-colors"
                          >
                            <div
                              className={`w-4 h-4 rounded border flex items-center justify-center ${
                                selectedVeggies.includes(veg) ? 'bg-snack-black border-snack-black' : 'border-gray-300'
                              }`}
                            >
                              {selectedVeggies.includes(veg) && <div className="w-2 h-2 bg-snack-gold rounded-full"></div>}
                            </div>
                            <input
                              type="checkbox"
                              checked={selectedVeggies.includes(veg)}
                              onChange={() => handleVeggieToggle(veg)}
                              className="hidden"
                            />
                            <span className={`text-sm ${selectedVeggies.includes(veg) ? 'text-snack-black font-bold' : 'text-gray-500'}`}>
                              {veg}
                            </span>
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
                        {SUPPLEMENTS.map((sup) => (
                          <label
                            key={sup.name}
                            className={`flex items-center justify-between cursor-pointer select-none p-3 border rounded transition-all ${
                              selectedSupplements.includes(sup.name) ? 'border-snack-gold bg-yellow-50/50' : 'border-gray-200 hover:border-gray-300'
                            }`}
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
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="w-10 h-full flex items-center justify-center hover:bg-gray-100 text-gray-500"
                    >
                      <Minus size={18} />
                    </button>
                    <span className="w-10 text-center font-bold text-lg text-snack-black">{quantity}</span>
                    <button
                      onClick={() => setQuantity(quantity + 1)}
                      className="w-10 h-full flex items-center justify-center hover:bg-gray-100 text-gray-500"
                    >
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
                          <button
                            onClick={() => setIsClearConfirmOpen(false)}
                            className="py-2 rounded-lg border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                          >
                            Annuler
                          </button>
                          <button
                            onClick={() => {
                              clearCart();
                              setIsClearConfirmOpen(false);
                            }}
                            className="py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 transition-colors"
                          >
                            Vider
                          </button>
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
                      <button
                        onClick={() => setIsClearConfirmOpen(true)}
                        className="text-xs font-bold text-gray-400 hover:text-red-500 uppercase tracking-wider transition-colors"
                      >
                        Vider
                      </button>
                    )}
                    <button onClick={closeCart} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                      <X />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50">
                  {cartItems.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                      <ShoppingBag size={64} className="mb-4 opacity-20" />
                      <p className="text-lg font-medium">Votre panier est vide</p>
                      <button onClick={closeCart} className="mt-4 text-snack-gold underline font-bold uppercase text-sm">
                        Continuer mes achats
                      </button>
                    </div>
                  ) : (
                    cartItems.map((item) => (
                      <div
                        key={item.id}
                        className="border border-gray-200 rounded-lg p-4 shadow-sm bg-white relative group hover:border-snack-gold transition-colors"
                      >
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="absolute top-3 right-3 text-gray-300 hover:text-red-500 transition-colors p-1"
                        >
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
                          {item.selectedSauce && (
                            <p>
                              <span className="font-bold text-xs uppercase">Sauce:</span> {item.selectedSauce}
                            </p>
                          )}
                          {item.selectedVeggies && (
                            <p>
                              <span className="font-bold text-xs uppercase">Crudités:</span>{' '}
                              {item.selectedVeggies.length === VEGGIES.length
                                ? 'Tout'
                                : item.selectedVeggies.length === 0
                                ? 'Aucune'
                                : item.selectedVeggies.join(', ')}
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
                </div>

                {cartItems.length > 0 && (
                  <div className="p-6 border-t border-gray-200 bg-white shadow-[0_-5px_15px_rgba(0,0,0,0.05)] space-y-4">
                    {/* ⚠️ Minimum commande */}
                    {!minOk && (
                      <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <AlertTriangle className="mt-0.5" />
                        <div className="text-sm">
                          <div className="font-bold text-snack-black">
                            Minimum de commande: {MIN_ORDER_EUR.toFixed(0)}€ — il vous manque {recommendationMissing.toFixed(2)}€
                          </div>
                          <div className="text-gray-600">Montant minimum calculé hors livraison.</div>
                        </div>
                      </div>
                    )}

                    {(hasCompletionSuggestions || hasUpsellSuggestions) && (
                      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-bold text-snack-black uppercase text-sm tracking-wider">
                            {hasCompletionSuggestions ? 'Suggestions pour compléter' : 'Suggestions'}
                          </div>
                          {hasCompletionSuggestions && (
                            <span className="text-xs text-gray-500 font-bold">
                              Il vous manque {recommendationMissing.toFixed(2)}€
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {recommendations.suggestions.map(({ item, category }) => (
                            <div
                              key={`${category.id}-${item.name}`}
                              className="border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3 bg-gray-50"
                            >
                              <div>
                                <div className="text-sm font-bold text-snack-black leading-tight">{item.name}</div>
                                <div className="text-xs text-gray-500">{Number(item.price).toFixed(2)} €</div>
                                <div className="text-[10px] uppercase text-gray-400 font-bold">{category.title}</div>
                              </div>
                              <button
                                className="text-xs font-bold uppercase bg-snack-gold text-black px-3 py-2 rounded hover:bg-black hover:text-snack-gold transition-colors"
                                onClick={() => handleSuggestionAdd(item, category)}
                              >
                                Ajouter
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Livraison obligatoire */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="font-bold text-snack-black uppercase text-sm tracking-wider">
                        Livraison <span className="text-gray-500 normal-case">( +{DELIVERY_FEE_EUR.toFixed(2)}€ )</span>
                      </div>

                      <div className="mt-3 space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Adresse de livraison</label>
                        <input
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          placeholder="Ex: Rue..., numéro, ville"
                          className="w-full p-3 border border-gray-300 rounded focus:border-snack-gold focus:ring-1 focus:ring-snack-gold outline-none bg-white font-medium"
                        />

                        <button
                          type="button"
                          onPointerUp={handleGeoButton}
                          onTouchEnd={handleGeoButton}
                          disabled={isLocating}
                          className={`w-full flex items-center justify-center gap-2 py-2 rounded border font-bold ${
                            isLocating ? 'opacity-70 cursor-not-allowed' : 'hover:bg-white'
                          }`}
                        >
                          <MapPin />
                          {isLocating ? 'Détection...' : 'Utiliser ma position (10 km)'}
                        </button>

                        {hasGeo && km != null && (
                          <div className="text-xs text-gray-600">
                            Distance estimée: <b>{km.toFixed(1)} km</b> (max {MAX_DELIVERY_KM} km)
                          </div>
                        )}

                        {/* erreurs livraison */}
                        {!hasAddress && (
                          <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                            <AlertTriangle className="mt-0.5" />
                            <div className="text-sm text-gray-700">Adresse de livraison obligatoire.</div>
                          </div>
                        )}
                        {!hasGeo && (
                          <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                            <AlertTriangle className="mt-0.5" />
                            <div className="text-sm text-gray-700">
                              Position obligatoire. Cliquez sur <b>« Utiliser ma position »</b>.
                            </div>
                          </div>
                        )}
                        {hasGeo && !inRange && (
                          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-3">
                            <AlertTriangle className="mt-0.5" />
                            <div className="text-sm text-red-700">
                              Livraison disponible uniquement dans un rayon de <b>{MAX_DELIVERY_KM} km</b>.
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Paiement */}
                    <div className="bg-white border border-gray-200 rounded-lg p-3">
                      <div className="font-bold text-snack-black uppercase text-sm tracking-wider mb-2">Moyen de paiement</div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setPaymentMethod('stripe')}
                          className={`py-2 rounded-lg border font-bold flex items-center justify-center gap-2 ${
                            paymentMethod === 'stripe'
                              ? 'border-snack-gold bg-snack-gold/10 text-black'
                              : 'border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          <CreditCard />
                          Stripe
                        </button>

                        <button
                          onClick={() => setPaymentMethod('cash')}
                          className={`py-2 rounded-lg border font-bold flex items-center justify-center gap-2 ${
                            paymentMethod === 'cash'
                              ? 'border-snack-gold bg-snack-gold/10 text-black'
                              : 'border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          <Banknote />
                          Cash (livraison)
                        </button>
                      </div>
                    </div>

                    {/* Total */}
                    <div className="flex justify-between items-end">
                      <div>
                        <div className="text-gray-500 uppercase font-bold tracking-wider text-sm">Total</div>
                        <div className="text-xs text-gray-500">
                          Sous-total: {itemsSubtotal.toFixed(2)}€ + Livraison: {DELIVERY_FEE_EUR.toFixed(2)}€
                        </div>
                      </div>
                      <div className="text-3xl font-display font-bold text-snack-black">{totalWithDelivery.toFixed(2)} €</div>
                    </div>

                    {/* Warnings visibles même si le bouton reste cliquable */}
                    {!minOk && (
                      <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <AlertTriangle className="mt-0.5" />
                        <div className="text-sm text-gray-700">Il faut commander un minimum de 20€ (hors livraison).</div>
                      </div>
                    )}
                    {!hasAddress && (
                      <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <AlertTriangle className="mt-0.5" />
                        <div className="text-sm text-gray-700">Adresse de livraison obligatoire.</div>
                      </div>
                    )}
                    {!hasGeo && (
                      <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <AlertTriangle className="mt-0.5" />
                        <div className="text-sm text-gray-700">Position obligatoire. Cliquez sur « Utiliser ma position ».</div>
                      </div>
                    )}

                    {/* Bouton payer */}
                    <button
                      id="checkout-btn"
                      onClick={paymentMethod === 'stripe' ? handleStripeCheckout : handleCashCheckout}
                      disabled={isCheckingOut || disableStripeCheckout}
                      className={`w-full bg-snack-gold text-snack-black py-4 rounded font-display font-bold text-xl uppercase tracking-wide border border-transparent transition-all shadow-lg flex items-center justify-center gap-2 group ${
                        isCheckingOut || disableStripeCheckout
                          ? 'opacity-60 cursor-not-allowed'
                          : 'hover:bg-white hover:border-snack-black hover:border-gray-200'
                      }`}
                    >
                      {isCheckingOut ? (
                        <span>Chargement...</span>
                      ) : paymentMethod === 'stripe' ? (
                        <>
                          <CreditCard size={24} className="group-hover:scale-110 transition-transform" />
                          <span>Payer en ligne</span>
                        </>
                      ) : (
                        <>
                          <Banknote size={24} className="group-hover:scale-110 transition-transform" />
                          <span>Valider (Cash livraison)</span>
                        </>
                      )}
                    </button>

                    {checkoutError && <p className="text-sm text-red-600 text-center font-semibold">{checkoutError}</p>}
                    {checkoutInfo && <p className="text-sm text-green-700 text-center font-semibold">{checkoutInfo}</p>}
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
