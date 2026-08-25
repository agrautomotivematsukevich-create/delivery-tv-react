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
      version: 'V1', N: 1, LOT_NO: 2, WS: 3, PALLETS: 4,
      CONTAINER_NO: 5, PHONE: 6, ETA: 7, START_TIME: 8, END_TIME: 9,
      UNLOAD_DURATION: 10, ZONE: 11, WORKER: 12,
      PHOTO_CONTAINER: 13, PHOTO_SEAL: 14, PHOTO_UNLOADED: 15,
      ARRIVAL_TIME: 0, SAP_STATUS: 0, LES_STATUS: 0, W_AUDIT: 15,
    });
    context.logPlanHandlerDebug_ = () => undefined;
    context.getActionTime = () => '10:17';
    context.buildContainerRowSnapshot_ = () => ({});
    const rowData = Array(15).fill('');
    rowData[4] = '599AJE17-79GI17\n';
    const sheet = {
      getName: () => '25.08',
      getMaxColumns: () => 15,
      getLastRow: () => 5,
      getRange: (row: number, column: number, rows?: number, columns?: number) => {
        if (row === 5 && column === 1 && rows && columns) {
          return { getDisplayValues: () => [rowData] };
        }
        return {
          setValue: (value: unknown) => writes.push({ row, column, value }),
          setValues: (values: unknown[][]) => values[0].forEach((value, index) => {
            writes.push({ row, column: column + index, value });
          }),
        };
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

describe('Code.gs terminal action safety and latency', () => {
  it('keeps the route-level lock off so audit work cannot block other terminal writes', () => {
    const context = loadCodeGs();

    expect(context.ROUTES.task_action.lock).toBe(false);
  });

  it('returns BUSY when the short task write lock cannot be acquired', () => {
    const context = loadCodeGs();
    context.Utilities = { formatDate: () => '10:17' };
    context.LockService = {
      getScriptLock: () => ({ tryLock: () => false, releaseLock: vi.fn() }),
    };
    context.textOut = (value: string) => value;
    context.appendAuditEvent_ = vi.fn();
    context.resolveActionSheetName_ = () => '25.08';
    context.invalidateActivePlanReadCache_ = vi.fn();
    context.applyTaskAction = vi.fn(() => ({ rowNumber: 5, oldSnapshot: {}, newSnapshot: {} }));
    context.buildContainerChangeAuditEvents_ = () => [];
    context.buildContainerAuditBase_ = () => ({});
    context.appendAuditEventsBatch_ = vi.fn();
    const spreadsheet = { getSheetByName: () => ({}) };

    const response = context.handleTaskAction({ id: '599AJE17-79GI17', act: 'finish' }, spreadsheet);

    expect(response).toBe('BUSY');
    expect(context.applyTaskAction).not.toHaveBeenCalled();
  });

  it('does not write the same operationId twice when the client retries', () => {
    const context = loadCodeGs();
    const operationCache = new Map<string, string>();
    context.Utilities = { formatDate: () => '10:17' };
    context.CacheService = {
      getScriptCache: () => ({
        get: (key: string) => operationCache.get(key) ?? null,
        put: (key: string, value: string) => operationCache.set(key, value),
      }),
    };
    context.LockService = {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: vi.fn() }),
    };
    context.textOut = (value: string) => value;
    context.appendAuditEvent_ = vi.fn();
    context.resolveActionSheetName_ = () => '25.08';
    context.invalidateActivePlanReadCache_ = vi.fn();
    context.applyTaskAction = vi.fn(() => ({ rowNumber: 5, oldSnapshot: {}, newSnapshot: {} }));
    context.buildContainerChangeAuditEvents_ = () => [];
    context.buildContainerAuditBase_ = () => ({});
    context.appendAuditEventsBatch_ = vi.fn();
    const spreadsheet = { getSheetByName: () => ({}) };
    const params = {
      id: '599AJE17-79GI17', act: 'finish', operationId: 'op-fixed-retry',
    };

    expect(context.handleTaskAction(params, spreadsheet)).toBe('UPDATED');
    expect(context.handleTaskAction(params, spreadsheet)).toBe('UPDATED');

    expect(context.applyTaskAction).toHaveBeenCalledTimes(1);
  });

  it('reuses an uploaded photo for the same operationId and photo type', () => {
    const context = loadCodeGs();
    const photoCache = new Map<string, string>();
    let nextFile = 0;
    const createFile = vi.fn(() => {
      nextFile += 1;
      return {
        getId: () => `file-${nextFile}`,
        getUrl: () => `https://drive.test/file-${nextFile}`,
        setSharing: vi.fn(),
      };
    });
    context.CacheService = {
      getScriptCache: () => ({
        get: (key: string) => photoCache.get(key) ?? null,
        put: (key: string, value: string) => photoCache.set(key, value),
      }),
    };
    context.DriveApp = {
      Access: { ANYONE_WITH_LINK: 'link' }, Permission: { VIEW: 'view' }, createFile,
    };
    context.Utilities = { base64Decode: () => [], newBlob: () => ({}) };
    context.appendAuditLog = vi.fn();
    context.jsonOut = (value: unknown) => value;
    const params = {
      image: 'data:image/jpeg;base64,YQ==', mimeType: 'image/jpeg', filename: 'test.jpg',
      containerId: '599AJE17-79GI17', photoType: 'container', operationId: 'op-photo-retry',
    };

    const first = context.handleUploadPhoto(params, {});
    const second = context.handleUploadPhoto(params, {});

    expect(first).toEqual({ status: 'SUCCESS', url: 'https://drive.test/file-1' });
    expect(second).toEqual(first);
    expect(createFile).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown start zone before writing', () => {
    const context = loadCodeGs();
    const validate = context.validateStartZone_ || (() => 'MISSING_VALIDATOR');

    expect(validate('599AJE17-79GI17', 'start', 'G2', [])).toBe('INVALID_ZONE');
  });

  it('rejects a zone occupied by another active container', () => {
    const context = loadCodeGs();
    const validate = context.validateStartZone_ || (() => 'MISSING_VALIDATOR');
    const C = { CONTAINER_NO: 5, START_TIME: 8, END_TIME: 9, ZONE: 11 };
    const activeRow = Array(12).fill('');
    activeRow[C.CONTAINER_NO - 1] = 'OTHER-CONTAINER';
    activeRow[C.START_TIME - 1] = '10:00';
    activeRow[C.ZONE - 1] = 'G5';

    expect(validate('599AJE17-79GI17', 'start', 'g5', [{ C, cells: activeRow }]))
      .toBe('ZONE_OCCUPIED:OTHER-CONTAINER');
  });

  it('allows the same container to retain its own active zone', () => {
    const context = loadCodeGs();
    const validate = context.validateStartZone_ || (() => 'MISSING_VALIDATOR');
    const C = { CONTAINER_NO: 5, START_TIME: 8, END_TIME: 9, ZONE: 11 };
    const activeRow = Array(12).fill('');
    activeRow[C.CONTAINER_NO - 1] = '599AJE17-79GI17\n';
    activeRow[C.START_TIME - 1] = '10:00';
    activeRow[C.ZONE - 1] = 'G3';

    expect(validate('599AJE17-79GI17', 'start', 'G3', [{ C, cells: activeRow }]))
      .toBe('');
  });

  it('batches a start into at most two sheet writes without a forced flush', () => {
    const context = loadCodeGs();
    const writes: Array<{ row: number; column: number; values: unknown[][] }> = [];
    const C = {
      version: 'V1', N: 1, LOT_NO: 2, WS: 3, PALLETS: 4, CONTAINER_NO: 5,
      CARRIER: 0, DRIVER: 0, PHONE: 6, ETA: 7, START_TIME: 8, END_TIME: 9,
      UNLOAD_DURATION: 10, FACTORY_DOWNTIME: 0, ZONE: 11, WORKER: 12,
      PHOTO_CONTAINER: 13, PHOTO_SEAL: 14, PHOTO_UNLOADED: 15,
      ARRIVAL_TIME: 16, SAP_STATUS: 17, LES_STATUS: 18, W_AUDIT: 18,
    };
    context.getPlanColumnsForSheetWriteSafe_ = () => C;
    context.logPlanHandlerDebug_ = () => undefined;
    context.getActionTime = () => '10:17';
    const row = Array(18).fill('');
    row[C.CONTAINER_NO - 1] = '599AJE17-79GI17\n';
    const sheet = {
      getName: () => '25.08',
      getMaxColumns: () => 18,
      getLastRow: () => 5,
      getRange: (rangeRow: number, column: number, rows?: number, columns?: number) => ({
        getValues: () => [row.slice(column - 1, column - 1 + (columns || 1))],
        getDisplayValues: () => [row.slice(column - 1, column - 1 + (columns || 1))],
        setValue: (value: unknown) => writes.push({ row: rangeRow, column, values: [[value]] }),
        setValues: (values: unknown[][]) => writes.push({ row: rangeRow, column, values }),
      }),
    };

    const result = context.applyTaskAction(sheet, '599AJE17-79GI17', 'start', '10:17', {
      zone: 'G3', op: 'tv tv', pGen: 'general-url', pSeal: 'seal-url',
    });

    expect(result).not.toBeNull();
    expect(writes.length).toBeLessThanOrEqual(2);
    expect(context.SpreadsheetApp.flush).not.toHaveBeenCalled();
  });

  it('reuses the active-row read during start instead of reading the plan again', () => {
    const context = loadCodeGs();
    const C = {
      version: 'V1', N: 1, LOT_NO: 2, WS: 3, PALLETS: 4, CONTAINER_NO: 5,
      CARRIER: 0, DRIVER: 0, PHONE: 6, ETA: 7, START_TIME: 8, END_TIME: 9,
      UNLOAD_DURATION: 10, FACTORY_DOWNTIME: 0, ZONE: 11, WORKER: 12,
      PHOTO_CONTAINER: 13, PHOTO_SEAL: 14, PHOTO_UNLOADED: 15,
      ARRIVAL_TIME: 16, SAP_STATUS: 17, LES_STATUS: 18, W_AUDIT: 18,
    };
    const row = Array(18).fill('');
    row[C.CONTAINER_NO - 1] = '599AJE17-79GI17';
    context.getPlanColumnsForSheetWriteSafe_ = () => C;
    const getLastRow = vi.fn(() => 5);
    const sheet = {
      getName: () => '25.08',
      getMaxColumns: () => 18,
      getLastRow,
      getRange: () => ({
        getDisplayValues: () => [row],
        setValues: vi.fn(),
      }),
    };

    const result = context.applyTaskAction(
      sheet,
      '599AJE17-79GI17',
      'start',
      '10:17',
      { zone: 'G3', op: 'tv tv' },
      { C, cells: row, rowNumber: 5, sheetName: '25.08' },
    );

    expect(result).not.toBeNull();
    expect(getLastRow).not.toHaveBeenCalled();
  });

  it('clears the unloaded photo when an action is fully undone', () => {
    const context = loadCodeGs();
    const writes: Array<{ column: number; values: unknown[][] }> = [];
    const C = {
      version: 'V1', N: 1, LOT_NO: 2, WS: 3, PALLETS: 4, CONTAINER_NO: 5,
      CARRIER: 0, DRIVER: 0, PHONE: 6, ETA: 7, START_TIME: 8, END_TIME: 9,
      UNLOAD_DURATION: 10, FACTORY_DOWNTIME: 0, ZONE: 11, WORKER: 12,
      PHOTO_CONTAINER: 13, PHOTO_SEAL: 14, PHOTO_UNLOADED: 15,
      ARRIVAL_TIME: 16, SAP_STATUS: 17, LES_STATUS: 18, W_AUDIT: 18,
    };
    const row = Array(18).fill('');
    row[C.CONTAINER_NO - 1] = '599AJE17-79GI17';
    row[C.START_TIME - 1] = '13:03';
    row[C.END_TIME - 1] = '13:05';
    row[C.PHOTO_UNLOADED - 1] = 'https://drive.test/unloaded';
    const sheet = {
      getName: () => '25.08',
      getMaxColumns: () => 18,
      getRange: (_row: number, column: number) => ({
        setValues: (values: unknown[][]) => writes.push({ column, values }),
      }),
    };

    context.applyTaskAction(
      sheet,
      '599AJE17-79GI17',
      'undo_start',
      '13:06',
      {},
      { C, cells: row, rowNumber: 5, sheetName: '25.08' },
    );

    const writtenCells = writes.flatMap((write) => write.values[0].map((value, index) => ({
      column: write.column + index,
      value,
    })));
    expect(writtenCells).toContainEqual({ column: C.PHOTO_UNLOADED, value: '' });
  });

  it('never reuses a read-safe fallback layout for a write', () => {
    const context = loadCodeGs();
    const isSafe = context.isPreparedPlanEntryWriteSafe_ || (() => true);

    expect(isSafe({ C: { version: 'V1', headerFound: false, missing: [] } })).toBe(false);
    expect(isSafe({ C: { version: 'V2_LIVE', headerFound: true, missing: ['ZONE'] } })).toBe(false);
    expect(isSafe({ C: { version: 'V2_LIVE', headerFound: true, missing: [] } })).toBe(true);
  });
});
