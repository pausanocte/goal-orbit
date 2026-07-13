export const appState = {
  syncStatus: 'init'
};

let retryDriveSyncHandler = null;

export function setSyncStatus(status) {
  appState.syncStatus = status;
}

export function setRetryDriveSyncHandler(handler) {
  retryDriveSyncHandler = handler;
}

export function retryDriveSync() {
  retryDriveSyncHandler?.();
}
