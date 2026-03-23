import React, { useState, useEffect, useMemo } from 'react';
import { DashboardData, TranslationSet, Task } from '../types';
import { Clock, Truck } from 'lucide-react';
import { api } from '../services/api';
import { parseHHMM, elapsedMin, formatWait } from '../utils/time';
import { currentShift, calculateShiftFact, calculateShiftTargets, formatMinutes, calculateTimeDiff } from '../utils/business';
import { AVAILABLE_ZONES, UNLOAD_TARGET } from '../utils/zones';

// ── UnloadTimer ─────────────────────────────────────────────────────────────────
const UnloadTimer: React.FC<{ startTime: string; sz?: number }> = ({ startTime, sz = 56 }) => {
  const [elapsed, setElapsed] = useState(() => elapsedMin(startTime));
  useEffect(() => {
    const id = setInterval(() => setElapsed(elapsedMin(startTime)), 30000);
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

// ── Skeleton для одной shift-карточки ──────────────────────────────────────────
const ShiftCardSkeleton: React.FC<{ tvMode?: boolean }> = ({ tvMode }) => (
  <div className="rounded-2xl px-2 py-3 border border-white/5 bg-white/2 flex flex-col items-center gap-1 animate-pulse w-full">
    <div className="h-3 w-12 bg-white/10 rounded" />
    <div className="flex items-baseline gap-1 mt-1">
      <div className={`${tvMode ? 'h-9 w-10' : 'h-8 w-8'} bg-white/10 rounded`} />
      <div className="h-4 w-6 bg-white/10 rounded" />
    </div>
  </div>
);

// ── Skeleton для ShiftNormWidget ───────────────────────────────────────────────
const ShiftNormSkeleton: React.FC = () => (
  <div className="w-full mt-3 rounded-2xl px-5 py-4 flex flex-col gap-3 border border-white/8 bg-white/4 animate-pulse">
    <div className="flex items-center justify-between">
      <div className="flex items-baseline gap-2">
        <div className="h-10 w-14 bg-white/10 rounded" />
        <div className="h-5 w-10 bg-white/10 rounded" />
      </div>
      <div className="h-4 w-20 bg-white/10 rounded" />
    </div>
    <div className="h-2 w-full bg-white/8 rounded-full mt-1" />
  </div>
);

// ── ShiftNormWidget ─────────────────────────────────────────────────────────────
const ShiftNormWidget: React.FC<{ data: DashboardData; allTasks: Task[]; t: TranslationSet; compact?: boolean; isLoading?: boolean }> = ({ data, allTasks, t, compact, isLoading }) => {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(n => n + 1), 60000); return () => clearInterval(id); }, []);

  const active = currentShift();
  
  // ⚡️ ГИБРИДНАЯ ЛОГИКА: 
  // Если есть allTasks (авторизован), считаем максимально точно на фронте.
  // Если allTasks пуст (TV-режим), берем готовые цифры с бэкенда!
  const facts = allTasks.length > 0 ? calculateShiftFact(allTasks) : data.shiftFacts;
  const targets = allTasks.length > 0 ? calculateShiftTargets(allTasks, facts, active) : data.shiftTargets;
  
  const target = targets[active] || 0;
  const done = active !== 'none' ? (facts[active] || 0) : 0;
  
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  let fraction = 0;
  if (active === 'morning') {
    fraction = (nowMin - 470) / 540;
  } else if (active === 'evening') {
    const adjNow = nowMin < 110 ? nowMin + 1440 : nowMin;
    fraction = (adjNow - 1010) / 540;
  } else if (active === 'night') {
    fraction = (nowMin - 110) / 360;
  }
  
  fraction = Math.max(0, Math.min(1, fraction));
  const expected = Math.round(target * fraction);
  const delta = done - expected;
  
  const isAhead = delta >= 1; 
  const isBehind = delta <= -2;
  const isVictory = target > 0 && done >= target;

  let statusCls = 'text-white/50';
  let barCls = 'bg-white/30';
  let bgCls = 'border-white/8 bg-white/4';
  
  let labelTop = 'В ГРАФИКЕ';
  let labelBottom = '';
  
  if (isVictory) {
    statusCls = 'text-emerald-400'; barCls = 'bg-emerald-400'; bgCls = 'border-emerald-500/20 bg-emerald-500/5';
    labelTop = 'НОРМА';
    labelBottom = 'ВЫПОЛНЕНА';
  } else if (isAhead) {
    statusCls = 'text-emerald-400'; barCls = 'bg-emerald-400'; bgCls = 'border-emerald-500/20 bg-emerald-500/5';
    labelTop = 'ОПЕРЕЖАЕМ';
    labelBottom = `+${delta} АВТО`;
  } else if (isBehind) {
    statusCls = 'text-red-400'; barCls = 'bg-red-400'; bgCls = 'border-red-500/20 bg-red-500/5';
    labelTop = 'ОТСТАЕМ';
    labelBottom = `${delta} АВТО`;
  }

  const barPct = target > 0 ? Math.min(100, (done / target) * 100) : (done > 0 ? 100 : 0);
  const markPct = target > 0 ? fraction * 100 : 0;

  return (
    <div className={`w-full mt-3 rounded-2xl px-5 py-4 flex flex-col justify-center gap-3 border transition-colors duration-500 ${bgCls}`}>
      <div className="flex items-center justify-between w-full">
        <div className="flex items-baseline gap-2 shrink-0">
          <span className={`font-black tabular-nums leading-none ${statusCls} ${compact ? 'text-4xl' : 'text-5xl'}`}>{done}</span>
          <span className="text-xl font-bold text-white/30 tabular-nums">/ {target}</span>
        </div>
        <div className="flex flex-col items-end justify-center text-right shrink-0">
          <span className={`font-bold uppercase tracking-widest ${statusCls} opacity-80 text-[10px] leading-tight`}>{labelTop}</span>
          {labelBottom && (
            <span className={`font-black uppercase tracking-widest ${statusCls} text-xs mt-0.5 leading-tight`}>{labelBottom}</span>
          )}
        </div>
      </div>
      {target > 0 ? (
        <div className="relative h-2 w-full rounded-full bg-white/8 overflow-visible mt-1">
          <div className="absolute top-1/2 -translate-y-1/2 w-[3px] h-5 bg-white/50 rounded-full z-10 shadow-[0_0_8px_rgba(255,255,255,0.8)]" 
               style={{ left: `${markPct}%`, transition: 'left 1s linear' }} 
               title="Цель на текущую минуту" />
          <div className={`h-full rounded-full transition-all duration-700 shadow-[0_0_10px_currentColor] ${barCls}`} 
               style={{ width: `${barPct}%`, color: barCls.replace('bg-', '') }} />
        </div>
      ) : (
        <div className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Резервное время (вне плана)</div>
      )}
    </div>
  );
};

// ── ShiftStatsBlock ─────────────────────────────────────────────────────────────
const ShiftStatsBlock: React.FC<{ data: DashboardData; allTasks: Task[]; tvMode?: boolean; isLoading?: boolean }> = ({ data, allTasks, tvMode, isLoading }) => {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(n => n + 1), 60000); return () => clearInterval(id); }, []);

  const active = currentShift();
  
  // ⚡️ ГИБРИДНАЯ ЛОГИКА
  const facts = allTasks.length > 0 ? calculateShiftFact(allTasks) : data.shiftFacts;
  const targets = allTasks.length > 0 ? calculateShiftTargets(allTasks, facts, active) : data.shiftTargets;

  const getCount = (key: 'morning' | 'evening' | 'night') => facts[key];

  const shifts = [
    { key: 'morning' as const, label: 'УТРО',  emoji: '☀️', color: 'text-amber-400',  border: 'border-amber-400/35',  bg: 'bg-amber-400/8' },
    { key: 'evening' as const, label: 'ВЕЧЕР', emoji: '🌆', color: 'text-orange-400', border: 'border-orange-400/35', bg: 'bg-orange-400/8' },
    { key: 'night'   as const, label: 'НОЧЬ',  emoji: '🌙', color: 'text-indigo-400', border: 'border-indigo-400/35', bg: 'bg-indigo-400/8' },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 w-full">
      {shifts.map(sh => {
        const count = getCount(sh.key);
        const target = targets[sh.key];
        const isActive = sh.key === active;
        return (
          <div key={sh.key} className={`rounded-2xl px-2 py-3 border transition-all duration-300 flex flex-col items-center gap-1 ${
            isActive ? `${sh.border} ${sh.bg}` : 'border-white/5 bg-white/2'
          }`}>
            <div className={`flex items-center gap-1 ${isActive ? sh.color : 'text-white/50'}`}>
              <span className="text-sm">{sh.emoji}</span>
              <span className="font-black uppercase tracking-wider text-[9px]">{sh.label}</span>
              {isActive && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse shrink-0" />}
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className={`font-black tabular-nums leading-none ${tvMode ? 'text-4xl' : 'text-3xl'} ${isActive ? sh.color : 'text-white/60'}`}>
                {count}
              </span>
              <span className={`font-bold text-sm ${isActive ? 'text-current opacity-50' : 'text-white/30'}`}>
                / {target}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── ShiftStatsBlock ─────────────────────────────────────────────────────────────
const ShiftStatsBlock: React.FC<{ data: DashboardData; allTasks: Task[]; tvMode?: boolean; isLoading?: boolean }> = ({ data, allTasks, tvMode, isLoading }) => {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(n => n + 1), 60000); return () => clearInterval(id); }, []);

  const active = currentShift();
  const facts = useMemo(() => calculateShiftFact(allTasks), [allTasks]);
  const targets = useMemo(() => calculateShiftTargets(allTasks, facts, active), [allTasks, facts, active]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2 w-full">
        <ShiftCardSkeleton tvMode={tvMode} />
        <ShiftCardSkeleton tvMode={tvMode} />
        <ShiftCardSkeleton tvMode={tvMode} />
      </div>
    );
  }
  
  const getCount = (key: 'morning' | 'evening' | 'night') => facts[key];

  const shifts = [
    { key: 'morning' as const, label: 'УТРО',  emoji: '☀️', color: 'text-amber-400',  border: 'border-amber-400/35',  bg: 'bg-amber-400/8' },
    { key: 'evening' as const, label: 'ВЕЧЕР', emoji: '🌆', color: 'text-orange-400', border: 'border-orange-400/35', bg: 'bg-orange-400/8' },
    { key: 'night'   as const, label: 'НОЧЬ',  emoji: '🌙', color: 'text-indigo-400', border: 'border-indigo-400/35', bg: 'bg-indigo-400/8' },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 w-full">
      {shifts.map(sh => {
        const count = getCount(sh.key);
        const target = targets[sh.key];
        const isActive = sh.key === active;
        return (
          <div key={sh.key} className={`rounded-2xl px-2 py-3 border transition-all duration-300 flex flex-col items-center gap-1 ${
            isActive ? `${sh.border} ${sh.bg}` : 'border-white/5 bg-white/2'
          }`}>
            <div className={`flex items-center gap-1 ${isActive ? sh.color : 'text-white/50'}`}>
              <span className="text-sm">{sh.emoji}</span>
              <span className="font-black uppercase tracking-wider text-[9px]">{sh.label}</span>
              {isActive && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse shrink-0" />}
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className={`font-black tabular-nums leading-none ${tvMode ? 'text-4xl' : 'text-3xl'} ${isActive ? sh.color : 'text-white/60'}`}>
                {count}
              </span>
              <span className={`font-bold text-sm ${isActive ? 'text-current opacity-50' : 'text-white/30'}`}>
                / {target}
              </span>
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
  idleMinutes?: number; 
}

const DockZonesGrid: React.FC<{ activeList: DashboardData['activeList']; allTasks?: Task[]; tvMode?: boolean }> = ({ activeList, allTasks = [], tvMode }) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!tvMode) return;
    const id = setInterval(() => setTick(n => n + 1), 60000);
    return () => clearInterval(id);
  }, [tvMode]);

  const zoneMap = new Map<string, { id: string; start: string; elapsed: number }>();
  for (const item of activeList) {
    if (item.zone) {
      const el = elapsedMin(item.start);
      zoneMap.set(item.zone, { id: item.id, start: item.start, elapsed: el });
    }
  }

  const lastDoneMap = new Map<string, number>(); 
  for (const task of allTasks) {
    if (task.status === 'DONE' && task.zone && task.end_time) {
      const endMin = parseHHMM(task.end_time);
      if (endMin !== null) {
        const prev = lastDoneMap.get(task.zone);
        if (prev === undefined || endMin > prev) lastDoneMap.set(task.zone, endMin);
      }
    }
  }
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  const zones: ZoneInfo[] = AVAILABLE_ZONES.map(name => {
    const task = zoneMap.get(name);
    if (task) {
      return { name, active: true, containerId: task.id, elapsed: task.elapsed, isOver: task.elapsed > UNLOAD_TARGET };
    }
    const lastEnd = lastDoneMap.get(name);
    let idleMinutes: number | undefined;
    if (lastEnd !== undefined) {
      idleMinutes = nowMin - lastEnd;
      if (idleMinutes < 0) idleMinutes += 1440;
    }
    return { name, active: false, idleMinutes };
  });

  const busyCount = zones.filter(z => z.active).length;

  if (tvMode) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-bold text-white/50 uppercase tracking-[2px]">Зоны выгрузки</div>
          <div className="text-[10px] font-bold text-white/60 tracking-wider">
            <span className="text-emerald-400">{busyCount}</span>
            <span className="text-white/50 mx-1">/</span>
            <span>{AVAILABLE_ZONES.length}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 flex-1">
          {zones.map(z => {
            const isOver = z.isOver ?? false;
            const isWarn = z.active && !isOver && (z.elapsed ?? 0) >= UNLOAD_TARGET - 5;

            let borderCls = 'border-white/6 bg-white/[0.02]';
            let dotCls    = 'bg-white/15';
            let nameCls   = 'text-white/50';

            if (z.active) {
              if (isOver) {
                borderCls = 'border-red-500/40 bg-red-500/[0.06] shadow-[0_0_20px_rgba(248,113,113,0.1)]';
                dotCls    = 'bg-red-400 animate-pulse';
                nameCls   = 'text-red-300';
              } else if (isWarn) {
                borderCls = 'border-yellow-500/40 bg-yellow-500/[0.06]';
                dotCls    = 'bg-yellow-400 animate-pulse';
                nameCls   = 'text-yellow-300';
              } else {
                borderCls = 'border-emerald-500/40 bg-emerald-500/[0.06] shadow-[0_0_15px_rgba(0,230,118,0.06)]';
                dotCls    = 'bg-emerald-400';
                nameCls   = 'text-emerald-300';
              }
            }

            return (
              <div key={z.name} className={`rounded-2xl border transition-all duration-500 flex flex-col justify-between p-4 ${borderCls}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} />
                    <span className={`font-black text-base tracking-wider uppercase ${nameCls}`}>{z.name}</span>
                  </div>
                  {z.active && (
                    <span className={`text-[9px] font-bold uppercase tracking-wider ${isOver ? 'text-red-400' : isWarn ? 'text-yellow-400' : 'text-emerald-400'}`}>
                      {isOver ? 'ПРЕВЫШЕН' : 'АКТИВНО'}
                    </span>
                  )}
                </div>

                {z.active ? (
                  <div className="flex-1 flex flex-col justify-center">
                    <div className={`font-mono text-sm font-bold truncate mt-2 ${isOver ? 'text-red-300' : isWarn ? 'text-yellow-300' : 'text-emerald-300'}`} title={z.containerId}>
                      {z.containerId}
                    </div>
                    <div className={`font-mono text-3xl font-black mt-1 tabular-nums ${isOver ? 'text-red-400' : isWarn ? 'text-yellow-400' : 'text-emerald-400'}`}>
                      {isOver ? `+${(z.elapsed ?? 0) - UNLOAD_TARGET}` : `${Math.max(0, UNLOAD_TARGET - (z.elapsed ?? 0))}`}
                      <span className="text-sm font-bold ml-1 opacity-60">мин</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col justify-center items-center">
                    {z.idleMinutes !== undefined ? (
                      <>
                        <div className="text-2xl font-black tabular-nums text-white/60 font-mono">
                          {z.idleMinutes >= 60 
                            ? `${Math.floor(z.idleMinutes / 60)}ч ${(z.idleMinutes % 60).toString().padStart(2,'0')}м`
                            : `${z.idleMinutes} мин`}
                        </div>
                        <div className="text-[9px] text-white/45 font-bold uppercase tracking-widest mt-1">простой</div>
                      </>
                    ) : (
                      <div className="text-[10px] text-white/60 font-bold uppercase tracking-widest">свободно</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
         <div className="text-[10px] font-bold text-white/50 uppercase tracking-[2px]">Зоны выгрузки</div>
         <div className="text-[10px] font-bold text-white/60 tracking-wider">
            <span className="text-emerald-400">{busyCount}</span>
            <span className="text-white/50 mx-1">/</span>
            <span>{AVAILABLE_ZONES.length}</span>
          </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 w-full">
        {zones.map(z => {
          const isOver = z.isOver ?? false;
          const isWarn = z.active && !isOver && (z.elapsed ?? 0) >= UNLOAD_TARGET - 5;

          let borderCls = 'border-white/6 bg-white/2';
          let dotCls    = 'bg-white/15';
          let labelCls  = 'text-white/50';
          let nameCls   = 'text-white/50';

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
            <div key={z.name} className={`rounded-xl border transition-all duration-500 overflow-hidden ${borderCls} p-2.5`}>
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
                <div className="flex items-center gap-2 mt-1">
                  {z.idleMinutes !== undefined ? (
                    <>
                       <div className="font-mono text-xs font-bold text-white/60 tabular-nums">
                         {z.idleMinutes >= 60 
                            ? `${Math.floor(z.idleMinutes / 60)}ч ${(z.idleMinutes % 60).toString().padStart(2,'0')}м`
                            : `${z.idleMinutes} м`}
                       </div>
                       <div className="text-[9px] text-white/30 uppercase tracking-widest font-medium mt-0.5">простой</div>
                    </>
                  ) : (
                    <div className="text-[10px] text-white/40 uppercase tracking-widest font-medium mt-0.5">свободно</div>
                  )}
                </div>
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
    <div className={`mt-3 rounded-xl border px-4 py-3 transition-all duration-500 w-full ${
      hasAuto ? 'border-accent-blue/30 bg-accent-blue/8' : 'border-white/6 bg-white/2'
    }`}>
      <div className="flex items-center gap-2.5 mb-1">
        <div className="relative shrink-0">
          <Truck className={`${tvMode ? 'w-5 h-5' : 'w-4 h-4'} ${hasAuto ? 'text-accent-blue' : 'text-white/50'}`} />
          {hasAuto && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-accent-blue flex items-center justify-center shadow-[0_0_10px_rgba(45,212,191,0.5)]">
              <span className="text-[7px] font-black text-white leading-none">{count}</span>
            </span>
          )}
        </div>
        {hasAuto ? (
          <div className="flex-1">
            <span className={`font-bold text-accent-blue uppercase tracking-wider ${tvMode ? 'text-xs' : 'text-[10px]'}`}>
              На территории — ожидают выгрузки
            </span>
          </div>
        ) : (
          <span className={`font-bold text-white/50 uppercase tracking-wider ${tvMode ? 'text-xs' : 'text-[10px]'}`}>
            Нет авто на площадке
          </span>
        )}
        {hasAuto && (
          <span className={`font-black tabular-nums text-accent-blue ${tvMode ? 'text-3xl' : 'text-2xl'} leading-none shrink-0`}>{count}</span>
        )}
      </div>

      {hasAuto && (
        <div className="flex flex-col gap-1 mt-2">
          {arrivedTasks.map(task => (
            <div key={task.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-accent-blue/8 border border-accent-blue/15">
              <span className="font-mono text-xs font-bold text-agr-light flex-1 truncate">{task.id}</span>
              {task.arrival_time && (
                <div className="flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3 text-accent-blue" />
                  <span className="font-mono text-[10px] font-bold text-accent-blue/80">{task.arrival_time}</span>
                  <span className="text-[9px] text-white/50 ml-1">
                    ({Math.max(0, elapsedMin(task.arrival_time))} мин)
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
    <div className="flex items-center justify-center gap-3 border-t border-white/5 pt-3 mt-3 shrink-0">
      <div className="font-mono text-4xl font-black text-white/80 tabular-nums tracking-tight">{time}</div>
      <div className="text-xs font-medium text-white/50 capitalize">{date}</div>
    </div>
  );
};

// ── ГЛАВНЫЙ КОМПОНЕНТ ──────────────────────────────────────────────────────────
interface DashboardProps {
  data: DashboardData | null;
  t: TranslationSet;
  tvMode?: boolean;
  allTasks: Task[];          
  isTasksLoading: boolean;   
}

const Dashboard: React.FC<DashboardProps> = ({ data, t, tvMode = false, allTasks, isTasksLoading }) => {
  
  if (!data) return (
    <div className="flex items-center justify-center w-full h-[50vh]">
       <div className="text-white/50 animate-pulse text-lg font-bold flex items-center gap-3">
         <Clock className="animate-spin text-white/30" /> Загрузка дашборда...
       </div>
    </div>
  );

  const percent       = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;
  const circumference = 2 * Math.PI * 150;
  const strokeOffset  = circumference - (percent / 100) * circumference;
  const isVictory     = data.total > 0 && data.done === data.total;
  const isEmpty       = data.total === 0;

  const arrivedTasks = allTasks.filter(
    tk =>
      tk.arrival_time && tk.arrival_time.trim() !== '' &&
      (!tk.start_time || tk.start_time.trim() === '') &&
      (!tk.end_time   || tk.end_time.trim()   === '')
  );

  const getStatusClass = (s: string) => {
    if (s === 'ACTIVE') return 'text-accent-green border-accent-green bg-accent-green/10 shadow-[0_0_20px_rgba(0,230,118,0.4)]';
    if (s === 'PAUSE')  return 'text-accent-yellow border-accent-yellow bg-accent-yellow/10';
    return 'bg-white/5 border-white/5 text-white/70';
  };

  const glass = "bg-card-bg backdrop-blur-xl border border-white/10 border-t-white/15 rounded-3xl shadow-[0_20px_40px_rgba(0,0,0,0.4)]";

  if (tvMode) {
    return (
      <div className="tv-root grid h-full min-h-0" style={{ gridTemplateColumns: '360px 1fr 320px', gap: '14px' }}>
        <div className={`${glass} relative flex flex-col items-center p-6 overflow-hidden`}>
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[160px] h-[160px] bg-accent-green blur-[100px] opacity-5 pointer-events-none" />
          <div className="text-[10px] font-bold text-white/50 uppercase tracking-[2px] w-full mb-1">{t.progress}</div>

          <div className="flex-1 flex items-center justify-center w-full">
            <div className="relative w-[88%] pb-[88%] h-0">
              <svg className="absolute top-0 left-0 w-full h-full -rotate-90" viewBox="0 0 350 350">
                <circle cx="175" cy="175" r="150" fill="none" strokeWidth="10" className="stroke-white/5" />
                <circle cx="175" cy="175" r="150" fill="none" strokeWidth="10" strokeLinecap="round"
                  className="stroke-accent-green transition-all duration-1000" strokeDasharray={circumference} strokeDashoffset={strokeOffset} />
              </svg>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10">
                <span className="text-6xl font-extrabold tracking-tighter text-white">{percent}%</span>
                <span className="text-lg text-white/50 font-mono mt-1">{data.done} / {data.total}</span>
              </div>
            </div>
          </div>

          <div className={`w-full py-3 rounded-2xl text-sm font-extrabold uppercase tracking-widest border text-center ${getStatusClass(data.status)}`}>
            {data.status === 'ACTIVE' ? t.status_active : data.status === 'PAUSE' ? t.status_pause : t.status_wait}
          </div>

          <ShiftNormWidget data={data} allTasks={allTasks} t={t} isLoading={isTasksLoading} />

          <div className="w-full mt-3">
            <div className="text-[10px] font-bold text-white/50 uppercase tracking-[2px] mb-2">По сменам</div>
            <ShiftStatsBlock data={data} allTasks={allTasks} tvMode isLoading={isTasksLoading} />
          </div>
        </div>

        <div className="flex flex-col gap-3 h-full min-h-0">
          {!isVictory && !isEmpty && (
            <div className={`${glass} p-5`}>
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-[2px] mb-1">{t.next}</div>
              <div className="font-mono font-bold tracking-tighter bg-gradient-to-b from-white to-gray-400 bg-clip-text text-transparent break-all leading-tight"
                style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}>
                {data.nextId}
              </div>
              <div className="text-base text-accent-blue font-semibold flex items-center gap-2 mt-1">
                <Clock className="w-4 h-4 shrink-0" />
                {calculateTimeDiff(data.nextTime, t)}
              </div>
              <OnTerritoryBlock arrivedTasks={arrivedTasks} tvMode />
            </div>
          )}

          {!isVictory && !isEmpty && (
            <div className={`${glass} flex-1 min-h-0 flex flex-col overflow-hidden`}>
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-[2px] p-4 pb-0">{t.list}</div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 tv-scroll">
                {data.activeList.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-white/45 text-sm">Нет активных</div>
                ) : data.activeList.map(item => {
                  const elapsed = elapsedMin(item.start);
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
                        <span className="text-[9px] uppercase text-white/60 font-bold tracking-widest mb-0.5">{t.lbl_start}</span>
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
                : <><div className="text-8xl mb-5 opacity-30">📅</div><div className="text-5xl font-black text-white/50">{t.empty}</div></>
              }
            </div>
          )}
        </div>

        <div className={`${glass} flex flex-col p-5 overflow-hidden`}>
          <div className="flex-1 min-h-0">
            <DockZonesGrid activeList={data.activeList} allTasks={allTasks} tvMode />
          </div>
          <TVClock />
        </div>

        <style>{`
          .tv-root .tv-scroll::-webkit-scrollbar { width: 3px; }
          .tv-root .tv-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="dashboard-root grid grid-cols-1 lg:grid-cols-[380px_1fr] xl:grid-cols-[400px_1fr] gap-6 lg:gap-8 flex-1 min-h-0">
      
      {/* ── ЛЕВАЯ КОЛОНКА (Общий прогресс + Смены) ── */}
      <div className={`${glass} relative flex flex-col p-6 lg:p-8 overflow-hidden h-full`}>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[250px] h-[250px] bg-accent-green blur-[130px] opacity-[0.03] pointer-events-none" />
        
        <div className="text-xs font-bold text-white/50 uppercase tracking-[2px] w-full text-left mb-6">{t.progress}</div>
        
        {/* Круговой график */}
        <div className="flex-1 flex flex-col items-center justify-center w-full min-h-[250px] my-2">
          <div className="relative w-full max-w-[280px] aspect-square">
            <svg className="absolute top-0 left-0 w-full h-full -rotate-90 drop-shadow-[0_0_15px_rgba(0,230,118,0.2)]" viewBox="0 0 350 350">
              <circle cx="175" cy="175" r="150" fill="none" strokeWidth="12" className="stroke-white/5" />
              <circle cx="175" cy="175" r="150" fill="none" strokeWidth="12" strokeLinecap="round"
                className="stroke-accent-green transition-all duration-1000 ease-out"
                strokeDasharray={circumference} strokeDashoffset={strokeOffset} />
            </svg>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10">
              <div className="text-7xl lg:text-8xl font-black tracking-tighter text-white drop-shadow-md">{percent}%</div>
              <div className="font-mono text-2xl text-white/50 font-bold mt-2">{data.done} <span className="text-white/30">/</span> {data.total}</div>
            </div>
          </div>
        </div>

        {/* Статус Дашборда */}
        <div className={`w-full py-4 mt-6 rounded-2xl text-base font-extrabold uppercase tracking-widest border text-center transition-colors duration-500 ${getStatusClass(data.status)}`}>
          {data.status === 'ACTIVE' ? t.status_active : data.status === 'PAUSE' ? t.status_pause : t.status_wait}
        </div>
        
        {/* Блок Нормы */}
        <div className="mt-4 w-full">
           <ShiftNormWidget data={data} allTasks={allTasks} t={t} isLoading={isTasksLoading} />
        </div>

        {/* Блок Смен */}
        <div className="w-full mt-6">
          <div className="text-[10px] font-bold text-white/50 uppercase tracking-[2px] mb-3 flex items-center justify-between">
            <span>По сменам</span>
            {isTasksLoading && <span className="text-white/30 text-[9px] animate-pulse flex items-center gap-1"><Clock size={10}/> Загрузка</span>}
          </div>
          <ShiftStatsBlock data={data} allTasks={allTasks} isLoading={isTasksLoading} />
        </div>
      </div>

      {/* ── ПРАВАЯ КОЛОНКА (Очередь + Территория + Зоны) ── */}
      <div className="flex flex-col gap-6 lg:gap-8 h-full min-h-0">
        
        {/* Верхний ряд: Следующий + На территории */}
        {!isVictory && !isEmpty && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 shrink-0">
            {/* Карточка "Следующий" */}
            <div className={`${glass} p-6 lg:p-8 flex flex-col justify-center`}>
              <div className="text-xs font-bold text-white/50 uppercase tracking-[2px] mb-3">{t.next}</div>
              <div className="font-mono text-5xl xl:text-6xl font-black tracking-tighter my-1 bg-gradient-to-br from-white to-gray-400 bg-clip-text text-transparent truncate">
                {data.nextId}
              </div>
              <div className="text-xl lg:text-2xl text-accent-blue font-bold flex items-center gap-3 mt-2 bg-accent-blue/10 w-fit px-4 py-2 rounded-xl border border-accent-blue/20">
                <Clock className="w-5 h-5 animate-pulse" />
                {calculateTimeDiff(data.nextTime, t)}
              </div>
            </div>

            {/* Карточка "На территории" */}
            <div className={`${glass} p-6 lg:p-8 flex flex-col`}>
               <div className="text-xs font-bold text-white/50 uppercase tracking-[2px] mb-3">Ожидают выгрузки</div>
               <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                 <OnTerritoryBlock arrivedTasks={arrivedTasks} />
               </div>
            </div>
          </div>
        )}

        {/* Средний ряд: Активные задачи */}
        {!isVictory && !isEmpty && (
          <div className={`${glass} flex-1 min-h-0 flex flex-col overflow-hidden`}>
            <div className="flex items-center justify-between p-6 lg:p-8 pb-0">
              <div className="text-xs font-bold text-white/50 uppercase tracking-[2px]">{t.list}</div>
              <div className="text-xs font-bold bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg text-white/60">
                <span className="text-accent-green">{data.activeList.length}</span> в работе
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 lg:p-8 pt-4 space-y-3 custom-scrollbar">
              {data.activeList.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-full text-white/30 gap-4 opacity-50">
                    <Truck size={48} strokeWidth={1} />
                    <span className="text-sm font-bold uppercase tracking-wider">Нет активных контейнеров</span>
                 </div>
              ) : data.activeList.map(item => {
                const elapsed = elapsedMin(item.start);
                const isOver  = elapsed > UNLOAD_TARGET;
                const isWarn  = !isOver && elapsed >= UNLOAD_TARGET - 5;
                const glowCls = isOver
                  ? 'border-red-500/40 bg-red-500/10 shadow-[0_0_25px_rgba(248,113,113,0.15)]'
                  : isWarn ? 'border-yellow-500/40 bg-yellow-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10';
                
                return (
                  <div key={item.id} className={`flex items-center p-4 lg:p-5 rounded-2xl border transition-all duration-300 ${glowCls}`}>
                    <UnloadTimer startTime={item.start} sz={56} />
                    <div className="flex-1 flex items-center gap-4 ml-5 lg:ml-6 overflow-hidden">
                      <span className="font-mono text-2xl lg:text-3xl font-black text-white truncate drop-shadow-md">{item.id}</span>
                      {item.zone && (
                        <span className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-xs font-black text-white/80 uppercase shrink-0 shadow-sm">
                          {item.zone}
                        </span>
                      )}
                    </div>
                    <div className="ml-auto flex flex-col items-end shrink-0 bg-black/20 p-2 rounded-xl border border-white/5">
                      <span className="text-[9px] uppercase text-white/40 font-bold tracking-widest mb-1">{t.lbl_start}</span>
                      <span className="font-mono text-xl lg:text-2xl font-black text-accent-green leading-none">{item.start}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Нижний ряд: Зоны (DockZonesGrid) */}
        <div className={`${glass} p-6 lg:p-8 shrink-0`}>
          <DockZonesGrid activeList={data.activeList} allTasks={allTasks} />
        </div>

        {/* Состояние "План выполнен" */}
        {(isVictory || isEmpty) && (
          <div className={`${glass} flex-1 flex flex-col items-center justify-center text-center p-8`}>
            {isVictory
              ? <><div className="text-8xl mb-6 animate-bounce drop-shadow-[0_0_30px_rgba(255,215,0,0.5)]">🏆</div><div className="text-4xl md:text-6xl font-black text-white drop-shadow-lg">{t.victory}</div><div className="text-white/50 mt-4 font-medium text-lg">Смена отработала на 100%</div></>
              : <><div className="text-8xl mb-6 opacity-20">📅</div><div className="text-4xl md:text-5xl font-black text-white/30">{t.empty}</div><div className="text-white/20 mt-4 font-medium">Задачи на сегодня отсутствуют</div></>
            }
          </div>
        )}
      </div>

      <style>{`
        .dashboard-root .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .dashboard-root .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .dashboard-root .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
};

export default Dashboard;