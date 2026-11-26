import { createClient } from '@supabase/supabase-js';
import { PaymentError, activateFromPayment, isOrderId, isPaymentId, paymentConfig, signatureMatches } from './_lib/razorpay.js';

// Called by the ZCare web app (same origin) after Razorpay Checkout succeeds.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Please sign in again.' });
    }
    const token = authHeader.slice('Bearer '.length);

    const config = paymentConfig();
    if (!config) {
      return res.status(500).json({ error: 'Payments are not available right now.' });
    }

    // Verify user JWT
    const userClient = createClient(config.supabaseUrl, config.anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) {
      return res.status(401).json({ error: 'Please sign in again.' });
    }

    const {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      subscription_id: subscriptionId,
    } = req.body || {};

    if (!isOrderId(orderId) || !isPaymentId(paymentId) || typeof signature !== 'string' || typeof subscriptionId !== 'string') {
      return res.status(400).json({ error: 'Invalid payment details.' });
    }

    if (!signatureMatches(`${orderId}|${paymentId}`, signature, config.keySecret)) {
      return res.status(400).json({ error: 'Payment verification failed.' });
    }

    const subscription = await activateFromPayment(config, {
      paymentId,
      orderId,
      expected: { userId: user.id, subscriptionId },
    });

    return res.status(200).json({ success: true, subscription });
  } catch (err) {
    if (err instanceof PaymentError) {
      console.error('verify-payment rejected:', err.code);
      return res.status(err.retry ? 502 : 400).json({
        error: 'We could not activate your plan automatically. If money was deducted, please contact support with your payment ID.',
      });
    }
    console.error('verify-payment error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
