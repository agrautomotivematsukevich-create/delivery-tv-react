export function parseHHMM(s: string | undefined): number | null {
  if (!s || !s.trim()) return null;
  const cleaned = s.trim().replace(/[^0-9:]/g, '');
  const m = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

export const MOSCOW_TIME_ZONE = 'Europe/Moscow';
// Day model: STRICT CALENDAR DAY (no 07:50 operational cutoff). The day boundary is midnight;
// carry-over of unfinished work is handled on the backend (current calendar sheet + unfinished
// rows of the previous calendar sheet). These constants now mark the midnight boundary.
export const OPERATIONAL_DAY_START_HOUR = 0;
export const OPERATIONAL_DAY_START_MINUTE = 0;

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
  cutoffMinute: number;
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

// Calendar-day model: the operational day IS the calendar day (no 07:50 cutoff, no
// 00:00–07:49 = previous-day logic). operational* fields alias the calendar day for back-compat;
// previousSheetName = calendar yesterday. Carry-over of unfinished work is handled on the backend.
export function getOperationalDateInfo(now: Date = new Date()): OperationalDateInfo {
  const moscowParts = getMoscowDateParts(now);
  const calendarUtc = buildUtcDateFromMoscowParts(moscowParts);
  const previousUtc = new Date(calendarUtc.getTime());
  previousUtc.setUTCDate(previousUtc.getUTCDate() - 1);

  return {
    calendarDate: formatUtcIsoDate(calendarUtc),
    operationalDate: formatUtcIsoDate(calendarUtc),
    calendarSheetName: formatUtcSheetName(calendarUtc),
    operationalSheetName: formatUtcSheetName(calendarUtc),
    previousSheetName: formatUtcSheetName(previousUtc),
    hour: moscowParts.hour,
    minute: moscowParts.minute,
    second: moscowParts.second,
    cutoffHour: OPERATIONAL_DAY_START_HOUR,
    cutoffMinute: OPERATIONAL_DAY_START_MINUTE,
    isBeforeOperationalCutoff: false,
  };
}

export function getOperationalIsoDate(now: Date = new Date()): string {
  return getOperationalDateInfo(now).operationalDate;
}

export function getOperationalSheetName(now: Date = new Date()): string {
  return getOperationalDateInfo(now).operationalSheetName;
}

// Time until the next calendar-day boundary = next local midnight (Moscow). +1s guards against
// the timer firing a hair early. Drives the "roll over to the new day's sheet" refresh.
export function getMillisecondsUntilNextOperationalBoundary(now: Date = new Date()): number {
  const parts = getMoscowDateParts(now);
  const currentUtc = buildUtcDateFromMoscowParts(parts);
  const nextMidnightUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0));
  nextMidnightUtc.setUTCDate(nextMidnightUtc.getUTCDate() + 1);
  return Math.max(nextMidnightUtc.getTime() - currentUtc.getTime() + 1000, 1000);
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

/** Текущая календарная дата в формате "DD.MM" (Москва, граница суток — полночь). */
export function todayDDMM(): string {
  return getOperationalSheetName();
}

/** Для сортировки дат формата "DD.MM" → числовое значение. */
export function dateSortValue(d: string): number {
  const parts = d.split('.');
  if (parts.length !== 2) return 0;
  return parseInt(parts[1]) * 100 + parseInt(parts[0]);
}
