export interface WindowInfo {
  windowId?: number;
  processId?: number;
  exePath?: string;
  processName: string;
  rawTitle?: string;
  normalizedTitle?: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  capturedAt?: number;
  displayHint?: {
    monitorId?: number;
    monitorModel?: string;
  };
  isSystemWindow?: boolean;
}

export interface CapturedWindowsResult {
  regular: WindowInfo[];
  system: WindowInfo[];
}

export interface MonitorContext {
  strictKey: string;
  fuzzyKey: string;
  monitorModels: string[];
  monitorSignatures: string[];
  capturedAt: number;
  monitors?: Array<{
    id: number;
    model: string;
    internal: boolean;
    width: number;
    height: number;
    scaleFactor: number;
    x: number;
    y: number;
    rotation: number;
    primary: boolean;
  }>;
}

export type RestoreMode = 'manual' | 'auto';

export type RestoreFailureReason =
  | 'no_candidate'
  | 'ambiguous'
  | 'move_failed'
  | 'window_disappeared'
  | 'timeout';

export type RestoreWindowState =
  | 'pending'
  | 'matched'
  | 'move_requested'
  | 'verify_pending'
  | 'retry_scheduled'
  | 'failed'
  | 'restored';

export interface RestoreWindowResult {
  targetTitle: string;
  state: RestoreWindowState;
  attempts: number;
  reason?: RestoreFailureReason;
  matchedWindowId?: number;
  score?: number;
}

export interface RestoreResult {
  success: boolean;
  restoredCount: number;
  totalCount: number;
  attemptCount: number;
  windows: RestoreWindowResult[];
}

export interface Layout {
  id: string;
  name: string;
  windows: WindowInfo[];
  createdAt: number;
  monitorContext?: MonitorContext;
}

export type ThemeMode = 'dark' | 'light' | 'system';

export interface Settings {
  autoRestore: boolean;
  askBeforeRestore: boolean;
  themeMode: ThemeMode;
  lastRestoredByMonitorKey: Record<string, string>;
  // Legacy fallback only
  lastLayoutId: string | null;
}

export interface StoreSchema {
  layouts: Layout[];
  settings: Settings;
}
