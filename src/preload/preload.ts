import { contextBridge, ipcRenderer } from 'electron';
import type { RestoreMode } from '../main/types';

console.info('[Preload] script loaded');

contextBridge.exposeInMainWorld('api', {
  getLayouts: () => {
    console.info('[Preload] getLayouts invoked');
    return ipcRenderer.invoke('get-layouts');
  },
  saveLayout: (name: string) => {
    console.info('[Preload] saveLayout invoked:', name);
    return ipcRenderer.invoke('save-layout', name);
  },
  restoreLayout: (id: string, mode: RestoreMode = 'manual') =>
    {
      console.info('[Preload] restoreLayout invoked:', { id, mode });
      return ipcRenderer.invoke('restore-layout', id, mode);
    },
  deleteLayout: (id: string) => {
    console.info('[Preload] deleteLayout invoked:', id);
    return ipcRenderer.invoke('delete-layout', id);
  },
  getSettings: () => {
    console.info('[Preload] getSettings invoked');
    return ipcRenderer.invoke('get-settings');
  },
  updateSettings: (settings: Record<string, unknown>) =>
    {
      console.info('[Preload] updateSettings invoked:', settings);
      return ipcRenderer.invoke('update-settings', settings);
    },
  captureWindows: () => {
    console.info('[Preload] captureWindows invoked');
    return ipcRenderer.invoke('capture-windows');
  },
  captureWindowsDetailed: () => {
    console.info('[Preload] captureWindowsDetailed invoked');
    return ipcRenderer.invoke('capture-windows-detailed');
  },
});

console.info('[Preload] contextBridge exposeInMainWorld(api) completed');
