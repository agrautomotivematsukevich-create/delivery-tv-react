import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '../services/api';
import { PlanRow, Task } from '../types';
import { getOperationalSheetName } from '../utils/time';

interface Props {
  allTasks: Task[];
  isTasksLoading: boolean;
  preview?: boolean;
}

type LotStatus = 'not_started' | 'low' | 'progress' | 'done';

interface LotProgress {
  lot: string;
  ws: string[];
  done: number;
  total: number;
  inProgress: number;
  notStarted: number;
  percent: number;
  status: LotStatus;
}

type RowTone = {
  accent: string;
  color: string;
  mutedColor: string;
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
};

const LOT_PLAN_REFRESH_MS = 180000;
const MIN_ROWS_PER_LOT = 4;
const MAX_VISIBLE_ACTIVE_LOTS = 8;
const MAX_DONE_LOTS = 3;
const LOT_NO_PATTERN = /^43115-[A-Z0-9]+$/;

const PREVIEW_LOT_FIXTURES: PreviewLotFixture[] = [
  { lot: '43115-CT13J20260410', ws: ['Welding', 'Assembly'], total: 12, done: 5, active: 3 },
  { lot: '43115-CT13J20260408', ws: 'Assembly', total: 13, done: 9, active: 2 },
  { lot: '43115-CM32T20260306', ws: ['Paint', 'Welding'], total: 19, done: 14, active: 3 },
  { lot: '43115-CT13J20260412', ws: 'Assembly', total: 17, done: 14, active: 1 },
  { lot: '43115-CT13J20260413', ws: 'Paint', total: 11, done: 10, active: 1 },
  { lot: '43115-CT13J20260414', ws: 'Welding', total: 14, done: 0 },
  { lot: '43115-CM32T20260401', ws: 'Assembly', total: 8, done: 8 },
  { lot: '43115-CM32T20260402', ws: 'Paint', total: 9, done: 9 },
  { lot: '43115-CM32T20260403', ws: 'Welding', total: 10, done: 10 },
  { lot: '43115-CM32T20260404', ws: 'Assembly', total: 7, done: 7 },
  { lot: '43115-CT13J20260405', ws: 'Paint', total: 3, done: 1, active: 1 },
];

const PREVIEW_NOISE_ROWS: PlanRow[] = [
  { rowIndex: 900, index: 900, lot: '4800169078 / 182402105', ws: 'Welding', pallets: '12/24', id: 'PREVIEW-NOISE-001', phone: '', eta: '15:00' },
  { rowIndex: 901, index: 901, lot: '4800169078', ws: 'Assembly', pallets: '0/14', id: 'PREVIEW-NOISE-002', phone: '', eta: '15:10' },
  { rowIndex: 902, index: 902, lot: '182402105', ws: 'Paint', pallets: '5/20', id: 'PREVIEW-NOISE-003', phone: '', eta: '15:20' },
  { rowIndex: 903, index: 903, lot: '', ws: 'Paint', pallets: '5/20', id: 'PREVIEW-NOISE-004', phone: '', eta: '15:30' },
];

const makePreviewPlanRows = (): PlanRow[] => {
  let rowIndex = 5;
  let index = 1;
  const rows = PREVIEW_LOT_FIXTURES.flatMap((fixture, lotIndex) => {
    const wsList = Array.isArray(fixture.ws) ? fixture.ws : [fixture.ws];
    return Array.from({ length: fixture.total }, (_, rowInLot) => ({
      rowIndex: rowIndex++,
      index: index++,
      lot: fixture.lot,
      ws: wsList[rowInLot % wsList.length],
      pallets: '',
      id: `PREVIEW-${String(lotIndex + 1).padStart(2, '0')}-${String(rowInLot + 1).padStart(3, '0')}`,
      phone: '',
      eta: `${String(8 + (lotIndex % 7)).padStart(2, '0')}:${String((rowInLot * 5) % 60).padStart(2, '0')}`,
    }));
  });
  return [...rows, ...PREVIEW_NOISE_ROWS];
};

const makePreviewTasks = (): Task[] => (
  PREVIEW_LOT_FIXTURES.flatMap((fixture, lotIndex) => Array.from({ length: fixture.total }, (_, rowInLot) => {
    const id = `PREVIEW-${String(lotIndex + 1).padStart(2, '0')}-${String(rowInLot + 1).padStart(3, '0')}`;
    const activeLimit = fixture.done + (fixture.active || 0);
    if (rowInLot < fixture.done) {
      return { id, status: 'DONE', time: '09:00', start_time: '08:18', end_time: '08:44', zone: 'G3' };
    }
    if (rowInLot < activeLimit) {
      return { id, status: 'ACTIVE', time: '09:35', start_time: '09:35', zone: 'G4' };
    }
    return { id, status: 'WAIT', time: '10:05' };
  }))
);

const PREVIEW_PLAN_ROWS: PlanRow[] = makePreviewPlanRows();
const PREVIEW_TASKS: Task[] = makePreviewTasks();

const fontUrl = 'https://fonts.googleapis.com/css2?family=Saira:wght@600;700;800;900&family=Manrope:wght@500;600;700;800&family=JetBrains+Mono:wght@500;700;800&display=swap';

const normalizeId = (value: string | undefined): string => (value || '').trim().toUpperCase();

const normalizeLotNo = (value: string | undefined): string => {
  const lot = (value || '').trim().toUpperCase();
  return LOT_NO_PATTERN.test(lot) ? lot : '';
};

const formatWs = (ws: string[]): string => (ws.length > 0 ? ws.join(' / ') : '-');

const middleEllipsis = (value: string, maxLength = 26): string => {
  if (value.length <= maxLength) return value;
  const head = Math.ceil((maxLength - 3) * 0.58);
  const tail = maxLength - 3 - head;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
};

const getStatus = (done: number, total: number, inProgress: number): LotStatus => {
  if (done >= total) return 'done';
  if (done === 0 && inProgress === 0) return 'not_started';
  return done / total < 0.5 ? 'low' : 'progress';
};

const activeStatusRank: Record<LotStatus, number> = {
  not_started: 0,
  low: 1,
  progress: 2,
  done: 3,
};

const getTone = (status: LotStatus, percent: number): RowTone => {
  if (status === 'done') {
    return {
      accent: '#00E676',
      color: '#00E676',
      mutedColor: '#78f5ad',
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
      mutedColor: 'rgba(255,255,255,.52)',
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
      mutedColor: '#f5cd6b',
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
      mutedColor: '#72eee6',
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
    mutedColor: '#9ec5ff',
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

const buildLotProgress = (rows: PlanRow[], allTasks: Task[]): LotProgress[] => {
  const taskById = new Map<string, Task>();
  allTasks.forEach((task) => {
    const id = normalizeId(task.id);
    if (id) taskById.set(id, task);
  });

  const groups = new Map<string, {
    lot: string;
    ws: string[];
    total: number;
    done: number;
    inProgress: number;
    notStarted: number;
  }>();

  rows.forEach((row) => {
    const lot = normalizeLotNo(row.lot);
    if (!lot) return;

    const group = groups.get(lot) || {
      lot,
      ws: [],
      total: 0,
      done: 0,
      inProgress: 0,
      notStarted: 0,
    };

    const ws = row.ws.trim();
    if (ws && !group.ws.includes(ws)) group.ws.push(ws);

    const task = taskById.get(normalizeId(row.id));
    if (task?.status === 'DONE') group.done += 1;
    else if (task?.status === 'ACTIVE') group.inProgress += 1;
    else group.notStarted += 1;

    group.total += 1;
    groups.set(lot, group);
  });

  return Array.from(groups.values())
    .filter((lot) => lot.total > MIN_ROWS_PER_LOT - 1)
    .map((lot) => {
      const percent = Math.round((lot.done / lot.total) * 100);
      const status = getStatus(lot.done, lot.total, lot.inProgress);
      return {
        ...lot,
        percent,
        status,
      };
    });
};

const TvLotProgressView: React.FC<Props> = ({ allTasks, isTasksLoading, preview = false }) => {
  const [planRows, setPlanRows] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

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

  const fetchPlan = useCallback(async (showLoader: boolean) => {
    if (preview) return;
    if (showLoader) setLoading(true);
    try {
      const data = await api.fetchFullPlan(getOperationalSheetName());
      setPlanRows(data);
      setLastUpdated(new Date());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [preview]);

  useEffect(() => {
    if (preview) {
      setPlanRows(PREVIEW_PLAN_ROWS);
      setLastUpdated(new Date());
      setError(false);
      setLoading(false);
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (!intervalId) intervalId = setInterval(() => fetchPlan(false), LOT_PLAN_REFRESH_MS);
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
        fetchPlan(false);
        start();
      }
    };

    fetchPlan(true);
    start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchPlan, preview]);

  const sourceTasks = preview ? PREVIEW_TASKS : allTasks;
  const lots = useMemo(() => buildLotProgress(planRows, sourceTasks), [planRows, sourceTasks]);
  const activeLots = useMemo(() => (
    lots
      .filter((lot) => lot.status !== 'done')
      .sort((a, b) => {
        const rankDiff = activeStatusRank[a.status] - activeStatusRank[b.status];
        if (rankDiff !== 0) return rankDiff;
        if (a.percent !== b.percent) return a.percent - b.percent;
        return a.lot.localeCompare(b.lot);
      })
  ), [lots]);
  const closedLots = useMemo(() => (
    lots
      .filter((lot) => lot.status === 'done')
      .sort((a, b) => a.lot.localeCompare(b.lot))
  ), [lots]);

  const visibleActiveLots = activeLots.slice(0, MAX_VISIBLE_ACTIVE_LOTS);
  const visibleClosedLots = closedLots.slice(0, MAX_DONE_LOTS);
  const notStartedLots = activeLots.filter((lot) => lot.status === 'not_started').length;
  const inWorkLots = activeLots.filter((lot) => lot.status !== 'not_started').length;
  const updatedTime = (lastUpdated || new Date()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const totalHiddenActive = Math.max(0, activeLots.length - visibleActiveLots.length);
  const headerStats: Array<{ label: string; value: number; color: string }> = [
    { label: 'Всего', value: lots.length, color: '#fff' },
    { label: 'В работе', value: inWorkLots, color: '#4DA8FF' },
    { label: 'Не начато', value: notStartedLots, color: '#FBBF24' },
    { label: 'Закрыто', value: closedLots.length, color: '#00E676' },
  ];

  const renderProgressBar = (lot: LotProgress, tone: RowTone) => (
    <div style={{ height: 28, borderRadius: 10, background: 'rgba(255,255,255,.08)', overflow: 'hidden', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.04)' }}>
      {lot.percent > 0 && (
        <div
          style={{
            width: `${lot.percent}%`,
            height: '100%',
            borderRadius: 10,
            background: tone.gradient,
            boxShadow: `0 0 18px ${tone.shadow}`,
          }}
        />
      )}
    </div>
  );

  const renderLotRow = (lot: LotProgress) => {
    const tone = getTone(lot.status, lot.percent);
    return (
      <div
        key={lot.lot}
        style={{
          display: 'grid',
          gridTemplateColumns: '430px 250px 1fr 150px 120px 150px',
          alignItems: 'center',
          gap: 18,
          minHeight: 88,
          padding: '12px 22px',
          borderRadius: 14,
          background: tone.bg,
          border: `1px solid ${tone.border}`,
          borderLeft: `7px solid ${tone.accent}`,
          overflow: 'hidden',
        }}
      >
        <div title={lot.lot} style={{ font: "800 37px/1 'JetBrains Mono'", color: '#fff', letterSpacing: -1, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {middleEllipsis(lot.lot, 24)}
        </div>
        <div title={formatWs(lot.ws)} style={{ font: "800 21px/1.1 'Manrope'", color: 'rgba(255,255,255,.72)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {formatWs(lot.ws)}
        </div>
        {renderProgressBar(lot, tone)}
        <div style={{ font: "900 34px/1 'Saira'", color: '#fff', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {lot.done} / {lot.total}
        </div>
        <div style={{ font: "900 50px/1 'Saira'", color: tone.color, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {lot.percent}%
        </div>
        <div style={{ justifySelf: 'end', padding: '10px 14px', minWidth: 126, borderRadius: 10, background: tone.badgeBg, border: `1px solid ${tone.badgeBorder}`, color: tone.badgeColor, font: "900 16px/1 'Manrope'", textAlign: 'center', textTransform: 'uppercase', letterSpacing: .8, whiteSpace: 'nowrap' }}>
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
        style={{
          display: 'grid',
          gridTemplateColumns: '380px 200px 1fr 116px 96px',
          alignItems: 'center',
          gap: 14,
          minHeight: 56,
          padding: '7px 16px',
          borderRadius: 12,
          background: tone.bg,
          border: `1px solid ${tone.border}`,
          overflow: 'hidden',
        }}
      >
        <div title={lot.lot} style={{ font: "800 28px/1 'JetBrains Mono'", color: '#dff7e8', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {middleEllipsis(lot.lot, 22)}
        </div>
        <div title={formatWs(lot.ws)} style={{ font: "800 16px/1 'Manrope'", color: 'rgba(255,255,255,.54)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {formatWs(lot.ws)}
        </div>
        {renderProgressBar(lot, tone)}
        <div style={{ font: "900 24px/1 'Saira'", color: '#fff', textAlign: 'right', whiteSpace: 'nowrap' }}>
          {lot.done} / {lot.total}
        </div>
        <div style={{ font: "900 30px/1 'Saira'", color: tone.color, textAlign: 'right', whiteSpace: 'nowrap' }}>
          {lot.percent}%
        </div>
      </div>
    );
  };

  const renderEmptyState = () => (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 18, border: '1px dashed rgba(255,255,255,.12)', background: 'rgba(255,255,255,.03)', color: 'rgba(255,255,255,.58)', font: "900 34px/1 'Saira'", letterSpacing: .5, textTransform: 'uppercase' }}>
      Нет активных Lot No для отображения
    </div>
  );

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'radial-gradient(1250px 720px at 88% -12%,rgba(0,230,118,.06),transparent 56%),radial-gradient(980px 620px at 0% 118%,rgba(77,168,255,.05),transparent 55%),linear-gradient(168deg,#1b2230 0%,#0f121b 78%)',
        padding: '18px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        color: '#eaf0f7',
        fontFamily: "'Manrope',system-ui,sans-serif",
      }}
    >
      <div
        style={{
          height: 58,
          maxHeight: 70,
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          padding: '0 22px',
          borderRadius: 15,
          background: 'rgba(255,255,255,.055)',
          border: '1px solid rgba(255,255,255,.1)',
          overflow: 'hidden',
        }}
      >
        <div style={{ font: "900 30px/1 'Saira'", color: '#fff', letterSpacing: 1, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          Отработка Lot No
        </div>
        <div style={{ width: 1, height: 30, background: 'rgba(255,255,255,.16)', flex: 'none' }} />
        {headerStats.map(({ label, value, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>
            <span style={{ font: "800 16px/1 'Manrope'", color: 'rgba(255,255,255,.56)' }}>{label}:</span>
            <span style={{ font: "900 32px/1 'Saira'", color }}>{value}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', font: "800 17px/1 'JetBrains Mono'", color: 'rgba(255,255,255,.55)', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
          обновлено {updatedTime}
        </div>
      </div>

      {loading || (!preview && isTasksLoading) ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', font: "900 34px/1 'Saira'", color: 'rgba(255,255,255,.55)', textTransform: 'uppercase' }}>
          Загрузка Lot No...
        </div>
      ) : error ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <AlertTriangle style={{ width: 72, height: 72, color: '#fca5a5' }} />
          <div style={{ marginTop: 18, font: "900 40px/1 'Saira'", color: '#fff' }}>Не удалось загрузить план</div>
          <div style={{ marginTop: 8, font: "800 18px/1 'Manrope'", color: 'rgba(255,255,255,.48)' }}>Используется текущий план операционного дня</div>
        </div>
      ) : (
        <>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibleActiveLots.length > 0 ? visibleActiveLots.map(renderLotRow) : renderEmptyState()}
          </div>

          {totalHiddenActive > 0 && (
            <div style={{ flex: 'none', height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.48)', font: "800 15px/1 'JetBrains Mono'", letterSpacing: 1, textTransform: 'uppercase' }}>
              Показано {visibleActiveLots.length} из {activeLots.length} активных Lot No
            </div>
          )}

          {closedLots.length > 0 && (
            <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ height: 28, display: 'flex', alignItems: 'center', gap: 12, color: '#5ff0a6', font: "900 16px/1 'JetBrains Mono'", letterSpacing: 2, textTransform: 'uppercase' }}>
                <span style={{ width: 5, height: 20, borderRadius: 3, background: '#00E676' }} />
                Закрытые Lot No
                {closedLots.length > MAX_DONE_LOTS && (
                  <span style={{ color: 'rgba(95,240,166,.72)', letterSpacing: 1 }}>
                    показано {visibleClosedLots.length} из {closedLots.length}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
