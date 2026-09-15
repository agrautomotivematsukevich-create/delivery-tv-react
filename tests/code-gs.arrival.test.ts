import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type GasContext = Record<string, any>;

// Sheet layout V1 (see .claude/rules/gas-backend.md): P = ARRIVAL_TIME.
const C = {
  version: 'V1', N: 1, LOT_NO: 2, WS: 3, PALLETS: 4, CONTAINER_NO: 5, PHONE: 6, ETA: 7,
  START_TIME: 8, END_TIME: 9, UNLOAD_DURATION: 10, ZONE: 11, WORKER: 12,
  PHOTO_CONTAINER: 13, PHOTO_SEAL: 14, PHOTO_UNLOADED: 15, ARRIVAL_TIME: 16,
  SAP_STATUS: 17, LES_STATUS: 18, W_AUDIT: 18,
};

function waitingRow(id: string, arrival: string, eta = '12:00'): { C: typeof C; cells: string[] } {
  const cells = Array(18).fill('');
  cells[C.CONTAINER_NO - 1] = id;
  cells[C.ETA - 1] = eta;
  cells[C.ARRIVAL_TIME - 1] = arrival;
  return { C, cells };
}

function loadCodeGs(rows: Array<{ C: typeof C; cells: string[] }>): GasContext {
  const context: GasContext = {
    Logger: { log: vi.fn() },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    SpreadsheetApp: { flush: vi.fn() },
    CacheService: { getScriptCache: () => ({ get: () => null, put: vi.fn(), removeAll: vi.fn() }) },
    ContentService: {
      MimeType: { TEXT: 'TEXT', JSON: 'JSON' },
      createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }),
    },
    Utilities: { formatDate: (_d: Date, _tz: string, fmt: string) => (fmt === 'H' ? '10' : fmt === 'm' ? '0' : '15.09') },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../Code.gs', import.meta.url), 'utf8'), context);
  context.getActivePlanRows_ = () => ({ currentSheet: '15.09', previousSheet: '14.09', rows });
  context.getTodaySheetName = () => '15.09';
  return context;
}

describe('Code.gs arrival fact rule', () => {
  it('accepts only a cell that starts with a real HH:MM stamp', () => {
    const context = loadCodeGs([]);
    expect(context.parseArrivalFact_('18:13')).toBe('18:13');
    expect(context.parseArrivalFact_(' 17:58! ')).toBe('17:58');
    expect(context.parseArrivalFact_('9:05')).toBe('9:05');
    expect(context.parseArrivalFact_('18:13:00')).toBe('18:13');
  });

  it('rejects dispatcher forecasts and ranges', () => {
    const context = loadCodeGs([]);
    for (const value of ['', 'к 21:00', '~к 20-21', 'к 19', 'пр КТК', '18:00-19:00', '18:00 - 19:00', '12:00–13:00']) {
      expect(context.parseArrivalFact_(value), JSON.stringify(value)).toBeNull();
    }
  });
});

describe('Code.gs handleReadComplex on-territory', () => {
  it('counts only real arrival stamps and appends the arrived list after ###MSG###', () => {
    const context = loadCodeGs([
      waitingRow('REAL1', '18:13'),
      waitingRow('FORECAST', 'к 21:00'),
      waitingRow('REAL2', '17:58!'),
      waitingRow('RANGE', '18:00-19:00'),
      waitingRow('NONE', ''),
    ]);

    const out = context.handleReadComplex({}, {}).text as string;
    const [head, tail] = out.split('###MSG###');

    expect(head.split('\n')[0]).toBe('ACTIVE;0|5;REAL1;12:00;0|0|0|5|0|0;2');
    expect(tail).toBe('\n###ARRIVED###\nREAL1|18:13\nREAL2|17:58');
  });

  it('keeps the legacy shape untouched when nobody has arrived', () => {
    const context = loadCodeGs([waitingRow('FORECAST', 'к 19')]);
    const out = context.handleReadComplex({}, {}).text as string;
    expect(out).toBe('ACTIVE;0|1;FORECAST;12:00;0|0|0|1|0|0;0\n###MSG###');
  });
});
