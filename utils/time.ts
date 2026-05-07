export function parseHHMM(s: string | undefined): number | null {
  if (!s || !s.trim()) return null;
  const cleaned = s.trim().replace(/[^0-9:]/g, '');
  const m = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

export const MOSCOW_TIME_ZONE = 'Europe/Moscow';
export const OPERATIONAL_DAY_START_HOUR = 6;

export interface OperationalDateInfo {
  calendarDate: string;
  operationalDate: string;
  calendarSheetName: string;
  operationalSheetName: string;
  previousSheetName: string;
  hour: number;
  minute: number;
  second: number;
  cutoffHour: number;
  isBeforeOperationalCutoff: boolean;
}

type MoscowDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getMoscowDateParts(now: Date = new Date()): MoscowDateParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MOSCOW_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const readPart = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value ?? '0';
    return parseInt(value, 10) || 0;
  };

  return {
    year: readPart('year'),
    month: readPart('month'),
    day: readPart('day'),
    hour: readPart('hour'),
    minute: readPart('minute'),
    second: readPart('second'),
  };
}

function buildUtcDateFromMoscowParts(parts: MoscowDateParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
}

function formatUtcIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatUtcSheetName(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}.${month}`;
}

export function getOperationalDateInfo(now: Date = new Date()): OperationalDateInfo {
  const moscowParts = getMoscowDateParts(now);
  const calendarUtc = buildUtcDateFromMoscowParts(moscowParts);
  const operationalUtc = new Date(calendarUtc.getTime());

  if (moscowParts.hour < OPERATIONAL_DAY_START_HOUR) {
    operationalUtc.setUTCDate(operationalUtc.getUTCDate() - 1);
  }

  const previousUtc = new Date(operationalUtc.getTime());
  previousUtc.setUTCDate(previousUtc.getUTCDate() - 1);

  return {
    calendarDate: formatUtcIsoDate(calendarUtc),
    operationalDate: formatUtcIsoDate(operationalUtc),
    calendarSheetName: formatUtcSheetName(calendarUtc),
    operationalSheetName: formatUtcSheetName(operationalUtc),
    previousSheetName: formatUtcSheetName(previousUtc),
    hour: moscowParts.hour,
    minute: moscowParts.minute,
    second: moscowParts.second,
    cutoffHour: OPERATIONAL_DAY_START_HOUR,
    isBeforeOperationalCutoff: moscowParts.hour < OPERATIONAL_DAY_START_HOUR,
  };
}

export function getOperationalIsoDate(now: Date = new Date()): string {
  return getOperationalDateInfo(now).operationalDate;
}

export function getOperationalSheetName(now: Date = new Date()): string {
  return getOperationalDateInfo(now).operationalSheetName;
}

export function getMillisecondsUntilNextOperationalBoundary(now: Date = new Date()): number {
  const parts = getMoscowDateParts(now);
  const currentUtc = buildUtcDateFromMoscowParts(parts);
  const nextBoundaryUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, OPERATIONAL_DAY_START_HOUR, 0, 0));

  if (parts.hour >= OPERATIONAL_DAY_START_HOUR) {
    nextBoundaryUtc.setUTCDate(nextBoundaryUtc.getUTCDate() + 1);
  }

  return Math.max(nextBoundaryUtc.getTime() - currentUtc.getTime() + 1000, 1000);
}

/** Текущее время в минутах от полуночи. */
export function nowMinutes(): number {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

/** Минут прошло с HH:MM (с учётом перехода через полночь). */
export function elapsedMin(startHHMM: string): number {
  const s = parseHHMM(startHHMM);
  if (s === null) return 0;
  let diff = nowMinutes() - s;
  if (diff < -60) diff += 1440;
  return Math.max(0, diff);
}

/** Минут до указанного HH:MM (отрицательное = уже прошло). */
export function minutesUntil(etaHHMM: string): number {
  const e = parseHHMM(etaHHMM);
  if (e === null) return 0;
  let diff = e - nowMinutes();
  if (diff < -720) diff += 1440;
  return diff;
}

/** Краткий формат: "Xч Yм" или "Yм". */
export function formatWait(minutes: number): string {
  if (minutes < 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

/** Развёрнутый формат: "Xч YYмин" или "Yмин". */
export function formatDuration(minutes: number): string {
  const abs = Math.abs(minutes);
  if (abs >= 60) {
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return `${h}ч ${m.toString().padStart(2, '0')}мин`;
  }
  return `${abs}мин`;
}

/** Вычисляет длительность между двумя HH:MM строками. */
export function calcDuration(start?: string, end?: string): string {
  if (!start || !end) return '-';
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  if (s === null || e === null) return '-';
  let diff = e - s;
  if (diff < 0) diff += 1440;
  return formatDuration(diff);
}

/** Текущая операционная дата в формате "DD.MM" (Москва, смена в 06:00). */
export function todayDDMM(): string {
  return getOperationalSheetName();
}

/** Для сортировки дат формата "DD.MM" → числовое значение. */
export function dateSortValue(d: string): number {
  const parts = d.split('.');
  if (parts.length !== 2) return 0;
  return parseInt(parts[1]) * 100 + parseInt(parts[0]);
}
