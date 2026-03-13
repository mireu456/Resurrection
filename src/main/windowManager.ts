import {
  CapturedWindowsResult,
  RestoreFailureReason,
  RestoreMode,
  RestoreResult,
  RestoreWindowResult,
  WindowInfo,
} from './types';

// node-window-manager는 네이티브 모듈이므로 로드 실패를 대비해 try/catch 처리
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wm: any = null;

try {
  wm = require('node-window-manager').windowManager;
} catch (e) {
  console.error('[WindowManager] node-window-manager 로드 실패:', e);
  console.warn('[WindowManager] 창 캡처/복원 기능이 비활성화됩니다.');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RuntimeWindow = any;

type CandidateWindow = {
  handle: RuntimeWindow;
  windowId: number;
  processId: number;
  exePath: string;
  processName: string;
  rawTitle: string;
  normalizedTitle: string;
  monitorId?: number;
};

type MatchResult =
  | { kind: 'matched'; candidate: CandidateWindow; score: number }
  | { kind: 'failed'; reason: RestoreFailureReason };

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function processNameFromPath(exePath: string): string {
  if (!exePath) return 'unknown';
  const name = exePath.split('\\').pop();
  return name && name.trim() ? name.trim().toLowerCase() : 'unknown';
}

function isSystemWindow(title: string, processName: string): boolean {
  const normalizedTitle = title.trim().toLowerCase();
  const normalizedProcess = processName.trim().toLowerCase();

  const systemTitleKeywords = [
    'program manager',
    'windows input experience',
    'search',
    '작업 보기',
    '입력 환경',
  ];
  const systemProcessNames = new Set([
    'textinputhost.exe',
    'shellexperiencehost.exe',
    'searchhost.exe',
    'searchapp.exe',
    'startmenuexperiencehost.exe',
    'lockapp.exe',
    'dwm.exe',
    'systemsettings.exe',
  ]);

  if (systemProcessNames.has(normalizedProcess)) return true;

  // 설정 앱은 환경에 따라 applicationframehost.exe로 잡히는 경우가 있어 제목과 함께 보정한다.
  if (
    normalizedProcess === 'applicationframehost.exe' &&
    (normalizedTitle === '설정' ||
      normalizedTitle === 'settings' ||
      normalizedTitle.startsWith('설정') ||
      normalizedTitle.startsWith('settings'))
  ) {
    return true;
  }

  return systemTitleKeywords.some((keyword) => normalizedTitle.includes(keyword));
}

export function isSystemWindowSnapshot(win: Pick<WindowInfo, 'title' | 'processName' | 'isSystemWindow'>): boolean {
  if (win.isSystemWindow) return true;
  return isSystemWindow(win.title || '', win.processName || '');
}

export function normalizeWindowTitle(value: string): string {
  // 제목은 앱 상태(알림 수, 별표, 접미사)에 자주 바뀌므로 비교 전에 정규화한다.
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^\(\d+\)\s*/, '')
    .replace(/\s*-\s*(google chrome|visual studio code|slack|microsoft edge)$/i, '')
    .replace(/\s*\*$/, '')
    .trim();
}

function getMonitorInfo(win: RuntimeWindow): { monitorId?: number; monitorModel?: string } {
  try {
    const monitor = win.getMonitor?.();
    if (!monitor) return {};
    const id = typeof monitor.id === 'number' ? monitor.id : undefined;
    return { monitorId: id };
  } catch {
    return {};
  }
}

function collectCurrentWindows(): CandidateWindow[] {
  if (!wm) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const windows: any[] = wm.getWindows();
  const result: CandidateWindow[] = [];

  for (const win of windows) {
    try {
      if (!win.isVisible()) continue;
      const rawTitle = safeString(win.getTitle()).trim();
      if (!rawTitle) continue;
      const exePath = safeString(win.path);
      const processName = processNameFromPath(exePath);
      if (isSystemWindow(rawTitle, processName)) continue;

      const normalizedTitle = normalizeWindowTitle(rawTitle);
      if (!normalizedTitle) continue;

      const processId = typeof win.processId === 'number' ? win.processId : -1;
      const windowId = typeof win.id === 'number' ? win.id : -1;
      const displayHint = getMonitorInfo(win);

      result.push({
        handle: win,
        windowId,
        processId,
        exePath,
        processName,
        rawTitle,
        normalizedTitle,
        monitorId: displayHint.monitorId,
      });
    } catch {
      continue;
    }
  }

  return result;
}

export function captureWindows(): WindowInfo[] {
  return captureWindowsDetailed().regular;
}

export function captureWindowsDetailed(): CapturedWindowsResult {
  if (!wm) return { regular: [], system: [] };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const windows: any[] = wm.getWindows();
    const regular: WindowInfo[] = [];
    const system: WindowInfo[] = [];

    for (const win of windows) {
      try {
        if (!win.isVisible()) continue;
        const rawTitle = safeString(win.getTitle()).trim();
        if (!rawTitle) continue;

        const bounds = win.getBounds();
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) continue;

        const exePath = safeString(win.path);
        const processName = processNameFromPath(exePath);
        const displayHint = getMonitorInfo(win);
        const systemWindow = isSystemWindow(rawTitle, processName);

        const snapshot: WindowInfo = {
          windowId: typeof win.id === 'number' ? win.id : undefined,
          processId: typeof win.processId === 'number' ? win.processId : undefined,
          exePath,
          processName,
          rawTitle,
          normalizedTitle: normalizeWindowTitle(rawTitle),
          title: rawTitle,
          x: Math.round(bounds.x),
          y: Math.round(bounds.y),
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
          capturedAt: Date.now(),
          displayHint,
          isSystemWindow: systemWindow,
        };

        if (systemWindow) {
          system.push(snapshot);
        } else {
          regular.push(snapshot);
        }
      } catch {
        continue;
      }
    }

    return { regular, system };
  } catch (e) {
    console.error('[WindowManager] 창 캡처 실패:', e);
    return { regular: [], system: [] };
  }
}

function scoreCandidate(target: WindowInfo, candidate: CandidateWindow, mode: RestoreMode): number {
  const targetRawTitle = target.rawTitle || target.title || '';
  const targetNormalized = target.normalizedTitle || normalizeWindowTitle(targetRawTitle);
  const targetExePath = (target.exePath || '').toLowerCase();
  const targetProcessName = (target.processName || '').toLowerCase();
  const targetWindowId = typeof target.windowId === 'number' ? target.windowId : undefined;
  const targetProcessId = typeof target.processId === 'number' ? target.processId : undefined;
  const targetMonitorId = target.displayHint?.monitorId;

  let score = 0;
  if (targetExePath && candidate.exePath.toLowerCase() === targetExePath) score += 50;
  if (targetNormalized && candidate.normalizedTitle === targetNormalized) score += 30;
  if (targetRawTitle && candidate.rawTitle === targetRawTitle) score += 15;
  if (targetProcessName && candidate.processName === targetProcessName) score += 20;
  if (typeof targetMonitorId === 'number' && candidate.monitorId === targetMonitorId) score += 10;

  // 세션 경계에서 흔들리는 식별자(windowId/processId)는
  // 수동 복원 + 최근 캡처 데이터일 때만 강하게 반영한다.
  const isSessionBiased = mode === 'manual' && typeof target.capturedAt === 'number'
    ? Date.now() - target.capturedAt < 10 * 60 * 1000
    : false;

  if (isSessionBiased && typeof targetWindowId === 'number' && candidate.windowId === targetWindowId) {
    score += 100;
  }
  if (isSessionBiased && typeof targetProcessId === 'number' && candidate.processId === targetProcessId) {
    score += 40;
  }

  return score;
}

function pickMatch(
  target: WindowInfo,
  candidates: CandidateWindow[],
  usedWindowIds: Set<number>,
  mode: RestoreMode
): MatchResult {
  // 이미 다른 타깃에 배정된 창은 제외해서 1:1 매칭을 강제한다.
  const scored = candidates
    .filter((candidate) => !usedWindowIds.has(candidate.windowId))
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(target, candidate, mode),
    }))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0 || scored[0].score < 40) {
    return { kind: 'failed', reason: 'no_candidate' };
  }

  if (scored.length > 1 && scored[1].score >= 40 && Math.abs(scored[0].score - scored[1].score) <= 5) {
    return { kind: 'failed', reason: 'ambiguous' };
  }

  return { kind: 'matched', candidate: scored[0].candidate, score: scored[0].score };
}

function verifyMoved(candidate: CandidateWindow, target: WindowInfo): boolean {
  try {
    const moved = candidate.handle.getBounds();
    const dx = Math.abs(Math.round((moved?.x ?? -99999) - target.x));
    const dy = Math.abs(Math.round((moved?.y ?? -99999) - target.y));
    const dw = Math.abs(Math.round((moved?.width ?? -99999) - target.width));
    const dh = Math.abs(Math.round((moved?.height ?? -99999) - target.height));
    return dx <= 2 && dy <= 2 && dw <= 2 && dh <= 2;
  } catch {
    return false;
  }
}

export async function restoreWindows(
  windows: WindowInfo[],
  options?: { mode?: RestoreMode; maxAttempts?: number; retryDelayMs?: number }
): Promise<RestoreResult> {
  if (!wm) {
    return {
      success: false,
      restoredCount: 0,
      totalCount: windows.length,
      attemptCount: 0,
      windows: windows.map((target) => ({
        targetTitle: target.rawTitle || target.title || '(untitled)',
        state: 'failed',
        attempts: 0,
        reason: 'timeout',
      })),
    };
  }

  const mode = options?.mode ?? 'manual';
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 3);
  const retryDelayMs = Math.max(100, options?.retryDelayMs ?? 450);

  // 창별 상태를 남겨야 운영 중 실패 유형을 정확히 추적할 수 있다.
  const statuses: RestoreWindowResult[] = windows.map((target) => ({
    targetTitle: target.rawTitle || target.title || '(untitled)',
    state: 'pending',
    attempts: 0,
  }));

  let restoredCount = 0;

  // 1회 복원에 실패해도, 모니터 전환 직후 창 생성 지연을 고려해 재시도한다.
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const candidates = collectCurrentWindows();
    const usedWindowIds = new Set<number>();

    for (let idx = 0; idx < windows.length; idx++) {
      const target = windows[idx];
      const status = statuses[idx];
      if (status.state === 'restored') continue;

      status.attempts = attempt;
      const match = pickMatch(target, candidates, usedWindowIds, mode);
      if (match.kind === 'failed') {
        status.state = attempt < maxAttempts ? 'retry_scheduled' : 'failed';
        status.reason = attempt < maxAttempts ? undefined : match.reason;
        continue;
      }

      usedWindowIds.add(match.candidate.windowId);
      status.state = 'matched';
      status.matchedWindowId = match.candidate.windowId;
      status.score = match.score;

      try {
        status.state = 'move_requested';
        match.candidate.handle.setBounds({
          x: target.x,
          y: target.y,
          width: target.width,
          height: target.height,
        });
        status.state = 'verify_pending';

        if (verifyMoved(match.candidate, target)) {
          status.state = 'restored';
          status.reason = undefined;
          restoredCount++;
        } else {
          status.state = attempt < maxAttempts ? 'retry_scheduled' : 'failed';
          status.reason = attempt < maxAttempts ? undefined : 'move_failed';
        }
      } catch {
        status.state = attempt < maxAttempts ? 'retry_scheduled' : 'failed';
        status.reason = attempt < maxAttempts ? undefined : 'window_disappeared';
      }
    }

    const pending = statuses.some((entry) => entry.state !== 'restored');
    if (!pending) break;
    if (attempt < maxAttempts) {
      await wait(retryDelayMs);
    }
  }

  for (const status of statuses) {
    if (status.state === 'restored') continue;
    if (!status.reason) {
      status.reason = 'timeout';
    }
    status.state = 'failed';
  }

  return {
    success: restoredCount > 0,
    restoredCount,
    totalCount: windows.length,
    attemptCount: maxAttempts,
    windows: statuses,
  };
}
