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

type LotStatus = 'problem' | 'not_started' | 'low' | 'progress' | 'done';

interface LotProgress {
  lot: string;
  ws: string[];
  done: number;
  total: number;
  percent: number;
  rows: number;
  containersDone: number;
  containersActive: number;
  containersWaiting: number;
  invalidRows: number;
  status: LotStatus;
}

type CardTone = {
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

const LOT_PLAN_REFRESH_MS = 180000;
const MAX_ACTIVE_LOTS = 6;
const MAX_DONE_LOTS = 3;

const PREVIEW_PLAN_ROWS: PlanRow[] = [
  { rowIndex: 5, index: 1, lot: '43115-CT13J20260321', ws: 'Welding', pallets: '20/24', id: 'PREVIEW-001', phone: '', eta: '08:10' },
  { rowIndex: 6, index: 2, lot: '43115-CT13J20260321', ws: 'Assembly', pallets: '5/10', id: 'PREVIEW-002', phone: '', eta: '08:40' },
  { rowIndex: 7, index: 3, lot: '43115-CT13J20260327', ws: 'Assembly', pallets: '14/17', id: 'PREVIEW-003', phone: '', eta: '09:20' },
  { rowIndex: 8, index: 4, lot: '43115-CT13J20260319', ws: 'Paint', pallets: '0/14', id: 'PREVIEW-004', phone: '', eta: '10:05' },
  { rowIndex: 9, index: 5, lot: '43115-CM32T20260312', ws: 'Welding', pallets: '34/34', id: 'PREVIEW-005', phone: '', eta: '10:45' },
  { rowIndex: 10, index: 6, lot: '43115-CT13J20260326', ws: 'Assembly', pallets: '6/17', id: 'PREVIEW-006', phone: '', eta: '11:30' },
  { rowIndex: 11, index: 7, lot: '43115-CM32T20260310', ws: 'Paint', pallets: '18/26', id: 'PREVIEW-007', phone: '', eta: '12:20' },
  { rowIndex: 12, index: 8, lot: '43115-CT13J20260329-LONG-ALPHA', ws: 'Paint', pallets: '31/34', id: 'PREVIEW-008', phone: '', eta: '13:00' },
  { rowIndex: 13, index: 9, lot: '43115-CM32T20260313', ws: 'Assembly', pallets: '22/22', id: 'PREVIEW-009', phone: '', eta: '13:40' },
  { rowIndex: 14, index: 10, lot: '43115-CM32T20260314', ws: 'Paint', pallets: '16/16', id: 'PREVIEW-010', phone: '', eta: '14:10' },
  { rowIndex: 15, index: 11, lot: '43115-CM32T20260315-LONG-CLOSED', ws: 'Welding', pallets: '40/40', id: 'PREVIEW-011', phone: '', eta: '14:30' },
];

const PREVIEW_TASKS: Task[] = [
  { id: 'PREVIEW-001', status: 'DONE', time: '09:00', start_time: '08:18', end_time: '08:44', zone: 'G3' },
  { id: 'PREVIEW-002', status: 'ACTIVE', time: '08:52', start_time: '08:52', zone: 'G4' },
  { id: 'PREVIEW-003', status: 'ACTIVE', time: '09:35', start_time: '09:35', zone: 'G5' },
  { id: 'PREVIEW-004', status: 'WAIT', time: '10:05' },
  { id: 'PREVIEW-005', status: 'DONE', time: '11:08', start_time: '10:40', end_time: '11:08', zone: 'G6' },
  { id: 'PREVIEW-006', status: 'ACTIVE', time: '11:42', start_time: '11:42', zone: 'G7' },
  { id: 'PREVIEW-007', status: 'DONE', time: '12:50', start_time: '12:15', end_time: '12:50', zone: 'G8' },
  { id: 'PREVIEW-008', status: 'WAIT', time: '13:00' },
  { id: 'PREVIEW-009', status: 'DONE', time: '14:05', start_time: '13:38', end_time: '14:05', zone: 'G9' },
  { id: 'PREVIEW-010', status: 'DONE', time: '14:42', start_time: '14:14', end_time: '14:42', zone: 'P70' },
  { id: 'PREVIEW-011', status: 'DONE', time: '15:10', start_time: '14:38', end_time: '15:10', zone: 'G3' },
];

const parseProgress = (value: string): { done: number; total: number } | null => {
  const match = value.trim().match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;
  const done = Number.parseInt(match[1], 10);
  const total = Number.parseInt(match[2], 10);
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0 || done < 0) return null;
  return { done, total };
};

const normalizeId = (value: string | undefined): string => (value || '').trim().toUpperCase();

const getStatus = (done: number, total: number, invalidRows: number): LotStatus => {
  if (invalidRows > 0 || total <= 0 || done > total) return 'problem';
  if (done === 0) return 'not_started';
  if (done >= total) return 'done';
  return done / total < 0.5 ? 'low' : 'progress';
};

const openStatusRank: Record<LotStatus, number> = {
  problem: 0,
  low: 1,
  progress: 2,
  not_started: 3,
  done: 4,
};

const middleEllipsis = (value: string, maxLength = 24): string => {
  if (value.length <= maxLength) return value;
  const head = Math.ceil((maxLength - 3) * 0.58);
  const tail = maxLength - 3 - head;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
};

const formatWs = (ws: string[]): string => ws.length > 0 ? ws.join(' / ') : '—';

const getTone = (lot: LotProgress): CardTone => {
  if (lot.status === 'problem') {
    return {
      accent: '#F87171',
      color: '#fca5a5',
      bg: 'rgba(248,113,113,.08)',
      border: 'rgba(248,113,113,.3)',
      badgeBg: 'rgba(248,113,113,.16)',
      badgeBorder: 'rgba(248,113,113,.3)',
      badgeColor: '#fecaca',
      gradient: 'linear-gradient(90deg,#F87171,#dc2626)',
      shadow: 'rgba(248,113,113,.5)',
    };
  }

  if (lot.status === 'not_started') {
    return {
      accent: '#6b7686',
      color: 'rgba(255,255,255,.55)',
      bg: 'rgba(255,255,255,.03)',
      border: 'rgba(255,255,255,.1)',
      badgeBg: 'rgba(255,255,255,.06)',
      badgeBorder: 'rgba(255,255,255,.16)',
      badgeColor: 'rgba(255,255,255,.6)',
      gradient: 'linear-gradient(90deg,#6b7686,#8792a1)',
      shadow: 'rgba(255,255,255,.18)',
    };
  }

  if (lot.status === 'low') {
    return {
      accent: '#FBBF24',
      color: '#FBBF24',
      bg: 'rgba(251,191,36,.08)',
      border: 'rgba(251,191,36,.3)',
      badgeBg: 'rgba(251,191,36,.16)',
      badgeBorder: 'rgba(251,191,36,.3)',
      badgeColor: '#f5cd6b',
      gradient: 'linear-gradient(90deg,#FBBF24,#f59e0b)',
      shadow: 'rgba(251,191,36,.5)',
    };
  }

  if (lot.percent >= 80) {
    return {
      accent: '#22D3C5',
      color: '#22D3C5',
      bg: 'rgba(34,211,197,.07)',
      border: 'rgba(34,211,197,.28)',
      badgeBg: 'rgba(34,211,197,.16)',
      badgeBorder: 'rgba(34,211,197,.3)',
      badgeColor: '#5fe6dc',
      gradient: 'linear-gradient(90deg,#22D3C5,#13a89c)',
      shadow: 'rgba(34,211,197,.5)',
    };
  }

  return {
    accent: '#4DA8FF',
    color: '#4DA8FF',
    bg: 'rgba(77,168,255,.07)',
    border: 'rgba(77,168,255,.28)',
    badgeBg: 'rgba(77,168,255,.16)',
    badgeBorder: 'rgba(77,168,255,.3)',
    badgeColor: '#9ec5ff',
    gradient: 'linear-gradient(90deg,#4DA8FF,#2f7fe0)',
    shadow: 'rgba(77,168,255,.5)',
  };
};

const statusLabel = (status: LotStatus): string => {
  if (status === 'not_started') return 'Не начато';
  if (status === 'problem') return 'Ошибка';
  return 'В работе';
};

const buildLotProgress = (rows: PlanRow[], allTasks: Task[]): LotProgress[] => {
  const taskById = new Map<string, Task>();
  allTasks.forEach((task) => {
    const id = normalizeId(task.id);
    if (id) taskById.set(id, task);
  });

  const groups = new Map<string, Omit<LotProgress, 'percent' | 'status'>>();

  rows.forEach((row) => {
    const lot = row.lot.trim();
    if (!lot) return;

    const existing = groups.get(lot) || {
      lot,
      ws: [],
      done: 0,
      total: 0,
      rows: 0,
      containersDone: 0,
      containersActive: 0,
      containersWaiting: 0,
      invalidRows: 0,
    };

    const parsed = parseProgress(row.pallets || '');
    if (parsed) {
      existing.done += parsed.done;
      existing.total += parsed.total;
    } else {
      existing.invalidRows += 1;
    }

    const ws = row.ws.trim();
    if (ws && !existing.ws.includes(ws)) existing.ws.push(ws);

    const task = taskById.get(normalizeId(row.id));
    if (task?.status === 'DONE') existing.containersDone += 1;
    else if (task?.status === 'ACTIVE') existing.containersActive += 1;
    else existing.containersWaiting += 1;

    existing.rows += 1;
    groups.set(lot, existing);
  });

  return Array.from(groups.values()).map((lot) => {
    const percent = lot.total > 0 ? Math.max(0, Math.min(100, Math.round((lot.done / lot.total) * 100))) : 0;
    return {
      ...lot,
      percent,
      status: getStatus(lot.done, lot.total, lot.invalidRows),
    };
  });
};

const fontUrl = 'https://fonts.googleapis.com/css2?family=Saira:wght@600;700;800;900&family=Manrope:wght@500;600;700;800&family=JetBrains+Mono:wght@500;700;800&display=swap';

const TvLotProgressView: React.FC<Props> = ({ allTasks, isTasksLoading, preview = false }) => {
  const [planRows, setPlanRows] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [clock, setClock] = useState(() => new Date());

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
    const id = setInterval(() => setClock(new Date()), 30000);
    return () => clearInterval(id);
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
  const closedLots = lots
    .filter((lot) => lot.status === 'done')
    .sort((a, b) => b.percent - a.percent || a.lot.localeCompare(b.lot));
  const openLots = lots
    .filter((lot) => lot.status !== 'done')
    .sort((a, b) => {
      const rankDiff = openStatusRank[a.status] - openStatusRank[b.status];
      if (rankDiff !== 0) return rankDiff;
      if (a.percent !== b.percent) return a.percent - b.percent;
      return a.lot.localeCompare(b.lot);
    });
  const visibleOpenLots = openLots.slice(0, MAX_ACTIVE_LOTS);
  const visibleClosedLots = closedLots.slice(0, MAX_DONE_LOTS);
  const notStartedLots = openLots.filter((lot) => lot.status === 'not_started').length;
  const activeLots = openLots.filter((lot) => lot.status === 'low' || lot.status === 'progress').length;
  const updatedTime = (lastUpdated || clock).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const timeText = clock.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const dateText = clock.toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: 'long' }).toUpperCase();

  const renderActiveLot = (lot: LotProgress) => {
    const tone = getTone(lot);
    const percent = lot.status === 'problem' && lot.total <= 0 ? 0 : lot.percent;

    return (
      <div
        key={lot.lot}
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '24px 26px',
          borderRadius: 18,
          background: tone.bg,
          border: `1px solid ${tone.border}`,
          borderLeft: `6px solid ${tone.accent}`,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span style={{ font: "800 12px/1 'JetBrains Mono'", letterSpacing: 3, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Lot No</span>
            <span title={formatWs(lot.ws)} style={{ font: "800 12px/1 'JetBrains Mono'", letterSpacing: 1.5, color: 'rgba(255,255,255,.38)', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              W/S {formatWs(lot.ws)}
            </span>
          </div>
          <span style={{ padding: '7px 14px', borderRadius: 9, background: tone.badgeBg, border: `1px solid ${tone.badgeBorder}`, font: "800 12px 'Manrope'", letterSpacing: 1, color: tone.badgeColor, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            {statusLabel(lot.status)}
          </span>
        </div>

        <div title={lot.lot} style={{ font: "800 40px/1 'JetBrains Mono'", color: lot.status === 'not_started' ? 'rgba(255,255,255,.85)' : '#fff', letterSpacing: -1, marginTop: 12, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {middleEllipsis(lot.lot, 24)}
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
            <span style={{ font: "900 88px/0.8 'Saira'", color: tone.color, letterSpacing: -3 }}>{lot.status === 'problem' && lot.total <= 0 ? '--' : lot.percent}</span>
            <span style={{ font: "900 30px 'Saira'", color: tone.color }}>%</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ font: "800 34px/0.9 'Saira'", color: lot.status === 'not_started' ? 'rgba(255,255,255,.7)' : '#fff', fontVariantNumeric: 'tabular-nums' }}>
              {lot.total > 0 ? lot.done : '--'} / {lot.total > 0 ? lot.total : '--'}
            </div>
            <div style={{ font: "700 12px 'JetBrains Mono'", letterSpacing: 1, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', marginTop: 5 }}>деталей</div>
          </div>
        </div>

        <div style={{ height: 30, borderRadius: 9, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}>
          {percent > 0 && (
            <div style={{ height: '100%', width: `${percent}%`, borderRadius: 9, background: tone.gradient, boxShadow: `0 0 16px ${tone.shadow}`, transformOrigin: 'left', animation: 'tvLotGrow 1s ease-out' }} />
          )}
        </div>
      </div>
    );
  };

  const renderClosedLot = (lot: LotProgress) => (
    <div key={lot.lot} style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, padding: '9px 16px', borderRadius: 11, background: 'rgba(0,230,118,.09)', border: '1px solid rgba(0,230,118,.25)', overflow: 'hidden' }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: '#00E676', color: '#06140c', font: "900 15px 'Manrope'", flex: '0 0 auto' }}>✓</span>
      <span title={lot.lot} style={{ font: "800 23px/1 'JetBrains Mono'", color: '#dff7e8', letterSpacing: -.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 310 }}>
        {middleEllipsis(lot.lot, 22)}
      </span>
      <span title={formatWs(lot.ws)} style={{ font: "800 12px 'JetBrains Mono'", letterSpacing: 1, color: 'rgba(255,255,255,.42)', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{formatWs(lot.ws)}</span>
      <span style={{ font: "900 22px 'Saira'", color: '#00E676', whiteSpace: 'nowrap' }}>{lot.percent}%</span>
      <span style={{ font: "700 14px 'Saira'", color: 'rgba(255,255,255,.45)', whiteSpace: 'nowrap' }}>{lot.done} / {lot.total}</span>
    </div>
  );

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'radial-gradient(1300px 720px at 82% -16%,rgba(0,230,118,.06),transparent 56%),radial-gradient(1100px 700px at 2% 116%,rgba(77,168,255,.05),transparent 55%),linear-gradient(168deg,#1b2230 0%,#0f121b 78%)',
        padding: '26px 30px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        color: '#eaf0f7',
        fontFamily: "'Manrope',system-ui,sans-serif",
      }}
    >
      <style>{`
        @keyframes tvLotPulse { 0%,100% { opacity: 1; } 50% { opacity: .25; } }
        @keyframes tvLotGrow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 22, height: 66, flex: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 46, padding: '0 16px', borderRadius: 12, background: 'linear-gradient(135deg,#00E676,#0c8f53)', font: "900 22px/1 'Saira'", letterSpacing: 1, color: '#06140c' }}>AGR</div>
        <div style={{ width: 1, height: 38, background: 'rgba(255,255,255,.13)' }} />
        <div>
          <div style={{ font: "800 12px/1 'JetBrains Mono'", letterSpacing: 4, color: '#5ff0a6', textTransform: 'uppercase' }}>Мониторинг склада</div>
          <div style={{ font: "900 38px/1 'Saira'", letterSpacing: 1, color: '#fff', textTransform: 'uppercase', marginTop: 7 }}>Отработка Lot No</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 18px', borderRadius: 13, background: 'rgba(34,211,197,.1)', border: '1px solid rgba(34,211,197,.26)' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#22D3C5', animation: 'tvLotPulse 1.6s ease-in-out infinite' }} />
            <span style={{ font: "800 13px 'JetBrains Mono'", letterSpacing: 1, color: '#5fe6dc', textTransform: 'uppercase' }}>Обновлено {updatedTime}</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ font: "900 44px/0.9 'Saira'", letterSpacing: 1, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{timeText}</div>
            <div style={{ font: "800 11px 'JetBrains Mono'", letterSpacing: 2, color: 'rgba(255,255,255,.45)', marginTop: 4 }}>{dateText}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, height: 128, flex: 'none' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, padding: '0 30px', borderRadius: 18, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)' }}>
          <span style={{ font: "800 13px/1 'JetBrains Mono'", letterSpacing: 3, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase' }}>Всего лотов</span>
          <span style={{ font: "900 68px/0.85 'Saira'", color: '#fff', letterSpacing: -1 }}>{lots.length}</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, padding: '0 30px', borderRadius: 18, background: 'rgba(77,168,255,.08)', border: '1px solid rgba(77,168,255,.26)' }}>
          <span style={{ font: "800 13px/1 'JetBrains Mono'", letterSpacing: 3, color: '#9ec5ff', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>В работе</span>
          <span style={{ font: "900 68px/0.85 'Saira'", color: '#4DA8FF', letterSpacing: -1 }}>{activeLots}</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, padding: '0 30px', borderRadius: 18, background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.26)' }}>
          <span style={{ font: "800 13px/1 'JetBrains Mono'", letterSpacing: 3, color: '#f5cd6b', textTransform: 'uppercase' }}>Не начато</span>
          <span style={{ font: "900 68px/0.85 'Saira'", color: '#FBBF24', letterSpacing: -1 }}>{notStartedLots}</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, padding: '0 30px', borderRadius: 18, background: 'rgba(0,230,118,.07)', border: '1px solid rgba(0,230,118,.26)' }}>
          <span style={{ font: "800 13px/1 'JetBrains Mono'", letterSpacing: 3, color: '#5ff0a6', textTransform: 'uppercase' }}>Закрыто</span>
          <span style={{ font: "900 68px/0.85 'Saira'", color: '#00E676', letterSpacing: -1 }}>{closedLots.length}</span>
        </div>
      </div>

      {loading || (!preview && isTasksLoading) ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', font: "900 34px 'Saira'", color: 'rgba(255,255,255,.55)', textTransform: 'uppercase' }}>Загрузка Lot No...</div>
      ) : error ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <AlertTriangle style={{ width: 80, height: 80, color: '#fca5a5' }} />
          <div style={{ marginTop: 18, font: "900 44px 'Saira'", color: '#fff' }}>Не удалось загрузить план</div>
          <div style={{ marginTop: 4, font: "800 18px 'Manrope'", color: 'rgba(255,255,255,.45)' }}>Экран использует существующий план текущего операционного дня</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, flex: 'none' }}>
            <span style={{ width: 5, height: 20, borderRadius: 3, background: '#4DA8FF' }} />
            <span style={{ font: "800 15px/1 'JetBrains Mono'", letterSpacing: 3, color: '#fff', textTransform: 'uppercase' }}>Активные лоты · сначала проблемные</span>
            <span style={{ marginLeft: 'auto', font: "800 13px 'JetBrains Mono'", letterSpacing: 1, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase' }}>
              {openLots.length > MAX_ACTIVE_LOTS ? `${visibleOpenLots.length} из ${openLots.length} открыто` : `${openLots.length} открыто`}
            </span>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gridTemplateRows: 'repeat(2,1fr)', gap: 16 }}>
            {visibleOpenLots.map(renderActiveLot)}
            {Array.from({ length: Math.max(0, MAX_ACTIVE_LOTS - visibleOpenLots.length) }).map((_, index) => (
              <div key={`empty-${index}`} style={{ borderRadius: 18, background: 'rgba(255,255,255,.025)', border: '1px dashed rgba(255,255,255,.08)' }} />
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 18, height: 74, flex: 'none', padding: '0 24px', borderRadius: 16, background: 'rgba(0,230,118,.05)', border: '1px solid rgba(0,230,118,.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, flex: 'none' }}>
              <span style={{ width: 5, height: 22, borderRadius: 3, background: '#00E676' }} />
              <span style={{ font: "800 14px/1 'JetBrains Mono'", letterSpacing: 3, color: '#5ff0a6', textTransform: 'uppercase' }}>Закрытые лоты</span>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 30, height: 30, padding: '0 9px', borderRadius: 8, background: 'rgba(0,230,118,.16)', border: '1px solid rgba(0,230,118,.3)', font: "900 16px 'Saira'", color: '#00E676' }}>
                {visibleClosedLots.length}
              </span>
            </div>
            {closedLots.length > MAX_DONE_LOTS && (
              <div style={{ flex: '0 0 auto', font: "800 12px 'JetBrains Mono'", letterSpacing: 1, color: '#5ff0a6', textTransform: 'uppercase', opacity: .9 }}>
                Закрытые: показано {visibleClosedLots.length} из {closedLots.length}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, overflow: 'hidden' }}>
              {visibleClosedLots.map(renderClosedLot)}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default TvLotProgressView;
