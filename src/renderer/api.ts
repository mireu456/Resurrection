import type { Layout, Settings, WindowInfo } from '../main/types';

declare global {
  interface Window {
    api: {
      getLayouts: () => Promise<Layout[]>;
      saveLayout: (name: string) => Promise<Layout>;
      restoreLayout: (
        id: string
      ) => Promise<{ success: boolean; error?: string; restoredCount?: number }>;
      deleteLayout: (id: string) => Promise<boolean>;
      getSettings: () => Promise<Settings>;
      updateSettings: (settings: Partial<Settings>) => Promise<Settings>;
      captureWindows: () => Promise<WindowInfo[]>;
    };
  }
}

export const api = window.api;

export type { Layout, Settings, WindowInfo };
