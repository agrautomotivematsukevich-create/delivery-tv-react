import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { parseDashboardData } from '../services/api';
import { isArrivalFact, selectArrivedTasks } from '../utils/arrivals';
import type { DashboardData, Task } from '../types';

const HEAD = 'ACTIVE;3|12;NAKU5249043;12:30;1|2|0|5|4|3;2';

function dashboard(extra: Partial<DashboardData> = {}): DashboardData {
  return {
    status: 'ACTIVE', done: 3, total: 12, nextId: 'X', nextTime: '12:30', activeList: [],
    onTerritory: 0, shiftCounts: { morning: 0, evening: 0, night: 0 },
    shiftFacts: { morning: 0, evening: 0, night: 0 }, shiftTargets: { morning: 0, evening: 0, night: 0 },
    ...extra,
  };
}

function task(id: string, fields: Partial<Task> = {}): Task {
  return { id, lot: '', ws: '', pallets: '', phone: '', eta: '', status: 'WAIT', ...fields } as Task;
}

describe('parseDashboardData arrived list', () => {
  it('reads ID|HH:MM rows after ###ARRIVED###', () => {
    const text = `${HEAD}\nACT1|10:00|0|BS|G1\n###MSG###\n###ARRIVED###\nREAL1|18:13\nREAL2|17:58\n`;
    const data = parseDashboardData(text);
    expect(data?.onTerritory).toBe(2);
    expect(data?.activeList).toEqual([{ id: 'ACT1', start: '10:00', zone: 'G1' }]);
    expect(data?.arrivedList).toEqual([{ id: 'REAL1', time: '18:13' }, { id: 'REAL2', time: '17:58' }]);
  });

  it('returns an empty arrived list for the legacy payload without the tail', () => {
    const data = parseDashboardData(`${HEAD}\n###MSG###`);
    expect(data?.onTerritory).toBe(2);
    expect(data?.arrivedList).toEqual([]);
  });
});

describe('isArrivalFact', () => {
  it('accepts a cell that starts with a real HH:MM stamp', () => {
    expect(isArrivalFact('18:13')).toBe(true);
    expect(isArrivalFact(' 17:58! ')).toBe(true);
    expect(isArrivalFact('9:05')).toBe(true);
  });

  it('rejects dispatcher forecasts and ranges', () => {
    for (const value of [undefined, '', 'к 21:00', '~к 20-21', 'к 19', 'пр КТК', '18:00-19:00', '18:00 - 19:00']) {
      expect(isArrivalFact(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe('selectArrivedTasks', () => {
  it('keeps only waiting tasks with a real arrival stamp', () => {
    const tasks = [
      task('REAL', { arrival_time: '18:13' }),
      task('FORECAST', { arrival_time: 'к 21:00' }),
      task('STARTED', { arrival_time: '17:00', start_time: '17:30' }),
      task('DONE', { arrival_time: '16:00', start_time: '16:10', end_time: '16:50' }),
    ];
    expect(selectArrivedTasks(tasks, dashboard()).map((t) => t.id)).toEqual(['REAL']);
  });

  it('falls back to the server list when no tasks are loaded (public TV)', () => {
    const data = dashboard({ arrivedList: [{ id: 'REAL1', time: '18:13' }] });
    expect(selectArrivedTasks([], data)).toEqual([{ id: 'REAL1', arrival_time: '18:13' }]);
  });

  it('shows nothing when neither tasks nor a server list are available', () => {
    expect(selectArrivedTasks([], dashboard())).toEqual([]);
    expect(selectArrivedTasks([], null)).toEqual([]);
  });
});
