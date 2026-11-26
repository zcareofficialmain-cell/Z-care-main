// Shared server-side Razorpay helpers. Files under a folder starting with "_" are not
// exposed as routes by Vercel.
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const API = 'https://api.razorpay.com/v1';

/** Razorpay ids are used in API URLs, so only their documented shape is accepted. */
export const isPaymentId = v => typeof v === 'string' && /^pay_[A-Za-z0-9]{6,40}$/.test(v);
export const isOrderId = v => typeof v === 'string' && /^order_[A-Za-z0-9]{6,40}$/.test(v);

/** Constant-time check of a hex HMAC-SHA256 signature. */
export function signatureMatches(data, signature, secret) {
  if (!secret || typeof signature !== 'string') return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(data).digest('hex'));
  const given = Buffer.from(signature);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

export class PaymentError extends Error {
  /**
   * @param {string} code    Short reason, for server logs.
   * @param {boolean} retry  True when trying again later could succeed.
   */
  constructor(code, retry = false) {
    super(code);
    this.code = code;
    this.retry = retry;
  }
}

export async function razorpayRequest(config, path, init = {}) {
  const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64');
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Basic ${auth}` },
    });
  } catch {
    throw new PaymentError('razorpay_unreachable', true);
  }
  if (!res.ok) throw new PaymentError(`razorpay_http_${res.status}`, true);
  return res.json();
}

export function paymentConfig() {
  const config = {
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    anonKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    keyId: process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
  };
  return Object.values(config).every(Boolean) ? config : null;
}

/** Database errors that will not change if the same request is sent again. */
const PERMANENT = /subscription_not_found|subscription_not_pending|amount_mismatch|currency_mismatch|payment_reference_already_used|invalid_plan|missing_payment_reference/;

/**
 * Activates the subscription a payment was made for. Everything is read from Razorpay with
 * the secret key: the subscription comes from the ORDER notes, which only our server writes
 * (create-order). Payment notes are set by the browser and are never trusted.
 *
 * @param expected  Optional { userId, subscriptionId } the order must belong to.
 */
export async function activateFromPayment(config, { paymentId, orderId, expected }) {
  if (!isPaymentId(paymentId) || !isOrderId(orderId)) throw new PaymentError('bad_ids');

  const order = await razorpayRequest(config, `/orders/${orderId}`);
  const subscriptionId = order.notes?.subscription_id;
  if (!subscriptionId) throw new PaymentError('order_has_no_subscription');
  if (expected && (order.notes.user_id !== expected.userId || subscriptionId !== expected.subscriptionId)) {
    throw new PaymentError('order_does_not_belong_to_request');
  }

  let payment = await razorpayRequest(config, `/payments/${paymentId}`);
  if (payment.order_id !== orderId) throw new PaymentError('payment_not_for_order');
  if (payment.currency !== 'INR' || order.currency !== 'INR') throw new PaymentError('currency_mismatch');
  if (Number(payment.amount) !== Number(order.amount)) throw new PaymentError('amount_mismatch');

  // An authorised payment is only a hold on the money. Capture it before granting access.
  if (payment.status === 'authorized' && expected) {
    try {
      payment = await razorpayRequest(config, `/payments/${paymentId}/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: payment.amount, currency: payment.currency }),
      });
    } catch {
      payment = await razorpayRequest(config, `/payments/${paymentId}`); // captured meanwhile?
    }
  }
  if (payment.status !== 'captured') throw new PaymentError('payment_not_captured', true);

  const admin = createClient(config.supabaseUrl, config.serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc('activate_subscription', {
    p_subscription_id: subscriptionId,
    p_provider_reference: paymentId,
    p_amount_paid: Number(payment.amount) / 100,
    p_currency: 'INR',
  });
  if (error) {
    console.error('activate_subscription error:', error.message);
    throw new PaymentError('activation_failed', !PERMANENT.test(error.message || ''));
  }
  return data;
}
