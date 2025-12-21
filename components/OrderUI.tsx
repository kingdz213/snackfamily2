import React, { useState, useEffect } from 'react';
import { X, Minus, Plus, ShoppingBag, Trash2, CreditCard } from 'lucide-react';
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
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const safeW = Number.isFinite(screenW) && screenW > 0
    ? screenW
    : (typeof window !== 'undefined' ? window.innerWidth : 0);
  const safeH = typeof window !== 'undefined' && Number.isFinite(window.innerHeight)
    ? window.innerHeight
    : 0;
  const hiddenCartX = Math.max(safeW, 480);
  const hiddenModalY = Math.max(safeH, 900);
  const showOverlay = isCartOpen || (isOrderModalOpen && selectedItem && selectedCategory);

  useEffect(() => {
    console.log('[OrderUI] isCartOpen', isCartOpen, 'isOrderModalOpen', isOrderModalOpen, 'screenW', screenW);
    if (!showOverlay) {
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('filter');
    }
  }, [isCartOpen, isOrderModalOpen, screenW, showOverlay]);

  useEffect(() => {
    if (isOrderModalOpen) {
      setQuantity(1);
      setSelectedSauce('Sans sauce');
      setSelectedSupplements([]);
      // FIX: Default to NO veggies selected (empty array)
      setSelectedVeggies([]);
      setVariant('Menu/Frites');
    }
  }, [isOrderModalOpen, selectedItem]);

  const handleSupplementToggle = (suppName: string) => {
    setSelectedSupplements((prev) =>
      prev.includes(suppName)
        ? prev.filter(s => s !== suppName)
        : [...prev, suppName]
    );
  };

  const handleVeggieToggle = (vegName: string) => {
    setSelectedVeggies((prev) =>
      prev.includes(vegName)
        ? prev.filter(v => v !== vegName)
        : [...prev, vegName]
    );
  };

  const getSupplementPrice = (name: string) => SUPPLEMENTS.find((sup) => sup.name === name)?.price ?? 0;
  const supplementLabelPrice = SUPPLEMENTS[0]?.price ?? 0;
  const handleOverlayClick = () => {
    if (isCartOpen) closeCart();
    if (isOrderModalOpen) closeOrderModal();
  };

  const getCurrentItemPrice = () => {
    if (!selectedItem) return 0;
    let base = variant === 'Solo' && selectedItem.priceSecondary
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
      price: itemTotal,
      quantity: quantity,
      selectedSauce: selectedCategory?.hasSauces ? selectedSauce : undefined,
      selectedSupplements: selectedCategory?.hasSupplements ? selectedSupplements : undefined,
      selectedVeggies: selectedCategory?.hasVeggies ? selectedVeggies : undefined,
      variant: selectedItem.priceSecondary ? variant : undefined
    };

    addToCart(newItem);
    closeOrderModal();
  };

  const handleStripeCheckout = async () => {
    setIsCheckingOut(true);
    setCheckoutError(null);

    try {
        if (cartItems.length === 0) {
          throw new Error('Votre panier est vide.');
        }

        const checkoutItems: Array<{ name: string; price: number; quantity: number }> = cartItems.map(item => {
            // Build a descriptive name including options for Stripe Line Items
            let description = item.name;
            if (item.variant) description += ` (${item.variant})`;
            if (item.selectedSauce) description += ` - ${item.selectedSauce}`;
            if (item.selectedSupplements && item.selectedSupplements.length > 0) {
                description += ` + ${item.selectedSupplements.join(', ')}`;
            }

            const euros = item.price;
            const price = toCents(euros);
            const quantity = Math.max(1, Math.trunc(item.quantity));

            return {
                name: description,
                price,
                quantity
            };
        });

        await startCheckout(checkoutItems);
        // Page redirects on success
    } catch (error) {
        console.error("Checkout failed", error);
        const message = error instanceof Error ? error.message : 'Impossible de finaliser le paiement.';
        setCheckoutError(message);
    } finally {
        setIsCheckingOut(false);
    }
  };

  const cartTotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return (
    <>
      <AnimatePresence>
        {showOverlay && (
          <Portal>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm"
              style={{ zIndex: 9998, pointerEvents: showOverlay ? 'auto' : 'none' }}
              onClick={handleOverlayClick}
            />
          </Portal>
        )}
      </AnimatePresence>

      {/* --- ORDER MODAL --- */}
      <AnimatePresence>
        {isOrderModalOpen && selectedItem && selectedCategory && (
          <Portal>
            <div className="fixed inset-0 flex items-end md:items-center justify-center">
              <motion.div
                  initial={{ y: hiddenModalY }} animate={{ y: 0 }} exit={{ y: hiddenModalY }}
                  transition={{ type: 'tween', duration: 0.35, ease: 'easeOut' }}
                  className="bg-white w-full md:w-[600px] max-h-[90vh] md:rounded-xl shadow-2xl flex flex-col overflow-hidden"
                  style={{ zIndex: 9999 }}
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
                               <button onClick={() => setVariant('Menu/Frites')} className={`p-3 rounded border-2 text-sm font-bold uppercase flex flex-col items-center justify-center gap-1 transition-all ${variant === 'Menu/Frites' ? 'border-snack-gold bg-snack-gold/10 text-black' : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}>
                                   <span>{selectedCategory.id === 'mitraillettes' ? 'Mitraillette (+Frites)' : 'Menu / Frites'}</span>
                                   <span className="text-lg">{Number(selectedItem.price).toFixed(2)} €</span>
                               </button>
                               <button onClick={() => setVariant('Solo')} className={`p-3 rounded border-2 text-sm font-bold uppercase flex flex-col items-center justify-center gap-1 transition-all ${variant === 'Solo' ? 'border-snack-gold bg-snack-gold/10 text-black' : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}>
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
                           <select value={selectedSauce} onChange={(e) => setSelectedSauce(e.target.value)} className="w-full p-3 border border-gray-300 rounded focus:border-snack-gold focus:ring-1 focus:ring-snack-gold outline-none bg-white font-medium">
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
                                       <input type="checkbox" checked={selectedVeggies.includes(veg)} onChange={() => handleVeggieToggle(veg)} className="hidden" />
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
                                  <label key={sup.name} className={`flex items-center justify-between cursor-pointer select-none p-3 border rounded transition-all ${selectedSupplements.includes(sup.name) ? 'border-snack-gold bg-yellow-50/50' : 'border-gray-200 hover:border-gray-300'}`}>
                                      <div className="flex items-center space-x-2">
                                           <input type="checkbox" checked={selectedSupplements.includes(sup.name)} onChange={() => handleSupplementToggle(sup.name)} className="accent-snack-gold w-4 h-4" />
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
                        <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-10 h-full flex items-center justify-center hover:bg-gray-100 text-gray-500"><Minus size={18} /></button>
                        <span className="w-10 text-center font-bold text-lg text-snack-black">{quantity}</span>
                        <button onClick={() => setQuantity(quantity + 1)} className="w-10 h-full flex items-center justify-center hover:bg-gray-100 text-gray-500"><Plus size={18} /></button>
                    </div>
                    <button onClick={handleAddToCart} className="flex-1 bg-snack-gold text-snack-black h-14 rounded-lg font-display font-bold text-lg uppercase tracking-wide hover:bg-black hover:text-snack-gold transition-all duration-200 flex items-center justify-between px-6 shadow-lg active:scale-95 active:bg-green-600 active:text-white">
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
            <div>
              <motion.div
                  initial={{ x: hiddenCartX }} animate={{ x: isCartOpen ? 0 : hiddenCartX }} exit={{ x: hiddenCartX }}
                  transition={{ type: 'tween', duration: 0.35, ease: 'easeOut' }}
                  className="fixed top-0 right-0 h-full w-full md:w-[450px] bg-white shadow-2xl flex flex-col relative"
                  style={{ zIndex: 9999 }}
              >
                <AnimatePresence>
                {isClearConfirmOpen && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
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
                            {import.meta.env.DEV && (
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
                                <button onClick={() => removeFromCart(item.id)} className="absolute top-3 right-3 text-gray-300 hover:text-red-500 transition-colors p-1"><Trash2 size={18} /></button>
                                <div><h4 className="font-bold text-snack-black text-lg">{item.name}</h4>{item.variant && <span className="text-[10px] font-bold text-black uppercase bg-snack-gold px-1.5 py-0.5 rounded mr-2">{item.variant === 'Menu/Frites' ? 'Menu/Frites' : 'Seul'}</span>}</div>
                                <div className="mt-2 text-sm text-gray-500 space-y-1 border-l-2 border-gray-100 pl-3">
                                    {item.selectedSauce && <p><span className="font-bold text-xs uppercase">Sauce:</span> {item.selectedSauce}</p>}
                                    {item.selectedVeggies && <p><span className="font-bold text-xs uppercase">Crudités:</span> {item.selectedVeggies.length === VEGGIES.length ? 'Tout' : item.selectedVeggies.length === 0 ? 'Aucune' : item.selectedVeggies.join(', ')}</p>}
                                    {item.selectedSupplements && item.selectedSupplements.length > 0 && <p className="text-snack-black font-bold">+ {item.selectedSupplements.join(', ')}</p>}
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
                    <div className="p-6 border-t border-gray-200 bg-white shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
                        <div className="flex justify-between items-center mb-6">
                            <span className="text-gray-500 uppercase font-bold tracking-wider text-sm">Total</span>
                            <span className="text-3xl font-display font-bold text-snack-black">{cartTotal.toFixed(2)} €</span>
                        </div>
                        <button
                            id="stripe-checkout-btn"
                            onClick={handleStripeCheckout}
                            disabled={isCheckingOut}
                            className={`w-full bg-snack-gold text-snack-black py-4 rounded font-display font-bold text-xl uppercase tracking-wide border border-transparent transition-all shadow-lg flex items-center justify-center gap-2 group ${isCheckingOut ? 'opacity-75 cursor-not-allowed' : 'hover:bg-white hover:border-snack-black hover:border-gray-200'}`}
                        >
                            {isCheckingOut ? (<span>Chargement...</span>) : (<><CreditCard size={24} className="group-hover:scale-110 transition-transform" /><span>Payer avec Stripe</span></>)}
                        </button>
                        {checkoutError && (
                          <p className="mt-3 text-sm text-red-600 text-center font-semibold">
                            {checkoutError}
                          </p>
                        )}
                        {import.meta.env.DEV && (
                          <div className="mt-4 text-center">
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
