import { PaymentError, activateFromPayment, paymentConfig, signatureMatches } from './_lib/razorpay.js';

const reply = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Razorpay webhook. Uses the Web Request signature so the signature is checked over the
 * exact bytes Razorpay sent. Nothing is processed unless that signature is valid.
 * A non-2xx answer makes Razorpay retry later.
 */
async function handleWebhook(request) {
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const config = paymentConfig();
    if (!webhookSecret || !config) {
      console.error('Razorpay webhook is not configured (RAZORPAY_WEBHOOK_SECRET and payment keys are required).');
      return reply(500, { error: 'Webhook not configured' });
    }

    const rawBody = Buffer.from(await request.arrayBuffer());
    if (!signatureMatches(rawBody, request.headers.get('x-razorpay-signature'), webhookSecret)) {
      console.warn('Razorpay webhook signature verification failed');
      return reply(400, { error: 'Invalid webhook signature' });
    }

    const body = JSON.parse(rawBody.toString('utf8'));
    if (body.event !== 'payment.captured' && body.event !== 'order.paid') {
      return reply(200, { status: 'ignored' });
    }

    const payment = body.payload?.payment?.entity;
    await activateFromPayment(config, { paymentId: payment?.id, orderId: payment?.order_id });
    return reply(200, { status: 'ok' });
  } catch (err) {
    if (err instanceof PaymentError) {
      console.error('Razorpay webhook not applied:', err.code);
      return err.retry ? reply(500, { error: 'Temporary failure' }) : reply(200, { status: 'not_applied' });
    }
    console.error('Razorpay webhook error:', err);
    return reply(500, { error: 'Webhook handler error' });
  }
}

export default { fetch: handleWebhook };
