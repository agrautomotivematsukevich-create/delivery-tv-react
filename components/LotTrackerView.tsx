import React, { useState, useEffect, useCallback } from 'react';
import { LotContainer, User, TranslationSet } from '../types';
import { api } from '../services/api';
import { Package, Search, Tv, Check, Clock, Timer, CheckCircle2 } from 'lucide-react';

interface Props {
  user: User | null;
  t: TranslationSet;
}

function parseHHMM(s: string): number | null {
  const m = (s || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}
function nowMinutes(): number { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }
function elapsedSince(startHHMM: string): number {
  const s = parseHHMM(startHHMM);
  if (s === null) return 0;
  let diff = nowMinutes() - s;
  if (diff < -60) diff += 1440;
  return Math.max(0, diff);
}
function todayDDMM(): string {
  const d = new Date();
  return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2);
}
function dateSort(d: string): number {
  const p = d.split('.');
  return parseInt(p[1] || '0') * 100 + parseInt(p[0] || '0');
}

const LotTrackerView: React.FC<Props> = ({ user, t }) => {
  const [searchLot, setSearchLot] = useState('');
  const [activeLot, setActiveLot] = useState('');
  const [containers, setContainers] = useState<LotContainer[]>([]);
  const [loading, setLoading] = useState(false);
  const [priorityLot, setPriorityLot] = useState('');
  const [savingPriority, setSavingPriority] = useState(false);
  const [saved, setSaved] = useState(false);
  const [, setTick] = useState(0);

  const isManager = user?.role === 'LOGISTIC' || user?.role === 'ADMIN';

  // Load current priority lot
  useEffect(() => {
    api.getPriorityLot().then(l => setPriorityLot(l));
  }, []);

  // Timer tick
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const doSearch = useCallback(async (lot: string) => {
    if (!lot.trim()) return;
    setLoading(true);
    setActiveLot(lot.trim().toUpperCase());
    const data = await api.fetchLotTracker(lot.trim());
    setContainers(data);
    setLoading(false);
  }, []);

  const handleSetPriority = async () => {
    if (!activeLot) return;
    setSavingPriority(true);
    const ok = await api.setPriorityLot(activeLot);
    if (ok) {
      setPriorityLot(activeLot);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSavingPriority(false);
  };

  // Sort containers
  const sorted = [...containers].sort((a, b) => {
    const da = dateSort(a.date), db = dateSort(b.date);
    if (da !== db) return da - db;
    return (parseInt(a.index) || 0) - (parseInt(b.index) || 0);
  });

  const done = sorted.filter(c => c.status === 'DONE');
  const active = sorted.filter(c => c.status === 'ACTIVE');
  const waiting = sorted.filter(c => c.status === 'WAIT');
  const today = todayDDMM();

  const glass = "bg-[rgba(20,20,25,0.6)] backdrop-blur-xl border border-white/10 border-t-white/15 rounded-3xl shadow-[0_20px_40px_rgba(0,0,0,0.4)]";

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">

      {/* Search bar */}
      <div className={`${glass} p-5`}>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1">
            <Package className="w-5 h-5 text-accent-blue shrink-0" />
            <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 focus-within:border-accent-blue/50 transition-colors">
              <Search className="w-4 h-4 text-white/50 shrink-0" />
              <input
                type="text"
                value={searchLot}
                onChange={e => setSearchLot(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && doSearch(searchLot)}
                placeholder="Введите номер лота..."
                className="bg-transparent text-white text-sm font-bold outline-none w-full placeholder:text-white/50"
              />
            </div>
            <button
              onClick={() => doSearch(searchLot)}
              disabled={!searchLot.trim()}
              className="px-5 py-2.5 rounded-xl bg-accent-blue text-white font-bold text-sm uppercase tracking-wider hover:bg-accent-blue/80 transition-all disabled:opacity-30 shrink-0"
            >
              Найти
            </button>
          </div>

          {/* Priority lot indicator */}
          {priorityLot && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent-blue/10 border border-accent-blue/20">
              <Tv className="w-4 h-4 text-accent-blue" />
              <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">TV:</span>
              <span className="text-sm font-black text-accent-blue">{priorityLot}</span>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {!activeLot && !loading && (
        <div className={`${glass} flex-1 flex items-center justify-center`}>
          <div className="text-center">
            <Package className="w-16 h-16 text-white/50 mx-auto mb-4" />
            <div className="text-white/50 text-xl font-bold">Введите номер лота для поиска</div>
            {priorityLot && (
              <button
                onClick={() => { setSearchLot(priorityLot); doSearch(priorityLot); }}
                className="mt-4 px-4 py-2 rounded-xl bg-accent-blue/10 border border-accent-blue/20 text-accent-blue text-sm font-bold hover:bg-accent-blue/20 transition-all"
              >
                Открыть текущий TV лот: {priorityLot}
              </button>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className={`${glass} flex-1 flex items-center justify-center`}>
          <div className="text-white/50 text-xl font-bold animate-pulse">Поиск лота {activeLot}...</div>
        </div>
      )}

      {activeLot && !loading && sorted.length === 0 && (
        <div className={`${glass} flex-1 flex items-center justify-center flex-col gap-3`}>
          <Package className="w-16 h-16 text-white/50" />
          <div className="text-white/50 text-xl font-bold">Лот «{activeLot}» не найден</div>
        </div>
      )}

      {activeLot && !loading && sorted.length > 0 && (
        <>
          {/* Stats bar */}
          <div className={`${glass} px-5 py-4 flex flex-wrap items-center gap-4`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-black text-white">{activeLot}</span>
              <span className="text-sm text-white/50 font-mono">{done.length}/{sorted.length}</span>
            </div>

            <div className="flex items-center gap-3 text-sm font-bold">
              <span className="flex items-center gap-1.5 text-emerald-400"><CheckCircle2 className="w-4 h-4" />{done.length}</span>
              <span className="flex items-center gap-1.5 text-amber-400"><Timer className="w-4 h-4" />{active.length}</span>
              <span className="flex items-center gap-1.5 text-white/50"><Clock className="w-4 h-4" />{waiting.length}</span>
            </div>

            {/* Progress bar */}
            <div className="flex items-center gap-2 flex-1 min-w-[120px]">
              <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-accent-green rounded-full transition-all duration-700"
                  style={{ width: `${sorted.length > 0 ? (done.length / sorted.length) * 100 : 0}%` }} />
              </div>
              <span className="text-xs font-bold text-white/50">{sorted.length > 0 ? Math.round((done.length / sorted.length) * 100) : 0}%</span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {/* Set as TV priority button */}
              {isManager && (
                <button
                  onClick={handleSetPriority}
                  disabled={savingPriority || activeLot === priorityLot}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                    activeLot === priorityLot
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                      : 'bg-accent-blue/10 border border-accent-blue/20 text-accent-blue hover:bg-accent-blue/20'
                  } disabled:opacity-50`}
                >
                  {activeLot === priorityLot ? (
                    <><Check className="w-4 h-4" /> На ТВ</>
                  ) : saved ? (
                    <><Check className="w-4 h-4" /> Сохранено!</>
                  ) : (
                    <><Tv className="w-4 h-4" /> {savingPriority ? 'Сохранение...' : 'Показать на ТВ'}</>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Container list */}
          <div className={`${glass} flex-1 min-h-0 flex flex-col overflow-hidden`}>
            <div className="text-[10px] font-bold text-white/50 uppercase tracking-[2px] px-5 pt-4 pb-2">
              Контейнеры · {sorted.length} шт
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-2">
              {sorted.map((c, i) => {
                const isDone = c.status === 'DONE';
                const isAct = c.status === 'ACTIVE';
                const isToday = c.date === today;

                let rowCls = 'border-white/5 bg-white/[0.02]';
                let statusCls = 'text-white/50 bg-white/5';
                let statusTxt = 'ОЖИДАНИЕ';

                if (isDone) {
                  rowCls = 'border-emerald-500/20 bg-emerald-500/[0.03]';
                  statusCls = 'text-emerald-400 bg-emerald-500/10';
                  statusTxt = 'ГОТОВО';
                } else if (isAct) {
                  rowCls = 'border-amber-500/25 bg-amber-500/[0.04]';
                  statusCls = 'text-amber-400 bg-amber-500/15';
                  statusTxt = 'ВЫГРУЗКА';
                }

                return (
                  <div key={`${c.date}-${c.id}-${i}`}
                    className={`flex flex-wrap items-center gap-3 p-3 md:p-4 rounded-2xl border transition-all ${rowCls}`}>
                    
                    {/* Date */}
                    <div className={`text-sm font-black w-12 text-center shrink-0 ${isToday ? 'text-accent-blue' : 'text-white/50'}`}>
                      {c.date}
                    </div>

                    {/* Dot */}
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isDone ? 'bg-emerald-400' : isAct ? 'bg-amber-400 animate-pulse' : 'bg-white/50 border border-white/50'}`} />

                    {/* ID */}
                    <div className="font-mono text-base md:text-lg font-bold text-white tracking-tight truncate min-w-0 flex-1">{c.id}</div>

                    {/* Meta */}
                    <div className="flex items-center gap-2 text-xs text-white/50 shrink-0">
                      {c.ws && <span className="font-bold">{c.ws}</span>}
                      {c.pallets && <span>{c.pallets}п</span>}
                      {c.zone && <span className="text-accent-blue font-bold">{c.zone}</span>}
                    </div>

                    {/* Times */}
                    <div className="flex items-center gap-3 shrink-0 text-xs">
                      {c.eta && <span className="text-white/50">ETA {c.eta}</span>}
                      {c.start_time && <span className="text-emerald-400 font-bold">{c.start_time}</span>}
                      {c.end_time && <span className="text-emerald-400">→ {c.end_time}</span>}
                      {isAct && c.start_time && (
                        <span className="font-mono font-black text-amber-400 text-sm">{elapsedSince(c.start_time)} мин</span>
                      )}
                    </div>

                    {/* Status */}
                    <div className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider shrink-0 ${statusCls}`}>
                      {statusTxt}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default LotTrackerView;
