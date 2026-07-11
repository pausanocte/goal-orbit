import { ORBIT_CONFIG } from '../config.js';
import { getGoogleAccessToken } from './drive-api.js';
import { setPremiumUnlocked } from '../store.js';

const apiBaseUrl = ORBIT_CONFIG.premiumApiBaseUrl.replace(/\/$/, '');

export function isPremiumPurchaseConfigured() {
  return Boolean(apiBaseUrl);
}

async function premiumRequest(path, options = {}) {
  const accessToken = getGoogleAccessToken();
  if (!accessToken) throw new Error('GOOGLE_LOGIN_REQUIRED');

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || `PREMIUM_API_${response.status}`);
    error.code = body.code || null;
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function refreshPremiumEntitlement() {
  if (!isPremiumPurchaseConfigured() || !getGoogleAccessToken()) return false;
  const result = await premiumRequest('/entitlement');
  setPremiumUnlocked(result.premium === true);
  return result.premium === true;
}

export async function startPremiumPurchase() {
  if (!isPremiumPurchaseConfigured()) throw new Error('PURCHASE_NOT_CONFIGURED');
  const result = await premiumRequest('/checkout', { method: 'POST', body: '{}' });
  if (!result.url) throw new Error('CHECKOUT_URL_MISSING');
  window.location.assign(result.url);
}
