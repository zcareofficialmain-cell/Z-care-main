// Payment endpoint tests. Razorpay and Supabase are simulated by replacing fetch:
// no network calls are made and no real keys are used.
import crypto from 'node:crypto';

Object.assign(process.env, {
  VITE_SUPABASE_URL: 'https://test-project.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'anon-test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-test',
  RAZORPAY_KEY_ID: 'rzp_test_id',
  RAZORPAY_KEY_SECRET: 'key-secret',
  RAZORPAY_WEBHOOK_SECRET: 'hook-secret',
});

const { default: verify } = await import('../api/verify-payment.js');
const { default: { fetch: webhook } } = await import('../api/razorpay-webhook.js');
console.log = ((log) => (...a) => log(...a))(console.log);
console.error = () => {};
console.warn = () => {};

const ORDER = 'order_AAAAAAAAAAAA';
const PAY = 'pay_BBBBBBBBBBBB';
const ME = 'user-me';
let world;
function reset(over = {}) {
  world = {
    order: { id: ORDER, amount: 19900, currency: 'INR', notes: { subscription_id: 'sub-mine', user_id: ME } },
    payment: { id: PAY, order_id: ORDER, amount: 19900, currency: 'INR', status: 'captured', notes: {} },
    activations: [], captures: 0, rpcError: null, razorpayDown: false, ...over,
  };
}
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.host === 'api.razorpay.com') {
    if (world.razorpayDown) return json(503, {});
    if (url.pathname === `/v1/orders/${ORDER}`) return json(200, world.order);
    if (url.pathname === `/v1/payments/${PAY}/capture`) { world.captures++; world.payment = { ...world.payment, status: 'captured' }; return json(200, world.payment); }
    if (url.pathname === `/v1/payments/${PAY}`) return json(200, world.payment);
    return json(404, {});
  }
  if (url.pathname === '/auth/v1/user') return json(200, { id: ME, aud: 'authenticated' });
  if (url.pathname === '/rest/v1/rpc/activate_subscription') {
    if (world.rpcError) return json(400, { message: world.rpcError });
    world.activations.push(JSON.parse(init.body));
    return json(200, { id: 'sub-mine', status: 'active' });
  }
  throw new Error('unexpected request ' + url);
};

const hmac = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest('hex');
async function callVerify(body = {}, { method = 'POST', auth = 'Bearer t' } = {}) {
  const res = { code: 200, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, end() { return this; } };
  const full = { razorpay_order_id: ORDER, razorpay_payment_id: PAY, razorpay_signature: hmac(`${ORDER}|${PAY}`, 'key-secret'), subscription_id: 'sub-mine', ...body };
  await verify({ method, headers: auth ? { authorization: auth } : {}, body: full }, res);
  return res;
}
// Deliberately spaced JSON: the signature must be checked over the exact bytes.
const event = (extra = {}) => JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: PAY, order_id: ORDER, amount: 19900, ...extra } } } }, null, 3);
const callHook = (raw, signature = hmac(raw, 'hook-secret')) =>
  webhook(new Request('https://zcare.test/api/razorpay-webhook', { method: 'POST', body: raw, headers: signature === null ? {} : { 'x-razorpay-signature': signature } }));

let passed = 0;
let failed = 0;
const check = (name, ok) => { if (ok) passed++; else { failed++; console.log('FAIL', name); } };
const none = () => world.activations.length === 0;

// ---- webhook
reset(); check('webhook refuses GET', (await webhook(new Request('https://zcare.test/api/razorpay-webhook'))).status === 405);
reset(); let r = await callHook(event(), null);
check('webhook without signature is rejected', r.status === 400 && none());
reset(); r = await callHook(event(), 'f'.repeat(64));
check('webhook with wrong signature is rejected', r.status === 400 && none());
reset(); delete process.env.RAZORPAY_WEBHOOK_SECRET; r = await callHook(event());
check('webhook without configured secret processes nothing', r.status === 500 && none());
process.env.RAZORPAY_WEBHOOK_SECRET = 'hook-secret';
reset(); r = await callHook(event());
check('genuine webhook activates once', r.status === 200 && world.activations.length === 1 && world.activations[0].p_subscription_id === 'sub-mine' && world.activations[0].p_amount_paid === 199);
reset(); r = await callHook(event({ notes: { subscription_id: 'sub-victim-or-other' } }));
check('payment notes are ignored; order notes decide', world.activations[0]?.p_subscription_id === 'sub-mine');
reset(); world.payment.status = 'failed'; r = await callHook(event());
check('webhook does not activate an uncaptured payment', r.status === 500 && none());
reset(); world.payment.status = 'authorized'; r = await callHook(event());
check('webhook never captures money itself', world.captures === 0 && none());
reset(); world.payment.order_id = 'order_OTHERORDER1'; r = await callHook(event());
check('webhook rejects payment of another order', r.status === 200 && none());
reset({ razorpayDown: true }); r = await callHook(event());
check('webhook asks for retry when Razorpay is down', r.status === 500 && none());
reset({ rpcError: 'subscription_not_pending' }); r = await callHook(event());
check('permanent database refusal is not retried', r.status === 200);
reset({ rpcError: 'connection reset' }); r = await callHook(event());
check('temporary database error is retried', r.status === 500);

// ---- verify-payment
reset(); r = await callVerify();
check('genuine payment activates', r.code === 200 && r.body.success && world.activations.length === 1);
check('no cross-origin header is sent', !('Access-Control-Allow-Origin' in r.headers));
reset(); r = await callVerify({}, { auth: null });
check('signed-out request is rejected', r.code === 401 && none());
reset(); r = await callVerify({ razorpay_signature: 'a'.repeat(64) });
check('forged signature is rejected', r.code === 400 && none());
reset(); r = await callVerify({ razorpay_payment_id: 'pay_x/../orders' });
check('malformed payment id is rejected', r.code === 400 && none());
reset(); r = await callVerify({ subscription_id: 'sub-yearly-other' });
check('payment cannot be applied to another subscription', r.code === 400 && none());
reset(); world.order.notes.user_id = 'someone-else'; r = await callVerify();
check("another user's order is rejected", r.code === 400 && none());
reset(); world.payment.amount = 100; r = await callVerify();
check('amount differing from the order is rejected', r.code === 400 && none());
reset(); world.payment.status = 'authorized'; r = await callVerify();
check('authorised payment is captured, then activated', r.code === 200 && world.captures === 1 && world.activations.length === 1);
reset({ rpcError: 'amount_mismatch: internal detail' }); r = await callVerify();
check('database error text is not returned to the browser', r.code === 400 && !JSON.stringify(r.body).includes('internal detail'));
reset(); r = await callVerify({}, { method: 'GET' });
check('GET is refused', r.code === 405);

console.log(` PAYMENT RESULTS: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
