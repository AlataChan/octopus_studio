const { contextBridge } = require('electron');

/**
 * Preload script for the renderer process
 * Exposes a safe API to the renderer process via contextBridge
 */
contextBridge.exposeInMainWorld('electron', {
  // Add any APIs you want to expose to the renderer process here
  // For example:
  // getAppVersion: () => app.getVersion(),

  // Currently, we don't need to expose any APIs since the app
  // works entirely through HTTP requests to the backend server
  isElectron: true,
});
