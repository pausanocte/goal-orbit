// ==========================================
// Orbit v3 - アプリ初期化・ルーティング
// ==========================================

import { renderSidebar } from './components/sidebar.js';
import { renderDashboard } from './components/dashboard.js';
import { renderTodayPage } from './components/today-page.js';
import { renderAreaPage } from './components/area-page.js';
import { renderMonthlyReview, flushMonthlyReviewAutosave } from './components/monthly-review.js';
import { renderArchives } from './components/archives.js';
import { openSyncConflictModal } from './components/sync-conflict-modal.js';
import { migrateIfNeeded, getFullData, restoreFullData, getLastModified, hasLocalUserChanges, markDataSynced, saveRecoveryBackup, setPremiumUnlocked, purgeExpiredTrash, shouldAskSampleChoice, markSampleChoice, createSampleData } from './store.js';
import { initDriveApi, isDriveAuthorized, downloadBackup, uploadBackup, findExistingBackupFile } from './services/drive-api.js';
import { refreshPremiumEntitlement } from './services/premium-api.js';
import { setRetryDriveSyncHandler, setSyncStatus } from './sync-state.js';
import { el } from './utils.js';
import { t } from './i18n.js';
import { initPwa } from './pwa.js';

let syncDebounceTimer = null;
let syncReady = false;
let startupSyncInProgress = false;
let startupSyncResolved = false;
let localSyncInProgress = false;
let localSyncQueued = false;
let activeSyncPromise = null;
let exitSyncOverlay = null;
let exitBackArmedUntil = 0;
const SYNC_CONFLICT_TOLERANCE_MS = 30 * 1000;
const EXIT_SYNC_TIMEOUT_MS = 8000;
const EXIT_BACK_ARM_MS = 5000;
const EXIT_GUARD_STATE = { orbitExitGuard: true };

let currentPage = 'dashboard';

const sidebarEl = document.getElementById('sidebar');
const mainContentEl = document.getElementById('main-content');
const appLayoutEl = document.querySelector('.app-layout');
const sidebarBackdropEl = document.getElementById('sidebar-backdrop');

const SIDEBAR_SWIPE_EDGE_PX = 36;
const SIDEBAR_SWIPE_MIN_X = 58;
const SIDEBAR_SWIPE_MAX_Y = 72;
const SIDEBAR_SWIPE_VELOCITY = 0.45;

let sidebarGesture = null;

function navigateTo(page) {
  flushPendingPageState();
  currentPage = page;
  renderSidebar(sidebarEl, currentPage, navigateTo);
  renderPage();
  collapseSidebarOnSmallScreens();
}

function collapseSidebarOnSmallScreens() {
  if (window.matchMedia('(max-width: 720px)').matches) {
    setSidebarOpen(false);
  }
}

function isSmallScreenShell() {
  return window.matchMedia('(max-width: 720px)').matches;
}

function setSidebarOpen(isOpen) {
  appLayoutEl?.classList.toggle('sidebar-collapsed', !isOpen);
  sidebarBackdropEl?.setAttribute('aria-hidden', String(!isOpen));
}

function initSidebarGestures() {
  const closeSidebar = () => setSidebarOpen(false);
  sidebarBackdropEl?.addEventListener('click', closeSidebar);

  window.addEventListener('pointerdown', (event) => {
    if (!isSmallScreenShell() || !appLayoutEl) return;
    if (event.isPrimary === false) return;

    const isCollapsed = appLayoutEl.classList.contains('sidebar-collapsed');
    const startX = event.clientX;
    const startY = event.clientY;
    const sidebarRect = sidebarEl?.getBoundingClientRect();
    const sidebarRight = sidebarRect?.right || 0;
    const startOnOpenEdge = isCollapsed && startX <= SIDEBAR_SWIPE_EDGE_PX;
    const startOnCloseZone = !isCollapsed && (
      startX <= sidebarRight + 24 || event.target === sidebarBackdropEl
    );

    if (!startOnOpenEdge && !startOnCloseZone) return;

    sidebarGesture = {
      pointerId: event.pointerId,
      mode: isCollapsed ? 'open' : 'close',
      startX,
      startY,
      startedAt: performance.now(),
      cancelled: false
    };
  }, { passive: true });

  window.addEventListener('pointermove', (event) => {
    if (!sidebarGesture || event.pointerId !== sidebarGesture.pointerId) return;

    const dx = event.clientX - sidebarGesture.startX;
    const dy = event.clientY - sidebarGesture.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDy > SIDEBAR_SWIPE_MAX_Y && absDy > absDx * 1.2) {
      sidebarGesture.cancelled = true;
      return;
    }

    const horizontalSwipe =
      sidebarGesture.mode === 'open'
        ? dx > 12 && absDx > absDy
        : dx < -12 && absDx > absDy;

    if (horizontalSwipe) event.preventDefault();
  }, { passive: false });

  window.addEventListener('pointerup', (event) => {
    if (!sidebarGesture || event.pointerId !== sidebarGesture.pointerId) return;

    const dx = event.clientX - sidebarGesture.startX;
    const dy = event.clientY - sidebarGesture.startY;
    const elapsed = Math.max(1, performance.now() - sidebarGesture.startedAt);
    const velocity = dx / elapsed;
    const isMostlyHorizontal = Math.abs(dy) <= SIDEBAR_SWIPE_MAX_Y;

    if (!sidebarGesture.cancelled && isMostlyHorizontal) {
      if (
        sidebarGesture.mode === 'open' &&
        (dx >= SIDEBAR_SWIPE_MIN_X || (dx > 30 && velocity >= SIDEBAR_SWIPE_VELOCITY))
      ) {
        setSidebarOpen(true);
      }

      if (
        sidebarGesture.mode === 'close' &&
        (dx <= -SIDEBAR_SWIPE_MIN_X || (dx < -30 && velocity <= -SIDEBAR_SWIPE_VELOCITY))
      ) {
        setSidebarOpen(false);
      }
    }

    sidebarGesture = null;
  }, { passive: true });

  window.addEventListener('pointercancel', (event) => {
    if (sidebarGesture?.pointerId === event.pointerId) sidebarGesture = null;
  }, { passive: true });
}

function flushPendingPageState() {
  if (currentPage === 'monthly-review') {
    flushMonthlyReviewAutosave();
  }
}

export function triggerSidebarRender() {
  if (sidebarEl.innerHTML !== '') {
    renderSidebar(sidebarEl, currentPage, navigateTo);
  }
}

function handleDriveStatusChange(status) {
  setSyncStatus(status);
  if (status === 'authorized') {
    refreshPremiumAfterLogin()
      .catch(err => console.warn('Premium status check failed', err))
      .finally(triggerSidebarRender);
    performStartupSync();
  } else {
    if (status === 'ready') setPremiumUnlocked(false);
    if (status === 'ready' || status === 'error') resolveStartupSyncForSampleChoice();
    triggerSidebarRender();
  }
}

function resolveStartupSyncForSampleChoice() {
  if (startupSyncResolved) return;
  startupSyncResolved = true;
  showSampleChoiceModalIfNeeded();
}

async function refreshPremiumAfterLogin() {
  const purchaseCompleted = new URLSearchParams(window.location.search).get('purchase') === 'success';
  const attempts = purchaseCompleted ? 6 : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await refreshPremiumEntitlement()) {
      if (purchaseCompleted) window.history.replaceState({}, '', window.location.pathname);
      return true;
    }
    if (attempt < attempts - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return false;
}

export function retryDriveSync() {
  if (isDriveAuthorized()) performStartupSync();
}

async function performStartupSync() {
  if (startupSyncInProgress) return;
  startupSyncInProgress = true;
  syncReady = false;
  setSyncStatus('syncing');
  triggerSidebarRender();

  try {
    const backupMeta = await findExistingBackupFile();
    if (backupMeta) {
      const driveData = await downloadBackup();
      if (!driveData) throw new Error('DRIVE_BACKUP_DOWNLOAD_FAILED');

      const localData = getFullData();
      const localModified = getLastModified();
      const driveModified = Number(driveData.lastModified) || new Date(backupMeta.modifiedTime).getTime();

      if (dataSetsMatch(localData, driveData)) {
        markDataSynced(localModified);
      } else if (!hasLocalUserChanges()) {
        restoreFullData(driveData);
        renderPage();
      } else if (!isMeaningfullyNewer(driveModified, localModified)) {
        saveRecoveryBackup(driveData);
        const uploaded = await uploadBackup(localData);
        if (!uploaded) throw new Error('DRIVE_BACKUP_UPLOAD_FAILED');
        markDataSynced(localModified);
      } else {
        const choice = await openSyncConflictModal({ localModified, driveModified });

        if (choice === 'drive') {
          saveRecoveryBackup(localData);
          restoreFullData(driveData);
          renderPage();
        } else if (choice === 'local') {
          const uploaded = await uploadBackup(localData);
          if (!uploaded) throw new Error('DRIVE_BACKUP_UPLOAD_FAILED');
          markDataSynced(localModified);
        } else {
          setSyncStatus('conflict');
          triggerSidebarRender();
          return;
        }
      }
    } else {
      const localData = getFullData();
      const uploaded = await uploadBackup(localData);
      if (!uploaded) throw new Error('DRIVE_BACKUP_UPLOAD_FAILED');
      markDataSynced(localData.lastModified);
    }

    syncReady = true;
    setSyncStatus('synced');
    if (hasLocalUserChanges()) {
      window.dispatchEvent(new Event('orbitDataChanged'));
    }
    resolveStartupSyncForSampleChoice();
  } catch (err) {
    console.error('Startup sync failed', err);
    setSyncStatus('error');
    resolveStartupSyncForSampleChoice();
  } finally {
    startupSyncInProgress = false;
    triggerSidebarRender();
  }
}

window.addEventListener('orbitDataChanged', async (event) => {
  if (!isDriveAuthorized() || !syncReady) return;

  clearTimeout(syncDebounceTimer);

  if (event?.detail?.immediateSync) {
    await syncLocalData();
    return;
  }

  setSyncStatus('syncing');
  triggerSidebarRender();

  syncDebounceTimer = setTimeout(async () => {
    await syncLocalData();
  }, 5000); // 5 seconds debounce
});

async function syncLocalData() {
  if (localSyncInProgress) {
    localSyncQueued = true;
    setSyncStatus('syncing');
    triggerSidebarRender();
    return activeSyncPromise || false;
  }

  localSyncInProgress = true;
  setSyncStatus('syncing');
  triggerSidebarRender();

  activeSyncPromise = runLocalSync();
  return activeSyncPromise;
}

async function runLocalSync() {
  try {
    do {
      localSyncQueued = false;
      const localData = getFullData();
      const uploaded = await uploadBackup(localData);
      if (!uploaded) throw new Error('DRIVE_BACKUP_UPLOAD_FAILED');
      markDataSynced(localData.lastModified);
    } while (localSyncQueued);

    setSyncStatus('synced');
    return true;
  } catch (err) {
    console.error(err);
    setSyncStatus('error');
    return false;
  } finally {
    localSyncInProgress = false;
    activeSyncPromise = null;
    triggerSidebarRender();
  }
}

function getExitSyncText(status) {
  const isJa = document.documentElement.lang === 'ja' || navigator.language?.startsWith('ja');
  const copy = {
    syncing: {
      ja: ['Google Driveに同期しています', '終わるまで少し待ってください。'],
      en: ['Syncing to Google Drive', 'Please wait before closing Orbit.']
    },
    done: {
      ja: ['同期しました', 'もう一度戻ると終了できます。'],
      en: ['Synced', 'Press Back again to close Orbit.']
    },
    failed: {
      ja: ['同期できませんでした', 'ローカルには保存済みです。通信状況を確認してください。'],
      en: ['Sync failed', 'Your changes are saved locally. Check your connection.']
    }
  };
  return copy[status]?.[isJa ? 'ja' : 'en'] || copy.syncing.en;
}

function showExitSyncOverlay(status = 'syncing') {
  const [title, detail] = getExitSyncText(status);
  if (!exitSyncOverlay) {
    exitSyncOverlay = el('div', { className: 'exit-sync-overlay', role: 'status', 'aria-live': 'polite' },
      el('div', { className: 'exit-sync-card' },
        el('div', { className: 'exit-sync-spinner', 'aria-hidden': 'true' }),
        el('div', { className: 'exit-sync-copy' },
          el('strong', { className: 'exit-sync-title' }, title),
          el('span', { className: 'exit-sync-detail' }, detail)
        )
      )
    );
    document.body.appendChild(exitSyncOverlay);
  }

  exitSyncOverlay.dataset.status = status;
  exitSyncOverlay.querySelector('.exit-sync-title').textContent = title;
  exitSyncOverlay.querySelector('.exit-sync-detail').textContent = detail;
  exitSyncOverlay.classList.add('active');
}

function hideExitSyncOverlay(delay = 0) {
  if (!exitSyncOverlay) return;
  window.setTimeout(() => {
    exitSyncOverlay?.classList.remove('active');
  }, delay);
}

async function syncBeforeLeavingApp() {
  flushPendingPageState();
  clearTimeout(syncDebounceTimer);

  if (!isDriveAuthorized() || !syncReady || (!hasLocalUserChanges() && !localSyncInProgress)) {
    exitBackArmedUntil = Date.now() + EXIT_BACK_ARM_MS;
    return true;
  }

  showExitSyncOverlay('syncing');

  const timeoutPromise = new Promise(resolve => {
    window.setTimeout(() => resolve(false), EXIT_SYNC_TIMEOUT_MS);
  });
  const syncSucceeded = await Promise.race([syncLocalData(), timeoutPromise]);

  if (syncSucceeded && !hasLocalUserChanges()) {
    showExitSyncOverlay('done');
    exitBackArmedUntil = Date.now() + EXIT_BACK_ARM_MS;
    hideExitSyncOverlay(1800);
    return true;
  }

  showExitSyncOverlay('failed');
  hideExitSyncOverlay(3500);
  return false;
}

function requestFinalSync(reason = 'background') {
  flushPendingPageState();
  clearTimeout(syncDebounceTimer);

  if (!isDriveAuthorized() || !syncReady || !hasLocalUserChanges()) return;
  if (reason === 'back') {
    syncBeforeLeavingApp();
    return;
  }
  syncLocalData();
}

function initBackButtonSyncGuard() {
  if (!window.history?.pushState) return;

  const armGuard = () => {
    if (!isSmallScreenShell()) return;
    if (!history.state?.orbitExitGuard) {
      history.pushState(EXIT_GUARD_STATE, '', location.href);
    }
  };

  history.replaceState({ ...(history.state || {}), orbitAppRoot: true }, '', location.href);
  armGuard();

  window.addEventListener('popstate', async () => {
    if (!isSmallScreenShell()) return;

    const canLeave = await syncBeforeLeavingApp();
    if (!canLeave) {
      armGuard();
      return;
    }

    window.setTimeout(() => {
      if (Date.now() > exitBackArmedUntil && isSmallScreenShell()) armGuard();
    }, EXIT_BACK_ARM_MS + 200);
  });
}

function dataSetsMatch(localData, driveData) {
  const comparable = data => ({
    areas: data.areas || [],
    goals: data.goals || [],
    reviews: data.reviews || [],
    language: data.language || 'ja',
    dashboardLayout: data.dashboardLayout || []
  });
  return JSON.stringify(comparable(localData)) === JSON.stringify(comparable(driveData));
}

function isMeaningfullyNewer(candidateModified, baseModified) {
  return candidateModified - baseModified > SYNC_CONFLICT_TOLERANCE_MS;
}

function renderPage() {
  const refreshCurrentPage = () => navigateTo(currentPage);

  if (currentPage.startsWith('area-')) {
    const areaId = currentPage.replace('area-', '');
    renderAreaPage(mainContentEl, areaId, navigateTo, refreshCurrentPage);
    return;
  }

  switch (currentPage) {
    case 'dashboard':
      renderDashboard(mainContentEl, navigateTo);
      break;
    case 'today':
      renderTodayPage(mainContentEl);
      break;
    case 'monthly-review':
      renderMonthlyReview(mainContentEl);
      break;
    case 'archives':
      renderArchives(mainContentEl, refreshCurrentPage);
      break;
    default:
      renderDashboard(mainContentEl, navigateTo);
  }
}

// 初期レンダリング
function showSampleChoiceModalIfNeeded() {
  if (!shouldAskSampleChoice()) return;

  const overlay = el('div', { className: 'modal-overlay active sample-choice-overlay' });
  const modal = el('div', { className: 'modal active sample-choice-modal' },
    el('div', { className: 'modal-header' },
      el('div', {},
        el('h2', { className: 'modal-title' }, t('sampleChoice.title')),
        el('p', { className: 'page-subtitle', style: 'margin: 6px 0 0;' }, t('sampleChoice.subtitle'))
      )
    ),
    el('div', { className: 'sample-choice-grid' },
      el('button', {
        type: 'button',
        className: 'sample-choice-card',
        onClick: () => {
          createSampleData();
          markSampleChoice('sample');
          overlay.remove();
          navigateTo('dashboard');
        }
      },
        el('i', { 'data-lucide': 'sparkles' }),
        el('strong', {}, t('sampleChoice.useSample')),
        el('span', {}, t('sampleChoice.useSampleDesc'))
      ),
      el('button', {
        type: 'button',
        className: 'sample-choice-card',
        onClick: () => {
          markSampleChoice('empty');
          overlay.remove();
          navigateTo('dashboard');
        }
      },
        el('i', { 'data-lucide': 'file-plus-2' }),
        el('strong', {}, t('sampleChoice.startEmpty')),
        el('span', {}, t('sampleChoice.startEmptyDesc'))
      )
    )
  );

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.__orbitAppInitialized) return;
  window.__orbitAppInitialized = true;

  const savedTheme = localStorage.getItem('orbit_theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }

  setPremiumUnlocked(false);
  initPwa();
  setRetryDriveSyncHandler(retryDriveSync);
  migrateIfNeeded(); // v2からのマイグレーション
  purgeExpiredTrash();
  initDriveApi(handleDriveStatusChange);

  const openBtn = document.getElementById('sidebar-open-btn');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      setSidebarOpen(true);
    });
  }
  initSidebarGestures();
  initBackButtonSyncGuard();

  const mobileShell = window.matchMedia('(max-width: 720px)');
  const handleMobileShellChange = () => collapseSidebarOnSmallScreens();
  collapseSidebarOnSmallScreens();
  if (mobileShell.addEventListener) {
    mobileShell.addEventListener('change', handleMobileShellChange);
  } else {
    mobileShell.addListener(handleMobileShellChange);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') requestFinalSync('background');
  });
  window.addEventListener('beforeunload', requestFinalSync);
  window.addEventListener('pagehide', requestFinalSync);

  navigateTo('dashboard');
});
