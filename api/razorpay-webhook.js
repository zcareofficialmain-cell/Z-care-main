import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    // If webhook secret is configured, verify HMAC signature
    if (webhookSecret && signature) {
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      if (expectedSignature !== signature) {
        console.warn('Razorpay webhook signature verification failed');
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }
    }

    const event = req.body?.event;
    const payload = req.body?.payload;

    if (event === 'payment.captured' || event === 'order.paid') {
      const payment = payload?.payment?.entity;
      const order = payload?.order?.entity;
      const subscriptionId = payment?.notes?.subscription_id || order?.notes?.subscription_id;
      const paymentId = payment?.id;
      const amount = payment?.amount;

      if (subscriptionId && paymentId && amount) {
        const supabaseUrl = process.env.VITE_SUPABASE_URL;
        const supabaseSecretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (supabaseUrl && supabaseSecretKey) {
          const adminClient = createClient(supabaseUrl, supabaseSecretKey, {
            auth: { persistSession: false },
          });

          const { data, error } = await adminClient.rpc('activate_subscription', {
            p_subscription_id: subscriptionId,
            p_provider_reference: paymentId,
            p_amount_paid: Number(amount) / 100,
            p_currency: 'INR',
          });

          if (error) {
            console.error('Webhook activate_subscription error:', error);
          } else {
            console.log(`Webhook successfully activated subscription ${subscriptionId}`);
          }
        }
      }
    }

    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('Razorpay webhook error:', err);
    return res.status(500).json({ error: err.message || 'Webhook handler error' });
  }
}
