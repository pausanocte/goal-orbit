# Orbit Android / Play Store Setup

Orbit will be published as a free Android app by wrapping the existing PWA with a Trusted Web Activity (TWA). This keeps hosting free and avoids maintaining a separate native Android codebase.

## Current publishing stance

- Android package: `app.goalorbit.mobile`.
- Hosting: Cloudflare Pages Free at `https://goal-orbit-app.pages.dev/`.
- Payments: external Stripe checkout is disabled in the app config for Play Store readiness.
- Premium upsell UI: hidden by default.
- Practical free limit: `freeItemLimit` is configured to `1000` in `js/config.js`.

## Required one-time external cost

Google Play Console requires a one-time developer registration fee. Hosting and local Android build preparation can still be done for free.

## Recommended free hosting

Use Cloudflare Pages Free and publish Orbit at:

```text
https://goal-orbit-app.pages.dev/
```

This is easier for TWA than a nested GitHub Pages path such as `/goal-orbit/`, because Digital Asset Links must be served from:

```text
https://goal-orbit-app.pages.dev/.well-known/assetlinks.json
```

## Android build tools

Bubblewrap is the recommended CLI for generating the Android TWA project.

```powershell
npm.cmd install --global @bubblewrap/cli
bubblewrap doctor
```

If Bubblewrap offers to install Android command line tools, accept the setup and licenses.

You can also use the helper script:

```powershell
.\playstore\android-twa.ps1 doctor
```

## Initialize the Android project

Run this only after the production PWA URL is live and `manifest.webmanifest` is reachable over HTTPS:

```powershell
bubblewrap init --manifest=https://goal-orbit-app.pages.dev/manifest.webmanifest --directory=android
```

Or with the helper:

```powershell
$env:ORBIT_TWA_MANIFEST_URL = 'https://goal-orbit-app.pages.dev/manifest.webmanifest'
.\playstore\android-twa.ps1 init
```

Use these values when prompted:

- Application name: `Orbit`
- Launcher name: `Orbit`
- Package ID: `app.goalorbit.mobile`
- Start URL: `/`
- Display mode: `standalone`
- Orientation: `portrait`
- Theme color: `#111118`
- Navigation color: `#0A0A0F`

Commit the generated Android project, but never commit signing keys or generated `.aab` / `.apk` files.

## Build the Play Store bundle

```powershell
cd android
bubblewrap build
```

Or with the helper:

```powershell
.\playstore\android-twa.ps1 build
```

The Play Store upload artifact is:

```text
android/app-release-bundle.aab
```

## Digital Asset Links

After creating the Play app and enabling Play App Signing, copy the Play app signing certificate SHA-256 fingerprint from Play Console.

Then update `.well-known/assetlinks.json` from `.well-known/assetlinks.example.json`:

- replace `REPLACE_WITH_PLAY_APP_SIGNING_SHA256`

Deploy that file to the PWA host before final TWA testing.

## Play Console checklist

Use `playstore/play-console-checklist.md` while preparing the listing and release.
