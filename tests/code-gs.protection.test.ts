import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type GasContext = Record<string, any>;

function loadCodeGs(properties: Record<string, string> = {}): GasContext {
  const context: GasContext = {
    Logger: { log: vi.fn() },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (name: string) => properties[name] || '',
      }),
    },
    SpreadsheetApp: {
      flush: vi.fn(),
      ProtectionType: { RANGE: 'RANGE' },
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../Code.gs', import.meta.url), 'utf8'), context);
  return context;
}

describe('Code.gs daily sheet protection', () => {
  it('protects both ranges for only the spreadsheet owner and configured editor', () => {
    const context = loadCodeGs({
      PLAN_PROTECTED_EDITOR_EMAIL: 'trusted.editor@example.com',
    });
    expect(context.applyDailySheetProtections_).toBeTypeOf('function');

    const protectedRanges: string[] = [];
    const addEditors = vi.fn();
    const removeEditors = vi.fn();
    const setDomainEdit = vi.fn();
    const setWarningOnly = vi.fn();
    const protection = {
      setDescription: vi.fn().mockReturnThis(),
      setWarningOnly,
      getEditors: () => [{ getEmail: () => 'old.editor@example.com' }],
      removeEditors,
      addEditors,
      canDomainEdit: () => true,
      setDomainEdit,
    };
    const sheet = {
      getProtections: vi.fn(() => []),
      getRange: (a1: string) => ({
        getA1Notation: () => a1,
        protect: () => {
          protectedRanges.push(a1);
          return protection;
        },
      }),
    };
    const spreadsheet = {
      getOwner: () => ({ getEmail: () => 'owner@example.com' }),
    };

    context.applyDailySheetProtections_(sheet, spreadsheet);

    expect(protectedRanges).toEqual(['N5:P100', 'J5:K100']);
    expect(removeEditors).toHaveBeenCalledTimes(2);
    expect(addEditors).toHaveBeenNthCalledWith(
      1,
      ['owner@example.com', 'trusted.editor@example.com'],
    );
    expect(addEditors).toHaveBeenNthCalledWith(
      2,
      ['owner@example.com', 'trusted.editor@example.com'],
    );
    expect(setWarningOnly).toHaveBeenCalledWith(false);
    expect(setDomainEdit).toHaveBeenCalledWith(false);
  });

  it('applies the layout and protections whenever a daily sheet is created', () => {
    const context = loadCodeGs({
      PLAN_PROTECTED_EDITOR_EMAIL: 'trusted.editor@example.com',
    });
    expect(context.createDailyPlanSheet_).toBeTypeOf('function');

    const sheet = { id: 'new-sheet' };
    const spreadsheet = {
      insertSheet: vi.fn(() => sheet),
    };
    context.applyPlanV2Layout = vi.fn();
    context.applyDailySheetProtections_ = vi.fn();

    const result = context.createDailyPlanSheet_(spreadsheet, '26.08');

    expect(result).toBe(sheet);
    expect(spreadsheet.insertSheet).toHaveBeenCalledWith('26.08');
    expect(context.applyPlanV2Layout).toHaveBeenCalledWith(sheet);
    expect(context.applyDailySheetProtections_).toHaveBeenCalledWith(sheet, spreadsheet);
  });

  it('protects a manually inserted daily sheet from the installable change trigger', () => {
    const context = loadCodeGs({
      PLAN_PROTECTED_EDITOR_EMAIL: 'trusted.editor@example.com',
    });
    expect(context.onDailySheetStructureChange).toBeTypeOf('function');

    const sheet = { getName: () => '26.08' };
    const spreadsheet = { getActiveSheet: () => sheet };
    context.applyDailySheetProtections_ = vi.fn();

    context.onDailySheetStructureChange({
      changeType: 'INSERT_GRID',
      source: spreadsheet,
    });

    expect(context.applyDailySheetProtections_).toHaveBeenCalledWith(sheet, spreadsheet);
  });

  it('installs one spreadsheet change trigger for future daily sheets', () => {
    const context = loadCodeGs({
      PLAN_PROTECTED_EDITOR_EMAIL: 'trusted.editor@example.com',
    });
    expect(context.installDailySheetProtection).toBeTypeOf('function');

    const sheet = { getName: () => '26.08' };
    const spreadsheet = {
      getActiveSheet: () => sheet,
      getSheetByName: () => sheet,
    };
    context.SpreadsheetApp.getActiveSpreadsheet = () => spreadsheet;
    context.Utilities = { formatDate: () => '26.08' };
    context.applyDailySheetProtections_ = vi.fn();
    const create = vi.fn();
    const onChange = vi.fn(() => ({ create }));
    const forSpreadsheet = vi.fn(() => ({ onChange }));
    const newTrigger = vi.fn(() => ({ forSpreadsheet }));
    context.ScriptApp = {
      getProjectTriggers: () => [],
      newTrigger,
    };

    context.installDailySheetProtection();

    expect(newTrigger).toHaveBeenCalledWith('onDailySheetStructureChange');
    expect(forSpreadsheet).toHaveBeenCalledWith(spreadsheet);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('stores the trusted editor before installing daily sheet protection', () => {
    const context = loadCodeGs();
    expect(context.configureDailySheetProtection).toBeTypeOf('function');

    const setProperty = vi.fn();
    context.PropertiesService = {
      getScriptProperties: () => ({ setProperty }),
    };
    context.installDailySheetProtection = vi.fn(() => 'INSTALLED');

    const result = context.configureDailySheetProtection(' trusted.editor@example.com ');

    expect(setProperty).toHaveBeenCalledWith(
      'PLAN_PROTECTED_EDITOR_EMAIL',
      'trusted.editor@example.com',
    );
    expect(context.PLAN_PROTECTED_EDITOR_EMAIL).toBe('trusted.editor@example.com');
    expect(context.installDailySheetProtection).toHaveBeenCalledTimes(1);
    expect(result).toBe('INSTALLED');
  });

  it('protects the current calendar sheet even when another tab is active', () => {
    const context = loadCodeGs({
      PLAN_PROTECTED_EDITOR_EMAIL: 'trusted.editor@example.com',
    });
    const dashboardSheet = { getName: () => 'DASHBOARD' };
    const todaySheet = { getName: () => '26.08' };
    const spreadsheet = {
      getActiveSheet: () => dashboardSheet,
      getSheetByName: (name: string) => name === '26.08' ? todaySheet : null,
    };
    context.SpreadsheetApp.getActiveSpreadsheet = () => spreadsheet;
    context.Utilities = { formatDate: () => '26.08' };
    context.applyDailySheetProtections_ = vi.fn();
    context.ScriptApp = { getProjectTriggers: () => [{
      getHandlerFunction: () => 'onDailySheetStructureChange',
    }] };

    context.installDailySheetProtection();

    expect(context.applyDailySheetProtections_).toHaveBeenCalledWith(todaySheet, spreadsheet);
  });
});
