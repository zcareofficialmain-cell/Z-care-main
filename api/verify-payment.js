import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const token = authHeader.split(' ')[1];

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const supabaseSecretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseSecretKey || !razorpayKeyId || !razorpayKeySecret) {
      return res.status(500).json({ error: 'Server payment configuration missing' });
    }

    // Verify user JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid or expired user session' });
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      subscription_id,
    } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !subscription_id) {
      return res.status(400).json({ error: 'Missing required payment verification parameters' });
    }

    // 1. Cryptographically verify signature: HMAC-SHA256(order_id + '|' + payment_id, secret)
    const expectedSignature = crypto
      .createHmac('sha256', razorpayKeySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment signature verification failed' });
    }

    // 2. Fetch payment details from Razorpay to confirm status and amount
    const authString = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64');
    const rzpRes = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
      headers: { Authorization: `Basic ${authString}` },
    });

    if (!rzpRes.ok) {
      return res.status(502).json({ error: 'Failed to verify payment status with Razorpay' });
    }

    const payment = await rzpRes.json();
    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      return res.status(400).json({ error: `Payment is not captured. Current status: ${payment.status}` });
    }

    if (payment.currency !== 'INR') {
      return res.status(400).json({ error: `Currency mismatch: expected INR, received ${payment.currency}` });
    }

    const amountPaidInInr = Number(payment.amount) / 100;

    // 3. Call activate_subscription() RPC using Supabase Secret Client
    const adminClient = createClient(supabaseUrl, supabaseSecretKey, {
      auth: { persistSession: false },
    });

    const { data: activatedSub, error: activateError } = await adminClient.rpc('activate_subscription', {
      p_subscription_id: subscription_id,
      p_provider_reference: razorpay_payment_id,
      p_amount_paid: amountPaidInInr,
      p_currency: 'INR',
    });

    if (activateError) {
      console.error('activate_subscription error:', activateError);
      return res.status(400).json({ error: activateError.message || 'Failed to activate subscription' });
    }

    return res.status(200).json({
      success: true,
      subscription: activatedSub,
    });
  } catch (err) {
    console.error('verify-payment error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
