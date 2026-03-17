export function parseHHMM(s: string | undefined): number | null {
  if (!s || !s.trim()) return null;
  const cleaned = s.trim().replace(/[^0-9:]/g, '');
  const m = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
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

/** Сегодняшняя дата в формате "DD.MM". */
export function todayDDMM(): string {
  const d = new Date();
  return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2);
}

/** Для сортировки дат формата "DD.MM" → числовое значение. */
export function dateSortValue(d: string): number {
  const parts = d.split('.');
  if (parts.length !== 2) return 0;
  return parseInt(parts[1]) * 100 + parseInt(parts[0]);
}
