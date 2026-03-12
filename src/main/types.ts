export interface WindowInfo {
  processName: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Layout {
  id: string;
  name: string;
  windows: WindowInfo[];
  createdAt: number;
}

export interface Settings {
  autoRestore: boolean;
  askBeforeRestore: boolean;
  lastLayoutId: string | null;
}

export interface StoreSchema {
  layouts: Layout[];
  settings: Settings;
}
