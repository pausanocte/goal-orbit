# Orbit

Orbit is a lightweight goal management web app with local browser storage and optional Google Drive sync.

## What is ready

- Local browser save works immediately
- Google login can be used for Drive sync
- Free plan item limits are enabled
- GitHub Pages deployment is configured

## Before public use

You should set your own Google OAuth client ID in [js/config.js](/C:/Users/yyou0/.gemini/antigravity-ide/scratch/goal-orbit/js/config.js).

In Google Cloud Console, create an OAuth 2.0 Client ID for a Web application and add these items:

- Authorized JavaScript origin: your GitHub Pages URL
- Authorized JavaScript origin: `http://127.0.0.1:4173`
- Authorized JavaScript origin: `http://localhost:4173`

Example GitHub Pages origin:

```text
https://yuyayasumi.github.io
```

If you publish this repository as `goal-orbit`, the app URL will usually be:

```text
https://yuyayasumi.github.io/goal-orbit/
```

## How to publish

1. Push `main` to GitHub.
2. In the repository settings, open `Pages`.
3. Set the source to `GitHub Actions`.
4. Wait for the deployment workflow to finish.

## Notes about data

- Local edits are saved in the browser as you use the app.
- Drive sync starts after Google login is available.
- If local data and Drive data differ, Orbit now asks which one to keep instead of overwriting silently.

## Premium purchase setup

Premium purchasing uses Stripe Checkout and a Cloudflare Worker. Buyers do not need a Stripe account. After payment, the premium entitlement is attached to their Google account and is restored automatically on another browser after login.

The app sends only the Google account identifier needed for the purchase check. Goal and review data are not sent to Stripe or Cloudflare.

### 1. Create Stripe product

1. Create a one-time purchase product in Stripe.
2. Copy its Price ID (`price_...`).
3. Keep the Stripe secret key (`sk_...`) private.

### 2. Create Cloudflare KV

Create a KV namespace for premium entitlements and copy its namespace ID.

### 3. Configure the Worker

1. Copy `worker/wrangler.toml.example` to `worker/wrangler.toml`.
2. Set `STRIPE_PRICE_ID` and the KV namespace ID.
3. Confirm `ORBIT_APP_URL`, `ORBIT_APP_ORIGIN`, and `ALLOWED_ORIGINS` match the public site.
4. Add secrets without writing them into source control:

```powershell
cd worker
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

5. Deploy the Worker:

```powershell
npx wrangler deploy
```

### 4. Configure Stripe webhook

Create a Stripe webhook that points to:

```text
https://YOUR-WORKER.workers.dev/stripe/webhook
```

Enable these events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

Copy the webhook signing secret (`whsec_...`) to the Worker secret configured above.

### 5. Connect Orbit

Set the deployed Worker URL in `js/config.js`:

```js
premiumApiBaseUrl: 'https://YOUR-WORKER.workers.dev'
```

Until this URL is configured, Orbit safely shows the premium purchase as being prepared and does not open a checkout page.
