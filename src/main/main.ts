import { app, BrowserWindow, ipcMain, dialog, screen } from 'electron';
import path from 'path';
import { createTray, destroyTray } from './tray';
import { captureWindows, restoreWindows } from './windowManager';
import { store } from './store';
import { Layout, Settings } from './types';

let mainWindow: BrowserWindow | null = null;
const isDev = !app.isPackaged;
let isQuitting = false;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: '리저렉션',
    frame: true,
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // 패키징된 exe에서는 process.defaultApp이 false이므로 DevTools 미실행
    if (process.defaultApp) {
      mainWindow.webContents.openDevTools();
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // 닫기 버튼 클릭 시 트레이로 최소화 (앱 종료 아님)
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

// ─── IPC 핸들러 ───────────────────────────────────────────────

ipcMain.handle('get-layouts', () => {
  return store.get('layouts');
});

ipcMain.handle('save-layout', (_event, name: string) => {
  const windows = captureWindows();
  const layout: Layout = {
    id: Date.now().toString(),
    name,
    windows,
    createdAt: Date.now(),
  };
  const layouts = store.get('layouts');
  layouts.push(layout);
  store.set('layouts', layouts);
  return layout;
});

ipcMain.handle('restore-layout', async (_event, layoutId: string) => {
  const layouts = store.get('layouts');
  const layout = layouts.find((l) => l.id === layoutId);
  if (!layout) return { success: false, error: '레이아웃을 찾을 수 없습니다.' };

  const settings = store.get('settings');

  if (settings.askBeforeRestore && mainWindow) {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['복원', '취소'],
      defaultId: 0,
      cancelId: 1,
      title: '레이아웃 복원',
      message: `"${layout.name}" 레이아웃으로 창을 복원할까요?`,
      detail: `저장된 창 ${layout.windows.length}개의 위치가 복원됩니다.`,
    });
    if (result.response !== 0) return { success: false, error: '사용자 취소' };
  }

  const restoredCount = restoreWindows(layout.windows);
  store.set('settings.lastLayoutId', layoutId);
  return { success: true, restoredCount };
});

ipcMain.handle('delete-layout', (_event, layoutId: string) => {
  const layouts = store.get('layouts').filter((l) => l.id !== layoutId);
  store.set('layouts', layouts);

  // 삭제된 레이아웃이 마지막 복원 레이아웃이었다면 초기화
  const settings = store.get('settings');
  if (settings.lastLayoutId === layoutId) {
    store.set('settings.lastLayoutId', null);
  }
  return true;
});

ipcMain.handle('get-settings', () => {
  return store.get('settings');
});

ipcMain.handle('update-settings', (_event, partial: Partial<Settings>) => {
  const current = store.get('settings');
  store.set('settings', { ...current, ...partial });
  return store.get('settings');
});

ipcMain.handle('capture-windows', () => {
  return captureWindows();
});

// ─── 앱 이벤트 ────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  if (mainWindow) createTray(mainWindow);

  // 모니터 변경 감지
  screen.on('display-added', () => handleDisplayChange('added'));
  screen.on('display-removed', () => handleDisplayChange('removed'));
  screen.on('display-metrics-changed', () => handleDisplayChange('changed'));
});

async function handleDisplayChange(changeType: string): Promise<void> {
  const settings = store.get('settings');
  if (!settings.autoRestore || !settings.lastLayoutId) return;

  const layouts = store.get('layouts');
  const layout = layouts.find((l) => l.id === settings.lastLayoutId);
  if (!layout) return;

  // 변경 안정화 대기 (모니터 연결 시 드라이버 초기화 시간)
  await new Promise((resolve) => setTimeout(resolve, 2000));

  if (settings.askBeforeRestore && mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['복원', '취소'],
      defaultId: 0,
      cancelId: 1,
      title: '모니터 변경 감지',
      message: `모니터 구성이 변경되었습니다 (${changeType}).`,
      detail: `"${layout.name}" 레이아웃으로 창을 복원할까요?`,
    });
    if (result.response !== 0) return;
  }

  restoreWindows(layout.windows);
}

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

// Windows/Linux에서 모든 창이 닫혀도 트레이로 계속 실행
app.on('window-all-closed', () => {
  // 의도적으로 quit 하지 않음 (트레이 상주)
});
