import { describe, expect, it } from 'vitest';
import type { Task, TaskActionResult } from '../types';
import {
  applyOptimisticTaskAction,
  collectOccupiedTerminalZones,
  createTerminalOperationId,
  getTerminalInitialState,
} from '../utils/terminalState';

const task = (partial: Partial<Task>): Task => ({
  id: 'DEFAULT', status: 'WAIT', time: '', ...partial,
});

describe('terminal state helpers', () => {
  it('collects active zones while excluding done and current containers', () => {
    const occupied = collectOccupiedTerminalZones([
      task({ id: 'CURRENT', status: 'WAIT' }),
      task({ id: 'ACTIVE-1', status: 'ACTIVE', start_time: '10:00', zone: 'g5' }),
      task({ id: 'DONE-1', status: 'DONE', start_time: '09:00', end_time: '09:30', zone: 'G6' }),
      task({ id: 'CURRENT', status: 'ACTIVE', start_time: '10:05', zone: 'G3' }),
    ], 'CURRENT');

    expect(occupied).toEqual({ G5: 'ACTIVE-1' });
  });

  it('shows selected zone and operator immediately after a successful start', () => {
    const result: TaskActionResult = {
      status: 'completed', zone: 'G3', operator: 'tv tv',
    };

    expect(applyOptimisticTaskAction(task({ id: 'TARGET' }), 'start', result, '12:03'))
      .toMatchObject({
        id: 'TARGET', status: 'ACTIVE', start_time: '12:03', zone: 'G3', operator: 'tv tv',
      });
  });

  it('creates a stable operation ID from the supplied UUID', () => {
    expect(createTerminalOperationId(' 599AJE17-79GI17\n', 'start', () => 'uuid-123'))
      .toBe('599AJE17-79GI17:start:uuid-123');
  });

  it('renders cached dashboard tasks immediately without an opening refetch', () => {
    const cachedTasks = [task({ id: 'READY-1' })];

    expect(getTerminalInitialState(cachedTasks)).toEqual({
      tasks: cachedTasks,
      loading: false,
      needsFetch: false,
    });
  });

  it('requests tasks when no cached dashboard task feed exists', () => {
    expect(getTerminalInitialState([])).toEqual({ tasks: [], loading: true, needsFetch: true });
  });
});
