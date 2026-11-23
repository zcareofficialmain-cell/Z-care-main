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
    const razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!supabaseUrl || !supabaseAnonKey || !razorpayKeyId || !razorpayKeySecret) {
      return res.status(500).json({ error: 'Server payment configuration missing' });
    }

    // Verify user JWT with Supabase
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid or expired user session' });
    }

    const { plan } = req.body || {};
    if (plan !== 'monthly' && plan !== 'yearly') {
      return res.status(400).json({ error: 'Invalid plan. Must be monthly or yearly' });
    }

    // Call request_subscription RPC on behalf of the authenticated user
    const { data: subData, error: subError } = await userClient.rpc('request_subscription', {
      p_plan: plan,
    });

    if (subError || !subData) {
      console.error('request_subscription error:', subError);
      return res.status(400).json({ error: subError?.message || 'Failed to request subscription' });
    }

    const subscription = subData;
    const amountInPaise = Math.round(Number(subscription.amount) * 100);

    // Create Order with Razorpay API
    const authString = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64');
    const orderPayload = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `sub_${subscription.id.replace(/-/g, '').substring(0, 30)}`,
      notes: {
        subscription_id: subscription.id,
        user_id: user.id,
        user_email: user.email || '',
        plan: plan,
      },
    };

    const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${authString}`,
      },
      body: JSON.stringify(orderPayload),
    });

    if (!rzpRes.ok) {
      const errText = await rzpRes.text();
      console.error('Razorpay orders API error:', errText);
      return res.status(502).json({ error: 'Failed to create order with Razorpay', details: errText });
    }

    const order = await rzpRes.json();

    return res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: razorpayKeyId,
      subscriptionId: subscription.id,
    });
  } catch (err) {
    console.error('create-order error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
