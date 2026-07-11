import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from './src/index.js';

const entitlementWrites = [];
const env = {
  ORBIT_APP_URL: 'https://example.com/goal-orbit/',
  ORBIT_APP_ORIGIN: 'https://example.com',
  ALLOWED_ORIGINS: 'https://example.com',
  STRIPE_PRICE_ID: 'price_test',
  STRIPE_SECRET_KEY: 'sk_test_value',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_value',
  ENTITLEMENTS: {
    async get(key) {
      return key === 'google-user-1' ? { active: true } : null;
    },
    async put(key, value) {
      entitlementWrites.push([key, JSON.parse(value)]);
    }
  }
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url.includes('googleapis.com/oauth2/v3/userinfo')) {
    return Response.json({ sub: 'google-user-1', email: 'buyer@example.com' });
  }
  if (url.includes('api.stripe.com/v1/checkout/sessions')) {
    assert.equal(options.headers.Authorization, 'Bearer sk_test_value');
    assert.match(String(options.body), /client_reference_id=google-user-1/);
    return Response.json({ url: 'https://checkout.stripe.com/test' });
  }
  throw new Error(`Unexpected fetch: ${url}`);
};

try {
  const authHeaders = { Authorization: 'Bearer google-token', Origin: 'https://example.com' };
  const entitlementResponse = await worker.fetch(new Request('https://worker.test/entitlement', { headers: authHeaders }), env);
  assert.deepEqual(await entitlementResponse.json(), { premium: true });

  const checkoutResponse = await worker.fetch(new Request('https://worker.test/checkout', {
    method: 'POST',
    headers: authHeaders
  }), env);
  assert.deepEqual(await checkoutResponse.json(), { url: 'https://checkout.stripe.com/test' });

  const event = JSON.stringify({
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test', payment_status: 'paid', metadata: { google_user_id: 'google-user-1' } } }
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${event}`).digest('hex');
  const webhookResponse = await worker.fetch(new Request('https://worker.test/stripe/webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` },
    body: event
  }), env);
  assert.equal(webhookResponse.status, 200);
  assert.equal(entitlementWrites[0][0], 'google-user-1');
  assert.equal(entitlementWrites[0][1].active, true);

  console.log('Worker premium flow tests passed.');
} finally {
  globalThis.fetch = originalFetch;
}
