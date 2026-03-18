import React, { useState, useEffect, useCallback } from 'react';
import { LotContainer, User, TranslationSet } from '../types';
import { api } from '../services/api';
import { Package, Search, Tv, Check, Clock, Timer, CheckCircle2, Loader2, Filter, Bell, BellRing, Layers } from 'lucide-react';
import { parseHHMM, elapsedMin, todayDDMM, dateSortValue } from '../utils/time';

interface Props {
  user: User | null;
  t: TranslationSet;
}

const WS_TRANSLATIONS: Record<string, string> = {
  'PAINT': 'Покраска',
  'ASSEMBLY': 'Сборка',
  'WELDING': 'Сварка',
  'БАКИ': 'Баки',
  'BS': 'BS'
};

const translateWs = (ws: string) => {
  if (!ws) return '';
  const upperWs = ws.trim().toUpperCase();
  return WS_TRANSLATIONS[upperWs] || ws; 
};

type StatusFilter = 'ALL' | 'DONE' | 'PENDING';

const LotTrackerView: React.FC<Props> = ({ user, t }) => {
  const [searchLot, setSearchLot] = useState('');
  const [activeLot, setActiveLot] = useState('');
  const [containers, setContainers] = useState<LotContainer[]>([]);
  const [loading, setLoading] = useState(false);
  const [priorityLot, setPriorityLot] = useState('');
  const [savingPriority, setSavingPriority] = useState(false);
  const [saved, setSaved] = useState(false);
  
  // Состояния фильтров
  const [filterWs, setFilterWs] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('ALL');
  
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);

  const isManager = user?.role === 'LOGISTIC' || user?.role === 'ADMIN';

  useEffect(() => {
    api.getPriorityLot().then(l => setPriorityLot(l));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const doSearch = useCallback(async (lot: string) => {
    if (!lot.trim()) return;
    setLoading(true);
    setActiveLot(lot.trim().toUpperCase());
    
    // Сбрасываем все фильтры при новом поиске
    setFilterWs('ALL');
    setFilterStatus('ALL');
    
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

  const handleSubscribe = (containerId: string) => {
    if (subscribedIds.has(containerId)) {
      alert(`Вы уже подписаны на уведомления для контейнера ${containerId}.`);
      return;
    }
    const email = window.prompt(`Хотите получить уведомление о начале выгрузки?\nВведите ваш Email для контейнера ${containerId}:`);
    if (email && email.includes('@')) {
      setSubscribedIds(prev => new Set(prev).add(containerId));
      alert(`Готово! Мы пришлем письмо на ${email}, как только статус изменится на "ВЫГРУЗКА".`);
    } else if (email) {
      alert('Пожалуйста, введите корректный Email.');
    }
  };

  // 1. Уникальные материалы
  const uniqueWs = Array.from(new Set(containers.map(c => c.ws).filter(Boolean))).sort();

  // 2. Двойная фильтрация (Материал + Статус)
  const filteredContainers = containers.filter(c => {
    const passWs = filterWs === 'ALL' || c.ws === filterWs;
    const passStatus = 
      filterStatus === 'ALL' ? true :
      filterStatus === 'DONE' ? c.status === 'DONE' :
      c.status !== 'DONE'; // PENDING (Ожидание или Выгрузка)
    
    return passWs && passStatus;
  });

  // 3. Сортировка результата
  const sorted = [...filteredContainers].sort((a, b) => {
    const da = dateSortValue(a.date), db = dateSortValue(b.date);
    if (da !== db) return da - db;
    return (parseInt(a.index) || 0) - (parseInt(b.index) || 0);
  });

  // 4. Подсчет цифр для шапки статистики (по всем контейнерам лота)
  const allDone = containers.filter(c => c.status === 'DONE');
  const allActive = containers.filter(c => c.status === 'ACTIVE');
  const allWaiting = containers.filter(c => c.status === 'WAIT');
  const today = todayDDMM();

  // 5. Умный подсчет для цифр внутри кнопок фильтров
  // Если выбран фильтр по Статусу, цифры в Материалах зависят от Статуса
  const filteredByStatusOnly = filterStatus === 'ALL' ? containers : containers.filter(c => filterStatus === 'DONE' ? c.status === 'DONE' : c.status !== 'DONE');
  // Если выбран фильтр по Материалу, цифры в Статусах зависят от Материала
  const filteredByWsOnly = filterWs === 'ALL' ? containers : containers.filter(c => c.ws === filterWs);

  const countAllStatus = filteredByWsOnly.length;
  const countDoneStatus = filteredByWsOnly.filter(c => c.status === 'DONE').length;
  const countPendingStatus = filteredByWsOnly.filter(c => c.status !== 'DONE').length;

  const glass = "bg-[rgba(58,60,78,0.35)] backdrop-blur-xl border border-white/10 border-t-white/15 rounded-3xl shadow-[0_20px_40px_rgba(0,0,0,0.4)]";

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
                onKeyDown={e => e.key === 'Enter' && !loading && doSearch(searchLot)}
                placeholder="Введите номер лота..."
                disabled={loading}
                className="bg-transparent text-white text-sm font-bold outline-none w-full placeholder:text-white/50 disabled:opacity-50"
              />
            </div>
            <button
              onClick={() => doSearch(searchLot)}
              disabled={!searchLot.trim() || loading}
              className="px-5 py-2.5 rounded-xl bg-accent-blue text-white font-bold text-sm uppercase tracking-wider hover:bg-accent-blue/80 transition-all disabled:opacity-50 shrink-0 flex items-center justify-center min-w-[100px]"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Найти"}
            </button>
          </div>

          {priorityLot && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent-blue/10 border border-accent-blue/20">
              <Tv className="w-4 h-4 text-accent-blue" />
              <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">TV:</span>
              <span className="text-sm font-black text-accent-blue">{priorityLot}</span>
            </div>
          )}
        </div>
      </div>

      {!activeLot && !loading && (
        <div className={`${glass} flex-1 flex items-center justify-center`}>
          <div className="text-center">
            <Package className="w-16 h-16 text-white/50 mx-auto mb-4" />
            <div className="text-white/50 text-xl font-bold">Введите номер лота для поиска</div>
          </div>
        </div>
      )}

      {loading && (
        <div className={`${glass} flex-1 flex items-center justify-center`}>
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-accent-blue animate-spin" />
            <div className="text-white/50 text-xl font-bold animate-pulse">Поиск данных по лоту...</div>
          </div>
        </div>
      )}

      {activeLot && !loading && containers.length === 0 && (
        <div className={`${glass} flex-1 flex items-center justify-center flex-col gap-3`}>
          <Package className="w-16 h-16 text-white/50" />
          <div className="text-white/50 text-xl font-bold">Лот «{activeLot}» не найден</div>
        </div>
      )}

      {activeLot && !loading && containers.length > 0 && (
        <>
          <div className={`${glass} flex flex-col`}>
            {/* Статистика */}
            <div className="px-5 py-4 flex flex-wrap items-center gap-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-black text-white">{activeLot}</span>
                <span className="text-sm text-white/50 font-mono">{allDone.length}/{containers.length}</span>
              </div>

              <div className="flex items-center gap-3 text-sm font-bold">
                <span className="flex items-center gap-1.5 text-emerald-400"><CheckCircle2 className="w-4 h-4" />{allDone.length}</span>
                <span className="flex items-center gap-1.5 text-amber-400"><Timer className="w-4 h-4" />{allActive.length}</span>
                <span className="flex items-center gap-1.5 text-white/50"><Clock className="w-4 h-4" />{allWaiting.length}</span>
              </div>

              <div className="flex items-center gap-2 flex-1 min-w-[120px]">
                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-accent-green rounded-full transition-all duration-700"
                    style={{ width: `${containers.length > 0 ? (allDone.length / containers.length) * 100 : 0}%` }} />
                </div>
                <span className="text-xs font-bold text-white/50">{containers.length > 0 ? Math.round((allDone.length / containers.length) * 100) : 0}%</span>
              </div>

              <div className="ml-auto flex items-center gap-2">
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

            {/* Фильтры */}
            <div className="px-5 py-3 flex flex-col gap-3">
              
              {/* Ряд 1: Фильтр по материалу */}
              {uniqueWs.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
                  <Filter className="w-4 h-4 text-white/50 shrink-0 mr-1" />
                  <button
                    onClick={() => setFilterWs('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                      filterWs === 'ALL' ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:bg-white/10 border border-white/5'
                    }`}
                  >
                    ВСЕ МАТЕРИАЛЫ ({filteredByStatusOnly.length})
                  </button>
                  {uniqueWs.map(ws => {
                    const count = filteredByStatusOnly.filter(c => c.ws === ws).length;
                    return (
                      <button
                        key={ws}
                        onClick={() => setFilterWs(ws)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                          filterWs === ws ? 'bg-accent-blue text-white' : 'bg-white/5 text-white/50 hover:bg-white/10 border border-white/5'
                        }`}
                      >
                        {translateWs(ws)} ({count})
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Ряд 2: Фильтр по статусу Принято/Не принято */}
              <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
                <Layers className="w-4 h-4 text-white/50 shrink-0 mr-1" />
                <button
                  onClick={() => setFilterStatus('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                    filterStatus === 'ALL' ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:bg-white/10 border border-white/5'
                  }`}
                >
                  ВСЕ СТАТУСЫ ({countAllStatus})
                </button>
                <button
                  onClick={() => setFilterStatus('DONE')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                    filterStatus === 'DONE' ? 'bg-emerald-500 text-white' : 'bg-white/5 text-emerald-400/50 hover:bg-white/10 border border-emerald-500/20'
                  }`}
                >
                  ПРИНЯТО ({countDoneStatus})
                </button>
                <button
                  onClick={() => setFilterStatus('PENDING')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                    filterStatus === 'PENDING' ? 'bg-amber-500 text-white' : 'bg-white/5 text-amber-400/50 hover:bg-white/10 border border-amber-500/20'
                  }`}
                >
                  НЕ ПРИНЯТО ({countPendingStatus})
                </button>
              </div>

            </div>
          </div>

          {/* Список контейнеров */}
          <div className={`${glass} flex-1 min-h-0 flex flex-col overflow-hidden`}>
            <div className="text-[10px] font-bold text-white/50 uppercase tracking-[2px] px-5 pt-4 pb-2">
              Отображено · {sorted.length} шт
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-2 custom-scrollbar">
              {sorted.length === 0 && (
                <div className="text-center text-white/30 py-8 text-sm font-bold">Нет контейнеров для выбранных фильтров</div>
              )}
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
                    
                    <div className={`text-sm font-black w-12 text-center shrink-0 ${isToday ? 'text-accent-blue' : 'text-white/50'}`}>
                      {c.date}
                    </div>

                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isDone ? 'bg-emerald-400' : isAct ? 'bg-amber-400 animate-pulse' : 'bg-white/50 border border-white/50'}`} />

                    <div className="font-mono text-base md:text-lg font-bold text-white tracking-tight truncate min-w-0 flex-1">{c.id}</div>

                    <div className="flex items-center gap-2 text-[10px] sm:text-xs text-white/50 shrink-0">
                      {c.ws && <span className="font-bold text-white/80 bg-white/5 px-2 py-0.5 rounded">{translateWs(c.ws)}</span>}
                      {c.pallets && <span>{c.pallets}п</span>}
                      {c.zone && <span className="text-accent-blue font-bold">{c.zone}</span>}
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 shrink-0 text-[10px] sm:text-xs">
                      {c.eta && <span className="text-white/50">Ожидаемое время выгрузки {c.eta}</span>}
                      {c.start_time && <span className="text-emerald-400 font-bold">{c.start_time}</span>}
                      {c.end_time && <span className="text-emerald-400">→ {c.end_time}</span>}
                      {isAct && c.start_time && (
                        <span className="text-[10px] text-white/50 ml-1">({elapsedMin(c.start_time)} мин)</span>
                      )}
                    </div>

                    <div className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider shrink-0 ${statusCls}`}>
                      {statusTxt}
                    </div>

                    {!isDone && !isAct && (
                      <button 
                        onClick={() => handleSubscribe(c.id)}
                        className={`ml-1 p-2 rounded-lg transition-colors ${subscribedIds.has(c.id) ? 'bg-accent-blue/20 text-accent-blue' : 'bg-white/5 text-white/30 hover:bg-white/10 hover:text-white'}`}
                        title="Уведомить о начале выгрузки"
                      >
                        {subscribedIds.has(c.id) ? <BellRing className="w-4 h-4 animate-pulse" /> : <Bell className="w-4 h-4" />}
                      </button>
                    )}
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
