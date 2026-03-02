import React, { useState, useEffect } from 'react';
import { DashboardData, TranslationSet, Task } from '../types';
import { Clock, Truck } from 'lucide-react';
import { api } from '../services/api';

interface DashboardProps {
  data: DashboardData | null;
  t: TranslationSet;
  tvMode?: boolean;
}

const SHIFT_NORM    = 55;
const SHIFT_LEN_MIN = 540;
const UNLOAD_TARGET = 30;

// Зоны выгрузки — из ActionModal
const DOCK_ZONES = ['G4', 'G5', 'G7', 'G8', 'G9', 'P70'];

// ── Утилиты ─────────────────────────────────────────────────────────────────────

function hhmm(s: string): number | null {
  const m = (s || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function elapsedSince(startHHMM: string): number {
  const startMin = hhmm(startHHMM);
  if (startMin === null) return 0;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let diff = nowMin - startMin;
  if (diff < -60) diff += 1440;
  return Math.max(0, diff);
}

type ShiftName = 'morning' | 'evening' | 'night' | 'none';

function currentShift(): ShiftName {
  const m = new Date().getHours() * 60 + new Date().getMinutes();
  if (m >= 470 && m < 1010) return 'morning';
  if (m >= 1010 || m < 110) return 'evening';
  if (m >= 110  && m < 470) return 'night';
  return 'none';
}

function getBaseline(key: string, currentDone: number): number {
  const stored = localStorage.getItem(key);
  if (stored !== null) {
    const v = parseInt(stored);
    if (!isNaN(v) && v <= currentDone) return v;
  }
  localStorage.setItem(key, String(currentDone));
  return currentDone;
}

interface ShiftProgress { shiftDone: number; expected: number; barFraction: number; }

function getShiftProgress(done: number): ShiftProgress {
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  if (nowMin >= 470 && nowMin < 1010) {
    const elapsed = nowMin - 470;
    const fraction = Math.min(1, elapsed / SHIFT_LEN_MIN);
    return { shiftDone: done, expected: Math.round(fraction * SHIFT_NORM), barFraction: fraction };
  }
  if (nowMin >= 1010 || nowMin < 110) {
    const today = new Date(); if (nowMin < 110) today.setDate(today.getDate() - 1);
    const baseline = getBaseline(`wh_eve_${today.toISOString().split('T')[0]}`, done);
    const adjNow = nowMin >= 1010 ? nowMin : nowMin + 1440;
    const fraction = Math.min(1, (adjNow - 1010) / SHIFT_LEN_MIN);
    return { shiftDone: Math.max(0, done - baseline), expected: Math.round(fraction * SHIFT_NORM), barFraction: fraction };
  }
  if (nowMin >= 110 && nowMin < 470) {
    const today = new Date(); today.setDate(today.getDate() - 1);
    const baseline = getBaseline(`wh_ngt_${today.toISOString().split('T')[0]}`, done);
    const fraction = Math.min(1, (nowMin - 110) / SHIFT_LEN_MIN);
    return { shiftDone: Math.max(0, done - baseline), expected: Math.round(fraction * SHIFT_NORM), barFraction: fraction };
  }
  return { shiftDone: 0, expected: 0, barFraction: 0 };
}

const formatMinutes = (totalMinutes: number, t: TranslationSet): string => {
  const abs = Math.abs(totalMinutes);
  const h = Math.floor(abs / 60), m = abs % 60;
  const ts = h > 0 ? `${h}ч ${m} мин` : `${m} мин`;
  return `${totalMinutes >= 0 ? t.eta_prefix : t.delay_prefix}${ts}`;
};

const calculateTimeDiff = (timeStr: string, t: TranslationSet): string => {
  const min = hhmm(timeStr);
  if (min === null) return '...';
  const now = new Date();
  let diff = min - (now.getHours() * 60 + now.getMinutes());
  if (diff < -720) diff += 1440;
  if (diff === 0) return 'NOW';
  return formatMinutes(diff, t);
};

// ── UnloadTimer ─────────────────────────────────────────────────────────────────

const UnloadTimer: React.FC<{ startTime: string; sz?: number }> = ({ startTime, sz = 56 }) => {
  const [elapsed, setElapsed] = useState(() => elapsedSince(startTime));
  useEffect(() => {
    const id = setInterval(() => setElapsed(elapsedSince(startTime)), 30000);
    return () => clearInterval(id);
  }, [startTime]);
  const r     = sz * 0.39;
  const circ  = 2 * Math.PI * r;
  const isOver = elapsed > UNLOAD_TARGET;
  const isWarn = !isOver && elapsed >= UNLOAD_TARGET - 5;
  const color  = isOver ? '#f87171' : isWarn ? '#fbbf24' : '#00e676';
  const offset = circ * (1 - Math.min(1, elapsed / UNLOAD_TARGET));
  return (
    <div className="relative shrink-0 flex items-center justify-center" style={{ width: sz, height: sz }}>
      <svg width={sz} height={sz} className="-rotate-90">
        <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={sz * 0.07} />
        <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke={color} strokeWidth={sz * 0.07}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }}
          className={isOver ? 'animate-pulse' : ''} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono font-black tabular-nums leading-none" style={{ fontSize: sz * 0.22, color }}>
          {isOver ? `+${elapsed - UNLOAD_TARGET}` : Math.max(0, UNLOAD_TARGET - elapsed)}
        </span>
        <span className="font-mono leading-none" style={{ fontSize: sz * 0.14, color: 'rgba(255,255,255,0.3)' }}>МИН</span>
      </div>
    </div>
  );
};

// ── ShiftNormWidget ─────────────────────────────────────────────────────────────

const ShiftNormWidget: React.FC<{ done: number; t: TranslationSet; compact?: boolean }> = ({ done, t, compact }) => {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(n => n + 1), 60000); return () => clearInterval(id); }, []);
  const { shiftDone, expected, barFraction } = getShiftProgress(done);
  const delta = shiftDone - expected;
  const isAhead = delta >= 2, isBehind = delta <= -3, normReached = shiftDone >= SHIFT_NORM;
  const status = normReached
    ? { label: '✓ НОРМА',       cls: 'text-emerald-400', bar: 'bg-emerald-400' }
    : isAhead  ? { label: t.shift_ahead,  cls: 'text-emerald-400', bar: 'bg-emerald-400' }
    : isBehind ? { label: t.shift_behind, cls: 'text-red-400',     bar: 'bg-red-400'     }
    :            { label: t.shift_on_track, cls: 'text-white/50',   bar: 'bg-white/30'    };
  const barPct  = Math.min(100, (shiftDone / SHIFT_NORM) * 100);
  const markPct = Math.min(100, barFraction * 100);
  return (
    <div className={`w-full mt-3 rounded-2xl px-5 py-4 space-y-2.5 border transition-colors duration-500 ${
      isBehind ? 'border-red-500/20 bg-red-500/5'
      : (isAhead || normReached) ? 'border-emerald-500/20 bg-emerald-500/5'
      : 'border-white/8 bg-white/4'
    }`}>
      <div className="flex items-baseline justify-between">
        <span className={`font-black tabular-nums leading-none ${status.cls} ${compact ? 'text-5xl' : 'text-5xl'}`}>{shiftDone}</span>
        <span className={`font-bold uppercase tracking-widest ${status.cls} opacity-80 text-sm`}>{status.label}</span>
      </div>
      <div className="relative h-2 w-full rounded-full bg-white/8 overflow-visible">
        <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-white/25 rounded-full z-10" style={{ left: `${markPct}%` }} />
        <div className={`h-full rounded-full transition-all duration-700 ${status.bar}`} style={{ width: `${barPct}%` }} />
      </div>
    </div>
  );
};

// ── ShiftStatsBlock ─────────────────────────────────────────────────────────────

const ShiftStatsBlock: React.FC<{ data: DashboardData; tvMode?: boolean }> = ({ data, tvMode }) => {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(n => n + 1), 60000); return () => clearInterval(id); }, []);
  const active = currentShift();
  const { shiftDone } = getShiftProgress(data.done);
  const backendHasData = data.shiftCounts && (
    data.shiftCounts.morning > 0 || data.shiftCounts.evening > 0 || data.shiftCounts.night > 0
  );
  const getCount = (key: 'morning' | 'evening' | 'night') => {
    if (backendHasData) return data.shiftCounts[key] ?? 0;
    return key === active ? shiftDone : 0;
  };
  const shifts = [
    { key: 'morning' as const, label: 'УТРО',  emoji: '☀️', color: 'text-amber-400',  border: 'border-amber-400/35',  bg: 'bg-amber-400/8' },
    { key: 'evening' as const, label: 'ВЕЧЕР', emoji: '🌆', color: 'text-orange-400', border: 'border-orange-400/35', bg: 'bg-orange-400/8' },
    { key: 'night'   as const, label: 'НОЧЬ',  emoji: '🌙', color: 'text-indigo-400', border: 'border-indigo-400/35', bg: 'bg-indigo-400/8' },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {shifts.map(sh => {
        const count = getCount(sh.key);
        const isActive = sh.key === active;
        return (
          <div key={sh.key} className={`rounded-2xl px-3 py-3 border transition-all duration-300 flex flex-col items-center gap-1 ${
            isActive ? `${sh.border} ${sh.bg}` : 'border-white/5 bg-white/2'
          }`}>
            <div className={`flex items-center gap-1.5 ${isActive ? sh.color : 'text-white/25'}`}>
              <span className="text-sm">{sh.emoji}</span>
              <span className="font-black uppercase tracking-wider text-[9px]">{sh.label}</span>
              {isActive && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
            </div>
            <div className={`font-black tabular-nums leading-none ${tvMode ? 'text-4xl' : 'text-3xl'} ${isActive ? sh.color : 'text-white/40'}`}>
              {count}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── DockZonesGrid ───────────────────────────────────────────────────────────────

interface ZoneInfo {
  name: string;
  active: boolean;
  containerId?: string;
  elapsed?: number;
  isOver?: boolean;
}

const DockZonesGrid: React.FC<{ activeList: DashboardData['activeList']; tvMode?: boolean }> = ({ activeList, tvMode }) => {
  // Строим map зона → активная задача
  const zoneMap = new Map<string, { id: string; start: string; elapsed: number }>();
  for (const item of activeList) {
    if (item.zone) {
      const el = elapsedSince(item.start);
      zoneMap.set(item.zone, { id: item.id, start: item.start, elapsed: el });
    }
  }

  const zones: ZoneInfo[] = DOCK_ZONES.map(name => {
    const task = zoneMap.get(name);
    if (task) {
      return { name, active: true, containerId: task.id, elapsed: task.elapsed, isOver: task.elapsed > UNLOAD_TARGET };
    }
    return { name, active: false };
  });

  return (
    <div>
      <div className="text-[10px] font-bold text-white/30 uppercase tracking-[2px] mb-2">Зоны выгрузки</div>
      <div className="grid grid-cols-3 gap-2">
        {zones.map(z => {
          const isOver = z.isOver ?? false;
          const isWarn = z.active && !isOver && (z.elapsed ?? 0) >= UNLOAD_TARGET - 5;

          let borderCls = 'border-white/6 bg-white/2';
          let dotCls    = 'bg-white/15';
          let labelCls  = 'text-white/20';
          let nameCls   = 'text-white/30';

          if (z.active) {
            if (isOver) {
              borderCls = 'border-red-500/40 bg-red-500/6 shadow-[0_0_12px_rgba(248,113,113,0.12)]';
              dotCls    = 'bg-red-400 animate-pulse';
              labelCls  = 'text-red-300/80';
              nameCls   = 'text-red-300';
            } else if (isWarn) {
              borderCls = 'border-yellow-500/40 bg-yellow-500/6';
              dotCls    = 'bg-yellow-400 animate-pulse';
              labelCls  = 'text-yellow-300/80';
              nameCls   = 'text-yellow-300';
            } else {
              borderCls = 'border-emerald-500/40 bg-emerald-500/6 shadow-[0_0_10px_rgba(0,230,118,0.08)]';
              dotCls    = 'bg-emerald-400';
              labelCls  = 'text-emerald-300/80';
              nameCls   = 'text-emerald-300';
            }
          }

          return (
            <div key={z.name} className={`rounded-xl border transition-all duration-500 overflow-hidden ${borderCls} ${tvMode ? 'p-3' : 'p-2.5'}`}>
              {/* Заголовок зоны */}
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotCls}`} />
                <span className={`font-black text-xs tracking-wider uppercase ${nameCls}`}>{z.name}</span>
              </div>
              {z.active ? (
                <>
                  <div className={`font-mono text-[10px] font-bold truncate ${labelCls}`} title={z.containerId}>
                    {z.containerId}
                  </div>
                  <div className={`font-mono text-xs font-black mt-1 ${isOver ? 'text-red-400' : isWarn ? 'text-yellow-400' : 'text-emerald-400'}`}>
                    {isOver ? `+${(z.elapsed ?? 0) - UNLOAD_TARGET} мин` : `${Math.max(0, UNLOAD_TARGET - (z.elapsed ?? 0))} мин`}
                  </div>
                </>
              ) : (
                <div className="text-[10px] text-white/15 font-medium mt-1">простой</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── OnTerritoryBlock ────────────────────────────────────────────────────────────

const OnTerritoryBlock: React.FC<{ arrivedTasks: Task[]; tvMode?: boolean }> = ({ arrivedTasks, tvMode }) => {
  const count = arrivedTasks.length;
  const hasAuto = count > 0;
  return (
    <div className={`mt-3 rounded-xl border px-4 py-3 transition-all duration-500 ${
      hasAuto ? 'border-blue-400/30 bg-blue-500/8' : 'border-white/6 bg-white/2'
    }`}>
      {/* Заголовок */}
      <div className="flex items-center gap-2.5 mb-1">
        <div className="relative shrink-0">
          <Truck className={`${tvMode ? 'w-5 h-5' : 'w-4 h-4'} ${hasAuto ? 'text-blue-400' : 'text-white/20'}`} />
          {hasAuto && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
              <span className="text-[7px] font-black text-white leading-none">{count}</span>
            </span>
          )}
        </div>
        {hasAuto ? (
          <div className="flex-1">
            <span className={`font-bold text-blue-300 uppercase tracking-wider ${tvMode ? 'text-xs' : 'text-[10px]'}`}>
              На территории — ожидают выгрузки
            </span>
          </div>
        ) : (
          <span className={`font-bold text-white/20 uppercase tracking-wider ${tvMode ? 'text-xs' : 'text-[10px]'}`}>
            Нет авто на площадке
          </span>
        )}
        {hasAuto && (
          <span className={`font-black tabular-nums text-blue-300 ${tvMode ? 'text-3xl' : 'text-2xl'} leading-none shrink-0`}>{count}</span>
        )}
      </div>

      {/* Список прибывших */}
      {hasAuto && (
        <div className="flex flex-col gap-1 mt-2">
          {arrivedTasks.map(task => (
            <div key={task.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-blue-500/8 border border-blue-400/15">
              <span className="font-mono text-xs font-bold text-blue-200 flex-1 truncate">{task.id}</span>
              {task.arrival_time && (
                <div className="flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3 text-blue-400/60" />
                  <span className="font-mono text-[10px] font-bold text-blue-400/80">{task.arrival_time}</span>
                  {/* Считаем сколько ждёт */}
                  <span className="text-[9px] text-white/30 ml-1">
                    ({Math.max(0, elapsedSince(task.arrival_time))} мин)
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── TVClock ─────────────────────────────────────────────────────────────────────

const TVClock: React.FC = () => {
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
      setDate(now.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', weekday: 'short' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex flex-col items-center border-t border-white/5 pt-4 mt-auto">
      <div className="font-mono text-5xl font-black text-white/80 tabular-nums tracking-tight">{time}</div>
      <div className="text-sm font-medium text-white/30 mt-1 capitalize">{date}</div>
    </div>
  );
};

// ── ГЛАВНЫЙ КОМПОНЕНТ ──────────────────────────────────────────────────────────

const Dashboard: React.FC<DashboardProps> = ({ data, t, tvMode = false }) => {
  const [allTasks, setAllTasks] = useState<Task[]>([]);

  // Загружаем все задачи для TV режима (нужен arrival_time и зоны)
  useEffect(() => {
    const load = async () => {
      const tasks = await api.fetchTasks('get_stats');
      setAllTasks(tasks);
    };
    load();
    const id = setInterval(load, tvMode ? 15000 : 60000);
    return () => clearInterval(id);
  }, [tvMode]);

  if (!data) return <div className="text-white/30 animate-pulse text-center mt-20">Loading…</div>;

  const percent       = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;
  const circumference = 2 * Math.PI * 150;
  const strokeOffset  = circumference - (percent / 100) * circumference;
  const isVictory     = data.total > 0 && data.done === data.total;
  const isEmpty       = data.total === 0;

  // Вычисляем авто на территории из реальных данных задач
  // arrival_time есть + статус WAIT (не начата выгрузка)
  const arrivedTasks = allTasks.filter(
    tk => tk.status === 'WAIT' && tk.arrival_time && tk.arrival_time.trim() !== ''
  );

  const getStatusClass = (s: string) => {
    if (s === 'ACTIVE') return 'text-accent-green border-accent-green bg-accent-green/10 shadow-[0_0_20px_rgba(0,230,118,0.4)]';
    if (s === 'PAUSE')  return 'text-accent-yellow border-accent-yellow bg-accent-yellow/10';
    return 'bg-white/5 border-white/5 text-white';
  };

  const glass = "bg-card-bg backdrop-blur-xl border border-white/10 border-t-white/15 rounded-3xl shadow-[0_20px_40px_rgba(0,0,0,0.4)]";

  // ── TV MODE ──────────────────────────────────────────────────────────────────
  if (tvMode) {
    return (
      <div className="tv-root grid h-full min-h-0" style={{ gridTemplateColumns: '360px 1fr 320px', gap: '14px' }}>

        {/* Колонка 1: Прогресс + Норма + Смены */}
        <div className={`${glass} relative flex flex-col items-center p-6 overflow-hidden`}>
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[160px] h-[160px] bg-accent-green blur-[100px] opacity-5 pointer-events-none" />
          <div className="text-[10px] font-bold text-white/30 uppercase tracking-[2px] w-full mb-1">{t.progress}</div>

          {/* Круг прогресса */}
          <div className="flex-1 flex items-center justify-center w-full">
            <div className="relative w-[88%] pb-[88%] h-0">
              <svg className="absolute top-0 left-0 w-full h-full -rotate-90" viewBox="0 0 350 350">
                <circle cx="175" cy="175" r="150" fill="none" strokeWidth="10" className="stroke-white/5" />
                <circle cx="175" cy="175" r="150" fill="none" strokeWidth="10" strokeLinecap="round"
                  className="stroke-accent-green transition-all duration-1000" strokeDasharray={circumference} strokeDashoffset={strokeOffset} />
              </svg>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10">
                <span className="text-6xl font-extrabold tracking-tighter text-white">{percent}%</span>
                <span className="text-lg text-white/35 font-mono mt-1">{data.done} / {data.total}</span>
              </div>
            </div>
          </div>

          {/* Статус */}
          <div className={`w-full py-3 rounded-2xl text-sm font-extrabold uppercase tracking-widest border text-center ${getStatusClass(data.status)}`}>
            {data.status === 'ACTIVE' ? t.status_active : data.status === 'PAUSE' ? t.status_pause : t.status_wait}
          </div>

          {/* Норма смены */}
          <ShiftNormWidget done={data.done} t={t} />

          {/* Смены */}
          <div className="w-full mt-3">
            <div className="text-[10px] font-bold text-white/30 uppercase tracking-[2px] mb-2">По сменам</div>
            <ShiftStatsBlock data={data} tvMode />
          </div>
        </div>

        {/* Колонка 2: Следующий + Территория + Активные */}
        <div className="flex flex-col gap-3 h-full min-h-0">

          {!isVictory && !isEmpty && (
            <div className={`${glass} p-5`}>
              <div className="text-[10px] font-bold text-white/30 uppercase tracking-[2px] mb-1">{t.next}</div>
              <div className="font-mono font-bold tracking-tighter bg-gradient-to-b from-white to-gray-400 bg-clip-text text-transparent break-all leading-tight"
                style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}>
                {data.nextId}
              </div>
              <div className="text-base text-accent-blue font-semibold flex items-center gap-2 mt-1">
                <Clock className="w-4 h-4 shrink-0" />
                {calculateTimeDiff(data.nextTime, t)}
              </div>
              {/* Блок авто на территории */}
              <OnTerritoryBlock arrivedTasks={arrivedTasks} tvMode />
            </div>
          )}

          {!isVictory && !isEmpty && (
            <div className={`${glass} flex-1 min-h-0 flex flex-col overflow-hidden`}>
              <div className="text-[10px] font-bold text-white/30 uppercase tracking-[2px] p-4 pb-0">{t.list}</div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 tv-scroll">
                {data.activeList.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-white/15 text-sm">Нет активных</div>
                ) : data.activeList.map(item => {
                  const elapsed = elapsedSince(item.start);
                  const isOver  = elapsed > UNLOAD_TARGET;
                  const isWarn  = !isOver && elapsed >= UNLOAD_TARGET - 5;
                  const glowCls = isOver
                    ? 'border-red-500/30 bg-red-500/5 shadow-[0_0_15px_rgba(248,113,113,0.08)]'
                    : isWarn ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-white/5 bg-white/5';
                  return (
                    <div key={item.id} className={`flex items-center p-4 rounded-2xl border ${glowCls}`}>
                      <UnloadTimer startTime={item.start} sz={64} />
                      <div className="flex-1 flex items-center gap-3 ml-4 overflow-hidden">
                        <span className="font-mono text-3xl font-bold tracking-tight text-gray-100 truncate">{item.id}</span>
                        {item.zone && (
                          <span className="px-2 py-1 rounded bg-white/10 border border-white/10 text-xs font-bold text-white/70 uppercase shrink-0">{item.zone}</span>
                        )}
                      </div>
                      <div className="ml-auto flex flex-col items-end shrink-0">
                        <span className="text-[9px] uppercase text-white/40 font-bold tracking-widest mb-0.5">{t.lbl_start}</span>
                        <span className="font-mono text-xl font-bold text-accent-green">{item.start}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(isVictory || isEmpty) && (
            <div className={`${glass} flex-1 flex flex-col items-center justify-center text-center p-8`}>
              {isVictory
                ? <><div className="text-8xl mb-5 animate-bounce">🏆</div><div className="text-5xl font-black text-white">{t.victory}</div></>
                : <><div className="text-8xl mb-5 opacity-30">📅</div><div className="text-5xl font-black text-white/30">{t.empty}</div></>
              }
            </div>
          )}
        </div>

        {/* Колонка 3: Зоны выгрузки + Часы */}
        <div className={`${glass} flex flex-col p-5 gap-4 overflow-hidden`}>
          <DockZonesGrid activeList={data.activeList} tvMode />
          <TVClock />
        </div>

        <style>{`
          .tv-root .tv-scroll::-webkit-scrollbar { width: 3px; }
          .tv-root .tv-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
        `}</style>
      </div>
    );
  }

  // ── ОБЫЧНЫЙ MODE ────────────────────────────────────────────────────────────────
  return (
    <div className="dashboard-root grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8 flex-1 min-h-0">

      <div className={`${glass} relative flex flex-col items-center justify-between p-10 overflow-hidden text-center`}>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] bg-accent-green blur-[120px] opacity-5 pointer-events-none" />
        <div className="text-xs font-bold text-white/30 uppercase tracking-[2px] w-full text-left mb-2">{t.progress}</div>
        <div className="flex-1 flex items-center justify-center w-full my-4">
          <div className="relative w-[85%] pb-[85%] h-0">
            <svg className="absolute top-0 left-0 w-full h-full -rotate-90" viewBox="0 0 350 350">
              <circle cx="175" cy="175" r="150" fill="none" strokeWidth="8" className="stroke-white/5" />
              <circle cx="175" cy="175" r="150" fill="none" strokeWidth="8" strokeLinecap="round"
                className="stroke-accent-green transition-all duration-1000 ease-in-out"
                strokeDasharray={circumference} strokeDashoffset={strokeOffset} />
            </svg>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-6xl lg:text-7xl font-extrabold tracking-tighter text-white z-10">{percent}%</div>
          </div>
        </div>
        <div className="font-mono text-3xl text-white/50 font-medium mb-6">{data.done} / {data.total}</div>
        <div className={`w-full py-5 rounded-2xl text-lg font-extrabold uppercase tracking-widest border ${getStatusClass(data.status)}`}>
          {data.status === 'ACTIVE' ? t.status_active : data.status === 'PAUSE' ? t.status_pause : t.status_wait}
        </div>
        <ShiftNormWidget done={data.done} t={t} />
        <div className="w-full mt-3">
          <div className="text-[10px] font-bold text-white/30 uppercase tracking-[2px] mb-2">По сменам</div>
          <ShiftStatsBlock data={data} />
        </div>
      </div>

      <div className="flex flex-col gap-6 h-full min-h-0">
        {!isVictory && !isEmpty && (
          <div className={`${glass} p-8`}>
            <div className="text-xs font-bold text-white/30 uppercase tracking-[2px] mb-2">{t.next}</div>
            <div className="font-mono text-6xl md:text-7xl font-bold tracking-tighter my-2 bg-gradient-to-b from-white to-gray-400 bg-clip-text text-transparent break-all">
              {data.nextId}
            </div>
            <div className="text-2xl text-accent-blue font-semibold flex items-center gap-3">
              <Clock className="w-6 h-6" />
              {calculateTimeDiff(data.nextTime, t)}
            </div>
            <OnTerritoryBlock arrivedTasks={arrivedTasks} />
          </div>
        )}
        {!isVictory && !isEmpty && (
          <div className={`${glass} flex-1 min-h-0 flex flex-col overflow-hidden`}>
            <div className="text-xs font-bold text-white/30 uppercase tracking-[2px] p-6 pb-0">{t.list}</div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {data.activeList.map(item => {
                const elapsed = elapsedSince(item.start);
                const isOver  = elapsed > UNLOAD_TARGET;
                const isWarn  = !isOver && elapsed >= UNLOAD_TARGET - 5;
                const glowCls = isOver
                  ? 'border-red-500/30 bg-red-500/5 shadow-[0_0_20px_rgba(248,113,113,0.08)]'
                  : isWarn ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-white/5 bg-white/5';
                return (
                  <div key={item.id} className={`flex items-center p-5 rounded-2xl border ${glowCls}`}>
                    <UnloadTimer startTime={item.start} />
                    <div className="flex-1 flex items-center gap-4 ml-5 overflow-hidden">
                      <span className="font-mono text-3xl md:text-4xl font-bold text-gray-100 truncate">{item.id}</span>
                      {item.zone && <span className="px-2 py-1 rounded bg-white/10 border border-white/10 text-sm font-bold text-white/70 uppercase shrink-0">{item.zone}</span>}
                    </div>
                    <div className="ml-auto flex flex-col items-end shrink-0">
                      <span className="text-[0.7rem] uppercase text-white/50 font-bold tracking-widest mb-1">{t.lbl_start}</span>
                      <span className="font-mono text-2xl font-bold text-accent-green">{item.start}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {(isVictory || isEmpty) && (
          <div className={`${glass} flex-1 flex flex-col items-center justify-center text-center p-8`}>
            {isVictory
              ? <><div className="text-8xl mb-6 animate-bounce">🏆</div><div className="text-4xl md:text-5xl font-black text-white">{t.victory}</div></>
              : <><div className="text-8xl mb-6 opacity-30">📅</div><div className="text-4xl md:text-5xl font-black text-white/30">{t.empty}</div></>
            }
          </div>
        )}
      </div>

      <style>{`
        .dashboard-root .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .dashboard-root .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
      `}</style>
    </div>
  );
};

export default Dashboard;
