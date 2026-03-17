import { Task, TranslationSet } from '../types';
import { parseHHMM } from './time';

export type ShiftName = 'morning' | 'evening' | 'night' | 'none';

export function currentShift(): ShiftName {
  const m = new Date().getHours() * 60 + new Date().getMinutes();
  if (m >= 470 && m < 1010) return 'morning';
  if (m >= 1010 || m < 110) return 'evening';
  if (m >= 110  && m < 470) return 'night';
  return 'none';
}

export function calculateShiftFact(tasks: Task[]) {
  let m = 0, e = 0, n = 0;
  tasks.forEach(t => {
    if (t.status === 'DONE' && t.end_time) {
      const min = parseHHMM(t.end_time);
      if (min === null) return;
      if (min >= 470 && min < 1010) m++;
      else if (min >= 1010 || min < 110) e++;
      else if (min >= 110 && min < 470) n++;
    }
  });
  return { morning: m, evening: e, night: n, none: 0 };
}

export function calculateShiftTargets(tasks: Task[], facts: Record<ShiftName, number>, activeShift: ShiftName) {
  let m_base = 0, e_base = 0, n_base = 0;
  let noEtaCount = 0;

  tasks.forEach(t => {
    const min = parseHHMM(t.eta || '');
    if (min === null) {
      noEtaCount++;
      return;
    }
    if (min >= 470 && min < 1010) m_base++;
    else if (min >= 1010 || min < 110) e_base++;
    else if (min >= 110 && min < 470) n_base++;
  });

  if (noEtaCount > 0) {
    const half = Math.ceil(noEtaCount / 2);
    m_base += half;
    e_base += (noEtaCount - half);
  }

  let m_target = m_base;
  let e_target = e_base;
  let n_target = n_base;

  if (activeShift === 'evening' || activeShift === 'night') {
     const m_debt = m_base - facts.morning; 
     e_target = Math.max(0, e_base + m_debt);
  }

  if (activeShift === 'night') {
     const e_debt = e_target - facts.evening;
     n_target = Math.max(0, n_base + e_debt);
  }

  return { morning: m_target, evening: e_target, night: n_target, none: 0 };
}

export const formatMinutes = (totalMinutes: number, t: TranslationSet): string => {
  const abs = Math.abs(totalMinutes);
  const h = Math.floor(abs / 60), min = abs % 60;
  const ts = h > 0 ? `${h}ч ${min} мин` : `${min} мин`;
  return `${totalMinutes >= 0 ? t.eta_prefix : t.delay_prefix}${ts}`;
};

export const calculateTimeDiff = (timeStr: string, t: TranslationSet): string => {
  const min = parseHHMM(timeStr);
  if (min === null) return '...';
  const now = new Date();
  let diff = min - (now.getHours() * 60 + now.getMinutes());
  if (diff < -720) diff += 1440;
  if (diff === 0) return 'NOW';
  return formatMinutes(diff, t);
};
