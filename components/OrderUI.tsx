// components/OrderUI.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Minus, Plus, ShoppingBag, Trash2, CreditCard, AlertTriangle, MapPin, Banknote, CalendarClock } from 'lucide-react';
import { MenuItem, MenuCategory, SAUCES, SUPPLEMENTS, VEGGIES, CartItem, CartSelectedOption, MenuOptionGroup } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { startCashOrder, startCheckout } from '../lib/stripe';
import { buildOrderMessage, buildWhatsAppUrl, getWhatsAppPhone, resolvePublicOrigin } from '../lib/whatsapp';
import { Portal } from './Portal';
import { getRecommendations, MIN_ORDER_EUR } from '../lib/recommendations';
import { MENU_CATEGORIES } from '../data/menuData';
import { LoadingSpinner } from '@/src/components/LoadingSpinner';
import { prefersReducedMotion, motionSafeHover, motionSafeTap, motionSafeTransition } from '@/src/lib/motion';
import { useAuth } from '@/src/auth/AuthProvider';
import { clearCustomerProfile, loadCustomerProfile, saveCustomerProfile } from '@/src/lib/customerProfile';
import { isOpenNow, getNextOpenSlot } from '@/src/lib/openingHours';
import { DELIVERY_STEP_MINUTES, DELIVERY_WINDOWS } from '@/src/config/delivery';
import { isValidPhoneBasic, normalizePhoneDigits } from '@/src/lib/phone';

interface OrderUIProps {
  isOrderModalOpen: boolean;
  selectedItem: MenuItem | null;
  selectedCategory: MenuCategory | null;
  closeOrderModal: () => void;
  openOrderModal: (item: MenuItem, category: MenuCategory) => void;
  addToCart: (item: CartItem) => void;
  requireAuth: (action: () => void) => void;

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

type DeliveryInfo = {
  name: string;
  phone: string;
  address: string;
  postalCode: string;
  city: string;
  note: string;
};

const pad = (value: number) => String(value).padStart(2, '0');

const formatDateTimeLocal = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;

const minutesFromTime = (time: string) => {
  const [hour, minute] = time.split(':').map((part) => Number(part));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
};

const roundToStep = (date: Date, stepMinutes: number) => {
  const stepMs = stepMinutes * 60 * 1000;
  return new Date(Math.round(date.getTime() / stepMs) * stepMs);
};

const formatSlotLabel = (date: Date) =>
  date.toLocaleString('fr-BE', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

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
  requireAuth,
  isCartOpen,
  closeCart,
  cartItems,
  removeFromCart,
  clearCart,
  screenW,
}) => {
  const { getIdToken, profile, user } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const [selectedSauce, setSelectedSauce] = useState<string>('Sans sauce');
  const [selectedSupplements, setSelectedSupplements] = useState<string[]>([]);
  const [selectedVeggies, setSelectedVeggies] = useState<string[]>([]);
  const [variant, setVariant] = useState<'Menu/Frites' | 'Solo'>('Menu/Frites');
  const [selectedOptions, setSelectedOptions] = useState<CartSelectedOption[]>([]);

  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutInfo, setCheckoutInfo] = useState<string | null>(null);
  const [deliveryFormError, setDeliveryFormError] = useState<string | null>(null);
  const [showDistanceBanner, setShowDistanceBanner] = useState(false);
  const [lastCashWhatsAppUrl, setLastCashWhatsAppUrl] = useState<string | null>(null);
  const [openingInfo, setOpeningInfo] = useState<{ isOpen: boolean; nextLabel: string | null }>({
    isOpen: true,
    nextLabel: null,
  });
  const [deliveryScheduleMode, setDeliveryScheduleMode] = useState<'ASAP' | 'SCHEDULED'>('ASAP');
  const [desiredDeliveryInputValue, setDesiredDeliveryInputValue] = useState('');
  const [desiredDeliveryAt, setDesiredDeliveryAt] = useState<string | null>(null);
  const [desiredDeliverySlotLabel, setDesiredDeliverySlotLabel] = useState<string | null>(null);
  const [desiredDeliveryError, setDesiredDeliveryError] = useState<string | null>(null);

  // Paiement
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'cash'>('stripe');
  const [isAddBouncing, setIsAddBouncing] = useState(false);
  const addBounceTimeoutRef = useRef<number | null>(null);

  // Adresse + position obligatoires
  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryInfo>({
    name: '',
    phone: '',
    address: '',
    postalCode: '',
    city: '',
    note: '',
  });
  const [deliveryLat, setDeliveryLat] = useState<number | undefined>(undefined);
  const [deliveryLng, setDeliveryLng] = useState<number | undefined>(undefined);
  const [isLocating, setIsLocating] = useState(false);
  const geoRequestLockRef = useRef(false);

  const checkoutFormRef = useRef<HTMLDivElement | null>(null);

  const bodyStyleRestoreRef = useRef<null | { overflow: string; filter: string }>(null);
  const reduceMotion = prefersReducedMotion();

  const dev = import.meta.env.DEV;
  const logDev = (...args: any[]) => dev && console.log(...args);
  const warnDev = (...args: any[]) => dev && console.warn(...args);

  const buildDefaultOptions = (item: MenuItem | null): CartSelectedOption[] => {
    if (!item?.optionGroups || item.optionGroups.length === 0) return [];
    return item.optionGroups.map((group) => {
      const fallbackChoice = group.choices[0];
      const choice =
        group.choices.find((candidate) => candidate.id === group.defaultChoiceId) ||
        fallbackChoice;
      return {
        groupId: group.id,
        groupLabel: group.label,
        choiceId: choice?.id ?? group.id,
        choiceLabel: choice?.label ?? group.label,
        deltaPriceCents: choice?.deltaPriceCents ?? 0,
      };
    });
  };

  const getOptionChoice = (group: MenuOptionGroup, choiceId: string) =>
    group.choices.find((choice) => choice.id === choiceId) || group.choices[0];

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
    if (typeof window === 'undefined') return;

    try {
      const ack = localStorage.getItem('sf2_10km_ack');
      setShowDistanceBanner(ack !== '1');
    } catch (error) {
      warnDev('[OrderUI] Failed to read distance banner ack', error);
      setShowDistanceBanner(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let saved = loadCustomerProfile();

    if (!saved) {
      try {
        const legacy = localStorage.getItem('sf2_delivery');
        if (legacy) {
          const parsed = JSON.parse(legacy);
          if (parsed && typeof parsed === 'object') {
            saveCustomerProfile({ deliveryInfo: parsed });
            localStorage.removeItem('sf2_delivery');
            saved = loadCustomerProfile();
          }
        }
      } catch (error) {
        warnDev('[OrderUI] Failed to migrate legacy delivery info', error);
      }
    }

    if (saved?.deliveryInfo) {
      setDeliveryInfo((prev) => ({
        ...prev,
        name: prev.name || saved?.deliveryInfo?.name || '',
        phone: prev.phone || normalizePhoneDigits(saved?.deliveryInfo?.phone || ''),
        address: prev.address || saved?.deliveryInfo?.address || '',
        postalCode: prev.postalCode || saved?.deliveryInfo?.postalCode || '',
        city: prev.city || saved?.deliveryInfo?.city || '',
        note: prev.note || saved?.deliveryInfo?.note || '',
      }));
    }

    if (Number.isFinite(saved?.deliveryLat)) {
      setDeliveryLat(saved?.deliveryLat);
    }
    if (Number.isFinite(saved?.deliveryLng)) {
      setDeliveryLng(saved?.deliveryLng);
    }

    if (saved?.deliveryScheduleMode) {
      setDeliveryScheduleMode(saved.deliveryScheduleMode);
      if (saved.deliveryScheduleMode === 'SCHEDULED' && saved.desiredDeliveryAt) {
        setDesiredDeliveryAt(saved.desiredDeliveryAt ?? null);
        setDesiredDeliverySlotLabel(saved.desiredDeliverySlotLabel ?? null);
        const desiredDate = new Date(saved.desiredDeliveryAt);
        if (!Number.isNaN(desiredDate.getTime())) {
          setDesiredDeliveryInputValue(formatDateTimeLocal(desiredDate));
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!profile) return;
    setDeliveryInfo((prev) => ({
      ...prev,
      name: prev.name || profile.name || '',
      phone: prev.phone || normalizePhoneDigits(profile.phone || ''),
      address: prev.address || profile.address || '',
      postalCode: prev.postalCode || profile.postalCode || '',
      city: prev.city || profile.city || '',
    }));
  }, [profile]);

  useEffect(() => {
    const refreshOpeningInfo = () => {
      const now = new Date();
      const isOpen = isOpenNow(now);
      const nextOpen = isOpen ? null : getNextOpenSlot(now);
      setOpeningInfo({ isOpen, nextLabel: nextOpen?.label ?? null });

      if (!isOpen && deliveryScheduleMode === 'ASAP') {
        setDeliveryScheduleMode('SCHEDULED');
        setCheckoutInfo('Snack fermé — sélectionnez un créneau pour programmer.');
      }
    };

    refreshOpeningInfo();
    const interval = window.setInterval(refreshOpeningInfo, 60 * 1000);
    return () => window.clearInterval(interval);
  }, [deliveryScheduleMode]);

  useEffect(() => {
    try {
      saveCustomerProfile({
        deliveryInfo,
        deliveryLat,
        deliveryLng,
        deliveryScheduleMode,
        desiredDeliveryAt,
        desiredDeliverySlotLabel,
      });
    } catch (error) {
      warnDev('[OrderUI] Failed to save customer profile', error);
    }
  }, [deliveryInfo, deliveryLat, deliveryLng, deliveryScheduleMode, desiredDeliveryAt, desiredDeliverySlotLabel]);

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
      setSelectedOptions(buildDefaultOptions(selectedItem));
      setCheckoutError(null);
      setCheckoutInfo(null);
    }
  }, [isOrderModalOpen, selectedItem]);

  useEffect(() => {
    return () => {
      if (addBounceTimeoutRef.current) {
        window.clearTimeout(addBounceTimeoutRef.current);
      }
    };
  }, []);

  const handleSupplementToggle = (suppName: string) => {
    setSelectedSupplements((prev) => (prev.includes(suppName) ? prev.filter((s) => s !== suppName) : [...prev, suppName]));
  };

  const handleVeggieToggle = (vegName: string) => {
    setSelectedVeggies((prev) => (prev.includes(vegName) ? prev.filter((v) => v !== vegName) : [...prev, vegName]));
  };

  const handleOptionChange = (group: MenuOptionGroup, choiceId: string) => {
    const choice = getOptionChoice(group, choiceId);
    if (!choice) return;
    setSelectedOptions((prev) => {
      const filtered = prev.filter((opt) => opt.groupId !== group.id);
      return [
        ...filtered,
        {
          groupId: group.id,
          groupLabel: group.label,
          choiceId: choice.id,
          choiceLabel: choice.label,
          deltaPriceCents: choice.deltaPriceCents,
        },
      ];
    });
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
    const optionsCost = selectedOptions.reduce((total, option) => total + option.deltaPriceCents, 0) / 100;
    return base + suppsCost + optionsCost;
  };

  const addItemToCart = () => {
    if (!selectedItem) return;

    if (selectedItem.unavailable) {
      setCheckoutError('Cet article est indisponible pour le moment.');
      return;
    }

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
      selectedOptions: selectedOptions.length > 0 ? selectedOptions : undefined,
    };

    addToCart(newItem);
    if (!reduceMotion) {
      setIsAddBouncing(true);
      addBounceTimeoutRef.current = window.setTimeout(() => setIsAddBouncing(false), 180);
    }
    window.setTimeout(() => closeOrderModal(), reduceMotion ? 0 : 110);
  };

  const handleAddToCart = () => {
    requireAuth(addItemToCart);
  };

  const itemsSubtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalWithDelivery = itemsSubtotal + DELIVERY_FEE_EUR;
  const isSelectedItemUnavailable = selectedItem?.unavailable ?? false;
  const recommendations = useMemo(() => getRecommendations(cartItems, MENU_CATEGORIES), [cartItems]);
  const recommendationMissing = recommendations.missing;
  const hasCompletionSuggestions = recommendationMissing > 0 && recommendations.suggestions.length > 0;
  const hasUpsellSuggestions = recommendationMissing <= 0 && recommendations.suggestions.length > 0;

  const formattedDeliveryAddress = useMemo(() => {
    const addressPart = deliveryInfo.address.trim();
    const cityPart = `${deliveryInfo.postalCode.trim()} ${deliveryInfo.city.trim()}`.trim();
    if (addressPart && cityPart) return `${addressPart}, ${cityPart}`;
    return addressPart || cityPart;
  }, [deliveryInfo]);

  // Minimum 20€ hors livraison
  const minOk = itemsSubtotal + 1e-9 >= MIN_ORDER_EUR;
  const disableStripeCheckout = paymentMethod === 'stripe' && !minOk;

  // Livraison obligatoire: adresse + position + distance <= 10km
  const hasName = deliveryInfo.name.trim().length > 0;
  const hasPhone = deliveryInfo.phone.trim().length > 0;
  const hasAddress = deliveryInfo.address.trim().length > 0;
  const hasPostalCode = deliveryInfo.postalCode.trim().length > 0;
  const hasCity = deliveryInfo.city.trim().length > 0;
  const hasGeo = Number.isFinite(deliveryLat) && Number.isFinite(deliveryLng);
  const hasRequiredDelivery = hasName && hasPhone && hasAddress && hasPostalCode && hasCity;

  const km =
    hasGeo && deliveryLat != null && deliveryLng != null
      ? distanceKm(SHOP_LAT, SHOP_LNG, deliveryLat, deliveryLng)
      : null;

  const inRange = km == null ? false : km <= MAX_DELIVERY_KM;
  const deliveryOk = hasRequiredDelivery && hasGeo && inRange;

  const buildLineItemName = (item: CartItem) => {
    let description = item.name;
    if (item.selectedOptions && item.selectedOptions.length > 0) {
      const optionText = item.selectedOptions.map((opt) => opt.choiceLabel).join(', ');
      description += ` — ${optionText}`;
    }
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

  const buildOrderLines = () =>
    cartItems.length
      ? cartItems.map((item) => `- ${Math.max(1, Math.trunc(item.quantity))}x ${buildLineItemName(item)}`)
      : ['- (aucun article)'];

  const handleSuggestionAdd = (item: MenuItem, category: MenuCategory) => {
    if (item.unavailable) return;

    const basePrice = Number(item.price);
    const hasOptions =
      category.hasSauces ||
      category.hasSupplements ||
      category.hasVeggies ||
      item.priceSecondary !== undefined ||
      (item.optionGroups && item.optionGroups.length > 0);

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
      setCheckoutError('Erreur géoloc: La géolocalisation n’est pas disponible sur ce navigateur.');
      return;
    }

    setIsLocating(true);

    const getGeoErrorMessage = (code?: number, fallback?: string) => {
      if (code === 1) {
        return 'Permission de localisation refusée. Autorisez la localisation pour ce site dans les réglages du navigateur.';
      }
      if (code === 2) {
        return 'Position indisponible. Activez le GPS et réessayez.';
      }
      if (code === 3) {
        return 'La demande de localisation a expiré. Placez-vous près d’une fenêtre et réessayez.';
      }
      return fallback || 'Impossible de récupérer votre position.';
    };

    let resolved = false;

    const handleSuccess = (pos: GeolocationPosition) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      setIsLocating(false);
      setDeliveryLat(pos.coords.latitude);
      setDeliveryLng(pos.coords.longitude);
      setCheckoutInfo('Position détectée ✅');
    };

    const handleError = (code?: number, message?: string) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      setIsLocating(false);
      setCheckoutInfo(null);
      setCheckoutError(`Erreur géoloc: ${getGeoErrorMessage(code, message)}`);
    };

    const timeoutId = window.setTimeout(() => {
      handleError(3, 'La demande de localisation a expiré.');
    }, 10000);

    navigator.geolocation.getCurrentPosition(
      (pos) => handleSuccess(pos),
      (err) => {
        handleError(err.code, err.message);
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

  const handleDeliveryChange = (field: keyof DeliveryInfo) => (value: string) => {
    const nextValue = field === 'phone' ? normalizePhoneDigits(value) : value;
    setDeliveryInfo((prev) => ({ ...prev, [field]: nextValue }));
    setDeliveryFormError(null);
  };

  const handleScheduleModeChange = (mode: 'ASAP' | 'SCHEDULED') => {
    setDeliveryScheduleMode(mode);
    if (mode === 'ASAP') {
      setDesiredDeliveryInputValue('');
      setDesiredDeliveryAt(null);
      setDesiredDeliverySlotLabel(null);
      setDesiredDeliveryError(null);
    }
  };

  const handleScheduleInputChange = (value: string) => {
    setDesiredDeliveryInputValue(value);
    if (!value) {
      setDesiredDeliveryAt(null);
      setDesiredDeliverySlotLabel(null);
      setDesiredDeliveryError(null);
      return;
    }
    const rawDate = new Date(value);
    if (Number.isNaN(rawDate.getTime())) {
      setDesiredDeliveryAt(null);
      setDesiredDeliverySlotLabel(null);
      setDesiredDeliveryError('Merci de choisir une date valide.');
      return;
    }
    const rounded = roundToStep(rawDate, DELIVERY_STEP_MINUTES);
    setDesiredDeliveryInputValue(formatDateTimeLocal(rounded));
    setDesiredDeliveryAt(rounded.toISOString());
    setDesiredDeliverySlotLabel(formatSlotLabel(rounded));
    setDesiredDeliveryError(null);
  };

  const handleClearCustomerInfo = () => {
    if (typeof window === 'undefined') return;
    if (!window.confirm('Supprimer vos informations enregistrées ?')) return;
    clearCustomerProfile();
    setDeliveryInfo({ name: '', phone: '', address: '', postalCode: '', city: '', note: '' });
    setDeliveryLat(undefined);
    setDeliveryLng(undefined);
    setDeliveryScheduleMode('ASAP');
    setDesiredDeliveryInputValue('');
    setDesiredDeliveryAt(null);
    setDesiredDeliverySlotLabel(null);
    setDesiredDeliveryError(null);
  };

  const validateScheduledDelivery = () => {
    if (deliveryScheduleMode === 'ASAP') {
      setDesiredDeliveryError(null);
      return true;
    }

    if (!desiredDeliveryAt) {
      setDesiredDeliveryError('Merci de choisir une date et une heure.');
      return false;
    }

    const date = new Date(desiredDeliveryAt);
    if (Number.isNaN(date.getTime())) {
      setDesiredDeliveryError('Date invalide.');
      return false;
    }

    if (date.getTime() < Date.now()) {
      setDesiredDeliveryError('Merci de choisir un horaire futur.');
      return false;
    }

    const window = DELIVERY_WINDOWS[date.getDay()] ?? null;
    if (!window) {
      setDesiredDeliveryError('Fermé.');
      return false;
    }

    const startMinutes = minutesFromTime(window.start);
    const endMinutes = minutesFromTime(window.end);
    if (startMinutes == null || endMinutes == null) {
      setDesiredDeliveryError('Horaires indisponibles pour ce jour.');
      return false;
    }

    const currentMinutes = date.getHours() * 60 + date.getMinutes();
    if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
      setDesiredDeliveryError(`Merci de choisir une heure entre ${window.start} et ${window.end}.`);
      return false;
    }

    setDesiredDeliveryError(null);
    return true;
  };

  const handleDistanceBannerAck = () => {
    setShowDistanceBanner(false);

    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem('sf2_10km_ack', '1');
    } catch (error) {
      warnDev('[OrderUI] Failed to save distance banner ack', error);
    }
  };

  const validateDeliveryForm = (): boolean => {
    const missing: string[] = [];
    if (!hasName) missing.push('Nom/prénom');
    if (!hasPhone) missing.push('Téléphone');
    if (!hasAddress) missing.push('Adresse');
    if (!hasPostalCode) missing.push('Code postal');
    if (!hasCity) missing.push('Ville');

    if (missing.length > 0) {
      setDeliveryFormError(`Merci de compléter : ${missing.join(', ')}.`);
      checkoutFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return false;
    }

    if (!isValidPhoneBasic(deliveryInfo.phone)) {
      setDeliveryFormError('Numéro de téléphone invalide.');
      checkoutFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return false;
    }

    setDeliveryFormError(null);
    return true;
  };

  const validateBeforeCheckout = (): boolean => {
    if (!validateDeliveryForm()) {
      return false;
    }
    if (!openingInfo.isOpen && deliveryScheduleMode === 'ASAP') {
      setCheckoutError('Snack fermé — choisissez un créneau pour programmer.');
      setDeliveryScheduleMode('SCHEDULED');
      return false;
    }
    if (!validateScheduledDelivery()) {
      return false;
    }
    if (cartItems.length === 0) {
      setCheckoutError('Votre panier est vide.');
      return false;
    }
    if (!minOk) {
      setCheckoutError('Il faut commander un minimum de 20€.');
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

    if (!user) {
      setCheckoutError('Connexion obligatoire pour valider la commande.');
      return;
    }

    if (!validateBeforeCheckout()) return;

    setIsCheckingOut(true);

    try {
      const deliveryAddress = formattedDeliveryAddress;

      const items = cartItems.map((it) => ({
        name: buildLineItemName(it),
        price: Math.round(Number(it.price) * 100),
        quantity: Math.max(1, Math.trunc(it.quantity)),
      }));

      const firebaseIdToken = await getIdToken();
      await startCheckout({
        origin: window.location.origin,
        items,
        deliveryAddress: deliveryAddress.trim(),
        deliveryLat: Number(deliveryLat),
        deliveryLng: Number(deliveryLng),
        desiredDeliveryAt: deliveryScheduleMode === 'SCHEDULED' ? desiredDeliveryAt : null,
        desiredDeliverySlotLabel: deliveryScheduleMode === 'SCHEDULED' ? desiredDeliverySlotLabel : null,
        firebaseIdToken: firebaseIdToken ?? undefined,
        notes: deliveryInfo.note.trim() || undefined,
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

    if (!user) {
      setCheckoutError('Connexion obligatoire pour valider la commande.');
      return;
    }

    if (!validateBeforeCheckout()) return;

    setIsCheckingOut(true);

    try {
      const items = cartItems.map((it) => ({
        name: buildLineItemName(it),
        price: Math.round(Number(it.price) * 100),
        quantity: Math.max(1, Math.trunc(it.quantity)),
      }));

      const firebaseIdToken = await getIdToken();
      const { orderId, adminHubUrl, publicOrderUrl } = await startCashOrder({
        origin: window.location.origin,
        items,
        deliveryAddress: formattedDeliveryAddress.trim(),
        deliveryLat: Number(deliveryLat),
        deliveryLng: Number(deliveryLng),
        desiredDeliveryAt: deliveryScheduleMode === 'SCHEDULED' ? desiredDeliveryAt : null,
        desiredDeliverySlotLabel: deliveryScheduleMode === 'SCHEDULED' ? desiredDeliverySlotLabel : null,
        firebaseIdToken: firebaseIdToken ?? undefined,
        notes: deliveryInfo.note.trim() || undefined,
      });

      const publicOrigin = resolvePublicOrigin() || window.location.origin;
      const verifyUrl = publicOrderUrl || `${publicOrigin}/order/${orderId}`;

      const message = buildOrderMessage({
        orderId,
        paymentLabel: 'À la livraison',
        publicOrderUrl: verifyUrl,
        adminHubUrl,
        lines: buildOrderLines(),
        desiredDeliveryAt: deliveryScheduleMode === 'SCHEDULED' ? desiredDeliveryAt : null,
        desiredDeliverySlotLabel: deliveryScheduleMode === 'SCHEDULED' ? desiredDeliverySlotLabel : null,
        notes: deliveryInfo.note.trim() || undefined,
      });

      const url = buildWhatsAppUrl(getWhatsAppPhone(), message);
      setLastCashWhatsAppUrl(url);
      setCheckoutInfo('Commande réservée — paiement à la livraison. Préparation en cours.');
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
                  {selectedItem.unavailable && (
                    <span className="bg-red-100 text-red-600 text-[10px] font-bold uppercase px-2 py-1 rounded">Indisponible</span>
                  )}
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

                  {selectedItem.optionGroups?.map((group) => {
                    const selectedChoiceId =
                      selectedOptions.find((option) => option.groupId === group.id)?.choiceId ||
                      group.defaultChoiceId ||
                      group.choices[0]?.id;
                    return (
                      <div key={group.id} className="bg-white p-4 rounded border border-gray-200 shadow-sm">
                        <h4 className="font-bold text-snack-black uppercase mb-3 text-sm tracking-wider flex items-center gap-2">
                          <span className="w-2 h-2 bg-snack-gold rounded-full"></span> {group.label}
                        </h4>
                        <div className="grid gap-2">
                          {group.choices.map((choice) => {
                            const extra =
                              choice.deltaPriceCents > 0 ? `(+${(choice.deltaPriceCents / 100).toFixed(2)}€)` : '';
                            return (
                              <label
                                key={choice.id}
                                className={`flex items-center justify-between cursor-pointer p-3 rounded border transition-all ${
                                  selectedChoiceId === choice.id
                                    ? 'border-snack-gold bg-snack-gold/10'
                                    : 'border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name={`option-${group.id}`}
                                    checked={selectedChoiceId === choice.id}
                                    onChange={() => handleOptionChange(group, choice.id)}
                                    className="accent-snack-gold w-4 h-4"
                                  />
                                  <span className="text-sm font-bold text-snack-black">{choice.label}</span>
                                </div>
                                {extra && <span className="text-xs font-bold text-snack-gold">{extra}</span>}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

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

                  <motion.button
                    onClick={handleAddToCart}
                    disabled={isSelectedItemUnavailable}
                    whileHover={reduceMotion ? undefined : motionSafeHover}
                    whileTap={reduceMotion ? undefined : motionSafeTap}
                    animate={reduceMotion ? { scale: 1 } : isAddBouncing ? { scale: [1, 1.05, 1] } : { scale: 1 }}
                    transition={reduceMotion ? { duration: 0 } : { ...motionSafeTransition, duration: 0.18 }}
                    className={`flex-1 bg-snack-gold text-snack-black h-14 rounded-lg font-display font-bold text-lg uppercase tracking-wide transition-all duration-200 flex items-center justify-between px-6 shadow-lg active:scale-95 active:bg-green-600 active:text-white ${
                      isSelectedItemUnavailable
                        ? 'opacity-60 cursor-not-allowed'
                        : 'hover:bg-black hover:text-snack-gold'
                    }`}
                  >
                    <span>{isSelectedItemUnavailable ? 'Indisponible' : 'Ajouter'}</span>
                    <span>{(getCurrentItemPrice() * quantity).toFixed(2)} €</span>
                  </motion.button>
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

                <div className="flex flex-col h-full">
                  <div className="p-5 bg-snack-black text-white flex justify-between items-center shadow-md sticky top-0 z-10">
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

                  <div className="flex-1 overflow-y-auto drawer-scroll">
                    {cartItems.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400 p-10">
                        <ShoppingBag size={64} className="mb-4 opacity-20" />
                        <p className="text-lg font-medium">Votre panier est vide</p>
                        <button onClick={closeCart} className="mt-4 text-snack-gold underline font-bold uppercase text-sm">
                          Continuer mes achats
                        </button>
                      </div>
                    ) : (
                      <div className="p-6 space-y-6 pb-36">
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-gray-500 font-bold uppercase tracking-wider">Articles ({cartItems.length})</div>
                          <button
                            onClick={() => setIsClearConfirmOpen(true)}
                            className="text-xs font-bold text-gray-400 hover:text-red-500 uppercase tracking-wider transition-colors"
                          >
                            Vider le panier
                          </button>
                        </div>

                        <div className="space-y-4">
                          {cartItems.map((item) => (
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
                                <h4 className="font-bold text-snack-black text-base md:text-lg leading-snug break-words whitespace-normal pr-10">{item.name}</h4>
                                {item.variant && (
                                  <span className="text-[10px] font-bold text-black uppercase bg-snack-gold px-1.5 py-0.5 rounded mr-2">
                                    {item.variant === 'Menu/Frites' ? 'Menu/Frites' : 'Seul'}
                                  </span>
                                )}
                              </div>

                              <div className="mt-2 text-sm text-gray-500 space-y-1 border-l-2 border-gray-100 pl-3">
                                {item.selectedOptions && item.selectedOptions.length > 0 && (
                                  <div className="space-y-1">
                                    {item.selectedOptions.map((option) => (
                                      <p key={`${item.id}-${option.groupId}`} className="text-snack-black">
                                        <span className="font-bold text-xs uppercase">{option.groupLabel}:</span>{' '}
                                        {option.choiceLabel}
                                      </p>
                                    ))}
                                  </div>
                                )}
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
                          ))}
                        </div>

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
                        <div ref={checkoutFormRef} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-bold text-snack-black uppercase text-sm tracking-wider">
                            Livraison <span className="text-gray-500 normal-case">( +{DELIVERY_FEE_EUR.toFixed(2)}€ )</span>
                          </div>
                          <button
                            type="button"
                            onClick={handleClearCustomerInfo}
                            className="text-xs font-bold uppercase text-gray-400 hover:text-red-600 underline"
                          >
                            Effacer mes infos
                          </button>
                        </div>

                        <div className="mt-3 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Nom / Prénom *</label>
                              <input
                                value={deliveryInfo.name}
                                onChange={(e) => handleDeliveryChange('name')(e.target.value)}
                                placeholder="Ex: Jean Dupont"
                                className="w-full p-3 border border-gray-300 rounded focus:border-snack-gold focus:ring-1 focus:ring-snack-gold outline-none bg-white font-medium"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Téléphone *</label>
                              <input
                                value={deliveryInfo.phone}
                                onChange={(e) => handleDeliveryChange('phone')(e.target.value)}
                                placeholder="Ex: 06..."
                                className="w-full p-3 border border-gray-300 rounded focus:border-snack-gold focus:ring-1 focus:ring-snack-gold outline-none bg-white font-medium"
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Adresse *</label>
                            <input
                              value={deliveryInfo.address}
                              onChange={(e) => handleDeliveryChange('address')(e.target.value)}
                              placeholder="Rue, numéro"
                              className="w-full p-3 border border-gray-300 rounded focus:border-snack-gold focus:ring-1 focus:ring-snack-gold outline-none bg-white font-medium"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Code postal *</label>
                              <input
                                value={deliveryInfo.postalCode}
                                onChange={(e) => handleDeliveryChange('postalCode')(e.target.value)}
                                placeholder="Ex: 59000"
                                className="w-full p-3 border border-gray-300 rounded focus:border-snack-gold focus:ring-1 focus:ring-snack-gold outline-none bg-white font-medium"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Ville *</label>
                              <input
                                value={deliveryInfo.city}
                                onChange={(e) => handleDeliveryChange('city')(e.target.value)}
                                placeholder="Ex: Valenciennes"
                                className="w-full p-3 border border-gray-300 rounded focus:border-snack-gold focus:ring-1 focus:ring-snack-gold outline-none bg-white font-medium"
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Instructions (sans oignons, etc.)</label>
                            <textarea
                              value={deliveryInfo.note}
                              onChange={(e) => handleDeliveryChange('note')(e.target.value)}
                              placeholder="Ex: sans oignons, sauce à part"
                              className="w-full p-3 border border-gray-300 rounded focus:border-snack-gold focus:ring-1 focus:ring-snack-gold outline-none bg-white font-medium min-h-[80px]"
                            />
                          </div>

                          <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
                            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                              Quand souhaitez-vous être livré ?
                            </div>
                            {!openingInfo.isOpen && (
                              <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                                Fermé actuellement. {openingInfo.nextLabel ? `Prochaine ouverture : ${openingInfo.nextLabel}.` : 'Prochaine ouverture à venir.'}
                              </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => handleScheduleModeChange('ASAP')}
                                disabled={!openingInfo.isOpen}
                                className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                                  deliveryScheduleMode === 'ASAP'
                                    ? 'border-snack-gold bg-snack-gold/10 text-snack-black'
                                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                } ${!openingInfo.isOpen ? 'opacity-60 cursor-not-allowed' : ''}`}
                              >
                                Dès que possible
                              </button>
                              <button
                                type="button"
                                onClick={() => handleScheduleModeChange('SCHEDULED')}
                                className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                                  deliveryScheduleMode === 'SCHEDULED'
                                    ? 'border-snack-gold bg-snack-gold/10 text-snack-black'
                                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                }`}
                              >
                                Programmer
                              </button>
                            </div>
                            {deliveryScheduleMode === 'SCHEDULED' && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                  <CalendarClock size={14} />
                                  Horaires livraison : mar-sam 11:00-23:00 • dim 16:30-23:00 • lun fermé
                                </div>
                                <input
                                  type="datetime-local"
                                  value={desiredDeliveryInputValue}
                                  onChange={(event) => handleScheduleInputChange(event.target.value)}
                                  min={formatDateTimeLocal(new Date())}
                                  step={DELIVERY_STEP_MINUTES * 60}
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-snack-gold"
                                />
                                {desiredDeliveryError && (
                                  <div className="text-xs text-red-600 font-semibold">{desiredDeliveryError}</div>
                                )}
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onPointerUp={handleGeoButton}
                            onTouchEnd={handleGeoButton}
                            disabled={isLocating}
                            className={`w-full flex items-center justify-center gap-2 py-2 rounded border font-bold ${
                              isLocating ? 'opacity-70 cursor-not-allowed' : 'hover:bg-white'
                            }`}
                          >
                            {isLocating ? (
                              <LoadingSpinner label="Détection..." size={20} />
                            ) : (
                              <>
                                <MapPin />
                                Utiliser ma position (10 km)
                              </>
                            )}
                          </button>

                          {hasGeo && km != null && (
                            <div className="text-xs text-gray-600">
                              Distance estimée: <b>{km.toFixed(1)} km</b> (max {MAX_DELIVERY_KM} km)
                            </div>
                          )}

                          {/* erreurs livraison */}
                          {deliveryFormError && (
                            <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                              <AlertTriangle className="mt-0.5" />
                              <div className="text-sm text-gray-700">{deliveryFormError}</div>
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
                              className={`py-2 rounded-lg border font-bold flex items-center justify-center gap-2 transition-all glow-soft shine-sweep ${
                                paymentMethod === 'stripe'
                                  ? 'border-snack-gold bg-snack-gold/10 text-black'
                                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
                              }`}
                            >
                              <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                                <CreditCard className="w-5 h-5 flex-shrink-0" />
                                <span>Payer en ligne</span>
                              </div>
                            </button>

                            <button
                              onClick={() => setPaymentMethod('cash')}
                              className={`py-2 rounded-lg border font-bold flex items-center justify-center gap-2 transition-all glow-soft ${
                                paymentMethod === 'cash'
                                  ? 'border-snack-gold bg-snack-gold/10 text-black'
                                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
                              }`}
                            >
                              <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                                <Banknote className="w-5 h-5 flex-shrink-0" />
                                <span>Payer en cash</span>
                              </div>
                            </button>
                          </div>
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

                        {checkoutError && <p className="text-sm text-red-600 text-center font-semibold">{checkoutError}</p>}
                        {checkoutInfo && <p className="text-sm text-green-700 text-center font-semibold">{checkoutInfo}</p>}
                        {lastCashWhatsAppUrl && (
                          <div className="flex justify-center">
                            <button
                              type="button"
                              onClick={() => window.location.assign(lastCashWhatsAppUrl)}
                              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-green-700"
                            >
                              Envoyer sur WhatsApp
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {showDistanceBanner && (
                    <div className="mx-6 mb-3 bg-black text-white rounded-lg p-3 flex items-center justify-between gap-3 shadow-lg">
                      <div className="text-sm font-bold">Livraison max 10 km</div>
                      <button
                        onClick={handleDistanceBannerAck}
                        className="bg-snack-gold text-black px-3 py-1 rounded font-bold uppercase text-xs hover:bg-white transition-colors"
                      >
                        OK
                      </button>
                    </div>
                  )}

                  {cartItems.length > 0 && (
                    <div
                      className="sticky bottom-0 border-t border-gray-200 bg-white shadow-[0_-5px_15px_rgba(0,0,0,0.05)] p-6 space-y-3"
                      style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
                    >
                      <div className="flex justify-between items-end rounded-lg border border-snack-gold/20 bg-snack-gold/5 p-3 glow-soft">
                        <div>
                          <div className="text-gray-500 uppercase font-bold tracking-wider text-sm">Total</div>
                          <div className="text-xs text-gray-500">
                            Sous-total: {itemsSubtotal.toFixed(2)}€ + Livraison: {DELIVERY_FEE_EUR.toFixed(2)}€
                          </div>
                        </div>
                        <div className="text-3xl font-display font-bold text-snack-black">{totalWithDelivery.toFixed(2)} €</div>
                      </div>

                      <button
                        id="checkout-btn"
                        onClick={paymentMethod === 'stripe' ? handleStripeCheckout : handleCashCheckout}
                        disabled={isCheckingOut || disableStripeCheckout}
                        className={`cta-premium w-full bg-snack-gold text-snack-black py-4 rounded font-display font-bold text-xl uppercase tracking-wide border border-transparent transition-all shadow-lg flex items-center justify-center gap-2 group glow-soft shine-sweep ${
                          isCheckingOut || disableStripeCheckout
                            ? 'opacity-60 cursor-not-allowed'
                            : 'hover:bg-white hover:border-snack-black hover:border-gray-200'
                        }`}
                      >
                        {isCheckingOut ? (
                          <LoadingSpinner
                            label="Chargement..."
                            size={22}
                            iconClassName="text-snack-black"
                            labelClassName="text-snack-black font-bold"
                          />
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
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </Portal>
        )}
      </AnimatePresence>
    </>
  );
};
