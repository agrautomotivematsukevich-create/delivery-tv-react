import React, { useState, useEffect } from 'react';
import { DashboardData, TranslationSet } from '../types';
import { Package, Clock } from 'lucide-react';

interface DashboardProps {
  data: DashboardData | null;
  t: TranslationSet;
}

const SHIFT_NORM    = 55;
const SHIFT_LEN_MIN = 530; // 8ч 50м
const UNLOAD_TARGET = 30;  // норма выгрузки, минут

// ── Утилиты времени ────────────────────────────────────────────────────────────

/** "HH:MM" → минуты от полуночи. null при ошибке. */
function hhmm(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

/** Минут прошло с момента старта до сейчас (с учётом перехода через полночь). */
function elapsedSince(startHHMM: string): number {
  const startMin = hhmm(startHHMM);
  if (startMin === null) return 0;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let diff = nowMin - startMin;
  if (diff < -60) diff += 1440;
  return Math.max(0, diff);
}

// ── Логика смен ────────────────────────────────────────────────────────────────

/** Сохраняет baseline вечерней смены (сколько было сделано к 16:40). */
function getEveningBaseline(currentDone: number): number {
  const now    = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // После полуночи до 1:40 — всё ещё вечерняя, дата = вчера
  const dateRef = (nowMin < 1 * 60 + 40)
    ? new Date(now.getTime() - 86400000)
    : now;
  const key = `wh_eve_${dateRef.toISOString().split('T')[0]}`;

  const stored = localStorage.getItem(key);
  if (stored !== null) {
    const v = parseInt(stored);
    if (!isNaN(v) && v <= currentDone) return v; // используем сохранённое
  }
  // Первый заход в вечернюю смену сегодня → фиксируем
  localStorage.setItem(key, String(currentDone));
  return currentDone;
}

interface ShiftProgress {
  shiftDone:   number; // выполнено за ТЕКУЩУЮ смену
  expected:    number; // ожидается по темпу
  barFraction: number; // 0–1: прогресс текущей смены (для маркера)
}

function getShiftProgress(done: number): ShiftProgress {
  const now    = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const mornStart = 7 * 60 + 50;   // 470
  const eveStart  = 16 * 60 + 40;  // 1000
  const noop = { shiftDone: 0, expected: 0, barFraction: 0 };

  // Между 01:40 и 07:50 — смен нет
  if (nowMin >= 1 * 60 + 40 && nowMin < mornStart) return noop;

  if (nowMin >= mornStart && nowMin < eveStart) {
    // ── Утренняя смена ──────────────────────────────────────────────────────
    const elapsed  = nowMin - mornStart;
    const fraction = Math.min(1, elapsed / SHIFT_LEN_MIN);
    return {
      shiftDone:   done,
      expected:    Math.round(fraction * SHIFT_NORM),
      barFraction: fraction,
    };
  }

  // ── Вечерняя смена ─────────────────────────────────────────────────────────
  const baseline = getEveningBaseline(done);
  const adjNow   = nowMin >= eveStart ? nowMin : nowMin + 1440;
  const elapsed  = adjNow - eveStart;
  const fraction = Math.min(1, elapsed / SHIFT_LEN_MIN);
  return {
    shiftDone:   Math.max(0, done - baseline),
    expected:    Math.round(fraction * SHIFT_NORM),
    barFraction: fraction,
  };
}

// ── Компонент: таймер выгрузки ─────────────────────────────────────────────────

const RADIUS = 22;
const CIRC   = 2 * Math.PI * RADIUS;

const UnloadTimer: React.FC<{ startTime: string }> = ({ startTime }) => {
  const [elapsed, setElapsed] = useState(() => elapsedSince(startTime));

  useEffect(() => {
    const id = setInterval(() => setElapsed(elapsedSince(startTime)), 30000);
    return () => clearInterval(id);
  }, [startTime]);

  const pct      = Math.min(1, elapsed / UNLOAD_TARGET);
  const isOver   = elapsed > UNLOAD_TARGET;
  const isWarn   = !isOver && elapsed >= UNLOAD_TARGET - 5;
  const remaining = Math.max(0, UNLOAD_TARGET - elapsed);

  const color = isOver ? '#f87171' : isWarn ? '#fbbf24' : '#00e676';
  const offset = CIRC * (1 - pct);

  return (
    <div className="relative shrink-0 flex items-center justify-center"
      style={{ width: 56, height: 56 }}>
      <svg width="56" height="56" className="-rotate-90">
        {/* Трек */}
        <circle cx="28" cy="28" r={RADIUS}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
        {/* Прогресс */}
        <circle cx="28" cy="28" r={RADIUS}
          fill="none" stroke={color} strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }}
          className={isOver ? 'animate-pulse' : ''}
        />
      </svg>
      {/* Текст в центре */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono font-black tabular-nums leading-none"
          style={{ fontSize: 12, color }}>
          {isOver ? `+${elapsed - UNLOAD_TARGET}` : remaining}
        </span>
        <span className="font-mono leading-none" style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>
          МИН
        </span>
      </div>
    </div>
  );
};

// ── Компонент: виджет нормы смены ─────────────────────────────────────────────

const ShiftNormWidget: React.FC<{ done: number; t: TranslationSet }> = ({ done, t }) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const { shiftDone, expected, barFraction } = getShiftProgress(done);
  const delta = shiftDone - expected;
  const isAhead    = delta >= 2;
  const isBehind   = delta <= -3;
  const normReached = shiftDone >= SHIFT_NORM;

  const status = normReached
    ? { label: '✓ НОРМА',        cls: 'text-emerald-400', bar: 'bg-emerald-400' }
    : isAhead
    ? { label: t.shift_ahead,    cls: 'text-emerald-400', bar: 'bg-emerald-400' }
    : isBehind
    ? { label: t.shift_behind,   cls: 'text-red-400',     bar: 'bg-red-400'     }
    : { label: t.shift_on_track, cls: 'text-white/50',    bar: 'bg-white/30'    };

  const barPct  = Math.min(100, (shiftDone / SHIFT_NORM) * 100);
  const markPct = Math.min(100, barFraction * 100);

  return (
    <div className={`w-full mt-4 rounded-2xl px-5 py-4 space-y-2.5 border transition-colors duration-500 ${
      isBehind               ? 'border-red-500/20 bg-red-500/5'
      : (isAhead||normReached) ? 'border-emerald-500/20 bg-emerald-500/5'
      : 'border-white/8 bg-white/4'
    }`}>
      <div className="flex items-baseline justify-between">
        <span className={`text-5xl font-black tabular-nums leading-none ${status.cls}`}>
          {shiftDone}
        </span>
        <span className={`text-sm font-bold uppercase tracking-widest ${status.cls} opacity-80`}>
          {status.label}
        </span>
      </div>
      <div className="relative h-2 w-full rounded-full bg-white/8 overflow-visible">
        <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-white/25 rounded-full z-10"
          style={{ left: `${markPct}%` }} />
        <div className={`h-full rounded-full transition-all duration-700 ${status.bar}`}
          style={{ width: `${barPct}%` }} />
      </div>
    </div>
  );
};

// ── Утилиты дашборда ───────────────────────────────────────────────────────────

const formatMinutes = (totalMinutes: number, t: TranslationSet): string => {
  const abs  = Math.abs(totalMinutes);
  const h    = Math.floor(abs / 60);
  const m    = abs % 60;
  const ts   = h > 0 ? `${h}ч ${m} мин` : `${m} мин`;
  return `${totalMinutes >= 0 ? t.eta_prefix : t.delay_prefix}${ts}`;
};

const calculateTimeDiff = (timeStr: string, t: TranslationSet): string => {
  const min = hhmm(timeStr);
  if (min === null) return '...';
  const now = new Date();
  let diff  = min - (now.getHours() * 60 + now.getMinutes());
  if (diff < -720) diff += 1440;
  if (diff === 0) return 'NOW';
  return formatMinutes(diff, t);
};

// ── Главный компонент ─────────────────────────────────────────────────────────

const Dashboard: React.FC<DashboardProps> = ({ data, t }) => {
  if (!data) return <div className="text-white/30 animate-pulse text-center mt-20">Loading…</div>;

  const percent         = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;
  const circumference   = 2 * Math.PI * 150;
  const strokeOffset    = circumference - (percent / 100) * circumference;
  const isVictory       = data.total > 0 && data.done === data.total;
  const isEmpty         = data.total === 0;

  const getStatusClass = (s: string) => {
    if (s === 'ACTIVE') return 'text-accent-green border-accent-green bg-accent-green/10 shadow-[0_0_20px_rgba(0,230,118,0.4)]';
    if (s === 'PAUSE')  return 'text-accent-yellow border-accent-yellow bg-accent-yellow/10';
    return 'bg-white/5 border-white/5 text-white';
  };

  const glass = "bg-card-bg backdrop-blur-xl border border-white/10 border-t-white/15 rounded-3xl shadow-[0_20px_40px_rgba(0,0,0,0.4)]";

  return (
    <div className="dashboard-root grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8 flex-1 min-h-0">

      {/* ── Левая панель ── */}
      <div className={`${glass} relative flex flex-col items-center justify-between p-10 overflow-hidden text-center`}>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] bg-accent-green blur-[120px] opacity-5 pointer-events-none" />
        <div className="text-xs font-bold text-white/30 uppercase tracking-[2px] w-full text-left mb-2">{t.progress}</div>

        <div className="flex-1 flex items-center justify-center w-full my-4">
          <div className="relative w-[85%] pb-[85%] h-0">
            <svg className="absolute top-0 left-0 w-full h-full -rotate-90" viewBox="0 0 350 350">
              <circle cx="175" cy="175" r="150" fill="none" strokeWidth="8" className="stroke-white/5" />
              <circle cx="175" cy="175" r="150" fill="none" strokeWidth="8" strokeLinecap="round"
                className="stroke-accent-green transition-all duration-1000 ease-in-out"
                strokeDasharray={circumference}
                strokeDashoffset={strokeOffset}
              />
            </svg>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-6xl lg:text-7xl font-extrabold tracking-tighter text-white z-10">
              {percent}%
            </div>
          </div>
        </div>

        <div className="font-mono text-3xl text-white/50 font-medium mb-6">{data.done} / {data.total}</div>

        <div className={`w-full py-5 rounded-2xl text-lg font-extrabold uppercase tracking-widest border transition-all duration-300 ${getStatusClass(data.status)}`}>
          {data.status === 'ACTIVE' ? t.status_active : data.status === 'PAUSE' ? t.status_pause : t.status_wait}
        </div>

        <ShiftNormWidget done={data.done} t={t} />
      </div>

      {/* ── Правая панель ── */}
      <div className="flex flex-col gap-6 h-full min-h-0">

        {/* Следующий */}
        {!isVictory && !isEmpty && (
          <div className={`${glass} p-8 flex flex-col justify-center`}>
            <div className="text-xs font-bold text-white/30 uppercase tracking-[2px] mb-2">{t.next}</div>
            <div className="font-mono text-6xl md:text-7xl font-bold tracking-tighter my-2 bg-gradient-to-b from-white to-gray-400 bg-clip-text text-transparent break-all">
              {data.nextId}
            </div>
            <div className="text-2xl text-accent-blue font-semibold flex items-center gap-3">
              <Clock className="w-6 h-6" />
              {calculateTimeDiff(data.nextTime, t)}
            </div>
          </div>
        )}

        {/* Активные — с таймером */}
        {!isVictory && !isEmpty && (
          <div className={`${glass} flex-1 min-h-0 flex flex-col relative overflow-hidden`}>
            <div className="text-xs font-bold text-white/30 uppercase tracking-[2px] p-6 pb-0">{t.list}</div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {data.activeList.map(item => {
                const elapsed  = elapsedSince(item.start);
                const isOver   = elapsed > UNLOAD_TARGET;
                const isWarn   = !isOver && elapsed >= UNLOAD_TARGET - 5;
                const glowCls  = isOver
                  ? 'border-red-500/30 bg-red-500/5 shadow-[0_0_20px_rgba(248,113,113,0.08)]'
                  : isWarn
                  ? 'border-yellow-500/30 bg-yellow-500/5'
                  : 'border-white/5 bg-white/5';

                return (
                  <div key={item.id}
                    className={`flex items-center p-5 rounded-2xl border transition-all group relative ${glowCls}`}>

                    {/* Таймер (кольцо) */}
                    <UnloadTimer startTime={item.start} />

                    {/* ID + зона */}
                    <div className="flex-1 flex items-center gap-4 ml-5 overflow-hidden">
                      <span className="font-mono text-3xl md:text-4xl font-bold tracking-tight text-gray-100 truncate">
                        {item.id}
                      </span>
                      {item.zone && (
                        <span className="px-2 py-1 rounded bg-white/10 border border-white/10 text-sm font-bold text-white/70 uppercase shrink-0">
                          {item.zone}
                        </span>
                      )}
                    </div>

                    {/* Время старта */}
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

        {/* Победа / пусто */}
        {(isVictory || isEmpty) && (
          <div className={`${glass} flex-1 flex flex-col items-center justify-center text-center p-8`}>
            {isVictory ? (
              <>
                <div className="text-8xl mb-6 animate-bounce">🏆</div>
                <div className="text-4xl md:text-5xl font-black text-white">{t.victory}</div>
              </>
            ) : (
              <>
                <div className="text-8xl mb-6 opacity-30">📅</div>
                <div className="text-4xl md:text-5xl font-black text-white/30">{t.empty}</div>
              </>
            )}
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
