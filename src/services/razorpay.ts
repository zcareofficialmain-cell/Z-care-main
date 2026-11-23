// ============================================================
// ZCare — Razorpay Payment Gateway Client Integration
// ============================================================

import { supabase } from '@/lib/supabase';
import type { PlanId } from '@/types';

declare global {
  interface Window {
    Razorpay?: any;
  }
}

/**
 * Dynamically loads the official Razorpay Checkout SDK into the document
 */
export function loadRazorpayScript(): Promise<boolean> {
  return new Promise(resolve => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export interface CheckoutResult {
  success: boolean;
  paymentId?: string;
  orderId?: string;
  error?: string;
  subscription?: any;
}

/**
 * Initiates the complete Razorpay checkout flow:
 * 1. Creates an order on the backend (/api/create-order)
 * 2. Opens the Razorpay Checkout modal
 * 3. Verifies payment signature on the backend (/api/verify-payment)
 * 4. Activates subscription in Supabase PostgreSQL
 */
export async function startRazorpayCheckout(
  plan: PlanId,
  user: { id: string; email?: string },
  userProfile?: { full_name?: string; phone?: string } | null
): Promise<CheckoutResult> {
  if (plan !== 'monthly' && plan !== 'yearly') {
    throw new Error('Only paid plans (monthly or yearly) require checkout.');
  }

  // 1. Ensure Razorpay Checkout script is loaded
  const loaded = await loadRazorpayScript();
  if (!loaded || !window.Razorpay) {
    throw new Error('Failed to load Razorpay payment SDK. Please check your internet connection.');
  }

  // 2. Obtain user's valid Supabase Auth session token
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error('Please sign in to proceed with checkout.');
  }

  // 3. Create server-side Razorpay order
  const createRes = await fetch('/api/create-order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ plan }),
  });

  if (!createRes.ok) {
    const errData = await createRes.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to initiate order. Please try again.');
  }

  const orderData = await createRes.json();
  const { orderId, amount, currency, keyId, subscriptionId } = orderData;

  // 4. Open Razorpay modal and await completion
  return new Promise((resolve, reject) => {
    let modalDismissed = true;

    const options = {
      key: keyId,
      amount,
      currency: currency || 'INR',
      name: 'ZCare Healthcare',
      description: `${plan === 'yearly' ? 'Yearly' : 'Monthly'} Membership`,
      order_id: orderId,
      prefill: {
        name: userProfile?.full_name || '',
        email: user.email || '',
        contact: userProfile?.phone || '',
      },
      theme: {
        color: '#0D5C4D', // ZCare deep teal / emerald brand color
      },
      notes: {
        subscription_id: subscriptionId,
        user_id: user.id,
        plan,
      },
      modal: {
        confirm_close: true,
        ondismiss: () => {
          if (modalDismissed) {
            reject(new Error('Payment was cancelled by user.'));
          }
        },
      },
      handler: async function (response: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      }) {
        modalDismissed = false;
        try {
          // 5. Verify cryptographic payment signature on trusted backend
          const verifyRes = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              subscription_id: subscriptionId,
            }),
          });

          if (!verifyRes.ok) {
            const verifyErr = await verifyRes.json().catch(() => ({}));
            reject(new Error(verifyErr.error || 'Payment verification failed on backend.'));
            return;
          }

          const verifyData = await verifyRes.json();
          resolve({
            success: true,
            paymentId: response.razorpay_payment_id,
            orderId: response.razorpay_order_id,
            subscription: verifyData.subscription,
          });
        } catch (err: any) {
          reject(err);
        }
      },
    };

    try {
      const rzpInstance = new window.Razorpay(options);
      rzpInstance.on('payment.failed', function (resp: any) {
        modalDismissed = false;
        reject(new Error(resp?.error?.description || 'Payment transaction failed.'));
      });
      rzpInstance.open();
    } catch (err) {
      reject(err);
    }
  });
}
