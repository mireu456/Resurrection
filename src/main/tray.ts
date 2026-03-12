import { app, Menu, Tray, BrowserWindow, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';

let tray: Tray | null = null;

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
