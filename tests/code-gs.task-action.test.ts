import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type GasContext = Record<string, any>;

function loadCodeGs(): GasContext {
  const properties = { getProperty: () => '' };
  const context: GasContext = {
    Logger: { log: vi.fn() },
    PropertiesService: { getScriptProperties: () => properties },
    SpreadsheetApp: { flush: vi.fn() },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../Code.gs', import.meta.url), 'utf8'), context);
  return context;
}

describe('Code.gs task ID handling', () => {
  it('matches a sheet container ID that has trailing spreadsheet whitespace', () => {
    const context = loadCodeGs();
    const writes: Array<{ row: number; column: number; value: unknown }> = [];
    context.getPlanColumnsForSheetWriteSafe_ = () => ({
      version: 'V1', CONTAINER_NO: 5, START_TIME: 8, END_TIME: 9,
      UNLOAD_DURATION: 10, ZONE: 11, WORKER: 12,
      PHOTO_CONTAINER: 13, PHOTO_SEAL: 14, PHOTO_UNLOADED: 15,
    });
    context.logPlanHandlerDebug_ = () => undefined;
    context.getActionTime = () => '10:17';
    context.buildContainerRowSnapshot_ = () => ({});
    const sheet = {
      getLastRow: () => 5,
      getRange: (row: number, column: number, rows?: number, columns?: number) => {
        if (rows && columns) return { getValues: () => [['599AJE17-79GI17\n']] };
        return { setValue: (value: unknown) => writes.push({ row, column, value }) };
      },
    };

    const result = context.applyTaskAction(sheet, '599AJE17-79GI17', 'start', '10:17', {
      zone: 'G3', op: 'tv tv',
    });

    expect(result).not.toBeNull();
    expect(writes).toContainEqual({ row: 5, column: 11, value: 'G3' });
  });

  it('routes a legacy action to the previous sheet when its stored ID has whitespace', () => {
    const context = loadCodeGs();
    context.getActivePlanSheetNames_ = () => ({ current: '25.08', previous: '24.08' });
    context.getPlanColumnsForSheet = () => ({ CONTAINER_NO: 5 });
    const sheet = (id: string) => ({
      getLastRow: () => 5,
      getRange: () => ({ getDisplayValues: () => [[id]] }),
    });
    const spreadsheet = {
      getSheetByName: (name: string) => name === '24.08'
        ? sheet('599AJE17-79GI17\r\n')
        : sheet('OTHER'),
    };

    expect(context.resolveActionSheetName_(spreadsheet, '599AJE17-79GI17', ''))
      .toBe('24.08');
  });

  it('returns normalized IDs in the operator task feed', () => {
    const context = loadCodeGs();
    context.CacheService = { getScriptCache: () => ({ get: () => null, put: vi.fn() }) };
    context.ContentService = {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (content: string) => ({
        getContent: () => content,
        setMimeType() { return this; },
      }),
    };
    context.todayCacheKey = () => 'stats_test';
    context.deriveStatus = () => 'WAIT';
    context.jsonOut = (value: unknown) => value;
    const C = {
      CONTAINER_NO: 5, WS: 3, PALLETS: 4, PHONE: 6, ETA: 7,
      START_TIME: 8, END_TIME: 9, ZONE: 11, WORKER: 12,
      PHOTO_CONTAINER: 13, PHOTO_SEAL: 14, ARRIVAL_TIME: 16,
    };
    const cells = Array(18).fill('');
    cells[C.CONTAINER_NO - 1] = '599AJE17-79GI17\n';
    context.getActivePlanRows_ = () => ({
      rows: [{ C, cells, sheetName: '25.08' }],
    });

    const tasks = JSON.parse(context.handleGetStats({}, {}).getContent());

    expect(tasks[0].id).toBe('599AJE17-79GI17');
  });
});
