import type { Task, TaskActionResult } from '../types';

export function getTerminalInitialState(initialTasks: Task[]): {
  tasks: Task[];
  loading: boolean;
  needsFetch: boolean;
} {
  const hasCachedTasks = initialTasks.length > 0;
  return {
    tasks: initialTasks,
    loading: !hasCachedTasks,
    needsFetch: !hasCachedTasks,
  };
}

export function collectOccupiedTerminalZones(
  tasks: Task[],
  currentContainerId: string,
): Record<string, string> {
  const currentId = currentContainerId.trim();
  const occupied: Record<string, string> = {};

  for (const task of tasks) {
    const id = task.id.trim();
    const zone = (task.zone || '').trim().toUpperCase();
    const isActive = Boolean(task.start_time) && !task.end_time;
    if (!zone || !isActive || id === currentId) continue;
    occupied[zone] = id;
  }

  return occupied;
}

export function applyOptimisticTaskAction(
  task: Task,
  action: 'start' | 'finish',
  result: TaskActionResult,
  nowHHMM: string,
): Task {
  if (action === 'start') {
    return {
      ...task,
      start_time: task.start_time || nowHHMM,
      status: 'ACTIVE',
      zone: result.zone || task.zone || '',
      operator: result.operator || task.operator || '',
    };
  }

  return {
    ...task,
    end_time: task.end_time || nowHHMM,
    status: 'DONE',
  };
}

export function createTerminalOperationId(
  containerId: string,
  action: 'start' | 'finish',
  uuid: () => string = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  },
): string {
  return `${containerId.trim()}:${action}:${uuid()}`;
}
