const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nebulaAPI', {
  launchProfile: (profile, customBrowserPath) => ipcRenderer.invoke('launch-profile', profile, customBrowserPath),
  launchProfileNative: (profile, customBrowserPath) => ipcRenderer.invoke('launch-profile-native', profile, customBrowserPath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openPopup: (url, partition) => ipcRenderer.invoke('open-popup', { url, partition }),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  checkProxy: (proxy) => ipcRenderer.invoke('check-proxy', proxy),
  deleteProfileFolder: (profileId) => ipcRenderer.invoke('delete-profile-folder', profileId),
  setCookies: (cookies, partition) => ipcRenderer.invoke('set-cookies', { cookies, partition }),
  getCookies: (partition) => ipcRenderer.invoke('get-cookies', { partition }),
  setProxy: (proxy, partition) => ipcRenderer.invoke('set-proxy', { proxy, partition }),
  // Sincronização de sessão via Cloud
  captureSession: (profileId, targetUrl) => ipcRenderer.invoke('capture-session', { profileId, targetUrl }),
  captureInternalSessionSilent: (profileId, targetUrl) => ipcRenderer.invoke('capture-internal-session-silent', { profileId, targetUrl }),
  injectSession: (profileId, sessionData, targetUrl) => ipcRenderer.invoke('inject-session', { profileId, sessionData, targetUrl }),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_event, value) => callback(value)),
  platform: process.platform,
  // 🧩 Sistema de Extensões
  getInstalledExtensions: () => ipcRenderer.invoke('get-installed-extensions'),
  installExtension: () => ipcRenderer.invoke('install-extension'),
  removeExtension: (extensionId) => ipcRenderer.invoke('remove-extension', extensionId),
  toggleExtension: (extensionId, enabled) => ipcRenderer.invoke('toggle-extension', extensionId, enabled),
  // 🔄 Auto-Updater
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  downloadAndInstallUpdate: (url) => ipcRenderer.invoke('download-and-install-update', url),
  onUpdateProgress: (callback) => ipcRenderer.on('update-download-progress', (_event, data) => callback(data)),
  // 🗄️ Database Secura IPC
  db: {
    upsertProfile: (profile, secret) => ipcRenderer.invoke('admin-upsert-profile', profile, secret),
    deleteProfile: (id, secret) => ipcRenderer.invoke('admin-delete-profile', id, secret)
  }
});