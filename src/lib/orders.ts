import { addDoc, collection, serverTimestamp, type FieldValue } from 'firebase/firestore';
import type { CartItem } from '../../types';
import type { CheckoutCustomerInfo } from '../../lib/stripe';
import { db } from '../firebase';

type PaymentStatus = 'pending' | 'paid' | 'failed';

export interface OrderRecord {
  items: CartItem[];
  total: number;
  customer: CheckoutCustomerInfo;
  stripeSessionId: string | null;
  status: PaymentStatus;
  createdAt: FieldValue;
}

export async function saveOrderInFirestore(
  cartItems: CartItem[],
  totalAmount: number,
  customerInfo: CheckoutCustomerInfo,
  stripeSessionId?: string,
  paymentStatus: PaymentStatus = 'pending'
): Promise<string | undefined> {
  try {
    const docRef = await addDoc(collection(db, 'orders'), {
      items: cartItems,
      total: totalAmount,
      customer: customerInfo,
      stripeSessionId: stripeSessionId ?? null,
      status: paymentStatus,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Erreur lors de l'enregistrement de la commande dans Firestore:", error);
    return undefined;
  }
}
