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
import { migrateIfNeeded, getFullData, restoreFullData, getLastModified, initializeSampleDataIfNeeded, hasLocalUserChanges, markDataSynced, saveRecoveryBackup, setPremiumUnlocked, purgeExpiredTrash } from './store.js';
import { initDriveApi, isDriveAuthorized, downloadBackup, uploadBackup, findExistingBackupFile } from './services/drive-api.js';
import { refreshPremiumEntitlement } from './services/premium-api.js';
import { setRetryDriveSyncHandler, setSyncStatus } from './sync-state.js';

let syncDebounceTimer = null;
let syncReady = false;
let startupSyncInProgress = false;
let localSyncInProgress = false;
let localSyncQueued = false;
const SYNC_CONFLICT_TOLERANCE_MS = 30 * 1000;

let currentPage = 'dashboard';

const sidebarEl = document.getElementById('sidebar');
const mainContentEl = document.getElementById('main-content');

function navigateTo(page) {
  flushPendingPageState();
  currentPage = page;
  renderSidebar(sidebarEl, currentPage, navigateTo);
  renderPage();
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
    triggerSidebarRender();
  }
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
  } catch (err) {
    console.error('Startup sync failed', err);
    setSyncStatus('error');
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
  setRetryDriveSyncHandler(retryDriveSync);
  migrateIfNeeded(); // v2からのマイグレーション
  purgeExpiredTrash();
  initializeSampleDataIfNeeded(); // サンプルデータの投入
  initDriveApi(handleDriveStatusChange);

  const openBtn = document.getElementById('sidebar-open-btn');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      document.querySelector('.app-layout').classList.remove('sidebar-collapsed');
    });
  }

  window.addEventListener('beforeunload', flushPendingPageState);
  window.addEventListener('pagehide', flushPendingPageState);

  navigateTo('dashboard');
});
