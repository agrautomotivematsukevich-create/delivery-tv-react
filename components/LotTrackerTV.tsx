import React, { useState, useEffect, useCallback } from 'react';
import { LotContainer } from '../types';
import { api } from '../services/api';
import { Clock, Package, Truck, Timer, CheckCircle2 } from 'lucide-react';

interface Props {
  lot?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseHHMM(s: string): number | null {
  const m = (s || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function nowMinutes(): number {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

/** Minutes elapsed since HH:MM today */
function elapsedSince(startHHMM: string): number {
  const s = parseHHMM(startHHMM);
  if (s === null) return 0;
  let diff = nowMinutes() - s;
  if (diff < -60) diff += 1440;
  return Math.max(0, diff);
}

/** Minutes until HH:MM today (can be negative if past) */
function minutesUntil(etaHHMM: string): number {
  const e = parseHHMM(etaHHMM);
  if (e === null) return 0;
  let diff = e - nowMinutes();
  if (diff < -720) diff += 1440; // wrap around midnight
  return diff;
}

function fmtDuration(mins: number): string {
  const abs = Math.abs(mins);
  if (abs >= 60) {
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return `${h}ч ${m.toString().padStart(2, '0')}м`;
  }
  return `${abs} мин`;
}

function todayDDMM(): string {
  const d = new Date();
  return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2);
}

/** Parse DD.MM to sortable number (handles year wrap: assume current year) */
function dateSort(d: string): number {
  const parts = d.split('.');
  if (parts.length !== 2) return 0;
  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  return month * 100 + day;
}

// ── Component ─────────────────────────────────────────────────────────────────

const LotTrackerTV: React.FC<Props> = ({ lot: lotProp = '' }) => {
  const [lotFromSheet, setLotFromSheet] = useState('');
  const [containers, setContainers] = useState<LotContainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  // The active lot: URL param takes priority, otherwise read from sheet
  const lot = lotProp || lotFromSheet;

  // Poll priority lot from sheet (if no URL param)
  useEffect(() => {
    if (lotProp) return; // URL param provided, skip
    const fetchLot = async () => {
      const l = await api.getPriorityLot();
      setLotFromSheet(l);
    };
    fetchLot();
    const id = setInterval(fetchLot, 15000);
    return () => clearInterval(id);
  }, [lotProp]);

  const fetchData = useCallback(async () => {
    if (!lot) { setLoading(false); return; }
    const data = await api.fetchLotTracker(lot);
    setContainers(data);
    setLoading(false);
  }, [lot]);

  // Polling
  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 20000);

    const onVis = () => {
      if (!document.hidden) fetchData();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [fetchData]);

  // Tick every 30s for live timers
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Clock
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

  // Sort: by date, then by index/eta
  const sorted = [...containers].sort((a, b) => {
    const da = dateSort(a.date), db = dateSort(b.date);
    if (da !== db) return da - db;
    const ia = parseInt(a.index) || 0, ib = parseInt(b.index) || 0;
    return ia - ib;
  });

  const done = sorted.filter(c => c.status === 'DONE');
  const active = sorted.filter(c => c.status === 'ACTIVE');
  const waiting = sorted.filter(c => c.status === 'WAIT');
  const totalCount = sorted.length;
  const doneCount = done.length;

  const today = todayDDMM();

  // Next waiting container (today with ETA in future, or next date)
  const nextWait = waiting.find(c => {
    if (c.date === today && c.eta) {
      return minutesUntil(c.eta) > -30; // allow 30min past
    }
    return dateSort(c.date) >= dateSort(today);
  }) || waiting[0];

  const nextCountdown = nextWait?.date === today && nextWait?.eta ? minutesUntil(nextWait.eta) : null;

  const percent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const glass = "bg-[rgba(58,60,78,0.35)] backdrop-blur-xl border border-white/10 border-t-white/15 rounded-3xl shadow-[0_20px_40px_rgba(0,0,0,0.4)]";

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-white/50 text-2xl font-bold animate-pulse">Загрузка лота {lot || '...'}...</div>
      </div>
    );
  }

  if (!lot) {
    return (
      <div className="flex-1 flex items-center justify-center flex-col gap-4">
        <Package className="w-20 h-20 text-white/50" />
        <div className="text-white/50 text-3xl font-bold">Лот не выбран</div>
        <div className="text-white/50 text-lg">Установите приоритетный лот в панели управления</div>
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <div className="flex-1 flex items-center justify-center flex-col gap-4">
        <Package className="w-20 h-20 text-white/50" />
        <div className="text-white/50 text-3xl font-bold">Лот «{lot}» не найден</div>
        <div className="text-white/50 text-lg">Проверьте номер лота в URL</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">

      {/* ── TOP BAR ── */}
      <div className={`${glass} flex items-center justify-between px-8 py-4 shrink-0`}>
        <div className="flex items-center gap-5">
          <Package className="w-7 h-7 text-accent-blue" />
          <div>
            <div className="text-[10px] font-bold text-white/50 uppercase tracking-[3px]">Отслеживание лота</div>
            <div className="text-3xl font-black tracking-tight text-white">{lot}</div>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-48 h-3 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-accent-green rounded-full transition-all duration-1000" style={{ width: `${percent}%` }} />
            </div>
            <span className="font-mono text-xl font-black text-white tabular-nums">{doneCount}<span className="text-white/50">/{totalCount}</span></span>
          </div>
          <div className="flex items-center gap-4 text-sm font-bold">
            <span className="flex items-center gap-1.5 text-emerald-400"><CheckCircle2 className="w-4 h-4" />{doneCount}</span>
            <span className="flex items-center gap-1.5 text-amber-400"><Timer className="w-4 h-4" />{active.length}</span>
            <span className="flex items-center gap-1.5 text-white/50"><Clock className="w-4 h-4" />{waiting.length}</span>
          </div>
        </div>

        {/* Clock */}
        <div className="flex items-center gap-3">
          <div className="font-mono text-3xl font-black text-white/80 tabular-nums">{time}</div>
          <div className="text-xs text-white/50 capitalize">{date}</div>
        </div>
      </div>

      {/* ── MAIN ── */}
      <div className="flex-1 min-h-0 grid gap-4" style={{ gridTemplateColumns: '1fr 380px' }}>

        {/* LEFT: Container timeline */}
        <div className={`${glass} flex flex-col overflow-hidden`}>
          <div className="text-[10px] font-bold text-white/50 uppercase tracking-[2px] px-6 pt-5 pb-3">
            Контейнеры лота · {totalCount} шт
          </div>
          <div className="flex-1 overflow-y-auto px-6 pb-5 space-y-2 lot-scroll">
            {sorted.map((c, i) => {
              const isActive = c.status === 'ACTIVE';
              const isDone = c.status === 'DONE';
              const isWait = c.status === 'WAIT';
              const isToday = c.date === today;

              let rowBorder = 'border-white/5 bg-white/[0.02]';
              let statusColor = 'text-white/50';
              let statusBg = 'bg-white/5';
              let statusText = 'ОЖИДАНИЕ';

              if (isDone) {
                rowBorder = 'border-emerald-500/20 bg-emerald-500/[0.03]';
                statusColor = 'text-emerald-400';
                statusBg = 'bg-emerald-500/10';
                statusText = 'ВЫГРУЖЕН';
              } else if (isActive) {
                rowBorder = 'border-amber-500/30 bg-amber-500/[0.05] shadow-[0_0_20px_rgba(245,158,11,0.06)]';
                statusColor = 'text-amber-400';
                statusBg = 'bg-amber-500/15';
                statusText = 'ВЫГРУЗКА';
              }

              return (
                <div key={`${c.date}-${c.id}-${i}`}
                  className={`flex items-center gap-4 p-4 rounded-2xl border transition-all duration-500 ${rowBorder} ${isActive ? 'ring-1 ring-amber-500/20' : ''}`}>
                  
                  {/* Date badge */}
                  <div className={`text-center shrink-0 w-14 ${isToday ? 'text-accent-blue' : 'text-white/50'}`}>
                    <div className="text-lg font-black leading-none">{c.date.split('.')[0]}</div>
                    <div className="text-[9px] font-bold uppercase opacity-60">{c.date.split('.')[1]} мес</div>
                  </div>

                  {/* Vertical line */}
                  <div className="flex flex-col items-center shrink-0">
                    <div className={`w-3 h-3 rounded-full border-2 ${isDone ? 'border-emerald-400 bg-emerald-400' : isActive ? 'border-amber-400 bg-amber-400 animate-pulse' : 'border-white/20 bg-transparent'}`} />
                    {i < sorted.length - 1 && <div className="w-0.5 h-6 -mb-6 bg-white/5" />}
                  </div>

                  {/* Container ID */}
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xl font-bold text-white tracking-tight truncate">{c.id}</div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-white/50">
                      {c.ws && <span className="font-bold">{c.ws}</span>}
                      {c.pallets && <span>{c.pallets} палл.</span>}
                      {c.zone && <span className="text-accent-blue font-bold">{c.zone}</span>}
                    </div>
                  </div>

                  {/* Times */}
                  <div className="flex items-center gap-5 shrink-0">
                    {/* ETA */}
                    {c.eta && (
                      <div className="text-center">
                        <div className="text-[8px] font-bold text-white/50 uppercase tracking-widest">ETA</div>
                        <div className="font-mono text-sm font-bold text-white/70">{c.eta}</div>
                      </div>
                    )}
                    {/* Start */}
                    {c.start_time && (
                      <div className="text-center">
                        <div className="text-[8px] font-bold text-emerald-400/70 uppercase tracking-widest">Начало</div>
                        <div className="font-mono text-sm font-bold text-emerald-400">{c.start_time}</div>
                      </div>
                    )}
                    {/* End */}
                    {c.end_time && (
                      <div className="text-center">
                        <div className="text-[8px] font-bold text-emerald-400/70 uppercase tracking-widest">Конец</div>
                        <div className="font-mono text-sm font-bold text-emerald-400">{c.end_time}</div>
                      </div>
                    )}
                    {/* Active timer */}
                    {isActive && c.start_time && (
                      <div className="text-center">
                        <div className="text-[8px] font-bold text-amber-400/70 uppercase tracking-widest">Идёт</div>
                        <div className="font-mono text-lg font-black text-amber-400 tabular-nums">{elapsedSince(c.start_time)} м</div>
                      </div>
                    )}
                  </div>

                  {/* Status badge */}
                  <div className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider shrink-0 ${statusBg} ${statusColor}`}>
                    {statusText}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Stats panel */}
        <div className="flex flex-col gap-4">

          {/* Active unload */}
          {active.length > 0 && (
            <div className={`${glass} p-6`}>
              <div className="text-[10px] font-bold text-amber-400/70 uppercase tracking-[2px] mb-3 flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-400" />
                Сейчас на выгрузке
              </div>
              {active.map(c => {
                const elapsed = elapsedSince(c.start_time);
                const isOver = elapsed > 30;
                return (
                  <div key={c.id} className="mb-3 last:mb-0">
                    <div className="font-mono text-2xl font-black text-white tracking-tight">{c.id}</div>
                    <div className="flex items-center gap-3 mt-2">
                      {c.zone && <span className="px-2 py-1 rounded-lg bg-white/5 text-xs font-bold text-white/70">{c.zone}</span>}
                      <span className="text-xs text-white/50">Начало: <span className="text-amber-400 font-bold">{c.start_time}</span></span>
                    </div>
                    <div className={`font-mono text-5xl font-black mt-3 tabular-nums ${isOver ? 'text-red-400' : 'text-amber-400'}`}>
                      {elapsed}
                      <span className="text-xl ml-2 opacity-60">мин</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Next container countdown */}
          {nextWait && (
            <div className={`${glass} p-6`}>
              <div className="text-[10px] font-bold text-accent-blue uppercase tracking-[2px] mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Следующий контейнер
              </div>
              <div className="font-mono text-2xl font-black text-white tracking-tight">{nextWait.id}</div>
              <div className="flex items-center gap-3 mt-2">
                {nextWait.ws && <span className="px-2 py-1 rounded-lg bg-white/5 text-xs font-bold text-white/70">{nextWait.ws}</span>}
                {nextWait.pallets && <span className="text-xs text-white/50">{nextWait.pallets} палл.</span>}
              </div>
              {nextWait.date !== today ? (
                <div className="mt-4">
                  <div className="text-[9px] font-bold text-white/50 uppercase tracking-widest mb-1">Дата</div>
                  <div className="font-mono text-4xl font-black text-accent-blue tabular-nums">{nextWait.date}</div>
                  {nextWait.eta && <div className="text-sm text-white/50 mt-1">ETA: {nextWait.eta}</div>}
                </div>
              ) : nextCountdown !== null ? (
                <div className="mt-4">
                  <div className="text-[9px] font-bold text-white/50 uppercase tracking-widest mb-1">
                    {nextCountdown > 0 ? 'Прибудет через' : 'Задержка'}
                  </div>
                  <div className={`font-mono text-5xl font-black tabular-nums ${nextCountdown > 0 ? 'text-accent-blue' : 'text-red-400'}`}>
                    {nextCountdown <= 0 && '+'}
                    {fmtDuration(nextCountdown)}
                  </div>
                  <div className="text-sm text-white/50 mt-1">ETA: {nextWait.eta}</div>
                </div>
              ) : (
                <div className="mt-4 text-white/50 text-sm">ETA не указано</div>
              )}
            </div>
          )}

          {/* Overall lot progress */}
          <div className={`${glass} p-6 flex-1`}>
            <div className="text-[10px] font-bold text-white/50 uppercase tracking-[2px] mb-4">Прогресс лота</div>
            
            {/* Big circle */}
            <div className="flex justify-center mb-5">
              <div className="relative w-40 h-40">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
                  <circle cx="100" cy="100" r="85" fill="none" strokeWidth="8" className="stroke-white/5" />
                  <circle cx="100" cy="100" r="85" fill="none" strokeWidth="8" strokeLinecap="round"
                    className="stroke-accent-green transition-all duration-1000"
                    strokeDasharray={2 * Math.PI * 85}
                    strokeDashoffset={2 * Math.PI * 85 * (1 - percent / 100)} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-black text-white tabular-nums">{percent}%</span>
                  <span className="text-xs text-white/50 font-mono">{doneCount}/{totalCount}</span>
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                <div className="text-2xl font-black text-emerald-400 tabular-nums">{doneCount}</div>
                <div className="text-[9px] font-bold text-emerald-400/70 uppercase tracking-widest mt-1">Готово</div>
              </div>
              <div className="text-center p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <div className="text-2xl font-black text-amber-400 tabular-nums">{active.length}</div>
                <div className="text-[9px] font-bold text-amber-400/70 uppercase tracking-widest mt-1">Сейчас</div>
              </div>
              <div className="text-center p-3 rounded-xl bg-white/[0.03] border border-white/10">
                <div className="text-2xl font-black text-white/70 tabular-nums">{waiting.length}</div>
                <div className="text-[9px] font-bold text-white/50 uppercase tracking-widest mt-1">В очереди</div>
              </div>
            </div>

            {/* Dates range */}
            {sorted.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/5 text-center">
                <span className="text-xs text-white/50">
                  {sorted[0].date} — {sorted[sorted.length - 1].date}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .lot-scroll::-webkit-scrollbar { width: 3px; }
        .lot-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
      `}</style>
    </div>
  );
};

export default LotTrackerTV;
