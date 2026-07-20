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
const SYNC_CONFLICT_TOLERANCE_MS = 30 * 1000;

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
    return;
  }

  localSyncInProgress = true;
  setSyncStatus('syncing');
  triggerSidebarRender();

  try {
    do {
      localSyncQueued = false;
      const localData = getFullData();
      const uploaded = await uploadBackup(localData);
      if (!uploaded) throw new Error('DRIVE_BACKUP_UPLOAD_FAILED');
      markDataSynced(localData.lastModified);
    } while (localSyncQueued);

    setSyncStatus('synced');
  } catch (err) {
    console.error(err);
    setSyncStatus('error');
  } finally {
    localSyncInProgress = false;
    triggerSidebarRender();
  }
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

  const mobileShell = window.matchMedia('(max-width: 720px)');
  const handleMobileShellChange = () => collapseSidebarOnSmallScreens();
  collapseSidebarOnSmallScreens();
  if (mobileShell.addEventListener) {
    mobileShell.addEventListener('change', handleMobileShellChange);
  } else {
    mobileShell.addListener(handleMobileShellChange);
  }

  window.addEventListener('beforeunload', flushPendingPageState);
  window.addEventListener('pagehide', flushPendingPageState);

  navigateTo('dashboard');
});
