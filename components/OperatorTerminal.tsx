import React, { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../services/api';
import { Task, TranslationSet } from '../types';
import { Phone, Check, Play, Layers, Search, X, ChevronUp, Undo2, Timer, WifiOff, Wifi, Eye } from 'lucide-react';
import { offlineQueue } from '../services/offlineQueue';
import SecureImage from './SecureImage'; // Импорт компонента для безопасного отображения фото

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
  
  // Состояние для модального окна просмотра фото
  const [previewTask, setPreviewTask] = useState<Task | null>(null);
  
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

  const handleTaskActionLocal = async (task: Task, action: 'start' | 'finish') => {
    if (processingIds.includes(task.id)) return;
    
    if (!isOnline) {
      alert('Нет подключения к интернету! Дождитесь появления сети для передачи фотографий.');
      return;
    }

    // ЛОГИКА БЛОКИРОВКИ ПОВТОРНОГО СТАРТА НА ТЕХ ЖЕ ВОРОТАХ
    if (action === "start") {
      const activeOnSameGate = tasks.find(t => t.status === 'ACTIVE' && t.zone === task.zone && t.id !== task.id);
      if (activeOnSameGate) {
        vibrate([100, 50, 100]);
        alert(`Внимание: На воротах (${task.zone}) уже есть активный контейнер (${activeOnSameGate.id}). Сначала завершите его.`);
        return;
      }
    }

    vibrate(30);
    stopPolling();
    setProcessingIds(prev => [...prev, task.id]);
    
    try {
      await onTaskAction(task, action);
      await fetchQueue();
    } catch (e: any) {
      console.error('Task action error:', e);
      vibrate([50, 100, 50, 100, 50]);
      alert('⚠️ Ошибка сети! Процесс был прерван. Фотографии не отправлены. Попробуйте еще раз.');
    } finally {
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
      alert('Не удалось отменить задачу. Проверьте сеть.');
    } finally {
      setUndoingId(null);
      startPolling();
    }
  };

  const { sorted } = React.useMemo(() => {
    const vis = tasks.filter(task => {
      if (task.end_time || task.status === 'DONE') return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return task.id.toLowerCase().includes(q) || (task.type || '').toLowerCase().includes(q);
    });
    const srt = [...vis].sort((a, b) => (a.status === 'ACTIVE' ? 0 : 1) - (b.status === 'ACTIVE' ? 0 : 1));
    return { sorted: srt };
  }, [tasks, search]);

  const firstActiveIdx = sorted.findIndex(t => t.status === 'ACTIVE');
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
          <div className="text-xl font-extrabold uppercase tracking-widest text-white">{t.drv_title}</div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/20 flex items-center justify-center transition-colors">
            <X size={18} className="text-white/60" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5">
            <Search size={16} className="text-white/50" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по ID..." className="flex-1 bg-transparent text-white text-sm outline-none" />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center h-full text-white/60 animate-pulse">Загрузка...</div>
          ) : (
            sorted.map((task, idx) => {
              const isActive = task.status === 'ACTIVE';
              const isWait = task.status === 'WAIT';
              const elapsed = isActive && task.start_time ? elapsedMin(task.start_time) : 0;
              const isProcessing = processingIds.includes(task.id);

              return (
                <div key={task.id} ref={idx === firstActiveIdx ? activeRef : undefined} className={`rounded-2xl p-4 flex flex-col gap-2 border transition-all ${isActive ? 'bg-accent-green/5 border-accent-green/20' : 'bg-white/5 border-white/5'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-1.5 h-10 rounded-full ${isActive ? 'bg-accent-green' : 'bg-white/15'}`} />
                      <div className="min-w-0">
                        <div className="flex items-center flex-wrap gap-1">
                          <span className="font-mono text-lg font-bold text-white truncate">
                            {task.id}
                            {/* ОТОБРАЖЕНИЕ ВОРОТ (DOCK) */}
                            {isActive && task.zone && (
                              <span className="ml-2 text-accent-blue font-black bg-accent-blue/10 px-2 py-0.5 rounded-md border border-accent-blue/20 tracking-tighter">({task.zone})</span>
                            )}
                          </span>
                          {getTypeBadge(task.type)}
                        </div>
                        <div className="text-white/60 text-xs font-mono">{task.eta || task.time} {isActive && <span className="text-accent-green ml-2">▶ {task.start_time}</span>}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      {isActive && (
                        <>
                          {/* Кнопка просмотра фото */}
                          {task.photo_gen && (
                            <button onClick={() => setPreviewTask(task)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-accent-blue/10 border border-accent-blue/20 text-accent-blue hover:bg-accent-blue/20 transition-colors">
                              <Eye size={18} />
                            </button>
                          )}
                          <div className={`px-3 py-1.5 rounded-xl border font-mono text-sm font-black flex items-center gap-1.5 ${elapsed > 30 ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-accent-green/10 border-accent-green/30 text-accent-green'}`}>
                            <Timer size={13} />{elapsed} мин
                          </div>
                        </>
                      )}
                      <button disabled={isProcessing} onClick={() => handleTaskActionLocal(task, isWait ? 'start' : 'finish')} className={`h-10 px-5 rounded-xl font-bold text-sm min-w-[120px] transition-all ${isWait ? 'bg-accent-blue text-white' : 'bg-accent-green text-black'}`}>
                        {isProcessing ? '...' : isWait ? t.btn_start : t.btn_finish}
                      </button>
                    </div>
                  </div>
                  
                  {isActive && (
                    <div className="flex items-center justify-between pl-5 pt-1 border-t border-white/5 mt-1">
                      <span className="text-[10px] text-white/40 font-mono">Оператор: {task.operator || '—'}</span>
                      {undoConfirm === task.id ? (
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleUndo(task.id)} className="text-[10px] font-bold text-red-400 px-2 py-1 bg-red-500/10 rounded">Да, отменить</button>
                          <button onClick={() => setUndoConfirm(null)} className="text-[10px] text-white/40 px-2 py-1">Нет</button>
                        </div>
                      ) : (
                        <button onClick={() => setUndoConfirm(task.id)} className="flex items-center gap-1 text-[10px] font-bold text-white/40 hover:text-red-400"><Undo2 size={11} />Отменить начало</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/5 text-xs text-white/50 font-mono flex justify-between">
          <span>{activeCount} активных · {waitCount} в очереди</span>
        </div>
      </div>

      {/* МОДАЛЬНОЕ ОКНО ПРОСМОТРА ФОТО */}
      {previewTask && (
        <div className="absolute inset-0 z-[70] bg-black/95 flex flex-col animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <span className="text-white font-bold">{previewTask.id}</span>
            <button onClick={() => setPreviewTask(null)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white"><X size={20} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
             {previewTask.photo_gen && (
               <div className="space-y-1">
                 <span className="text-[10px] text-white/40 uppercase font-bold">Контейнер:</span>
                 <SecureImage src={previewTask.photo_gen} alt="Container" className="w-full rounded-xl border border-white/10 aspect-video object-cover" />
               </div>
             )}
             {previewTask.photo_seal && (
               <div className="space-y-1">
                 <span className="text-[10px] text-white/40 uppercase font-bold">Пломба:</span>
                 <SecureImage src={previewTask.photo_seal} alt="Seal" className="w-full rounded-xl border border-white/10 aspect-video object-cover" />
               </div>
             )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OperatorTerminal;
