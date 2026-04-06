const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  toggleTop: () => ipcRenderer.invoke('toggle-top'),
  toggleCompact: () => ipcRenderer.invoke('toggle-compact'),
  setAutoStart: (enable) => ipcRenderer.invoke('set-auto-start', enable),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  onConfigUpdated: (callback) => ipcRenderer.on('config-updated', (_event, config) => callback(config))
});
