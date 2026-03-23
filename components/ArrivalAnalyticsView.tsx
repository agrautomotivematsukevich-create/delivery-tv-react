import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { Task, TranslationSet } from '../types';
import {
  Calendar, Timer, TrendingUp, AlertTriangle, CheckCircle,
  Clock, Package, ChevronDown, ChevronUp, ChevronsUpDown, Truck
} from 'lucide-react';

import { parseHHMM, formatWait } from '../utils/time';

interface ArrivalAnalyticsViewProps {
  t: TranslationSet;
}

interface EnrichedTask extends Task {
  waitMinutes: number | null; 
  isLiveWaiting: boolean; // Машина приехала, но разгрузка не начата
}

// --- Вспомогательные функции ---

function getWaitStyle(minutes: number | null): { bg: string; text: string; dot: string; } {
  if (minutes === null) return { bg: 'bg-white/5', text: 'text-white/30', dot: 'bg-white/20' };
  if (minutes <= 0)     return { bg: 'bg-white/5', text: 'text-white/30', dot: 'bg-white/20' };
  if (minutes <= 30)    return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' };
  if (minutes <= 60)    return { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' };
  return { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' };
}

type SortKey = 'id' | 'type' | 'eta' | 'arrival_time' | 'start_time' | 'waitMinutes' | 'zone' | 'operator';
type SortDir = 'asc' | 'desc';

// --- Компонент ---

const ArrivalAnalyticsView: React.FC<ArrivalAnalyticsViewProps> = ({ t }) => {
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('waitMinutes');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [wsFilter, setWsFilter] = useState<string>('ALL');

  const isToday = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return date === today;
  }, [date]);

  const fetchData = async (d: string) => {
    setLoading(true);
    const [y, m, day] = d.split('-');
    const formattedDate = `${day}.${m}`;
    const data = await api.fetchHistory(formattedDate);
    setTasks(data);
    setLoading(false);
  };

  useEffect(() => { fetchData(date); }, [date]);

  // Обогащаем данные
  const enriched = useMemo<EnrichedTask[]>(() => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    return tasks.map(task => {
      const arrMin = parseHHMM(task.arrival_time);
      const startMin = parseHHMM(task.start_time);
      let waitMinutes: number | null = null;
      let isLiveWaiting = false;

      if (arrMin !== null && startMin !== null) {
        waitMinutes = startMin - arrMin;
        if (waitMinutes < -60) waitMinutes = null; 
      } else if (isToday && arrMin !== null && !startMin && task.status !== 'DONE') {
        // Считаем live-ожидание для машин, которые стоят прямо сейчас
        waitMinutes = currentMinutes - arrMin;
        if (waitMinutes < 0) waitMinutes = 0; // Защита от перевала через полночь
        isLiveWaiting = true;
      }

      return { ...task, waitMinutes, isLiveWaiting };
    });
  }, [tasks, isToday]);

  // Уникальные W/S для фильтра
  const wsOptions = useMemo(() => {
    const set = new Set(enriched.map(t => t.type || '—').filter(Boolean));
    return ['ALL', ...Array.from(set).sort()];
  }, [enriched]);

  // Фильтрация + сортировка
  const filtered = useMemo(() => {
    let list = wsFilter === 'ALL' ? enriched : enriched.filter(t => t.type === wsFilter);
    return [...list].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'waitMinutes') {
        const av = a.waitMinutes ?? -9999;
        const bv = b.waitMinutes ?? -9999;
        return (av - bv) * dir;
      }
      const av = (a as any)[sortKey] ?? '';
      const bv = (b as any)[sortKey] ?? '';
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [enriched, sortKey, sortDir, wsFilter]);

  // Статистика (Продуктовый подход)
  const stats = useMemo(() => {
    const withWait = enriched.filter(t => t.waitMinutes !== null && t.waitMinutes >= 0 && !t.isLiveWaiting);
    const total = enriched.length;
    const withDataCount = withWait.length;
    
    const avg = withDataCount > 0
      ? Math.round(withWait.reduce((s, t) => s + (t.waitMinutes ?? 0), 0) / withDataCount)
      : null;
    
    const max = withDataCount > 0
      ? Math.max(...withWait.map(t => t.waitMinutes ?? 0))
      : null;
    
    const overHour = withWait.filter(t => (t.waitMinutes ?? 0) > 60).length;
    
    // Метрика SLA (сколько разгрузили быстрее 30 минут)
    const slaMet = withWait.filter(t => (t.waitMinutes ?? 0) <= 30).length;
    const slaPct = withDataCount > 0 ? Math.round((slaMet / withDataCount) * 100) : null;

    const liveWaiters = enriched.filter(t => t.isLiveWaiting);

    return { total, withDataCount, avg, max, overHour, slaPct, liveWaiters };
  }, [enriched]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronsUpDown size={12} className="opacity-30" />;
    return sortDir === 'desc'
      ? <ChevronDown size={12} className="text-accent-blue" />
      : <ChevronUp size={12} className="text-accent-blue" />;
  };

  return (
    <div className="flex flex-col gap-6 h-full flex-1 min-h-0">

      {/* ── Хедер страницы ── */}
      <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-3xl p-5 flex flex-wrap items-center gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Timer size={18} className="text-amber-400" />
          </div>
          <div>
            <h2 className="font-black text-white text-base uppercase tracking-wider">Аналитика прибытия</h2>
            <div className="text-xs text-white/40 mt-0.5">Время ожидания между заездом и началом разгрузки</div>
          </div>
        </div>

        <div className="flex items-center gap-3 ml-auto flex-wrap">
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
            {wsOptions.map(ws => (
              <button
                key={ws}
                onClick={() => setWsFilter(ws)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                  wsFilter === ws ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white'
                }`}
              >
                {ws === 'ALL' ? 'Все W/S' : ws}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2 hover:bg-white/10 transition-colors">
            <Calendar size={14} className="text-white/40" />
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="bg-transparent text-white font-mono text-sm outline-none [color-scheme:dark] cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* ── НОВЫЙ БЛОК: Оперативный контроль (Live) ── */}
      {!loading && isToday && stats.liveWaiters.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-6 shadow-[0_0_30px_rgba(239,68,68,0.1)] animate-in slide-in-from-top duration-500">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Truck className="text-red-400 animate-pulse" size={24} />
              <h3 className="text-lg font-black text-white uppercase">Ожидают разгрузки прямо сейчас</h3>
            </div>
            <div className="text-sm font-bold text-red-400 bg-red-500/20 px-3 py-1 rounded-lg">
              {stats.liveWaiters.length} машин в очереди
            </div>
          </div>
          
          <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2">
            {stats.liveWaiters.map(task => {
              const wait = task.waitMinutes ?? 0;
              const isCritical = wait > 30;
              return (
                <div key={task.id} className={`shrink-0 border rounded-xl p-4 min-w-[200px] ${
                  isCritical ? 'bg-red-500/20 border-red-500/30' : 'bg-amber-500/10 border-amber-500/20'
                }`}>
                  <div className="text-xs font-bold text-white/60 mb-1">{task.type || 'W/S'}</div>
                  <div className="text-lg font-black font-mono text-white mb-2">{task.id}</div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-white/50">Стоит уже:</span>
                    <span className={`font-bold tabular-nums ${isCritical ? 'text-red-400' : 'text-amber-400'}`}>
                      {formatWait(wait)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Карточки статистики ── */}
      {!loading && tasks.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          
          {/* Улучшенная карточка: Норматив (SLA) */}
          <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-lg relative overflow-hidden">
            <div className="absolute -right-4 -top-4 opacity-10">
              <CheckCircle size={100} className={stats.slaPct && stats.slaPct >= 80 ? 'text-emerald-400' : 'text-white'} />
            </div>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={16} className={stats.slaPct && stats.slaPct >= 80 ? 'text-emerald-400' : 'text-amber-400'} />
              <span className="text-xs text-white/40 uppercase tracking-wider">Норматив (≤30м)</span>
            </div>
            <div className={`text-4xl font-black tabular-nums ${
              stats.slaPct === null ? 'text-white/30' :
              stats.slaPct >= 80 ? 'text-emerald-400' :
              stats.slaPct >= 50 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {stats.slaPct !== null ? `${stats.slaPct}%` : '—'}
            </div>
            <div className="text-xs text-white/40 mt-1">от всех разгруженных машин</div>
          </div>

          {/* Среднее ожидание */}
          <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} className="text-amber-400/60" />
              <span className="text-xs text-white/40 uppercase tracking-wider">Среднее ожидание</span>
            </div>
            <div className={`text-4xl font-black tabular-nums ${
              stats.avg === null ? 'text-white/30' :
              stats.avg <= 30 ? 'text-emerald-400' :
              stats.avg <= 60 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {stats.avg !== null ? formatWait(stats.avg) : '—'}
            </div>
            <div className="text-xs text-white/40 mt-1">целевой KPI: 30мин</div>
          </div>

          {/* Макс. ожидание */}
          <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={16} className="text-red-400/60" />
              <span className="text-xs text-white/40 uppercase tracking-wider">Максимум</span>
            </div>
            <div className={`text-4xl font-black tabular-nums ${
              stats.max === null ? 'text-white/30' :
              stats.max <= 30 ? 'text-emerald-400' :
              stats.max <= 60 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {stats.max !== null ? formatWait(stats.max) : '—'}
            </div>
            <div className="text-xs text-white/40 mt-1">самый долгий простой</div>
          </div>

          {/* Критичных > 1 часа */}
          <div className={`backdrop-blur-xl border rounded-2xl p-5 shadow-lg ${
            stats.overHour > 0
              ? 'bg-red-500/10 border-red-500/30'
              : 'bg-card-bg border-white/10'
          }`}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className={stats.overHour > 0 ? 'text-red-400' : 'text-emerald-400/60'} />
              <span className="text-xs text-white/40 uppercase tracking-wider">Критичные (&gt;60м)</span>
            </div>
            <div className={`text-4xl font-black tabular-nums ${stats.overHour > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {stats.overHour}
            </div>
            <div className="text-xs text-white/40 mt-1">нарушения норматива</div>
          </div>
        </div>
      )}

      {/* ── Антирейтинг (Бар-чарт) ── */}
      {!loading && stats.withDataCount > 0 && (() => {
        const withData = filtered.filter(t => t.waitMinutes !== null && t.waitMinutes > 0 && !t.isLiveWaiting);
        if (withData.length === 0) return null;
        const maxVal = Math.max(...withData.map(t => t.waitMinutes ?? 0));
        
        return (
          <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-xl">
            <div className="text-sm font-black uppercase tracking-widest text-white mb-4 flex items-center gap-2">
              <TrendingUp size={16} className="text-red-400" />
              Топ самых долгих ожиданий (Антирейтинг)
            </div>
            <div className="flex flex-col gap-3">
              {withData.slice(0, 10).map(task => {
                const pct = maxVal > 0 ? ((task.waitMinutes ?? 0) / maxVal) * 100 : 0;
                const style = getWaitStyle(task.waitMinutes);
                return (
                  <div key={task.id} className="flex items-center gap-3 group">
                    <div className="w-40 text-xs font-mono text-white/70 truncate text-right shrink-0 flex flex-col items-end">
                      <span className="font-bold text-white">{task.id}</span>
                      <span className="text-[10px] text-white/40">{task.type || 'W/S'}</span>
                    </div>
                    <div className="flex-1 h-7 bg-white/5 rounded-lg overflow-hidden relative border border-white/5">
                      <div
                        className={`h-full transition-all duration-1000 ease-out ${
                          style.dot === 'bg-emerald-400' ? 'bg-emerald-500/30' : 
                          style.dot === 'bg-amber-400' ? 'bg-amber-500/30' : 'bg-red-500/40'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                      <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black tabular-nums drop-shadow-md ${style.text}`}>
                        {formatWait(task.waitMinutes ?? 0)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Таблица ── */}
      <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-3xl flex-1 min-h-0 overflow-hidden flex flex-col shadow-2xl">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-white/30 animate-pulse gap-3">
            <Timer size={24} strokeWidth={1} className="animate-spin" />
            <span>Загрузка данных...</span>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-white/30 gap-4">
            <Package size={48} strokeWidth={1} />
            <div>Нет данных за выбранную дату</div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-6 pt-4 pb-2 border-b border-white/5">
              <div className="flex items-center gap-4">
                {[
                  { dot: 'bg-white/20', label: 'Нет данных' },
                  { dot: 'bg-emerald-400', label: `Норма (≤30м)` },
                  { dot: 'bg-amber-400', label: `Превышение (30–60м)` },
                  { dot: 'bg-red-400', label: `Критично (>60м)` },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${item.dot}`} />
                    <span className="text-[10px] text-white/50 uppercase tracking-wider font-bold">{item.label}</span>
                  </div>
                ))}
              </div>
              <div className="text-xs text-white/40 font-bold bg-white/5 px-2 py-1 rounded-md">
                Показано: {filtered.length} из {enriched.length}
              </div>
            </div>

            {/* ✅ ИСПРАВЛЕННЫЕ ЗАГОЛОВКИ ТАБЛИЦЫ (keys) */}
            <div className="grid grid-cols-[2.5rem_1fr_5rem_4rem_4rem_6rem_5rem_1fr] gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/40 border-b border-white/10 bg-black/20">
              <div className="text-center">#</div>
              {[
                { key: 'id' as SortKey, label: 'Контейнер' },
                { key: 'type' as SortKey, label: 'W/S' },          // Исправлено
                { key: 'eta' as SortKey, label: 'План' },
                { key: 'arrival_time' as SortKey, label: 'Факт' },
                { key: 'start_time' as SortKey, label: 'Разгрузка' },
                { key: 'waitMinutes' as SortKey, label: 'Ожидание' },
                { key: 'zone' as SortKey, label: 'Зона' },
                { key: 'operator' as SortKey, label: 'Оператор' }, // Исправлено
              ].map(({ key, label }, i) => (
                <button
                  key={i}
                  onClick={() => handleSort(key)}
                  className={`flex items-center gap-1 hover:text-white transition-colors text-left ${
                    key === 'waitMinutes' ? 'justify-center' : ''
                  }`}
                >
                  {label}
                  <SortIcon k={key} />
                </button>
              ))}
            </div>

            {/* Строки */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {filtered.map((task, idx) => {
                const style = getWaitStyle(task.waitMinutes);
                return (
                  <div
                    key={task.id}
                    className={`grid grid-cols-[2.5rem_1fr_5rem_4rem_4rem_6rem_5rem_1fr] gap-2 px-4 py-3 border-b border-white/5 items-center transition-colors hover:bg-white/10 ${
                      task.status !== 'DONE' && !task.isLiveWaiting ? 'opacity-50' : ''
                    } ${task.isLiveWaiting ? 'bg-red-500/5' : ''}`}
                  >
                    <div className="text-center text-xs text-white/30 font-mono">{idx + 1}</div>

                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-1.5 h-8 rounded-full shrink-0 ${task.isLiveWaiting ? 'bg-red-500 animate-pulse' : style.dot}`} />
                      <div>
                        <div className="font-mono text-sm font-bold text-white truncate">{task.id}</div>
                        {task.status !== 'DONE' && (
                          <div className={`text-[9px] uppercase tracking-wider font-bold ${task.isLiveWaiting ? 'text-red-400' : 'text-white/30'}`}>
                            {task.isLiveWaiting ? 'В ОЧЕРЕДИ' : (task.status === 'ACTIVE' ? 'в работе' : 'ожидание')}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-xs font-bold text-white/60 bg-white/5 border border-white/10 rounded-md px-2 py-1 truncate w-fit">
                      {task.type || '—'}
                    </div>

                    <div className="text-xs font-mono text-white/40">{task.eta || '—'}</div>
                    <div className="text-xs font-mono text-white/70 font-bold">{task.arrival_time || '—'}</div>
                    <div className="text-xs font-mono text-white/70 font-bold">{task.start_time || '—'}</div>

                    <div className="flex justify-center">
                      <div className={`text-sm font-black text-center rounded-lg px-3 py-1 min-w-[70px] ${task.isLiveWaiting ? 'bg-red-500/20 text-red-400 border border-red-500/30' : `${style.bg} ${style.text}`}`}>
                        {task.waitMinutes === null
                          ? <span className="text-xs font-normal text-white/20">—</span>
                          : task.waitMinutes <= 0
                            ? <span className="text-xs text-white/30">0м</span>
                            : formatWait(task.waitMinutes)
                        }
                      </div>
                    </div>

                    <div className="text-xs font-mono text-white/60">{task.zone || '—'}</div>
                    <div className="text-xs text-white/50 truncate">{task.operator || '—'}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
};

export default ArrivalAnalyticsView;
