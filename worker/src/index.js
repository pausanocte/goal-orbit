const STRIPE_API = 'https://api.stripe.com/v1';
const GOOGLE_USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request, env) });
    }

    try {
      if (request.method === 'POST' && url.pathname === '/stripe/webhook') {
        return await handleStripeWebhook(request, env);
      }
      if (request.method === 'POST' && url.pathname === '/checkout') {
        return json(await createCheckout(request, env), 200, corsHeaders(request, env));
      }
      if (request.method === 'GET' && url.pathname === '/entitlement') {
        return json(await getEntitlement(request, env), 200, corsHeaders(request, env));
      }
      return json({ error: 'NOT_FOUND' }, 404, corsHeaders(request, env));
    } catch (error) {
      console.error(error);
      const status = error.status || 500;
      return json({
        error: error.message || 'INTERNAL_ERROR',
        code: error.code || null
      }, status, corsHeaders(request, env));
    }
  }
};

async function createCheckout(request, env) {
  const user = await authenticateGoogleUser(request);
  const body = new URLSearchParams({
    mode: 'payment',
    success_url: `${env.ORBIT_APP_URL}?purchase=success`,
    cancel_url: `${env.ORBIT_APP_URL}?purchase=cancelled`,
    client_reference_id: user.sub,
    customer_email: user.email,
    'line_items[0][price]': env.STRIPE_PRICE_ID,
    'line_items[0][quantity]': '1',
    'metadata[google_user_id]': user.sub
  });

  const response = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  const session = await response.json();
  if (!response.ok) {
    console.error('Stripe checkout failed', {
      code: session.error?.code,
      type: session.error?.type,
      message: session.error?.message
    });
    throw httpError(502, session.error?.message || 'STRIPE_CHECKOUT_FAILED', session.error?.code || 'STRIPE_CHECKOUT_FAILED');
  }
  return { url: session.url };
}

async function getEntitlement(request, env) {
  const user = await authenticateGoogleUser(request);
  const entitlement = await env.ENTITLEMENTS.get(user.sub, 'json');
  return { premium: entitlement?.active === true };
}

async function handleStripeWebhook(request, env) {
  const payload = await request.text();
  const signature = request.headers.get('Stripe-Signature') || '';
  if (!await verifyStripeSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET)) {
    return json({ error: 'INVALID_SIGNATURE' }, 400);
  }

  const event = JSON.parse(payload);
  const session = event.data?.object;
  const paidEvent = event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded';

  if (paidEvent && session?.payment_status === 'paid') {
    const googleUserId = session.metadata?.google_user_id || session.client_reference_id;
    if (googleUserId) {
      await env.ENTITLEMENTS.put(googleUserId, JSON.stringify({
        active: true,
        purchasedAt: new Date().toISOString(),
        stripeSessionId: session.id
      }));
    }
  }
  return json({ received: true });
}

async function authenticateGoogleUser(request) {
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw httpError(401, 'GOOGLE_LOGIN_REQUIRED');

  const response = await fetch(GOOGLE_USERINFO, {
    headers: { Authorization: authorization }
  });
  if (!response.ok) throw httpError(401, 'INVALID_GOOGLE_LOGIN');

  const user = await response.json();
  if (!user.sub || !user.email) throw httpError(401, 'GOOGLE_PROFILE_UNAVAILABLE');
  return user;
}

async function verifyStripeSignature(payload, header, secret) {
  const parts = header.split(',').map(part => part.split('=', 2));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!timestamp || signatures.length === 0 || !secret) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
  return signatures.some(value => timingSafeEqual(expected, value));
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim());
  return {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : env.ORBIT_APP_ORIGIN,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

function httpError(status, message, code = null) {
  return Object.assign(new Error(message), { status, code });
}
