import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type GasContext = Record<string, any>;

// Real CacheService limit: 100 KB per value (Apps Script silently fails, so we throw to surface it).
const CACHE_VALUE_LIMIT = 100 * 1024;

function fakeCache() {
  const store = new Map<string, string>();
  const put = (key: string, value: string) => {
    if (Buffer.byteLength(value, 'utf8') > CACHE_VALUE_LIMIT) throw new Error(`Argument too large: value (${key})`);
    store.set(key, value);
  };
  return {
    store,
    get: (key: string) => store.get(key) ?? null,
    put: vi.fn(put),
    getAll: (keys: string[]) => Object.fromEntries(keys.filter(k => store.has(k)).map(k => [k, store.get(k)])),
    putAll: vi.fn((values: Record<string, string>) => { for (const [k, v] of Object.entries(values)) put(k, v); }),
    remove: (key: string) => { store.delete(key); },
    removeAll: (keys: string[]) => { for (const k of keys) store.delete(k); },
  };
}

const C = {
  version: 'V1', N: 1, LOT_NO: 2, WS: 3, PALLETS: 4, CONTAINER_NO: 5, PHONE: 6, ETA: 7,
  START_TIME: 8, END_TIME: 9, UNLOAD_DURATION: 10, ZONE: 11, WORKER: 12, W_READ: 18,
};

function planRow(i: number): string[] {
  const cells = Array(18).fill('');
  cells[C.N - 1] = String(i + 1);
  cells[C.LOT_NO - 1] = `43115-CT13J202606${String(i % 40).padStart(2, '0')}`;
  cells[C.WS - 1] = ['Welding', 'Assembly', 'Painting'][i % 3];
  cells[C.PALLETS - 1] = '0/20';
  cells[C.CONTAINER_NO - 1] = `CICU${String(7000000 + i)}`;
  cells[C.ETA - 1] = '16:00';
  if (i % 2) cells[C.START_TIME - 1] = '15:00';
  if (i % 4 === 1) cells[C.END_TIME - 1] = '15:30';
  cells[C.ZONE - 1] = i % 2 ? 'G3' : '';
  return cells;
}

function loadCodeGs(rowCount: number) {
  const cache = fakeCache();
  const rows = Array.from({ length: rowCount }, (_, i) => planRow(i));
  const getRange = vi.fn(() => ({ getDisplayValues: () => rows }));
  const sheet = { getName: () => '16.09', getLastRow: () => rowCount + 4, getRange };
  const ss = { getSheetByName: (name: string) => (name === '16.09' ? sheet : null) };
  const context: GasContext = {
    Logger: { log: vi.fn() },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    SpreadsheetApp: { flush: vi.fn() },
    CacheService: { getScriptCache: () => cache },
    ContentService: {
      MimeType: { TEXT: 'TEXT', JSON: 'JSON' },
      createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }),
    },
    Utilities: { formatDate: () => '16.09' },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../Code.gs', import.meta.url), 'utf8'), context);
  context.getTvLotProgressSheetNames_ = () => ['16.09'];
  context.getPlanColumnsForSheet = () => C;
  context.planReadCols_ = () => 18;
  return { context, cache, ss, getRange };
}

describe('Code.gs handleTvLotProgress server cache', () => {
  it('serves a payload larger than the 100 KB CacheService limit from cache on the second call', () => {
    const { context, ss, getRange } = loadCodeGs(700);
    const first = context.handleTvLotProgress({ days: '7' }, ss).text;
    expect(Buffer.byteLength(first, 'utf8')).toBeGreaterThan(CACHE_VALUE_LIMIT);
    expect(getRange).toHaveBeenCalledTimes(1);

    const second = context.handleTvLotProgress({ days: '7' }, ss).text;
    expect(getRange).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('still caches a small payload', () => {
    const { context, ss, getRange } = loadCodeGs(5);
    const first = context.handleTvLotProgress({ days: '7' }, ss).text;
    const second = context.handleTvLotProgress({ days: '7' }, ss).text;
    expect(getRange).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(JSON.parse(second).planRows).toHaveLength(5);
  });

  it('re-reads the sheets when one cached chunk is missing instead of returning a truncated payload', () => {
    const { context, cache, ss, getRange } = loadCodeGs(700);
    const first = context.handleTvLotProgress({ days: '7' }, ss).text;
    const chunkKeys = [...cache.store.keys()].filter(k => /_\d+$/.test(k));
    expect(chunkKeys.length).toBeGreaterThan(1);
    cache.remove(chunkKeys[chunkKeys.length - 1]);

    const second = context.handleTvLotProgress({ days: '7' }, ss).text;
    expect(getRange).toHaveBeenCalledTimes(2);
    expect(second).toBe(first);
  });
});
