import type {
  CapturedWindowsResult,
  Layout,
  RestoreMode,
  Settings,
  ThemeMode,
  WindowInfo,
} from '../main/types';

console.info('[Renderer][api.ts] module loaded. window.api exists at load time =', typeof window.api !== 'undefined');

declare global {
  interface Window {
    api: {
      getLayouts: () => Promise<Layout[]>;
      saveLayout: (name: string) => Promise<Layout>;
      restoreLayout: (
        id: string,
        mode?: RestoreMode
      ) => Promise<{ success: boolean; error?: string; restoredCount?: number; report?: unknown }>;
      deleteLayout: (id: string) => Promise<boolean>;
      getSettings: () => Promise<Settings>;
      updateSettings: (settings: Partial<Settings>) => Promise<Settings>;
      captureWindows: () => Promise<WindowInfo[]>;
      captureWindowsDetailed: () => Promise<CapturedWindowsResult>;
    };
  }
}

function getRuntimeApi() {
  console.info('[Renderer][api.ts] getRuntimeApi called. window.api exists =', typeof window.api !== 'undefined');
  if (!window.api) {
    console.error('[Renderer][api.ts] window.api is undefined');
    throw new Error(
      'Electron preload API를 찾지 못했습니다. 브라우저에서 http://localhost:5173만 열지 말고, `npm run dev`로 Electron 앱을 실행해주세요.'
    );
  }
  console.info('[Renderer][api.ts] window.api keys =', Object.keys(window.api));
  return window.api;
}

export const api = {
  getLayouts: () => getRuntimeApi().getLayouts(),
  saveLayout: (name: string) => getRuntimeApi().saveLayout(name),
  restoreLayout: (id: string, mode?: RestoreMode) => getRuntimeApi().restoreLayout(id, mode),
  deleteLayout: (id: string) => getRuntimeApi().deleteLayout(id),
  getSettings: () => getRuntimeApi().getSettings(),
  updateSettings: (settings: Partial<Settings>) => getRuntimeApi().updateSettings(settings),
  captureWindows: () => getRuntimeApi().captureWindows(),
  captureWindowsDetailed: () => getRuntimeApi().captureWindowsDetailed(),
};

export type { CapturedWindowsResult, Layout, Settings, ThemeMode, WindowInfo };
