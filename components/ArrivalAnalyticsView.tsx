import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { Task, TranslationSet } from '../types';
import {
  Calendar, Timer, TrendingUp, AlertTriangle, CheckCircle,
  Clock, Package, ChevronDown, ChevronUp, ChevronsUpDown
} from 'lucide-react';

interface ArrivalAnalyticsViewProps {
  t: TranslationSet;
}

interface EnrichedTask extends Task {
  waitMinutes: number | null; // null = нет данных о прибытии
}

// --- Вспомогательные функции ---

/** Парсит "HH:MM" → минуты от полуночи. Возвращает null при ошибке. */
function parseHHMM(s: string | undefined): number | null {
  if (!s || !s.trim()) return null;
  const cleaned = s.trim().replace(/[^0-9:]/g, '');
  const parts = cleaned.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0]);
  const m = parseInt(parts[1]);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

/** Минуты → строка "Xч Yм" или "Yм" */
function formatWait(minutes: number): string {
  if (minutes < 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

/** Цвет и лейбл ячейки простоя */
function getWaitStyle(minutes: number | null): {
  bg: string; text: string; dot: string;
} {
  if (minutes === null) return { bg: 'bg-white/5', text: 'text-white/30', dot: 'bg-white/20' };
  if (minutes <= 0)     return { bg: 'bg-white/5', text: 'text-white/30', dot: 'bg-white/20' };
  if (minutes <= 30)    return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' };
  if (minutes <= 60)    return { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' };
  return { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' };
}

type SortKey = 'id' | 'eta' | 'arrival_time' | 'start_time' | 'waitMinutes' | 'zone';
type SortDir = 'asc' | 'desc';

// --- Компонент ---

const ArrivalAnalyticsView: React.FC<ArrivalAnalyticsViewProps> = ({ t }) => {
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('waitMinutes');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [wsFilter, setWsFilter] = useState<string>('ALL');

  const fetchData = async (d: string) => {
    setLoading(true);
    const [y, m, day] = d.split('-');
    const formattedDate = `${day}.${m}`;
    const data = await api.fetchHistory(formattedDate);
    setTasks(data);
    setLoading(false);
  };

  useEffect(() => { fetchData(date); }, [date]);

  // Обогащаем данные: считаем простой
  const enriched = useMemo<EnrichedTask[]>(() => {
    return tasks.map(task => {
      const arrMin = parseHHMM(task.arrival_time);
      const startMin = parseHHMM(task.start_time);
      let waitMinutes: number | null = null;
      if (arrMin !== null && startMin !== null) {
        waitMinutes = startMin - arrMin;
        // Если машина прибыла после полуночи до начала следующего дня — коррекция не нужна
        // но если результат отрицательный — данные некорректны
        if (waitMinutes < -60) waitMinutes = null; // явно неверные данные
      }
      return { ...task, waitMinutes };
    });
  }, [tasks]);

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
      return av.localeCompare(bv) * dir;
    });
  }, [enriched, sortKey, sortDir, wsFilter]);

  // Статистика
  const stats = useMemo(() => {
    const withData = enriched.filter(t => t.waitMinutes !== null && t.waitMinutes >= 0);
    const total = enriched.length;
    const withDataCount = withData.length;
    const avg = withData.length > 0
      ? Math.round(withData.reduce((s, t) => s + (t.waitMinutes ?? 0), 0) / withData.length)
      : null;
    const max = withData.length > 0
      ? Math.max(...withData.map(t => t.waitMinutes ?? 0))
      : null;
    const overHour = withData.filter(t => (t.waitMinutes ?? 0) > 60).length;
    return { total, withDataCount, avg, max, overHour };
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
      <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-3xl p-5 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Timer size={18} className="text-amber-400" />
          </div>
          <div>
            <div className="font-black text-white text-base uppercase tracking-wider">{t.arr_title}</div>
            <div className="text-xs text-white/40 mt-0.5">Колонка P таблицы → время ожидания разгрузки</div>
          </div>
        </div>

        <div className="flex items-center gap-3 ml-auto flex-wrap">
          {/* Фильтр W/S */}
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
            {wsOptions.map(ws => (
              <button
                key={ws}
                onClick={() => setWsFilter(ws)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                  wsFilter === ws ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'
                }`}
              >
                {ws}
              </button>
            ))}
          </div>

          {/* Дата */}
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2">
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

      {/* ── Карточки статистики ── */}
      {!loading && tasks.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Всего машин */}
          <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Package size={16} className="text-white/40" />
              <span className="text-xs text-white/40 uppercase tracking-wider">{t.arr_vehicles_total}</span>
            </div>
            <div className="text-3xl font-black text-white tabular-nums">{stats.total}</div>
            <div className="text-xs text-white/30 mt-1">
              {stats.withDataCount} {t.arr_vehicles_with_data}
            </div>
          </div>

          {/* Среднее ожидание */}
          <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} className="text-amber-400/60" />
              <span className="text-xs text-white/40 uppercase tracking-wider">{t.arr_avg_wait}</span>
            </div>
            <div className={`text-3xl font-black tabular-nums ${
              stats.avg === null ? 'text-white/30' :
              stats.avg <= 30 ? 'text-emerald-400' :
              stats.avg <= 60 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {stats.avg !== null ? formatWait(stats.avg) : '—'}
            </div>
            <div className="text-xs text-white/30 mt-1">по машинам с данными</div>
          </div>

          {/* Макс. ожидание */}
          <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={16} className="text-red-400/60" />
              <span className="text-xs text-white/40 uppercase tracking-wider">{t.arr_max_wait}</span>
            </div>
            <div className={`text-3xl font-black tabular-nums ${
              stats.max === null ? 'text-white/30' :
              stats.max <= 30 ? 'text-emerald-400' :
              stats.max <= 60 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {stats.max !== null ? formatWait(stats.max) : '—'}
            </div>
            <div className="text-xs text-white/30 mt-1">максимальный зафиксированный</div>
          </div>

          {/* Критичных > 1 часа */}
          <div className={`backdrop-blur-xl border rounded-2xl p-5 ${
            stats.overHour > 0
              ? 'bg-red-500/5 border-red-500/20'
              : 'bg-card-bg border-white/10'
          }`}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className={stats.overHour > 0 ? 'text-red-400' : 'text-white/40'} />
              <span className="text-xs text-white/40 uppercase tracking-wider">&gt; 60 мин</span>
            </div>
            <div className={`text-3xl font-black tabular-nums ${stats.overHour > 0 ? 'text-red-400' : 'text-white/30'}`}>
              {stats.overHour}
            </div>
            <div className="text-xs text-white/30 mt-1">{t.arr_over_hour}</div>
          </div>
        </div>
      )}

      {/* ── Визуальный бар-чарт (топ по ожиданию) ── */}
      {!loading && stats.withDataCount > 0 && (() => {
        const withData = filtered.filter(t => t.waitMinutes !== null && t.waitMinutes > 0);
        if (withData.length === 0) return null;
        const maxVal = Math.max(...withData.map(t => t.waitMinutes ?? 0));
        return (
          <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-3xl p-6">
            <div className="text-xs font-bold uppercase tracking-widest text-white/40 mb-4">
              Распределение времени простоя
            </div>
            <div className="flex flex-col gap-2">
              {withData.slice(0, 15).map(task => {
                const pct = maxVal > 0 ? ((task.waitMinutes ?? 0) / maxVal) * 100 : 0;
                const style = getWaitStyle(task.waitMinutes);
                return (
                  <div key={task.id} className="flex items-center gap-3 group">
                    <div className="w-32 text-xs font-mono text-white/50 truncate text-right shrink-0">
                      {task.id}
                    </div>
                    <div className="flex-1 h-6 bg-white/5 rounded-lg overflow-hidden relative">
                      <div
                        className={`h-full rounded-lg transition-all duration-700 ${style.dot === 'bg-emerald-400' ? 'bg-emerald-500/40' : style.dot === 'bg-amber-400' ? 'bg-amber-500/40' : 'bg-red-500/40'}`}
                        style={{ width: `${pct}%` }}
                      />
                      <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold tabular-nums ${style.text}`}>
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
      <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-3xl flex-1 min-h-0 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-white/30 animate-pulse gap-3">
            <Timer size={24} strokeWidth={1} className="animate-spin" />
            <span>{t.msg_loading_history}</span>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-white/30 gap-4">
            <Package size={48} strokeWidth={1} />
            <div>{t.arr_no_data}</div>
          </div>
        ) : (
          <>
            {/* Легенда */}
            <div className="flex items-center gap-4 px-6 pt-4 pb-2 border-b border-white/5">
              {[
                { dot: 'bg-white/20', label: t.arr_no_arrival },
                { dot: 'bg-emerald-400', label: `${t.arr_status_ok} (≤30м)` },
                { dot: 'bg-amber-400', label: `${t.arr_status_warn} (30–60м)` },
                { dot: 'bg-red-400', label: `${t.arr_status_crit} (>60м)` },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${item.dot}`} />
                  <span className="text-[10px] text-white/40 uppercase tracking-wider">{item.label}</span>
                </div>
              ))}
              <div className="ml-auto text-xs text-white/30">
                {filtered.length} из {enriched.length}
              </div>
            </div>

            {/* Шапка таблицы */}
            <div className="grid grid-cols-[2.5rem_1fr_4rem_4rem_5rem_5rem_5rem_4rem_1fr] gap-2 px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-white/30 border-b border-white/5">
              <div className="text-center">#</div>
              {[
                { key: 'id' as SortKey, label: t.arr_col_container },
                { key: 'id' as SortKey, label: t.arr_col_ws },
                { key: 'eta' as SortKey, label: t.arr_col_eta },
                { key: 'arrival_time' as SortKey, label: t.arr_col_arrival },
                { key: 'start_time' as SortKey, label: t.arr_col_unload_start },
                { key: 'waitMinutes' as SortKey, label: t.arr_col_wait },
                { key: 'zone' as SortKey, label: t.arr_col_zone },
                { key: 'id' as SortKey, label: t.arr_col_operator },
              ].map(({ key, label }, i) => (
                <button
                  key={i}
                  onClick={() => handleSort(key)}
                  className="flex items-center gap-1 hover:text-white transition-colors text-left"
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
                const hasWait = task.waitMinutes !== null && task.waitMinutes > 0;
                return (
                  <div
                    key={task.id}
                    className={`grid grid-cols-[2.5rem_1fr_4rem_4rem_5rem_5rem_5rem_4rem_1fr] gap-2 px-4 py-3 border-b border-white/5 items-center transition-colors hover:bg-white/5 ${
                      task.status !== 'DONE' ? 'opacity-50' : ''
                    }`}
                  >
                    {/* Индекс */}
                    <div className="text-center text-xs text-white/20 font-mono">{idx + 1}</div>

                    {/* Container ID */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-1.5 h-8 rounded-full shrink-0 ${style.dot}`} />
                      <div>
                        <div className="font-mono text-sm font-bold text-white truncate">{task.id}</div>
                        {task.status !== 'DONE' && (
                          <div className="text-[9px] text-white/30 uppercase tracking-wider">
                            {task.status === 'ACTIVE' ? 'в работе' : 'ожидание'}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* W/S */}
                    <div className="text-xs font-bold text-white/50 bg-white/5 rounded-lg px-2 py-1 text-center truncate">
                      {task.type || '—'}
                    </div>

                    {/* ETA */}
                    <div className="text-xs font-mono text-white/50 text-center">{task.eta || '—'}</div>

                    {/* Прибытие */}
                    <div className="text-xs font-mono text-white/70 text-center font-bold">
                      {task.arrival_time || <span className="text-white/20">—</span>}
                    </div>

                    {/* Начало разгрузки */}
                    <div className="text-xs font-mono text-white/70 text-center font-bold">
                      {task.start_time || <span className="text-white/20">—</span>}
                    </div>

                    {/* Простой */}
                    <div className={`text-sm font-black text-center rounded-lg py-1 ${style.bg} ${style.text}`}>
                      {task.waitMinutes === null
                        ? <span className="text-xs font-normal text-white/20">{t.arr_no_arrival}</span>
                        : task.waitMinutes <= 0
                          ? <span className="text-xs text-white/30">0м</span>
                          : formatWait(task.waitMinutes)
                      }
                    </div>

                    {/* Зона */}
                    <div className="text-xs font-mono text-white/60 text-center bg-white/5 rounded px-1">
                      {task.zone || '—'}
                    </div>

                    {/* Оператор */}
                    <div className="text-xs text-white/50 truncate">{task.operator || '—'}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #444; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default ArrivalAnalyticsView;
