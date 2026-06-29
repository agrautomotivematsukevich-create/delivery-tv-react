import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '../services/api';
import { PlanRow, Task } from '../types';
import { getOperationalDateInfo } from '../utils/time';

interface Props {
  allTasks: Task[];
  isTasksLoading: boolean;
  preview?: boolean;
  readOnly?: boolean;
}

type LotStatus = 'not_started' | 'low' | 'progress' | 'done';
type WsGroupKey = 'welding' | 'assembly' | 'paint' | 'other';

interface LotPlanRow extends PlanRow {
  sheetDate: string;
  sequence: number;
}

interface LotProgress {
  lot: string;
  ws: string[];
  wsSegments: WsSegment[];
  done: number;
  total: number;
  inProgress: number;
  notStarted: number;
  unfinished: number;
  percent: number;
  lastSequence: number;
  status: LotStatus;
}

interface WsSegment {
  key: WsGroupKey;
  label: string;
  count: number;
  percent: number;
  color: string;
}

type RowTone = {
  accent: string;
  color: string;
  bg: string;
  border: string;
  badgeBg: string;
  badgeBorder: string;
  badgeColor: string;
  gradient: string;
  shadow: string;
};

type PreviewLotFixture = {
  lot: string;
  ws: string | string[];
  total: number;
  done: number;
  active?: number;
  dayOffset?: number;
};

const LOT_PLAN_REFRESH_MS = 180000;
const LOT_LOOKBACK_DAYS = 7;
const MIN_ROWS_PER_LOT = 3;
const MAX_DESKTOP_ACTIVE_LOTS = 6;
const MAX_COMPACT_ACTIVE_LOTS = 5;
const MAX_DONE_LOTS = 3;
const LOT_NO_PATTERN = /^43115-[A-Z0-9]+$/;

const PREVIEW_LOT_FIXTURES: PreviewLotFixture[] = [
  { lot: '43115-CT13J20260410', ws: ['Welding', 'Assembly'], total: 3, done: 1, active: 1, dayOffset: 0 },
  { lot: '43115-CT13J20260408', ws: 'Assembly', total: 13, done: 9, active: 2, dayOffset: 0 },
  { lot: '43115-CM32T20260306', ws: ['Paint', 'Welding'], total: 19, done: 14, active: 3, dayOffset: 1 },
  { lot: '43115-CT13J20260412', ws: 'Assembly', total: 17, done: 14, active: 1, dayOffset: 2 },
  { lot: '43115-CT13J20260413', ws: 'Paint', total: 11, done: 10, active: 1, dayOffset: 3 },
  { lot: '43115-CT13J20260414', ws: 'Welding', total: 14, done: 0, dayOffset: 4 },
  { lot: '43115-CM32T20260401', ws: 'Assembly', total: 8, done: 8, dayOffset: 0 },
  { lot: '43115-CM32T20260402', ws: 'Paint', total: 9, done: 9, dayOffset: 1 },
  { lot: '43115-CM32T20260403', ws: 'Welding', total: 10, done: 10, dayOffset: 2 },
  { lot: '43115-CM32T20260404', ws: 'Assembly', total: 7, done: 7, dayOffset: 3 },
  { lot: '43115-CT13J20260405', ws: 'Paint', total: 2, done: 1, active: 1, dayOffset: 0 },
];

const fontUrl = 'https://fonts.googleapis.com/css2?family=Saira:wght@600;700;800;900&family=Manrope:wght@500;600;700;800&family=JetBrains+Mono:wght@500;700;800&display=swap';

const normalizeId = (value: string | undefined): string => (value || '').trim().toUpperCase();

const normalizeLotNo = (value: string | undefined): string => {
  const lot = (value || '').trim().toUpperCase();
  return LOT_NO_PATTERN.test(lot) ? lot : '';
};

const formatWs = (ws: string[]): string => (ws.length > 0 ? ws.join(' / ') : 'W/S не указан');

const middleEllipsis = (value: string, maxLength = 26): string => {
  if (value.length <= maxLength) return value;
  const head = Math.ceil((maxLength - 3) * 0.58);
  const tail = maxLength - 3 - head;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
};

const normalizeWsGroup = (value: string | undefined): WsGroupKey => {
  const ws = (value || '').trim().toUpperCase();
  if (ws.includes('WELD')) return 'welding';
  if (ws.includes('ASSY') || ws.includes('ASSEMB')) return 'assembly';
  if (ws.includes('PAINT')) return 'paint';
  return 'other';
};

const WS_SEGMENT_META: Record<WsGroupKey, { label: string; color: string }> = {
  welding: { label: 'Welding', color: '#4DA8FF' },
  assembly: { label: 'Assembly', color: '#FBBF24' },
  paint: { label: 'Paint', color: '#C084FC' },
  other: { label: 'Other', color: 'rgba(255,255,255,.34)' },
};

const createEmptyWsCounts = (): Record<WsGroupKey, number> => ({
  welding: 0,
  assembly: 0,
  paint: 0,
  other: 0,
});

const buildWsSegments = (wsCounts: Record<WsGroupKey, number>, total: number): WsSegment[] => (
  (['welding', 'assembly', 'paint', 'other'] as WsGroupKey[])
    .map((key) => ({
      key,
      label: WS_SEGMENT_META[key].label,
      count: wsCounts[key],
      percent: total > 0 ? (wsCounts[key] / total) * 100 : 0,
      color: WS_SEGMENT_META[key].color,
    }))
    .filter((segment) => segment.count > 0)
);

const formatSheetName = (date: Date): string => {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}.${month}`;
};

// Lot window: TOMORROW + today + (days-2) previous calendar days. Including tomorrow lets a Lot
// No that already spilled into the next day's plan be aggregated as one lot. Mirrors the backend
// getTvLotProgressSheetNames_ used by the read-only TV path.
const getRecentOperationalSheetNames = (days = LOT_LOOKBACK_DAYS): string[] => {
  const { operationalDate } = getOperationalDateInfo();
  const [year, month, day] = operationalDate.split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  return Array.from({ length: days }, (_, index) => {
    const offset = 1 - index; // +1 (tomorrow), 0 (today), -1, … , -(days-2)
    const date = new Date(base.getTime());
    date.setUTCDate(base.getUTCDate() + offset);
    return formatSheetName(date);
  });
};

const getStatus = (done: number, total: number, inProgress: number): LotStatus => {
  if (done >= total) return 'done';
  if (done === 0 && inProgress === 0) return 'not_started';
  return done / total < 0.5 ? 'low' : 'progress';
};

const getTone = (status: LotStatus, percent: number): RowTone => {
  if (status === 'done') {
    return {
      accent: '#00E676',
      color: '#00E676',
      bg: 'rgba(0,230,118,.08)',
      border: 'rgba(0,230,118,.22)',
      badgeBg: 'rgba(0,230,118,.14)',
      badgeBorder: 'rgba(0,230,118,.28)',
      badgeColor: '#78f5ad',
      gradient: 'linear-gradient(90deg,#00E676,#0bbf6a)',
      shadow: 'rgba(0,230,118,.42)',
    };
  }

  if (status === 'not_started') {
    return {
      accent: '#778293',
      color: 'rgba(255,255,255,.58)',
      bg: 'rgba(255,255,255,.035)',
      border: 'rgba(255,255,255,.12)',
      badgeBg: 'rgba(255,255,255,.06)',
      badgeBorder: 'rgba(255,255,255,.14)',
      badgeColor: 'rgba(255,255,255,.68)',
      gradient: 'linear-gradient(90deg,#778293,#98a4b3)',
      shadow: 'rgba(255,255,255,.18)',
    };
  }

  if (status === 'low') {
    return {
      accent: '#FBBF24',
      color: '#FBBF24',
      bg: 'rgba(251,191,36,.08)',
      border: 'rgba(251,191,36,.26)',
      badgeBg: 'rgba(251,191,36,.15)',
      badgeBorder: 'rgba(251,191,36,.28)',
      badgeColor: '#f8d779',
      gradient: 'linear-gradient(90deg,#FBBF24,#f59e0b)',
      shadow: 'rgba(251,191,36,.45)',
    };
  }

  if (percent >= 80) {
    return {
      accent: '#22D3C5',
      color: '#22D3C5',
      bg: 'rgba(34,211,197,.075)',
      border: 'rgba(34,211,197,.26)',
      badgeBg: 'rgba(34,211,197,.14)',
      badgeBorder: 'rgba(34,211,197,.28)',
      badgeColor: '#72eee6',
      gradient: 'linear-gradient(90deg,#22D3C5,#13a89c)',
      shadow: 'rgba(34,211,197,.45)',
    };
  }

  return {
    accent: '#4DA8FF',
    color: '#4DA8FF',
    bg: 'rgba(77,168,255,.075)',
    border: 'rgba(77,168,255,.26)',
    badgeBg: 'rgba(77,168,255,.14)',
    badgeBorder: 'rgba(77,168,255,.28)',
    badgeColor: '#9ec5ff',
    gradient: 'linear-gradient(90deg,#4DA8FF,#2f7fe0)',
    shadow: 'rgba(77,168,255,.45)',
  };
};

const statusLabel = (status: LotStatus): string => {
  if (status === 'done') return 'Закрыто';
  if (status === 'not_started') return 'Не начато';
  return 'В работе';
};

const makeTaskKey = (sheetDate: string | undefined, id: string | undefined): string => `${(sheetDate || '').trim()}|${normalizeId(id)}`;

const makePreviewData = (): { planRows: LotPlanRow[]; tasks: Task[] } => {
  const sheetNames = getRecentOperationalSheetNames();
  let index = 1;
  const planRows: LotPlanRow[] = [];
  const tasks: Task[] = [];

  PREVIEW_LOT_FIXTURES.forEach((fixture, fixtureIndex) => {
    const wsList = Array.isArray(fixture.ws) ? fixture.ws : [fixture.ws];
    const sheetDate = sheetNames[Math.min(fixture.dayOffset || 0, sheetNames.length - 1)] || sheetNames[0] || '';
    const dayRank = LOT_LOOKBACK_DAYS - (fixture.dayOffset || 0);

    Array.from({ length: fixture.total }, (_, rowInLot) => {
      const id = `PREVIEW-${String(fixtureIndex + 1).padStart(2, '0')}-${String(rowInLot + 1).padStart(3, '0')}`;
      const rowIndex = 5 + rowInLot;
      planRows.push({
        rowIndex,
        index: index++,
        lot: fixture.lot,
        ws: wsList[rowInLot % wsList.length],
        pallets: '',
        id,
        phone: '',
        eta: `${String(8 + (fixtureIndex % 7)).padStart(2, '0')}:${String((rowInLot * 5) % 60).padStart(2, '0')}`,
        sheetDate,
        sequence: dayRank * 100000 + rowIndex,
      });

      const activeLimit = fixture.done + (fixture.active || 0);
      const status = rowInLot < fixture.done ? 'DONE' : rowInLot < activeLimit ? 'ACTIVE' : 'WAIT';
      tasks.push({
        id,
        status,
        time: status === 'DONE' ? '09:00' : status === 'ACTIVE' ? '09:35' : '10:05',
        start_time: status !== 'WAIT' ? '08:18' : undefined,
        end_time: status === 'DONE' ? '08:44' : undefined,
        zone: status !== 'WAIT' ? 'G3' : undefined,
        sheet_date: sheetDate,
      });
    });
  });

  planRows.push(
    { rowIndex: 900, index: 900, lot: '4800169078 / 182402105', ws: 'Welding', pallets: '12/24', id: 'PREVIEW-NOISE-001', phone: '', eta: '15:00', sheetDate: sheetNames[0] || '', sequence: 999999 },
    { rowIndex: 901, index: 901, lot: '4800169078', ws: 'Assembly', pallets: '0/14', id: 'PREVIEW-NOISE-002', phone: '', eta: '15:10', sheetDate: sheetNames[0] || '', sequence: 999998 },
    { rowIndex: 902, index: 902, lot: '182402105', ws: 'Paint', pallets: '5/20', id: 'PREVIEW-NOISE-003', phone: '', eta: '15:20', sheetDate: sheetNames[0] || '', sequence: 999997 },
    { rowIndex: 903, index: 903, lot: '', ws: 'Paint', pallets: '5/20', id: 'PREVIEW-NOISE-004', phone: '', eta: '15:30', sheetDate: sheetNames[0] || '', sequence: 999996 },
  );

  return { planRows, tasks };
};

const buildLotProgress = (rows: LotPlanRow[], tasks: Task[]): LotProgress[] => {
  const taskByKey = new Map<string, Task>();
  tasks.forEach((task) => {
    const id = normalizeId(task.id);
    if (!id) return;
    const sheetDate = task.sheet_date || '';
    taskByKey.set(makeTaskKey(sheetDate, id), task);
  });

  const groups = new Map<string, {
    lot: string;
    ws: string[];
    doneWsCounts: Record<WsGroupKey, number>;
    total: number;
    done: number;
    inProgress: number;
    notStarted: number;
    lastSequence: number;
  }>();

  rows.forEach((row) => {
    const lot = normalizeLotNo(row.lot);
    if (!lot) return;

    const group = groups.get(lot) || {
      lot,
      ws: [],
      doneWsCounts: createEmptyWsCounts(),
      total: 0,
      done: 0,
      inProgress: 0,
      notStarted: 0,
      lastSequence: 0,
    };

    const ws = row.ws.trim();
    if (ws && !group.ws.includes(ws)) group.ws.push(ws);

    const task = taskByKey.get(makeTaskKey(row.sheetDate, row.id));
    if (task?.status === 'DONE') {
      group.done += 1;
      group.doneWsCounts[normalizeWsGroup(ws)] += 1;
    } else if (task?.status === 'ACTIVE') group.inProgress += 1;
    else group.notStarted += 1;

    group.total += 1;
    group.lastSequence = Math.max(group.lastSequence, row.sequence);
    groups.set(lot, group);
  });

  return Array.from(groups.values())
    .filter((lot) => lot.total >= MIN_ROWS_PER_LOT)
    .map((lot) => {
      const percent = Math.round((lot.done / lot.total) * 100);
      const status = getStatus(lot.done, lot.total, lot.inProgress);
      return {
        ...lot,
        wsSegments: buildWsSegments(lot.doneWsCounts, lot.done),
        unfinished: lot.total - lot.done,
        percent,
        status,
      };
    });
};

const TvLotProgressView: React.FC<Props> = ({ preview = false, readOnly = false }) => {
  const [planRows, setPlanRows] = useState<LotPlanRow[]>([]);
  const [taskRows, setTaskRows] = useState<Task[]>([]);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(() => (typeof window === 'undefined' ? 1080 : window.innerHeight));

  useEffect(() => {
    const existing = document.querySelector<HTMLLinkElement>(`link[href="${fontUrl}"]`);
    if (existing) return;
    const preconnectFonts = document.createElement('link');
    preconnectFonts.rel = 'preconnect';
    preconnectFonts.href = 'https://fonts.gstatic.com';
    preconnectFonts.crossOrigin = 'anonymous';
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = fontUrl;
    document.head.append(preconnectFonts, fontLink);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setViewportHeight(window.innerHeight);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const fetchLotData = useCallback(async (showLoader: boolean) => {
    if (preview) return;
    if (showLoader) setLoading(true);
    try {
      if (readOnly) {
        const data = await api.fetchTvLotProgress(LOT_LOOKBACK_DAYS);
        setPlanRows(data.planRows.map((row, rowOrder) => ({
          ...row,
          sheetDate: row.sheetDate || '',
          sequence: Number(row.sequence) || rowOrder,
        })));
        setTaskRows(data.tasks);
        setError(false);
        return;
      }

      const sheetNames = getRecentOperationalSheetNames();
      const [planResults, taskResults] = await Promise.all([
        Promise.all(sheetNames.map((sheetDate) => api.fetchFullPlan(sheetDate).catch(() => [] as PlanRow[]))),
        Promise.all(sheetNames.map((sheetDate) => api.fetchHistory(sheetDate).catch(() => [] as Task[]))),
      ]);

      const nextPlanRows = planResults.flatMap((rows, dayIndex) => {
        const sheetDate = sheetNames[dayIndex];
        const dayRank = sheetNames.length - dayIndex;
        return rows.map((row, rowOrder) => ({
          ...row,
          sheetDate,
          sequence: dayRank * 100000 + (Number(row.rowIndex) || rowOrder),
        }));
      });

      const nextTasks = taskResults.flatMap((tasks, dayIndex) => {
        const sheetDate = sheetNames[dayIndex];
        return tasks.map((task) => ({ ...task, sheet_date: task.sheet_date || sheetDate }));
      });

      setPlanRows(nextPlanRows);
      setTaskRows(nextTasks);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [preview, readOnly]);

  useEffect(() => {
    if (preview) {
      const data = makePreviewData();
      setPlanRows(data.planRows);
      setTaskRows(data.tasks);
      setError(false);
      setLoading(false);
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (!intervalId) intervalId = setInterval(() => fetchLotData(false), LOT_PLAN_REFRESH_MS);
    };
    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        fetchLotData(false);
        start();
      }
    };

    fetchLotData(true);
    start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchLotData, preview]);

  const lots = useMemo(() => buildLotProgress(planRows, taskRows), [planRows, taskRows]);
  const activeLots = useMemo(() => (
    lots
      .filter((lot) => lot.status !== 'done')
      .sort((a, b) => {
        const aInWork = a.inProgress > 0;
        const bInWork = b.inProgress > 0;
        if (aInWork !== bInWork) return aInWork ? -1 : 1;
        if (a.unfinished !== b.unfinished) return b.unfinished - a.unfinished;
        return b.lastSequence - a.lastSequence;
      })
  ), [lots]);
  const closedLots = useMemo(() => (
    lots
      .filter((lot) => lot.status === 'done')
      .sort((a, b) => b.lastSequence - a.lastSequence)
  ), [lots]);

  const maxVisibleActiveLots = viewportHeight >= 900 ? MAX_DESKTOP_ACTIVE_LOTS : MAX_COMPACT_ACTIVE_LOTS;
  const visibleActiveLots = activeLots.slice(0, maxVisibleActiveLots);
  const visibleClosedLots = closedLots.slice(0, MAX_DONE_LOTS);
  const totalHiddenActive = Math.max(0, activeLots.length - visibleActiveLots.length);

  const renderProgressBar = (lot: LotProgress, tone: RowTone) => {
    const isClosed = lot.status === 'done';
    const filledWidth = lot.total > 0 ? (lot.done / lot.total) * 100 : 0;
    const segments = lot.done > 0 && lot.wsSegments.length > 0 ? lot.wsSegments : [{
      key: 'other' as WsGroupKey,
      label: 'Other',
      count: lot.done,
      percent: 100,
      color: WS_SEGMENT_META.other.color,
    }];

    return (
      <div
        aria-label={segments.map((segment) => `${segment.label} ${segment.count}`).join(', ')}
        className="tv-lot-progress-track"
        style={{
          height: 'clamp(22px, 3.4vh, 30px)',
          borderRadius: 10,
          background: 'rgba(255,255,255,.08)',
          overflow: 'hidden',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.04)',
        }}
      >
        {isClosed ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 10,
              background: tone.gradient,
              boxShadow: `0 0 18px ${tone.shadow}`,
            }}
          />
        ) : filledWidth > 0 ? (
          <div
            style={{
              width: `${filledWidth}%`,
              height: '100%',
              borderRadius: filledWidth >= 99.5 ? 10 : '10px 0 0 10px',
              overflow: 'hidden',
              display: 'flex',
              boxShadow: `0 0 18px ${tone.shadow}`,
            }}
          >
            {segments.map((segment, index) => (
              <div
                key={segment.key}
                style={{
                  flex: `${segment.count} 1 0`,
                  minWidth: segment.percent > 0 ? 4 : 0,
                  height: '100%',
                  background: segment.color,
                  boxShadow: index === 0 ? `0 0 18px ${segment.color}` : 'none',
                  borderLeft: index === 0 ? 'none' : '2px solid rgba(12,16,24,.72)',
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const renderLotRow = (lot: LotProgress) => {
    const tone = getTone(lot.status, lot.percent);
    return (
      <div
        key={lot.lot}
        className="tv-lot-active-row"
        data-lot-row="active"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(330px,1.7fr) minmax(260px,2.5fr) clamp(82px,8vw,150px) clamp(76px,7vw,128px) clamp(108px,9vw,150px)',
          alignItems: 'center',
          gap: 'clamp(10px,1.25vw,22px)',
          minHeight: 'clamp(78px,9.5vh,122px)',
          padding: 'clamp(9px,1.1vw,18px) clamp(14px,1.35vw,26px)',
          borderRadius: 'clamp(12px,1vw,16px)',
          background: tone.bg,
          border: `1px solid ${tone.border}`,
          borderLeft: `7px solid ${tone.accent}`,
          overflow: 'hidden',
        }}
      >
        <div title={lot.lot} style={{ font: "800 clamp(28px,2.15vw,39px)/1 'JetBrains Mono'", color: '#fff', letterSpacing: -1, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {middleEllipsis(lot.lot, 24)}
        </div>
        {renderProgressBar(lot, tone)}
        <div style={{ font: "900 clamp(26px,2.15vw,36px)/1 'Saira'", color: '#fff', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {lot.done} / {lot.total}
        </div>
        <div style={{ font: "900 clamp(36px,3.8vw,52px)/1 'Saira'", color: tone.color, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {lot.percent}%
        </div>
        <div className="tv-lot-status-badge" style={{ justifySelf: 'end', padding: 'clamp(8px,1vh,11px) clamp(10px,1vw,15px)', minWidth: 'clamp(104px,8.5vw,132px)', borderRadius: 10, background: tone.badgeBg, border: `1px solid ${tone.badgeBorder}`, color: tone.badgeColor, font: "900 clamp(13px,1.05vw,16px)/1 'Manrope'", textAlign: 'center', textTransform: 'uppercase', letterSpacing: .8, whiteSpace: 'nowrap' }}>
          {statusLabel(lot.status)}
        </div>
      </div>
    );
  };

  const renderClosedRow = (lot: LotProgress) => {
    const tone = getTone(lot.status, lot.percent);
    return (
      <div
        key={lot.lot}
        className="tv-lot-closed-row"
        data-lot-row="closed"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px,1.4fr) minmax(260px,2.3fr) clamp(82px,7vw,116px) clamp(72px,6vw,96px)',
          alignItems: 'center',
          gap: 'clamp(10px,1vw,16px)',
          minHeight: 'clamp(44px,5.4vh,58px)',
          padding: 'clamp(5px,.8vh,8px) clamp(12px,1.1vw,18px)',
          borderRadius: 12,
          background: tone.bg,
          border: `1px solid ${tone.border}`,
          overflow: 'hidden',
        }}
      >
        <div title={lot.lot} style={{ font: "800 clamp(22px,1.65vw,30px)/1 'JetBrains Mono'", color: '#dff7e8', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {middleEllipsis(lot.lot, 22)}
        </div>
        {renderProgressBar(lot, tone)}
        <div style={{ font: "900 clamp(20px,1.45vw,25px)/1 'Saira'", color: '#fff', textAlign: 'right', whiteSpace: 'nowrap' }}>
          {lot.done} / {lot.total}
        </div>
        <div style={{ font: "900 clamp(24px,1.8vw,32px)/1 'Saira'", color: tone.color, textAlign: 'right', whiteSpace: 'nowrap' }}>
          {lot.percent}%
        </div>
      </div>
    );
  };

  const renderEmptyState = () => (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 18, border: '1px dashed rgba(255,255,255,.12)', background: 'rgba(255,255,255,.03)', color: 'rgba(255,255,255,.58)', font: "900 clamp(24px,2.2vw,36px)/1 'Saira'", letterSpacing: .5, textTransform: 'uppercase' }}>
      Нет активных Lot No для отображения
    </div>
  );

  const renderWsLegend = () => (
    <div
      className="tv-lot-ws-legend"
      aria-label="W/S группы"
      style={{
        marginLeft: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: 'clamp(9px,.8vw,14px)',
        padding: 'clamp(5px,.65vh,8px) clamp(9px,.9vw,14px)',
        borderRadius: 999,
        background: 'rgba(8,13,22,.52)',
        border: '1px solid rgba(255,255,255,.11)',
        boxShadow: '0 8px 24px rgba(0,0,0,.18), inset 0 0 0 1px rgba(255,255,255,.03)',
        color: 'rgba(255,255,255,.58)',
        font: "900 clamp(10px,.75vw,13px)/1 'Manrope'",
        letterSpacing: .8,
        textTransform: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: 'rgba(255,255,255,.5)', textTransform: 'uppercase' }}>W/S группы</span>
      {(['welding', 'assembly', 'paint'] as WsGroupKey[]).map((key) => (
        <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 'clamp(5px,.45vw,7px)', color: 'rgba(255,255,255,.76)' }}>
          <span
            style={{
              width: 'clamp(8px,.65vw,11px)',
              height: 'clamp(8px,.65vw,11px)',
              borderRadius: 3,
              background: WS_SEGMENT_META[key].color,
              boxShadow: `0 0 10px ${WS_SEGMENT_META[key].color}`,
            }}
          />
          {WS_SEGMENT_META[key].label}
        </span>
      ))}
    </div>
  );

  return (
    <div
      className="tv-lot-screen"
      style={{
        width: '100vw',
        height: '100vh',
        boxSizing: 'border-box',
        overflow: 'hidden',
        background: 'radial-gradient(1250px 720px at 88% -12%,rgba(0,230,118,.06),transparent 56%),radial-gradient(980px 620px at 0% 118%,rgba(77,168,255,.05),transparent 55%),linear-gradient(168deg,#1b2230 0%,#0f121b 78%)',
        padding: 'clamp(12px,1.25vw,28px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(8px,1vh,14px)',
        color: '#eaf0f7',
        fontFamily: "'Manrope',system-ui,sans-serif",
      }}
    >
      <style>
        {`
          @media (max-height: 760px) {
            .tv-lot-screen {
              padding: 14px 16px !important;
              gap: 10px !important;
            }

            .tv-lot-active-title {
              height: auto !important;
              min-height: 32px !important;
              margin-bottom: 10px !important;
            }

            .tv-lot-ws-legend {
              padding: 6px 10px !important;
              gap: 10px !important;
              margin-top: 2px !important;
            }

            .tv-lot-active-list {
              gap: 10px !important;
            }

            .tv-lot-active-row {
              min-height: 74px !important;
              padding: 10px 14px !important;
              gap: 12px !important;
            }

            .tv-lot-active-row .tv-lot-progress-track {
              height: 24px !important;
            }

            .tv-lot-status-badge {
              margin-left: 2px !important;
              min-width: 104px !important;
            }

            .tv-lot-closed-section {
              margin-top: 18px !important;
              gap: 0 !important;
            }

            .tv-lot-closed-title {
              height: auto !important;
              min-height: 28px !important;
              margin-bottom: 8px !important;
            }

            .tv-lot-closed-list {
              gap: 6px !important;
            }

            .tv-lot-closed-row {
              min-height: 36px !important;
              padding: 6px 12px !important;
              gap: 10px !important;
            }

            .tv-lot-closed-row .tv-lot-progress-track {
              height: 22px !important;
            }
          }
        `}
      </style>
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', font: "900 clamp(24px,2.2vw,36px)/1 'Saira'", color: 'rgba(255,255,255,.55)', textTransform: 'uppercase' }}>
          Загрузка Lot No...
        </div>
      ) : error ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <AlertTriangle style={{ width: 'clamp(56px,5vw,76px)', height: 'clamp(56px,5vw,76px)', color: '#fca5a5' }} />
          <div style={{ marginTop: 18, font: "900 clamp(28px,2.5vw,42px)/1 'Saira'", color: '#fff' }}>Не удалось загрузить план</div>
          <div style={{ marginTop: 8, font: "800 clamp(15px,1.2vw,19px)/1 'Manrope'", color: 'rgba(255,255,255,.48)' }}>Экран читает последние 7 операционных дней</div>
        </div>
      ) : (
        <>
          <div className="tv-lot-active-title" style={{ height: 'clamp(28px,3.8vh,40px)', display: 'flex', alignItems: 'center', gap: 'clamp(10px,1vw,16px)', color: '#9ec5ff', font: "900 clamp(15px,1.25vw,20px)/1 'JetBrains Mono'", letterSpacing: 2, textTransform: 'uppercase', flex: 'none' }}>
            <span style={{ width: 5, height: 'clamp(18px,2.5vh,24px)', borderRadius: 3, background: '#4DA8FF' }} />
            Активные Lot No
            {totalHiddenActive > 0 && (
              <span style={{ color: 'rgba(158,197,255,.72)', letterSpacing: 1 }}>
                показано {visibleActiveLots.length} из {activeLots.length}
              </span>
            )}
            {renderWsLegend()}
          </div>

          <div className="tv-lot-active-list" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'clamp(8px,1vh,14px)' }}>
            {visibleActiveLots.length > 0 ? visibleActiveLots.map(renderLotRow) : renderEmptyState()}
          </div>

          {closedLots.length > 0 && (
            <div className="tv-lot-closed-section" style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 'clamp(6px,.75vh,9px)' }}>
              <div className="tv-lot-closed-title" style={{ height: 'clamp(24px,3.2vh,32px)', display: 'flex', alignItems: 'center', gap: 'clamp(10px,1vw,16px)', color: '#5ff0a6', font: "900 clamp(14px,1.1vw,17px)/1 'JetBrains Mono'", letterSpacing: 2, textTransform: 'uppercase' }}>
                <span style={{ width: 5, height: 'clamp(17px,2.3vh,22px)', borderRadius: 3, background: '#00E676' }} />
                Закрытые Lot No
              </div>
              <div className="tv-lot-closed-list" style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(5px,.75vh,8px)' }}>
                {visibleClosedLots.map(renderClosedRow)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TvLotProgressView;
