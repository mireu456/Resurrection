import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';
import fs from 'fs';
import {
  createTray,
  destroyTray,
  showRestoreConfirmationBalloon,
} from './tray';
import {
  captureWindows,
  captureWindowsDetailed,
  isSystemWindowSnapshot,
  restoreWindows,
} from './windowManager';
import { store } from './store';
import {
  Layout,
  MonitorContext,
  RestoreMode,
  Settings,
  WindowInfo,
} from './types';
import { getCurrentMonitorContext } from './monitorContext';

let mainWindow: BrowserWindow | null = null;
const isDev = !app.isPackaged;
let isQuitting = false;

let displayDebounceTimer: NodeJS.Timeout | null = null;
let autoRestoreInFlight = false;
let displaySequence = 0;
let lastAutoRestoreStrictKey: string | null = null;
let lastAutoRestoreAt = 0;

const DISPLAY_DEBOUNCE_MS = 1200;
const DUPLICATE_KEY_SUPPRESSION_MS = 4000;

function resolvePreloadPath(): string {
  const candidates = [
    path.join(__dirname, '../preload/preload.js'),
    path.join(app.getAppPath(), 'dist/preload/preload.js'),
    path.join(process.cwd(), 'dist/preload/preload.js'),
  ];

  for (const candidate of candidates) {
    console.info('[Main][Preload] checking candidate:', candidate, 'exists=', fs.existsSync(candidate));
    if (fs.existsSync(candidate)) {
      console.info('[Main][Preload] selected candidate:', candidate);
      return candidate;
    }
  }

  // 후보가 모두 실패하면 기존 경로를 반환해 최소한 Electron 에러 로그를 남긴다.
  return candidates[0];
}

function createWindow(): void {
  const preloadPath = resolvePreloadPath();
  console.info('[Main] Using preload path:', preloadPath);

  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: '리저렉션',
    frame: true,
    show: false,
  });

  if (isDev) {
    console.info('[Main] running in dev mode, loading renderer URL');
    mainWindow.loadURL('http://localhost:5173');
  } else {
    console.info('[Main] running in packaged mode, loading renderer file');
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    console.info('[Main] window ready-to-show');
    mainWindow?.show();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.info('[Main] did-finish-load');
    void mainWindow?.webContents
      .executeJavaScript('typeof window.api !== "undefined"')
      .then((hasApi) => console.info('[Main] renderer window.api exists:', hasApi))
      .catch((error) => console.error('[Main] failed to probe window.api:', error));
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, desc, url) => {
    console.error('[Main] did-fail-load:', { code, desc, url });
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function toRegularWindows(windows: WindowInfo[]): WindowInfo[] {
  return windows.filter((win) => !isSystemWindowSnapshot(win));
}

function sanitizeLayout(layout: Layout): Layout {
  const regularWindows = toRegularWindows(layout.windows);
  if (regularWindows.length === layout.windows.length) return layout;
  return {
    ...layout,
    windows: regularWindows,
  };
}

function getLayouts(): Layout[] {
  const rawLayouts = store.get('layouts');
  const sanitizedLayouts = rawLayouts.map(sanitizeLayout);

  const changed = sanitizedLayouts.some((layout, index) => layout.windows.length !== rawLayouts[index].windows.length);
  if (changed) {
    console.info('[Main] sanitized legacy layouts: removed system windows from saved data');
    store.set('layouts', sanitizedLayouts);
  }

  return sanitizedLayouts;
}

function updateSettings(next: Settings): Settings {
  store.set('settings', next);
  return next;
}

function hasLastRestoreMap(settings: Settings): boolean {
  return Object.keys(settings.lastRestoredByMonitorKey || {}).length > 0;
}

function resolveLayoutIdForMonitor(settings: Settings, context: MonitorContext): string | null {
  // 신규 키 맵 우선 -> 레거시(lastLayoutId)는 맵이 비었을 때만 fallback.
  const map = settings.lastRestoredByMonitorKey || {};
  if (map[context.strictKey]) return map[context.strictKey];
  if (map[context.fuzzyKey]) return map[context.fuzzyKey];
  if (!hasLastRestoreMap(settings) && settings.lastLayoutId) return settings.lastLayoutId;
  return null;
}

function markLastRestored(settings: Settings, context: MonitorContext, layoutId: string): Settings {
  // strict/fuzzy 키를 동시에 갱신해 환경이 조금 달라도 복원 가능성을 높인다.
  return {
    ...settings,
    lastLayoutId: layoutId,
    lastRestoredByMonitorKey: {
      ...settings.lastRestoredByMonitorKey,
      [context.strictKey]: layoutId,
      [context.fuzzyKey]: layoutId,
    },
  };
}

async function runRestoreFlow(
  layout: Layout,
  mode: RestoreMode,
  reason: string,
  context: MonitorContext
): Promise<{ success: boolean; error?: string; restoredCount?: number; report?: unknown }> {
  const settings = store.get('settings');
  if (settings.askBeforeRestore) {
    // 확인 UX는 트레이 팝업으로 통일한다.
    const balloon = await showRestoreConfirmationBalloon({
      layoutName: layout.name,
      windowCount: layout.windows.length,
      reason,
    });
    if (!balloon.confirmed) {
      console.info('[Restore] cancelled by tray confirmation:', balloon.status);
      return { success: false, error: '사용자 취소' };
    }
  }

  const regularWindows = toRegularWindows(layout.windows);
  const result = await restoreWindows(regularWindows, {
    mode,
    maxAttempts: mode === 'auto' ? 2 : 3,
    retryDelayMs: mode === 'auto' ? 350 : 500,
  });

  if (result.success) {
    // 성공한 복원만 "마지막 복원"으로 기록해 오염을 방지한다.
    const latestSettings = store.get('settings');
    updateSettings(markLastRestored(latestSettings, context, layout.id));
  }

  const failed = result.windows.filter((item) => item.state === 'failed');
  if (failed.length > 0) {
    console.warn('[Restore] failed windows:', failed.map((item) => ({
      targetTitle: item.targetTitle,
      reason: item.reason,
      attempts: item.attempts,
    })));
  }

  return {
    success: result.success,
    restoredCount: result.restoredCount,
    report: result,
    error: result.success ? undefined : '복원 가능한 창을 찾지 못했습니다.',
  };
}

async function tryAutoRestore(changeType: string): Promise<void> {
  const settings = store.get('settings');
  if (!settings.autoRestore) return;

  const context = getCurrentMonitorContext();
  if (
    lastAutoRestoreStrictKey === context.strictKey &&
    Date.now() - lastAutoRestoreAt < DUPLICATE_KEY_SUPPRESSION_MS
  ) {
    return;
  }

  const layoutId = resolveLayoutIdForMonitor(settings, context);
  if (!layoutId) return;

  const layout = getLayouts().find((item) => item.id === layoutId);
  if (!layout) return;

  const result = await runRestoreFlow(layout, 'auto', `모니터 변경:${changeType}`, context);
  if (result.success) {
    lastAutoRestoreStrictKey = context.strictKey;
    lastAutoRestoreAt = Date.now();
  }
}

function scheduleDisplayChange(changeType: string): void {
  displaySequence += 1;
  const seq = displaySequence;

  if (displayDebounceTimer) {
    clearTimeout(displayDebounceTimer);
  }

  displayDebounceTimer = setTimeout(() => {
    // latest-only: 마지막 이벤트만 실제 복원 후보로 처리한다.
    void processDisplayChange(seq, changeType);
  }, DISPLAY_DEBOUNCE_MS);
}

async function processDisplayChange(seq: number, changeType: string): Promise<void> {
  if (seq !== displaySequence) return;

  if (autoRestoreInFlight) {
    // in-flight guard: 복원 도중 들어온 이벤트는 짧게 대기 후 재검사한다.
    setTimeout(() => {
      void processDisplayChange(seq, changeType);
    }, 300);
    return;
  }

  autoRestoreInFlight = true;
  try {
    await tryAutoRestore(changeType);
  } catch (error) {
    console.error('[DisplayChange] auto restore failed:', error);
  } finally {
    autoRestoreInFlight = false;
  }
}

// ─── IPC 핸들러 ───────────────────────────────────────────────

ipcMain.handle('get-layouts', () => {
  console.info('[Main][IPC] get-layouts');
  return getLayouts();
});

ipcMain.handle('save-layout', (_event, name: string) => {
  console.info('[Main][IPC] save-layout:', name);
  const windows = captureWindowsDetailed().regular;
  const monitorContext = getCurrentMonitorContext();
  const layout: Layout = {
    id: Date.now().toString(),
    name,
    windows,
    createdAt: Date.now(),
    monitorContext,
  };
  const layouts = getLayouts();
  layouts.push(layout);
  store.set('layouts', layouts);
  console.info('[Main][IPC] save-layout done:', { layoutId: layout.id, windowCount: windows.length });
  return layout;
});

ipcMain.handle(
  'restore-layout',
  async (_event, layoutId: string, mode: RestoreMode = 'manual') => {
    console.info('[Main][IPC] restore-layout:', { layoutId, mode });
    const layout = getLayouts().find((item) => item.id === layoutId);
    if (!layout) return { success: false, error: '레이아웃을 찾을 수 없습니다.' };
    const context = getCurrentMonitorContext();
    return runRestoreFlow(layout, mode, mode === 'manual' ? '수동 복원' : '자동 복원', context);
  }
);

ipcMain.handle('delete-layout', (_event, layoutId: string) => {
  console.info('[Main][IPC] delete-layout:', layoutId);
  const layouts = getLayouts().filter((layout) => layout.id !== layoutId);
  store.set('layouts', layouts);

  const settings = store.get('settings');
  const prunedMap = Object.fromEntries(
    Object.entries(settings.lastRestoredByMonitorKey || {}).filter(([, id]) => id !== layoutId)
  );

  updateSettings({
    ...settings,
    lastLayoutId: settings.lastLayoutId === layoutId ? null : settings.lastLayoutId,
    lastRestoredByMonitorKey: prunedMap,
  });
  return true;
});

ipcMain.handle('get-settings', () => {
  console.info('[Main][IPC] get-settings');
  return store.get('settings');
});

ipcMain.handle('update-settings', (_event, partial: Partial<Settings>) => {
  console.info('[Main][IPC] update-settings:', partial);
  const current = store.get('settings');
  const next: Settings = {
    ...current,
    ...partial,
    themeMode:
      partial.themeMode === 'light' ||
      partial.themeMode === 'dark' ||
      partial.themeMode === 'system'
        ? partial.themeMode
        : current.themeMode,
    lastRestoredByMonitorKey:
      partial.lastRestoredByMonitorKey && typeof partial.lastRestoredByMonitorKey === 'object'
        ? partial.lastRestoredByMonitorKey
        : current.lastRestoredByMonitorKey,
    lastLayoutId:
      typeof partial.lastLayoutId === 'string' || partial.lastLayoutId === null
        ? partial.lastLayoutId
        : current.lastLayoutId,
  };
  return updateSettings(next);
});

ipcMain.handle('capture-windows', () => {
  console.info('[Main][IPC] capture-windows');
  return toRegularWindows(captureWindows());
});

ipcMain.handle('capture-windows-detailed', () => {
  console.info('[Main][IPC] capture-windows-detailed');
  return captureWindowsDetailed();
});

// ─── 앱 이벤트 ────────────────────────────────────────────────

app.whenReady().then(() => {
  console.info('[Main] app.whenReady');
  createWindow();
  if (mainWindow) createTray(mainWindow);

  screen.on('display-added', () => scheduleDisplayChange('added'));
  screen.on('display-removed', () => scheduleDisplayChange('removed'));
  screen.on('display-metrics-changed', () => scheduleDisplayChange('changed'));
});

app.on('before-quit', () => {
  isQuitting = true;
  destroyTray();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow?.show();
  }
});

app.on('window-all-closed', () => {
  // 트레이 상주
});
