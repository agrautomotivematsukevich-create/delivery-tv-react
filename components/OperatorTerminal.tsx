import React, { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../services/api';
import { Task, TranslationSet } from '../types';
import { Phone, Check, Play, Layers, Search, X, ChevronUp, Undo2, Timer, WifiOff, Wifi } from 'lucide-react';
import { offlineQueue } from '../services/offlineQueue';

interface OperatorTerminalProps {
  onClose: () => void;
  onTaskAction: (task: Task, action: 'start' | 'finish') => Promise<void>;
  t: TranslationSet;
}

function parseHHMM(s: string): number | null {
  const m = (s || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function elapsedMin(startHHMM: string): number {
  const s = parseHHMM(startHHMM);
  if (s === null) return 0;
  const now = new Date();
  let diff = (now.getHours() * 60 + now.getMinutes()) - s;
  if (diff < -60) diff += 1440;
  return Math.max(0, diff);
}

export function vibrate(pattern: number | number[]) {
  try { navigator?.vibrate?.(pattern); } catch { /* ignore */ }
}

const OperatorTerminal: React.FC<OperatorTerminalProps> = ({ onClose, onTaskAction, t }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [undoConfirm, setUndoConfirm] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [processingIds, setProcessingIds] = useState<string[]>([]);
  
  const activeRef = useRef<HTMLDivElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const data = await api.fetchTasks('get_operator_tasks');
      setTasks(data);
    } catch (e) {
      console.error('fetchQueue failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchQueue, 15000);
  }, [fetchQueue]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    startPolling();
    return () => stopPolling();
  }, [fetchQueue, startPolling, stopPolling]);

  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const on = () => { setIsOnline(true); offlineQueue.flush(); };
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    const check = () => setPendingCount(offlineQueue.count());
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!loading && activeRef.current) {
      setTimeout(() => activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    }
  }, [loading]);

  const scrollToActive = () => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleTaskActionLocal = async (task: Task, action: 'start' | 'finish') => {
    if (processingIds.includes(task.id)) return;
    
    // Блокируем действие, если браузер явно сообщает, что интернета нет
    if (!isOnline) {
      alert('Нет подключения к интернету! Дождитесь появления сети для передачи фотографий.');
      return;
    }

    vibrate(30);
    stopPolling();
    setProcessingIds(prev => [...prev, task.id]);
    
    try {
      // Пытаемся выполнить задачу (включая загрузку фото)
      await onTaskAction(task, action);
      // Если прошло успешно, обновляем очередь
      await fetchQueue();
    } catch (e: any) {
      console.error('Task action error:', e);
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Выводим пользователю предупреждение
      vibrate([50, 100, 50, 100, 50]); // Длинная вибрация ошибки
      alert('⚠️ Ошибка сети!\n\nПроцесс был прерван из-за потери связи. Фотографии не отправлены.\n\nПожалуйста, проверьте интернет (например, переключитесь на мобильные данные) и нажмите кнопку еще раз.');
    } finally {
      // Снимаем блокировку кнопки независимо от результата
      setProcessingIds(prev => prev.filter(id => id !== task.id));
      startPolling();
    }
  };

  const handleUndo = async (taskId: string) => {
    setUndoingId(taskId);
    stopPolling();
    try {
      await api.taskAction(taskId, 'undo_start', '', '', '', '', '');
      vibrate([50, 30, 50]);
      await fetchQueue();
      setUndoConfirm(null);
    } catch (e) {
      console.error('Undo failed:', e);
      alert('Не удалось отменить задачу из-за проблем с сетью. Попробуйте снова.');
    } finally {
      setUndoingId(null);
      startPolling();
    }
  };

  const { visible, sorted } = React.useMemo(() => {
    const vis = tasks.filter(task => {
      if (task.end_time || task.status === 'DONE') return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return task.id.toLowerCase().includes(q) || (task.type || '').toLowerCase().includes(q);
    });

    const srt = [...vis].sort((a, b) => {
      const aA = a.status === 'ACTIVE' ? 0 : 1;
      const bA = b.status === 'ACTIVE' ? 0 : 1;
      return aA - bA;
    });

    return { visible: vis, sorted: srt };
  }, [tasks, search]);

  const firstActiveIdx = sorted.findIndex(t => t.status === 'ACTIVE');
  const hasActive = firstActiveIdx !== -1;
  const activeCount = sorted.filter(t => t.status === 'ACTIVE').length;
  const waitCount = sorted.filter(t => t.status === 'WAIT').length;

  const getTypeBadge = (type?: string) => {
    if (!type) return null;
    const colorMap: Record<string, string> = {
      Welding:  'bg-accent-blue/15 border-accent-blue/40 text-accent-blue',
      Assembly: 'bg-orange-500/15 border-orange-500/40 text-orange-400',
      Paint:    'bg-purple-500/15 border-purple-500/40 text-purple-400',
    };
    const color = colorMap[type] ?? 'bg-white/10 border-white/20 text-white/60';
    return <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${color} ml-2 shrink-0`}>{type}</span>;
  };

  return (
    <div className="terminal-root fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-xl p-0 md:p-8 animate-in fade-in duration-200">
      <div className="bg-[#191B25] w-full md:w-[95%] max-w-[800px] h-[95vh] md:h-[90vh] rounded-t-3xl md:rounded-[2.5rem] border border-white/10 flex flex-col shadow-2xl overflow-hidden relative">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="text-xl font-extrabold uppercase tracking-widest text-white">{t.drv_title}</div>
            {(!isOnline || pendingCount > 0) && (
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                !isOnline ? 'bg-red-500/15 border border-red-500/30 text-red-400' : 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
              }`}>
                {!isOnline ? <WifiOff size={12} /> : <Wifi size={12} />}
                {!isOnline ? 'Оффлайн' : `${pendingCount} в очереди`}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasActive && (
              <button onClick={scrollToActive} title="Перейти к активному"
                className="w-9 h-9 rounded-full bg-accent-green/15 border border-accent-green/30 hover:bg-accent-green/25 flex items-center justify-center transition-colors">
                <ChevronUp size={16} className="text-accent-green" />
              </button>
            )}
            <button onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/20 flex items-center justify-center transition-colors">
              <X size={18} className="text-white/60" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 focus-within:border-accent-blue/50 transition-colors">
            <Search size={16} className="text-white/50 shrink-0" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Поиск по ID или типу..."
              className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-white/50" />
            {search && (
              <button onClick={() => setSearch('')} className="text-white/50 hover:text-white transition-colors">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-white/60 animate-pulse text-sm">Загрузка...</div>
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center text-white/50 text-lg font-bold mt-20">
              {search ? 'Ничего не найдено' : t.empty}
            </div>
          ) : (
            sorted.map((task, idx) => {
              const isWait = task.status === 'WAIT';
              const isActive = task.status === 'ACTIVE';
              const isFirstActive = idx === firstActiveIdx;
              const elapsed = isActive && task.start_time ? elapsedMin(task.start_time) : 0;
              const isOvertime = elapsed > 30;
              const isUndoing = undoingId === task.id;
              const showUndoConfirm = undoConfirm === task.id;
              const isProcessing = processingIds.includes(task.id);

              const palletMatch = task.pallets?.match(/^(\d+)\s*\/\s*(\d+)$/);
              const isPalletOver = palletMatch
                ? parseInt(palletMatch[1], 10) / parseInt(palletMatch[2], 10) > 0.55
                : false;

              const cardClasses = `rounded-2xl p-4 flex flex-col gap-2 transition-all border ${
                isPalletOver
                  ? 'bg-red-500/10 border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.1)] active:bg-red-500/20 md:hover:bg-red-500/20'
                  : isActive
                    ? isOvertime
                      ? 'bg-red-500/5 border-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.05)]'
                      : 'bg-accent-green/5 border-accent-green/20 shadow-[0_0_20px_rgba(0,230,118,0.05)]'
                    : 'bg-white/5 border-white/5 active:bg-white/10 md:hover:bg-white/8'
              }`;

              return (
                <div key={task.id} ref={isFirstActive ? activeRef : undefined} className={cardClasses}>

                  {/* Main row */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-1.5 h-10 rounded-full shrink-0 ${
                        isActive ? (isOvertime ? 'bg-red-400 animate-pulse' : 'bg-accent-green') : 'bg-white/15'
                      }`} />
                      <div className="min-w-0">
                        <div className="flex items-center flex-wrap gap-1">
                          <span className="font-mono text-lg font-bold text-white truncate">{task.id}</span>
                          {getTypeBadge(task.type)}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-white/60 text-xs">
                          <span className="font-mono">{task.eta || task.time || '—'}</span>
                          {task.pallets && (
                            <span className={`flex items-center gap-1 ${isPalletOver ? 'text-red-500 font-bold' : ''}`}>
                              <Layers size={10} className={isPalletOver ? 'text-red-500' : ''} />
                              {task.pallets}
                            </span>
                          )}
                          {isActive && task.start_time && (
                            <span className="text-accent-green font-bold">▶ {task.start_time}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-auto shrink-0">
                      {isActive && task.start_time && (
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-mono text-sm font-black tabular-nums ${
                          isOvertime ? 'bg-red-500/10 border-red-500/30 text-red-400'
                            : elapsed > 20 ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            : 'bg-accent-green/10 border-accent-green/30 text-accent-green'
                        }`}>
                          <Timer size={13} />{elapsed} мин
                        </div>
                      )}

                      {task.phone && (
                        <a href={`tel:${task.phone}`}
                          className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                          <Phone size={16} className="text-accent-green" />
                        </a>
                      )}

                      <button
                        disabled={isProcessing}
                        onClick={() => handleTaskActionLocal(task, isWait ? 'start' : 'finish')}
                        className={`h-10 px-5 rounded-xl font-bold text-sm tracking-wide transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 min-w-[120px] ${
                          isWait ? 'bg-accent-blue text-white active:bg-accent-blue/80 md:hover:bg-accent-blue/80' 
                                 : 'bg-accent-green text-black active:bg-accent-green/80 md:hover:bg-accent-green/80'
                        }`}>
                        {isProcessing ? (
                          <span className="animate-pulse">Загрузка...</span>
                        ) : isWait ? (
                          <><Play size={13} fill="currentColor" /> {t.btn_start}</>
                        ) : (
                          <><Check size={15} /> {t.btn_finish}</>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Undo row for active */}
                  {isActive && (
                    <div className="flex items-center justify-between pl-5 pt-1 border-t border-white/5 mt-1">
                      <span className="text-[10px] text-white/50 font-mono">
                        {task.zone && <span className="mr-2">Зона: {task.zone}</span>}
                        {task.operator && <span>Оператор: {task.operator}</span>}
                      </span>
                      {showUndoConfirm ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-red-400 font-bold">Отменить?</span>
                          <button onClick={() => handleUndo(task.id)} disabled={isUndoing}
                            className="px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] font-bold hover:bg-red-500/25 transition-all disabled:opacity-50">
                            {isUndoing ? '...' : 'Да'}
                          </button>
                          <button onClick={() => setUndoConfirm(null)}
                            className="px-3 py-1.5 rounded-lg bg-white/5 text-white/50 text-[10px] font-bold hover:bg-white/10 transition-all">
                            Нет
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => { vibrate(20); setUndoConfirm(task.id); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all">
                          <Undo2 size={11} />Отменить начало
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {!loading && sorted.length > 0 && (
          <div className="px-6 py-3 border-t border-white/5 shrink-0 flex items-center justify-between">
            <span className="text-xs text-white/50 font-mono">
              {activeCount} активных · {waitCount} в очереди
            </span>
            {hasActive && (
              <button onClick={scrollToActive} className="text-xs text-accent-green/60 hover:text-accent-green font-bold transition-colors">
                ↑ Активный
              </button>
            )}
          </div>
        )}
      </div>

      <style>{`
        .terminal-root .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .terminal-root .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
      `}</style>
    </div>
  );
};

export default OperatorTerminal;