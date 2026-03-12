import { WindowInfo } from './types';

// node-window-manager는 네이티브 모듈이므로 로드 실패를 대비해 try/catch 처리
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wm: any = null;

try {
  wm = require('node-window-manager').windowManager;
} catch (e) {
  console.error('[WindowManager] node-window-manager 로드 실패:', e);
  console.warn('[WindowManager] 창 캡처/복원 기능이 비활성화됩니다.');
}

export function captureWindows(): WindowInfo[] {
  if (!wm) return [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const windows: any[] = wm.getWindows();
    const result: WindowInfo[] = [];

    for (const win of windows) {
      try {
        if (!win.isVisible()) continue;

        const title: string = win.getTitle();
        if (!title || title.trim() === '') continue;

        // 시스템 창 필터링
        if (title === 'Program Manager' || title === 'Windows Input Experience') continue;

        const bounds = win.getBounds();
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) continue;

        const exePath: string = win.path || '';
        const processName = exePath
          ? exePath.split('\\').pop() || 'unknown'
          : 'unknown';

        result.push({
          processName,
          title,
          x: Math.round(bounds.x),
          y: Math.round(bounds.y),
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
        });
      } catch {
        continue;
      }
    }

    return result;
  } catch (e) {
    console.error('[WindowManager] 창 캡처 실패:', e);
    return [];
  }
}

export function restoreWindows(windows: WindowInfo[]): number {
  if (!wm) return 0;

  let restored = 0;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentWindows: any[] = wm.getWindows();

    for (const target of windows) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const match = currentWindows.find((w: any) => {
          try {
            return w.getTitle() === target.title;
          } catch {
            return false;
          }
        });

        if (match) {
          match.setBounds({
            x: target.x,
            y: target.y,
            width: target.width,
            height: target.height,
          });
          restored++;
        }
      } catch {
        continue;
      }
    }
  } catch (e) {
    console.error('[WindowManager] 창 복원 실패:', e);
  }

  return restored;
}
