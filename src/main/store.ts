import Store from 'electron-store';
import { StoreSchema, Settings } from './types';

const defaultSettings: Settings = {
  autoRestore: false,
  askBeforeRestore: true,
  lastLayoutId: null,
};

const store = new Store<StoreSchema>({
  defaults: {
    layouts: [],
    settings: defaultSettings,
  },
});

export { store };
