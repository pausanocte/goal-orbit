// ==========================================
// Orbit v3 - Google Drive API Service
// ==========================================

import { ORBIT_CONFIG } from '../config.js';

const CLIENT_ID = ORBIT_CONFIG.googleClientId;
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events email profile';
const BACKUP_FILENAME = 'orbit-cloud-backup.json';
const AUTH_SESSION_KEY = 'orbit_google_auth_session';
const AUTO_LOGIN_KEY = 'orbit_google_auto_login';
const INIT_RETRY_INTERVAL_MS = 500;
const INIT_TIMEOUT_MS = 8000;

let tokenClient;
let gapiInited = false;
let gisInited = false;
let isAuthorized = false;
let currentFileId = null;
let statusCallback = null;
let currentUserInfo = null;
let readyHandled = false;
let initStarted = false;
let initRetryTimer = null;
let initTimeoutTimer = null;
let gapiLoadRequested = false;

function saveAuthSession(tokenResponse) {
  const expiresIn = Number(tokenResponse.expires_in || 3600);
  const session = {
    access_token: tokenResponse.access_token,
    token_type: tokenResponse.token_type || 'Bearer',
    scope: tokenResponse.scope || SCOPES,
    expires_at: Date.now() + (expiresIn * 1000)
  };
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  localStorage.setItem(AUTO_LOGIN_KEY, 'true');
}

function restoreAuthSession() {
  try {
    const raw = sessionStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return false;

    const session = JSON.parse(raw);
    if (!session.access_token || session.expires_at <= Date.now() + 60000) {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
      return false;
    }

    gapi.client.setToken({ access_token: session.access_token });
    isAuthorized = true;
    return true;
  } catch {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    return false;
  }
}

async function finishAuthorization(tokenResponse = null) {
  if (tokenResponse) {
    gapi.client.setToken(tokenResponse);
    saveAuthSession(tokenResponse);
  }
  isAuthorized = true;
  await fetchUserInfo();
  updateStatus('authorized');
}

export async function fetchUserInfo() {
  if (!isAuthorized) return null;
  try {
    const accessToken = gapi.client.getToken().access_token;
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (res.ok) {
      currentUserInfo = await res.json();
      return currentUserInfo;
    }
  } catch (err) {
    console.error('Error fetching user info', err);
  }
  return null;
}

export function getUserInfo() {
  return currentUserInfo;
}

export function getGoogleAccessToken() {
  return isAuthorized ? gapi.client.getToken()?.access_token || null : null;
}

export function initDriveApi(onStatusChange) {
  statusCallback = onStatusChange;

  if (initStarted) return;
  initStarted = true;

  initTimeoutTimer = setTimeout(() => {
    if (!gapiInited || !gisInited) {
      console.warn('Google APIs did not finish loading in time.');
      updateStatus('error');
    }
  }, INIT_TIMEOUT_MS);

  tryInitializeDriveApi();
}

function tryInitializeDriveApi() {
  if (typeof gapi !== 'undefined' && typeof google !== 'undefined') {
    if (!gapiLoadRequested) {
      gapiLoadRequested = true;
      gapi.load('client', initializeGapiClient);
    }
    initializeGisClient();
  } else {
    initRetryTimer = setTimeout(tryInitializeDriveApi, INIT_RETRY_INTERVAL_MS);
  }
}

async function initializeGapiClient() {
  try {
    await gapi.client.init({
      discoveryDocs: [DISCOVERY_DOC],
    });
    gapiInited = true;
    checkIfReady();
  } catch (err) {
    console.error('Error initializing GAPI client', err);
    updateStatus('error');
  }
}

function initializeGisClient() {
  if (gisInited || !google?.accounts?.oauth2) return;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: async (resp) => {
      if (resp.error !== undefined) {
        updateStatus('ready');
        return;
      }
      await finishAuthorization(resp);
    },
    error_callback: () => updateStatus('ready'),
  });
  gisInited = true;
  checkIfReady();
}

async function checkIfReady() {
  if (!gapiInited || !gisInited || readyHandled) return;
  readyHandled = true;
  clearTimeout(initRetryTimer);
  clearTimeout(initTimeoutTimer);

  if (restoreAuthSession()) {
    await finishAuthorization();
    return;
  }

  if (localStorage.getItem(AUTO_LOGIN_KEY) === 'true') {
    // Reuse the user's existing Google grant when the browser permits it.
    tokenClient.requestAccessToken({ prompt: '' });
    return;
  }

  updateStatus('ready');
}

function updateStatus(status) {
  if (statusCallback) statusCallback(status);
}

export function handleAuthClick() {
  if (gapi.client.getToken() === null) {
    tokenClient.requestAccessToken({prompt: 'consent'});
  } else {
    tokenClient.requestAccessToken({prompt: ''});
  }
}

export function handleSignoutClick() {
  const token = gapi.client.getToken();
  if (token !== null) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken('');
    isAuthorized = false;
    currentFileId = null;
    currentUserInfo = null;
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    localStorage.removeItem(AUTO_LOGIN_KEY);
    updateStatus('ready');
  }
}

export async function findExistingBackupFile() {
  try {
    const response = await gapi.client.drive.files.list({
      q: `name='${BACKUP_FILENAME}' and trashed=false`,
      fields: 'files(id, name, modifiedTime)',
      spaces: 'drive',
    });
    const files = response.result.files;
    if (files && files.length > 0) {
      currentFileId = files[0].id;
      return files[0];
    } else {
      currentFileId = null;
      return null;
    }
  } catch (err) {
    console.error('Error finding backup file', err);
    throw err;
  }
}

export async function downloadBackup() {
  if (!isAuthorized || !currentFileId) return null;
  try {
    const response = await gapi.client.drive.files.get({
      fileId: currentFileId,
      alt: 'media'
    });
    return typeof response.result === 'string' ? JSON.parse(response.result) : response.result;
  } catch (err) {
    console.error('Error downloading backup', err);
    return null;
  }
}

export async function uploadBackup(jsonData) {
  if (!isAuthorized) return false;
  updateStatus('syncing');

  const fileMetadata = {
    name: BACKUP_FILENAME,
    mimeType: 'application/json'
  };
  
  const fileContent = JSON.stringify(jsonData);
  const file = new Blob([fileContent], { type: 'application/json' });

  try {
    if (currentFileId) {
      // Update existing file
      await updateFile(currentFileId, fileMetadata, file);
    } else {
      // Create new file
      await createFile(fileMetadata, file);
    }
    updateStatus('synced');
    return true;
  } catch (err) {
    console.error('Error uploading backup', err);
    updateStatus('error');
    return false;
  }
}

// Multipart upload functions for Drive API
async function createFile(metadata, fileBlob) {
  const accessToken = gapi.client.getToken().access_token;
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', fileBlob);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });
  if (!res.ok) throw new Error(`Drive create failed: ${res.status}`);
  const data = await res.json();
  if (!data.id) throw new Error('Drive create failed: missing file ID');
  currentFileId = data.id;
}

async function updateFile(fileId, metadata, fileBlob) {
  const accessToken = gapi.client.getToken().access_token;
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', fileBlob);

  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });
  if (!res.ok) throw new Error(`Drive update failed: ${res.status}`);
}

export function isDriveAuthorized() {
  return isAuthorized;
}
