import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { Task, TranslationSet } from '../types';
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  ChevronsUpDown,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  Package,
  Timer,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { getOperationalIsoDate, parseHHMM } from '../utils/time';

interface ArrivalAnalyticsViewProps {
  t: TranslationSet;
}

type PeriodMode = 'week' | 'month' | 'custom';
type SortKey = 'id' | 'type' | 'eta' | 'arrival' | 'start' | 'downtime' | 'status' | 'zone' | 'operator' | 'date';
type SortDir = 'asc' | 'desc';
type DelayCategory = 'norm' | 'risk' | 'over' | 'none';

interface EnrichedTask extends Task {
  etaMin: number | null;
  arrivalMin: number | null;
  startMin: number | null;
  baseMin: number | null;
  downtime: number | null;
  arrivalWait: number | null;
  live: boolean;
  early: boolean;
  category: DelayCategory;
  displayDate: string;
  sourceDateIso: string | null;
}

interface ChartPoint {
  label: string;
  value: number;
}

const TERRITORY_LIMIT_MIN = 7 * 60;
const RISK_LIMIT_MIN = 5 * 60;

const PREFERRED_WS = ['Assembly', 'Paint', 'Welding', 'Баки', 'Запчасти'];

const CATEGORY_STYLE: Record<DelayCategory, { text: string; bg: string; border: string; dot: string; label: string }> = {
  norm: { text: '#34d399', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)', dot: '#34d399', label: 'НОРМА' },
  risk: { text: '#fbbf24', bg: 'rgba(245,158,11,0.13)', border: 'rgba(245,158,11,0.28)', dot: '#fbbf24', label: 'РИСК' },
  over: { text: '#f87171', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.32)', dot: '#f87171', label: '>7Ч' },
  none: { text: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', dot: 'rgba(255,255,255,0.2)', label: '—' },
};

function fmtDur(min: number | null): string {
  if (min === null || Number.isNaN(min)) return '—';
  const rounded = Math.max(0, Math.round(min));
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h <= 0) return `${m}м`;
  return m === 0 ? `${h}ч` : `${h}ч ${m}м`;
}

function fmtTime(min: number | null): string {
  if (min === null || Number.isNaN(min)) return '—';
  const normalized = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseIsoAsUtc(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatIso(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function isoToSheetDate(iso: string): string {
  const date = parseIsoAsUtc(iso);
  return `${String(date.getUTCDate()).padStart(2, '0')}.${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function sheetDateToIso(sheetDate?: string): string | null {
  if (!sheetDate || !/^\d{2}\.\d{2}$/.test(sheetDate)) return null;
  const year = parseIsoAsUtc(getOperationalIsoDate()).getUTCFullYear();
  const [day, month] = sheetDate.split('.').map(Number);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftIso(iso: string, days: number): string {
  const date = parseIsoAsUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatIso(date);
}

function buildIsoRange(period: PeriodMode, customFrom: string, customTo: string): string[] {
  let fromIso = customFrom;
  let toIso = customTo;

  if (period === 'week') fromIso = shiftIso(toIso, -6);
  if (period === 'month') fromIso = shiftIso(toIso, -29);

  let from = parseIsoAsUtc(fromIso);
  let to = parseIsoAsUtc(toIso);
  if (from.getTime() > to.getTime()) [from, to] = [to, from];

  const dates: string[] = [];
  for (const cur = new Date(from.getTime()); cur.getTime() <= to.getTime(); cur.setUTCDate(cur.getUTCDate() + 1)) {
    dates.push(formatIso(cur));
  }
  return dates;
}

function diffForward(endMin: number, startMin: number): number | null {
  const diff = endMin - startMin;
  return diff > 0 ? diff : 0;
}

function nowMoscowMinutes(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

function liveDiffFromBase(baseMin: number): number {
  const current = nowMoscowMinutes();
  const diff = current - baseMin;
  return diff > 0 ? diff : 0;
}

function getBaseTime(etaMin: number | null, arrivalMin: number | null): number | null {
  if (arrivalMin === null) return null;
  if (etaMin === null) return arrivalMin;
  return Math.max(etaMin, arrivalMin);
}

function getCategory(min: number | null): DelayCategory {
  if (min === null) return 'none';
  if (min <= RISK_LIMIT_MIN) return 'norm';
  if (min <= TERRITORY_LIMIT_MIN) return 'risk';
  return 'over';
}

function enrichTask(task: Task, isoDate: string, isToday: boolean): EnrichedTask | null {
  if (!task.id?.trim()) return null;

  const etaMin = parseHHMM(task.eta);
  const arrivalMin = parseHHMM(task.arrival_time);
  const startMin = parseHHMM(task.start_time);
  const baseMin = getBaseTime(etaMin, arrivalMin);
  const live = isToday && startMin === null && task.status !== 'DONE' && baseMin !== null;

  let downtime: number | null = null;
  if (baseMin !== null && startMin !== null) downtime = diffForward(startMin, baseMin);
  else if (live && baseMin !== null) downtime = liveDiffFromBase(baseMin);

  let arrivalWait: number | null = null;
  if (arrivalMin !== null && startMin !== null) arrivalWait = diffForward(startMin, arrivalMin);
  else if (isToday && arrivalMin !== null && startMin === null && task.status !== 'DONE') arrivalWait = liveDiffFromBase(arrivalMin);

  const taskIso = sheetDateToIso(task.sheet_date) ?? isoDate;
  return {
    ...task,
    etaMin,
    arrivalMin,
    startMin,
    baseMin,
    downtime,
    arrivalWait,
    live,
    early: etaMin !== null && arrivalMin !== null && arrivalMin < etaMin,
    category: getCategory(downtime),
    displayDate: task.sheet_date || isoToSheetDate(taskIso),
    sourceDateIso: taskIso,
  };
}

function colorForDelay(min: number | null): string {
  return CATEGORY_STYLE[getCategory(min)].text;
}

function seriesPath(points: ChartPoint[], width: number, height: number): { line: string; area: string; coords: Array<{ x: number; y: number }> } {
  const maxValue = Math.max(2, ...points.map((p) => p.value));
  const x0 = 8;
  const y0 = 14;
  const plotWidth = width - 16;
  const plotHeight = height - 42;
  const coords = points.map((p, i) => {
    const x = points.length === 1 ? x0 + plotWidth / 2 : x0 + (i / (points.length - 1)) * plotWidth;
    const y = y0 + (1 - p.value / maxValue) * plotHeight;
    return { x, y };
  });
  const line = coords.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1]?.x.toFixed(1) ?? width} ${y0 + plotHeight} L${x0} ${y0 + plotHeight} Z`;
  return { line, area, coords };
}

const ArrivalAnalyticsView: React.FC<ArrivalAnalyticsViewProps> = () => {
  const operationalIso = getOperationalIsoDate();
  const [period, setPeriod] = useState<PeriodMode>('week');
  const [customTo, setCustomTo] = useState(operationalIso);
  const [customFrom, setCustomFrom] = useState(shiftIso(operationalIso, -6));
  const [tasks, setTasks] = useState<EnrichedTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [wsFilter, setWsFilter] = useState('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('downtime');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const isoRange = useMemo(() => buildIsoRange(period, customFrom, customTo), [period, customFrom, customTo]);
  const isSingleTodayRange = isoRange.length === 1 && isoRange[0] === operationalIso;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all(
      isoRange.map(async (iso) => {
        const sheetDate = isoToSheetDate(iso);
        try {
          const dayTasks = await api.fetchHistory(sheetDate);
          return dayTasks
            .map((task) => enrichTask({ ...task, sheet_date: task.sheet_date || sheetDate }, iso, iso === operationalIso))
            .filter((task): task is EnrichedTask => Boolean(task));
        } catch {
          return [] as EnrichedTask[];
        }
      })
    ).then((days) => {
      if (!cancelled) setTasks(days.flat());
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isoRange, operationalIso]);

  const wsOptions = useMemo(() => {
    const fromData = Array.from(new Set(tasks.map((task) => task.type).filter((value): value is string => Boolean(value)))).sort();
    const ordered = [...PREFERRED_WS, ...fromData.filter((ws) => !PREFERRED_WS.includes(ws))];
    return ['ALL', ...ordered.filter((ws, index, arr) => arr.indexOf(ws) === index)];
  }, [tasks]);

  const filtered = useMemo(() => {
    const list = wsFilter === 'ALL' ? tasks : tasks.filter((task) => task.type === wsFilter);
    const dir = sortDir === 'asc' ? 1 : -1;
    const readNumber = (task: EnrichedTask, key: SortKey): number | null => {
      if (key === 'eta') return task.etaMin;
      if (key === 'arrival') return task.arrivalMin;
      if (key === 'start') return task.startMin;
      if (key === 'downtime') return task.downtime;
      if (key === 'date') return task.sourceDateIso ? parseIsoAsUtc(task.sourceDateIso).getTime() : null;
      return null;
    };

    return [...list].sort((a, b) => {
      const avn = readNumber(a, sortKey);
      const bvn = readNumber(b, sortKey);
      if (avn !== null || bvn !== null) return ((avn ?? -1) - (bvn ?? -1)) * dir;
      const av = sortKey === 'arrival' ? a.arrival_time : sortKey === 'start' ? a.start_time : (a as unknown as Record<string, unknown>)[sortKey];
      const bv = sortKey === 'arrival' ? b.arrival_time : sortKey === 'start' ? b.start_time : (b as unknown as Record<string, unknown>)[sortKey];
      return String(av ?? '').localeCompare(String(bv ?? ''), 'ru') * dir;
    });
  }, [sortDir, sortKey, tasks, wsFilter]);

  const completed = filtered.filter((task) => !task.live && task.downtime !== null);
  const live = filtered.filter((task) => task.live);
  const over7Completed = completed.filter((task) => (task.downtime ?? 0) > TERRITORY_LIMIT_MIN);
  const liveOver7 = live.filter((task) => (task.downtime ?? 0) > TERRITORY_LIMIT_MIN);
  const avgDelay = completed.length ? Math.round(completed.reduce((sum, task) => sum + (task.downtime ?? 0), 0) / completed.length) : null;
  const allKnownDelays = filtered.map((task) => task.downtime).filter((value): value is number => value !== null);
  const maxDelay = allKnownDelays.length ? Math.max(...allKnownDelays) : null;
  const withoutViolationPct = completed.length
    ? Math.round((completed.filter((task) => (task.downtime ?? 0) <= TERRITORY_LIMIT_MIN).length / completed.length) * 100)
    : null;
  const arrivalWaits = completed.map((task) => task.arrivalWait).filter((value): value is number => value !== null);
  const arrivalAvg = arrivalWaits.length ? Math.round(arrivalWaits.reduce((sum, value) => sum + value, 0) / arrivalWaits.length) : null;
  const arrivalMax = arrivalWaits.length ? Math.max(...arrivalWaits) : null;
  const earlyCount = completed.filter((task) => task.early).length;

  const chartPoints = useMemo<ChartPoint[]>(() => {
    return isoRange.map((iso) => ({
      label: isoToSheetDate(iso).slice(0, 2),
      value: tasks.filter((task) => task.sourceDateIso === iso && !task.live && (task.downtime ?? 0) > TERRITORY_LIMIT_MIN).length,
    }));
  }, [isoRange, tasks]);

  const chart = seriesPath(chartPoints.length ? chartPoints : [{ label: '', value: 0 }], 900, 200);
  const spark = seriesPath(chartPoints.length ? chartPoints : [{ label: '', value: 0 }], 120, 34);
  const chartTotal = chartPoints.reduce((sum, point) => sum + point.value, 0);
  const chartPeak = Math.max(0, ...chartPoints.map((point) => point.value));
  const maxChartValue = Math.max(2, chartPeak);
  const gridLines = [maxChartValue, Math.round(maxChartValue / 2), 0].map((value) => ({
    value,
    y: 14 + (1 - value / maxChartValue) * 158,
  }));

  const antirating = completed
    .filter((task) => (task.downtime ?? 0) > 0)
    .sort((a, b) => (b.downtime ?? 0) - (a.downtime ?? 0))
    .slice(0, 9);
  const antiratingMax = Math.max(1, antirating[0]?.downtime ?? 1);

  const periodLabel = period === 'week' ? 'за неделю' : period === 'month' ? 'за месяц' : 'за период';
  const periodTag = period === 'week' ? '· неделя' : period === 'month' ? '· месяц' : '';
  const heroCritical = over7Completed.length > 0;
  const heroAccent = heroCritical ? '#f87171' : '#34d399';
  const heroBg = heroCritical
    ? 'radial-gradient(700px 300px at 12% -20%, rgba(239,68,68,0.12), transparent 60%), rgba(239,68,68,0.05)'
    : 'rgba(16,185,129,0.045)';
  const heroBorder = heroCritical ? 'rgba(239,68,68,0.22)' : 'rgba(52,211,153,0.2)';
  const spotlight = liveOver7.sort((a, b) => (b.downtime ?? 0) - (a.downtime ?? 0));
  const liveCards = live.slice().sort((a, b) => (b.downtime ?? 0) - (a.downtime ?? 0));

  const handleSort = (key: SortKey) => {
    api.auditEvent('ARRIVAL_SORT_CHANGE', {
      entityType: 'page',
      entityId: 'arrival',
      oldValue: { sortKey, sortDir },
      newValue: { sortKey: key, sortDir: sortKey === key ? (sortDir === 'asc' ? 'desc' : 'asc') : 'desc' },
      details: { period, wsFilter },
    }, `arrival-sort:${key}`, 2000);
    if (sortKey === key) setSortDir((current) => current === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ keyName }: { keyName: SortKey }) => {
    if (sortKey !== keyName) return <ChevronsUpDown size={11} style={{ opacity: 0.4 }} />;
    return sortDir === 'asc' ? <ChevronUp size={11} color="#fbbf24" /> : <ChevronDown size={11} color="#fbbf24" />;
  };

  const setPresetPeriod = (next: PeriodMode) => {
    api.auditEvent('ARRIVAL_PERIOD_CHANGE', {
      entityType: 'page',
      entityId: 'arrival',
      oldValue: period,
      newValue: next,
      details: { customFrom, customTo },
    }, `arrival-period:${next}`, 2000);
    setPeriod(next);
    if (next === 'week') setCustomFrom(shiftIso(customTo, -6));
    if (next === 'month') setCustomFrom(shiftIso(customTo, -29));
  };

  const handleCustomFromChange = (nextFrom: string) => {
    api.auditEvent('ARRIVAL_DATE_RANGE_CHANGE', {
      entityType: 'page',
      entityId: 'arrival',
      oldValue: { from: customFrom, to: customTo },
      newValue: { from: nextFrom, to: customTo },
      details: { field: 'from' },
    }, `arrival-from:${nextFrom}`, 2000);
    setCustomFrom(nextFrom);
    setPeriod('custom');
  };

  const handleCustomToChange = (nextTo: string) => {
    const nextFrom = period !== 'custom' ? shiftIso(nextTo, period === 'week' ? -6 : -29) : customFrom;
    api.auditEvent('ARRIVAL_DATE_RANGE_CHANGE', {
      entityType: 'page',
      entityId: 'arrival',
      oldValue: { from: customFrom, to: customTo },
      newValue: { from: nextFrom, to: nextTo },
      details: { field: 'to', period },
    }, `arrival-to:${nextTo}`, 2000);
    setCustomTo(nextTo);
    if (period !== 'custom') setCustomFrom(nextFrom);
  };

  const handleWsFilterChange = (nextWs: string) => {
    api.auditEvent('ARRIVAL_WS_FILTER_CHANGE', {
      entityType: 'page',
      entityId: 'arrival',
      oldValue: wsFilter,
      newValue: nextWs,
      details: { period, customFrom, customTo },
    }, `arrival-ws:${nextWs}`, 2000);
    setWsFilter(nextWs);
  };

  const segmentClass = (value: PeriodMode) => value === period ? 'arrival-segment arrival-segment-active' : 'arrival-segment';
  const chipClass = (value: string) => value === wsFilter ? 'arrival-chip arrival-chip-active' : 'arrival-chip';

  return (
    <div className="arrival-design">
      <div className="arrival-inner">
        <section className="arrival-filter-panel">
          <div className="arrival-filter-top">
            <div className="arrival-title-row">
              <div className="arrival-title-icon"><Timer size={20} /></div>
              <div>
                <h2>Простой на территории</h2>
                <p>Время от ожидаемого/фактического заезда до начала разгрузки · порог нарушения <b>7 часов</b></p>
              </div>
            </div>

            <div className="arrival-period-controls">
              <div className="arrival-segments">
                <button onClick={() => setPresetPeriod('week')} className={segmentClass('week')}>Неделя</button>
                <button onClick={() => setPresetPeriod('month')} className={segmentClass('month')}>Месяц</button>
                <button onClick={() => setPeriod('custom')} className={segmentClass('custom')}>Диапазон</button>
              </div>
              <div className="arrival-date-range">
                <Calendar size={15} />
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => handleCustomFromChange(event.target.value)}
                />
                <span>—</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => handleCustomToChange(event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="arrival-ws-row">
            <span>КАТЕГОРИЯ W/S</span>
            <div className="arrival-chip-list">
              {wsOptions.map((ws) => (
                <button key={ws} onClick={() => handleWsFilterChange(ws)} className={chipClass(ws)}>
                  {ws === 'ALL' ? 'Все W/S' : ws}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="arrival-hero" style={{ background: heroBg, borderColor: heroBorder }}>
          <div className="arrival-hero-main">
            <div className="arrival-hero-summary">
              <div className="arrival-hero-label">
                <div className="arrival-hero-icon" style={{ color: heroAccent, borderColor: heroBorder }}>
                  <Truck size={22} />
                </div>
                <div>Задержались на<br />территории &gt; 7 часов</div>
              </div>

              <div className="arrival-hero-number">
                <span style={{ color: heroAccent }}>{over7Completed.length}</span>
                <svg viewBox="0 0 120 34" width="118" height="34" preserveAspectRatio="none">
                  <path d={spark.area} fill={heroCritical ? 'rgba(239,68,68,0.14)' : 'rgba(52,211,153,0.14)'} />
                  <path d={spark.line} fill="none" stroke={heroAccent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </svg>
              </div>
              <div className="arrival-hero-sub">
                {heroCritical ? 'нарушений за период · из них критичны прямо сейчас' : 'за выбранный период нарушений норматива нет'}
              </div>

              <div className="arrival-hero-kpis">
                <div>
                  <span>КРИТИЧНЫ СЕЙЧАС</span>
                  <strong style={{ color: liveOver7.length > 0 ? '#f87171' : '#34d399' }}>{liveOver7.length}</strong>
                </div>
                <div>
                  <span>В ОЧЕРЕДИ ВСЕГО</span>
                  <strong>{live.length}</strong>
                </div>
              </div>
            </div>

            <div className="arrival-spotlight">
              <div className="arrival-section-head">
                <span>ТЕКУЩИЕ КРИТИЧЕСКИЕ СЛУЧАИ</span>
                <em>требуют немедленного решения</em>
              </div>
              {spotlight.length > 0 ? (
                <div className="arrival-spotlight-list arrival-sx">
                  {spotlight.map((task, index) => (
                    <article key={`${task.sourceDateIso ?? task.displayDate}-${task.id}-spot-${index}`} className="arrival-spot-card">
                      <div className="arrival-card-top">
                        <span>{task.type || 'W/S'}</span>
                        <i />
                      </div>
                      <strong>{task.id}</strong>
                      <p><MapPin size={11} /> {task.zone || '—'} · {task.operator || '—'}</p>
                      <div className="arrival-spot-bottom">
                        <div>
                          <span>ПРОСТОЙ</span>
                          <b>{fmtDur(task.downtime)}</b>
                        </div>
                        <p>план {fmtTime(task.etaMin)}<br />заезд {fmtTime(task.arrivalMin)}</p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="arrival-empty-good">
                  <CheckCircle size={28} />
                  <div>
                    <strong>Критических задержек сейчас нет</strong>
                    <span>Все машины на территории в пределах норматива</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="arrival-kpi-grid">
          {[
            { icon: <AlertTriangle size={15} />, label: `ЗАДЕРЖЕК >7Ч ${periodTag}`, value: over7Completed.length, color: over7Completed.length > 0 ? '#f87171' : '#34d399', hint: 'нарушений норматива территории', ghost: <AlertTriangle size={92} /> },
            { icon: <Clock size={15} />, label: 'СРЕДНИЙ ПРОСТОЙ', value: fmtDur(avgDelay), color: colorForDelay(avgDelay), hint: 'целевой KPI: ≤ 5ч на территории' },
            { icon: <TrendingUp size={15} />, label: 'МАКСИМУМ', value: fmtDur(maxDelay), color: colorForDelay(maxDelay), hint: 'самый долгий простой за период' },
            { icon: <CheckCircle size={15} />, label: 'БЕЗ НАРУШЕНИЯ', value: withoutViolationPct === null ? '—' : `${withoutViolationPct}%`, color: withoutViolationPct === null ? 'rgba(255,255,255,0.3)' : withoutViolationPct >= 80 ? '#34d399' : withoutViolationPct >= 50 ? '#fbbf24' : '#f87171', hint: 'поставок уложились в норматив', ghost: <CheckCircle size={92} /> },
          ].map((item) => (
            <article key={item.label} className="arrival-kpi-card">
              {item.ghost && <div className="arrival-kpi-ghost">{item.ghost}</div>}
              <div><span style={{ color: item.color }}>{item.icon}</span><span>{item.label}</span></div>
              <strong style={{ color: item.color }}>{item.value}</strong>
              <p>{item.hint}</p>
            </article>
          ))}
        </section>

        <section className="arrival-chart-grid">
          <div className="arrival-chart-card">
            <div className="arrival-section-head">
              <span><TrendingUp size={16} /> Динамика задержек &gt; 7 часов</span>
              <em>{periodLabel} · по дням</em>
            </div>
            <div className="arrival-chart-stats">
              <div><strong>{chartTotal}</strong><span>всего за период</span></div>
              <div><strong style={{ color: chartPeak >= 6 ? '#f87171' : chartPeak >= 3 ? '#fbbf24' : '#34d399' }}>{chartPeak}</strong><span>пик за день</span></div>
            </div>
            <svg viewBox="0 0 900 200" width="100%" preserveAspectRatio="xMidYMid meet" className="arrival-chart">
              <defs>
                <linearGradient id="agrArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(245,158,11,0.34)" />
                  <stop offset="100%" stopColor="rgba(245,158,11,0)" />
                </linearGradient>
              </defs>
              {gridLines.map((line) => (
                <g key={line.value}>
                  <line x1="8" y1={line.y.toFixed(1)} x2="892" y2={line.y.toFixed(1)} stroke="rgba(255,255,255,0.07)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  <text x="0" y={(line.y + 3).toFixed(1)} fill="rgba(255,255,255,0.3)" fontSize="10" fontFamily="JetBrains Mono">{line.value}</text>
                </g>
              ))}
              <path d={chart.area} fill="url(#agrArea)" />
              <path d={chart.line} fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              {chart.coords.map((point, index) => (
                <g key={`${point.x}-${index}`}>
                  {chartPoints.length <= 10 && <circle cx={point.x.toFixed(1)} cy={point.y.toFixed(1)} r="3.5" fill="#0a0c12" stroke="#fbbf24" strokeWidth="2.5" />}
                  {(chartPoints.length <= 10 || index % 5 === 0 || index === chartPoints.length - 1) && (
                    <text x={point.x.toFixed(1)} y="196" fill="rgba(255,255,255,0.4)" fontSize="10.5" fontFamily="JetBrains Mono" textAnchor="middle">{chartPoints[index]?.label}</text>
                  )}
                </g>
              ))}
            </svg>
          </div>

          <div className="arrival-mini-card">
            <div className="arrival-section-title"><Timer size={16} /> <span>Аналитика прибытия</span></div>
            <p>ожидание в очереди после заезда</p>
            <div className="arrival-mini-list">
              <div><span><b>Среднее ожидание</b><em>от заезда до разгрузки</em></span><strong style={{ color: colorForDelay(arrivalAvg) }}>{fmtDur(arrivalAvg)}</strong></div>
              <div><span><b>Макс. ожидание</b><em>пиковая очередь</em></span><strong style={{ color: colorForDelay(arrivalMax) }}>{fmtDur(arrivalMax)}</strong></div>
              <div className="arrival-mini-blue"><span><b>Приехали раньше плана</b><em>не учтено в простое территории</em></span><strong>{earlyCount}</strong></div>
            </div>
          </div>
        </section>

        <section className="arrival-live">
          <div className="arrival-live-head">
            <div>
              <i />
              <span>Прямо сейчас на территории</span>
              <em>накопленный простой в реальном времени</em>
            </div>
            <div className="arrival-legend">
              <span><i style={{ background: '#34d399' }} />в норме</span>
              <span><i style={{ background: '#fbbf24' }} />близко к 7ч</span>
              <span><i style={{ background: '#f87171' }} />превышение</span>
            </div>
          </div>
          {liveCards.length > 0 ? (
            <div className="arrival-live-grid">
              {liveCards.map((task, index) => {
                const cat = CATEGORY_STYLE[task.category];
                const tag = task.category === 'over' ? 'ПРЕВЫШЕНИЕ' : task.category === 'risk' ? 'БЛИЗКО К 7Ч' : 'В НОРМЕ';
                return (
                  <article key={`${task.sourceDateIso ?? task.displayDate}-${task.id}-live-${index}`} className={`arrival-live-card arrival-live-${task.category}`}>
                    <div className="arrival-card-top">
                      <span>{task.type || 'W/S'}</span>
                      <b style={{ color: cat.text, background: cat.bg, borderColor: cat.border }}>{tag}</b>
                    </div>
                    <div className="arrival-live-main">
                      <div>
                        <strong>{task.id}</strong>
                        <p>план {fmtTime(task.etaMin)} · заезд {fmtTime(task.arrivalMin)}</p>
                      </div>
                      <div>
                        <span>СТОИТ УЖЕ</span>
                        <strong style={{ color: cat.text }}>{fmtDur(task.downtime)}</strong>
                      </div>
                    </div>
                    <div className="arrival-progress"><span style={{ width: `${Math.min(100, Math.round(((task.downtime ?? 0) / TERRITORY_LIMIT_MIN) * 100))}%`, background: cat.text }} /></div>
                    <div className="arrival-live-foot"><span>{task.zone || '—'} · {task.operator || '—'}</span><span>порог 7ч</span></div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="arrival-live-empty">{isSingleTodayRange ? 'Сейчас на территории нет машин, ожидающих разгрузки' : 'Для выбранного периода текущая очередь доступна только по сегодняшнему дню'}</div>
          )}
        </section>

        <section className="arrival-bottom-grid">
          <aside className="arrival-antirating">
            <div className="arrival-section-title"><TrendingUp size={16} /> <span>Топ долгих простоев</span></div>
            {antirating.length > 0 ? (
              <div className="arrival-antirating-list">
                {antirating.map((task, index) => {
                  const cat = CATEGORY_STYLE[task.category];
                  return (
                    <div key={`${task.sourceDateIso ?? task.displayDate}-${task.id}-top-${index}`} className="arrival-antirating-row">
                      <div><strong>{task.id}</strong><span>{task.type || 'W/S'}</span></div>
                      <div>
                        <span style={{ width: `${Math.round(((task.downtime ?? 0) / antiratingMax) * 100)}%`, background: cat.bg }} />
                        <b style={{ color: cat.text }}>{fmtDur(task.downtime)}</b>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="arrival-panel-empty"><Package size={32} /> Нет данных для антирейтинга</div>
            )}
          </aside>

          <section className="arrival-table-card">
            <div className="arrival-table-head">
              <div>
                <span>Проблемные машины</span>
                <div className="arrival-table-legend">
                  <i style={{ background: '#34d399' }} />НОРМА ≤5Ч
                  <i style={{ background: '#fbbf24' }} />РИСК 5–7Ч
                  <i style={{ background: '#f87171' }} />&gt;7Ч
                </div>
              </div>
              <strong>Показано {filtered.length} из {tasks.length}</strong>
            </div>

            <div className="arrival-table">
              <div className="arrival-table-row arrival-table-header">
                <div>#</div>
                {[
                  ['id', 'Контейнер'],
                  ['type', 'W/S'],
                  ['eta', 'План'],
                  ['arrival', 'Факт'],
                  ['start', 'Разгрузка'],
                  ['downtime', 'Простой'],
                  ['status', 'Статус'],
                  ['zone', 'Зона'],
                  ['operator', 'Оператор'],
                  ['date', 'Дата'],
                ].map(([key, label]) => (
                  <button key={key} onClick={() => handleSort(key as SortKey)} className={sortKey === key ? 'active' : ''}>
                    {label}<SortIcon keyName={key as SortKey} />
                  </button>
                ))}
              </div>

              <div className="arrival-table-body arrival-sy">
                {loading ? (
                  <div className="arrival-table-empty"><Timer size={24} /> Загрузка данных...</div>
                ) : filtered.length === 0 ? (
                  <div className="arrival-table-empty"><Package size={34} /> Нет данных за выбранный период</div>
                ) : (
                  filtered.map((task, index) => {
                    const cat = CATEGORY_STYLE[task.category];
                    return (
                      <div key={`${task.displayDate}-${task.id}-${index}`} className={`arrival-table-row ${task.live ? `arrival-row-live arrival-row-${task.category}` : ''}`}>
                        <div>{index + 1}</div>
                        <div className="arrival-id-cell">
                          <i style={{ background: cat.dot }} />
                          <span><strong>{task.id}</strong>{task.live && <em>{task.category === 'over' ? 'ПРЕВЫШЕНИЕ 7Ч' : 'НА ТЕРРИТОРИИ'}</em>}</span>
                        </div>
                        <div><b className="arrival-ws-badge">{task.type || '—'}</b></div>
                        <div>{fmtTime(task.etaMin)}</div>
                        <div>{fmtTime(task.arrivalMin)}{task.early && <em>раньше</em>}</div>
                        <div>{task.live ? '—' : fmtTime(task.startMin)}</div>
                        <div><b className="arrival-delay-badge" style={{ color: cat.text, background: cat.bg, borderColor: cat.border }}>{fmtDur(task.downtime)}</b></div>
                        <div><b className="arrival-status-badge" style={{ color: cat.text, background: cat.bg, borderColor: cat.border }}>{task.live ? (task.category === 'over' ? '>7Ч' : 'НА ТЕРР.') : cat.label}</b></div>
                        <div>{task.zone || '—'}</div>
                        <div>{task.operator || '—'}</div>
                        <div>{task.displayDate}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        </section>

        <footer className="arrival-footer">AGR WAREHOUSE · АНАЛИТИКА ВРЕМЕНИ ПРОСТОЯ</footer>
      </div>
    </div>
  );
};

export default ArrivalAnalyticsView;
