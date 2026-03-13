import Store from 'electron-store';
import { StoreSchema, Settings } from './types';

const defaultSettings: Settings = {
  autoRestore: false,
  askBeforeRestore: true,
  themeMode: 'system',
  lastRestoredByMonitorKey: {},
  lastLayoutId: null,
};

const store = new Store<StoreSchema>({
  defaults: {
    layouts: [],
    settings: defaultSettings,
  },
});

function normalizeSettings(value: unknown): Settings {
  const input = (value ?? {}) as Partial<Settings>;
  const lastRestoredByMonitorKey =
    input.lastRestoredByMonitorKey &&
    typeof input.lastRestoredByMonitorKey === 'object' &&
    !Array.isArray(input.lastRestoredByMonitorKey)
      ? (input.lastRestoredByMonitorKey as Record<string, string>)
      : {};

  return {
    autoRestore: typeof input.autoRestore === 'boolean' ? input.autoRestore : defaultSettings.autoRestore,
    askBeforeRestore:
      typeof input.askBeforeRestore === 'boolean'
        ? input.askBeforeRestore
        : defaultSettings.askBeforeRestore,
    themeMode:
      input.themeMode === 'light' || input.themeMode === 'dark' || input.themeMode === 'system'
        ? input.themeMode
        : defaultSettings.themeMode,
    lastRestoredByMonitorKey,
    lastLayoutId: typeof input.lastLayoutId === 'string' ? input.lastLayoutId : null,
  };
}

store.set('settings', normalizeSettings(store.get('settings')));

export { store };
