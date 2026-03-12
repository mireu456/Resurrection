import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  getLayouts: () => ipcRenderer.invoke('get-layouts'),
  saveLayout: (name: string) => ipcRenderer.invoke('save-layout', name),
  restoreLayout: (id: string) => ipcRenderer.invoke('restore-layout', id),
  deleteLayout: (id: string) => ipcRenderer.invoke('delete-layout', id),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings: Record<string, unknown>) =>
    ipcRenderer.invoke('update-settings', settings),
  captureWindows: () => ipcRenderer.invoke('capture-windows'),
});
