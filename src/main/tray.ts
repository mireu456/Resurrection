import { app, Menu, Tray, BrowserWindow, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';

let tray: Tray | null = null;

export type TrayConfirmStatus =
  | 'shown'
  | 'clicked'
  | 'dismissed'
  | 'expired'
  | 'failed_to_show';

export interface TrayConfirmResult {
  confirmed: boolean;
  status: TrayConfirmStatus;
}

function getTrayIcon(): Electron.NativeImage {
  const assetsDir = path.join(app.getAppPath(), 'assets');
  const faviconPath = path.join(assetsDir, 'favicon_resurrection.png');
  const trayPath = path.join(assetsDir, 'tray.png');

  if (fs.existsSync(faviconPath)) {
    const img = nativeImage.createFromPath(faviconPath);
    return img.getSize().width > 32 ? img.resize({ width: 32, height: 32 }) : img;
  }
  if (fs.existsSync(trayPath)) {
    return nativeImage.createFromPath(trayPath);
  }

  // 아이콘 파일이 없을 경우 프로그래매틱하게 16x16 보라색 아이콘 생성
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buffer[i * 4] = 139;      // R
    buffer[i * 4 + 1] = 92;  // G
    buffer[i * 4 + 2] = 246; // B
    buffer[i * 4 + 3] = 255; // A
  }
  return nativeImage.createFromBitmap(buffer, { width: size, height: size });
}

export function createTray(mainWindow: BrowserWindow): void {
  const icon = getTrayIcon();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '리저렉션 열기',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setToolTip('리저렉션 - 듀얼모니터 창 배치 복원');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

export async function showRestoreConfirmationBalloon(options: {
  layoutName: string;
  windowCount: number;
  reason: string;
  timeoutMs?: number;
}): Promise<TrayConfirmResult> {
  if (!tray) {
    return { confirmed: false, status: 'failed_to_show' };
  }
  const currentTray = tray;

  const timeoutMs = options.timeoutMs ?? 8000;

  return new Promise((resolve) => {
    let done = false;
    let timer: NodeJS.Timeout | null = null;

    const finish = (result: TrayConfirmResult) => {
      if (done) return;
      done = true;
      // 리스너를 반드시 정리해 중복 클릭/메모리 누수를 막는다.
      currentTray.removeListener('balloon-click', onClick);
      currentTray.removeListener('balloon-closed', onClosed);
      currentTray.removeListener('balloon-show', onShow);
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    const onClick = () => finish({ confirmed: true, status: 'clicked' });
    const onClosed = () => finish({ confirmed: false, status: 'dismissed' });
    const onShow = () => {
      // 상태 추적 목적의 no-op. 명시적으로 이벤트 수신 가능성을 유지한다.
    };

    currentTray.on('balloon-click', onClick);
    currentTray.on('balloon-closed', onClosed);
    currentTray.on('balloon-show', onShow);

    timer = setTimeout(() => {
      finish({ confirmed: false, status: 'expired' });
    }, timeoutMs);

    try {
      currentTray.displayBalloon({
        title: '리저렉션 복원 확인',
        content: `[${options.reason}] "${options.layoutName}" 레이아웃(${options.windowCount}개 창)을 복원하려면 팝업을 클릭하세요.`,
        iconType: 'info',
        noSound: true,
      });
    } catch (error) {
      console.error('[Tray] Failed to show balloon:', error);
      finish({ confirmed: false, status: 'failed_to_show' });
    }
  });
}
