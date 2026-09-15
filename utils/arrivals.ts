import type { DashboardData, Task } from '../types';

// Column P ("Время прибытия") also holds dispatcher forecasts: "к 21:00", "~к 19-20",
// "18:00-19:00", "пр КТК". Only a cell that STARTS with HH:MM and is not a range is a fact
// that the truck is on site; trailing text ("17:58!") is ignored. Mirrors parseArrivalFact_
// in Code.gs — keep both in sync.
export function normalizeArrivalTime(value: string | undefined): string | null {
  const text = (value ?? '').trim();
  const m = text.match(/^(\d{1,2}):(\d{2})(.*)$/);
  if (!m) return null;
  if (/^\s*[\d\-–—]/.test(m[3])) return null;
  return `${m[1]}:${m[2]}`;
}

export function isArrivalFact(value: string | undefined): boolean {
  return normalizeArrivalTime(value) !== null;
}

export type ArrivedTask = Pick<Task, 'id' | 'arrival_time'>;

// With a task list (logged-in screens) the arrivals come from the tasks; the public TV
// (?tv=1) has no tasks, so it falls back to the list handleReadComplex appends after ###MSG###.
export function selectArrivedTasks(allTasks: Task[], data: DashboardData | null): ArrivedTask[] {
  if (allTasks.length > 0) {
    return allTasks.filter(
      (tk) => isArrivalFact(tk.arrival_time) && !tk.start_time?.trim() && !tk.end_time?.trim(),
    );
  }
  return (data?.arrivedList ?? []).map((item) => ({ id: item.id, arrival_time: item.time }));
}
