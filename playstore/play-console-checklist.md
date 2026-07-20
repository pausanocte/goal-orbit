# Play Console Checklist

## Before app creation

- Use package ID `app.goalorbit.mobile`.
- Publish the PWA to `https://goal-orbit-app.pages.dev/`.
- Confirm `https://goal-orbit-app.pages.dev/manifest.webmanifest` loads.
- Confirm `https://goal-orbit-app.pages.dev/privacy.html` loads.
- Disable external digital-goods checkout for the Play build.

## App setup

- Create the app in Play Console.
- Set app name: `Orbit`.
- Set default language: Japanese.
- Set app type: App.
- Set price: Free.
- Confirm no ads unless ads are later added.

## Store listing

- App icon: use `assets/icons/orbit-icon-512.png`.
- Short description: use `playstore/store-listing-ja.md`.
- Full description: use `playstore/store-listing-ja.md`.
- Screenshots: capture Android phone screenshots after the TWA build is installable.
- Privacy policy URL: `https://goal-orbit-app.pages.dev/privacy.html`.

## Policy declarations

- Data safety: local goal data is stored on device; Google Drive sync is optional.
- App access: no special credentials required unless Google login is being tested.
- Content rating: productivity / goal management.
- Target audience: adults/general productivity users.
- Financial features: none, if Stripe checkout remains disabled.

## Release

- Upload `android/app-release-bundle.aab`.
- Add release notes.
- Run internal testing first.
- Add closed testing if required by the Play Console account.
- Confirm Digital Asset Links validation before production rollout.
