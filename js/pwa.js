const INSTALL_BUTTON_ID = 'install-app-btn';

let deferredInstallPrompt = null;

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function getInstallButton() {
  return document.getElementById(INSTALL_BUTTON_ID);
}

function updateInstallButton() {
  const button = getInstallButton();
  if (!button) return;
  button.hidden = !deferredInstallPrompt || isStandalone();
}

function bindInstallPrompt() {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateInstallButton();
  });

  const button = getInstallButton();
  if (!button) return;

  button.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;

    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    updateInstallButton();

    await promptEvent.prompt();
    await promptEvent.userChoice.catch(() => null);
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(error => {
      console.warn('Orbit service worker registration failed', error);
    });
  });
}

export function initPwa() {
  bindInstallPrompt();
  registerServiceWorker();
}
