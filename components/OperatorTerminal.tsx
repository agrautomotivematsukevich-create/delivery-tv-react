import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import { Task, TranslationSet, User } from '../types';
import { Phone, Check, Play, Layers, Clock, AlertTriangle, RefreshCw, User as UserIcon } from 'lucide-react';

interface OperatorTerminalProps {
  onClose: () => void;
  onTaskAction: (task: Task, action: 'start' | 'finish') => void;
  t: TranslationSet;
  currentUser: User;
}

// ---------- Вспомогательные функции (без изменений) ----------
const parseTime = (timeStr?: string): { hours: number; minutes: number; valid: boolean } => {
  if (!timeStr || typeof timeStr !== 'string') return { hours: 0, minutes: 0, valid: false };
  const trimmed = timeStr.trim().replace(/[^\d:.]/g, '');
  const formats = [/^(\d{1,2}):(\d{1,2})$/, /^(\d{1,2})\.(\d{1,2})$/, /^(\d{1,2})(\d{2})$/];
  for (const format of formats) {
    const match = trimmed.match(format);
    if (match) {
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) return { hours, minutes, valid: true };
    }
  }
  return { hours: 0, minutes: 0, valid: false };
};

const formatTime = (timeStr?: string): string => {
  const p = parseTime(timeStr);
  return p.valid ? `${p.hours.toString().padStart(2, '0')}:${p.minutes.toString().padStart(2, '0')}` : '-';
};

const calculateDuration = (startTimeStr?: string): string => {
  const p = parseTime(startTimeStr);
  if (!p.valid) return '-';
  const now = new Date();
  const start = new Date();
  start.setHours(p.hours, p.minutes, 0, 0);
  if (start > now) start.setDate(start.getDate() - 1);
  const diff = Math.floor((now.getTime() - start.getTime()) / 60000);
  if (diff < 60) return `${diff} мин`;
  return `${Math.floor(diff / 60)} ч ${diff % 60} мин`;
};

const parseETA = (etaStr?: string): { time: string; date: Date | null; valid: boolean } => {
  const p = parseTime(etaStr);
  if (!p.valid) return { time: '-', date: null, valid: false };
  const timeStr = `${p.hours.toString().padStart(2, '0')}:${p.minutes.toString().padStart(2, '0')}`;
  const etaDate = new Date();
  etaDate.setHours(p.hours, p.minutes, 0, 0);
  if (etaDate < new Date()) etaDate.setDate(etaDate.getDate() + 1);
  return { time: timeStr, date: etaDate, valid: true };
};

const getETABorderColor = (etaStr?: string): string => {
  const eta = parseETA(etaStr);
  if (!eta.valid || !eta.date) return 'border-white/10';
  const diff = (eta.date.getTime() - Date.now()) / 60000;
  if (diff < 0) return 'border-red-500';
  if (diff < 30) return 'border-orange-500';
  return 'border-white/10';
};

// ---------- ОСНОВНОЙ КОМПОНЕНТ ----------
const OperatorTerminal: React.FC<OperatorTerminalProps> = ({ onClose, onTaskAction, t, currentUser }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadTimeout, setUploadTimeout] = useState(false);

  // Ключ localStorage для активной задачи ТЕКУЩЕГО оператора
  const storageKey = `activeTask_${currentUser.name}`;

  // Получить / установить / удалить ID активной задачи
  const getActiveTaskId = (): string | null => localStorage.getItem(storageKey);
  const setActiveTaskId = (taskId: string | null) => {
    if (taskId) localStorage.setItem(storageKey, taskId);
    else localStorage.removeItem(storageKey);
  };

  // Загрузка задач с сервера
  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.fetchTasks('get_operator_tasks');
      setTasks(data);
      setUploadTimeout(false);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  // ---------- ЛОГИКА ФИЛЬТРАЦИИ ----------
  // 1. ID активной задачи (из localStorage)
  const activeTaskId = getActiveTaskId();

  // 2. Все задачи, которые сейчас активны (есть start_time, нет end_time)
  const allActiveTasks = tasks.filter(t => t.start_time?.trim() && !t.end_time?.trim());

  // 3. Активная задача ТЕКУЩЕГО оператора (id совпадает с сохранённым И задача действительно активна)
  const myActiveTask = tasks.find(t => t.id === activeTaskId && t.start_time?.trim() && !t.end_time?.trim());

  // 4. Чужие активные задачи – полностью скрываем
  const otherActiveTaskIds = new Set(
    allActiveTasks.filter(t => t.id !== activeTaskId).map(t => t.id)
  );

  // 5. Доступные задачи:
  //    - статус WAIT
  //    - нет start_time (не начата)
  //    - нет end_time
  //    - не является чужой активной задачей
  const availableTasks = tasks.filter(task => {
    if (task.status !== 'WAIT') return false;
    if (task.start_time?.trim()) return false; // уже начата
    if (task.end_time?.trim()) return false;   // завершена
    if (otherActiveTaskIds.has(task.id)) return false; // чужая активная
    return true;
  });

  // Обёртка для onTaskAction – сохраняем/удаляем activeTaskId в localStorage
  const handleTaskAction = (task: Task, action: 'start' | 'finish') => {
    if (action === 'start') {
      setActiveTaskId(task.id);
    } else {
      setActiveTaskId(null);
    }
    onTaskAction(task, action);
  };

  const getTypeBadge = (type?: string) => {
    if (!type) return null;
    let color = "bg-white/10 border-white/20 text-white";
    if (type.includes("BS")) color = "bg-accent-red/15 border-accent-red text-accent-red";
    if (type.includes("AS")) color = "bg-orange-500/15 border-orange-500 text-orange-500";
    if (type.includes("PS")) color = "bg-accent-purple/15 border-accent-purple text-accent-purple";
    return <span className={`px-2 py-0.5 rounded text-xs font-bold border ${color} ml-2`}>{type}</span>;
  };

  // ---------- РЕНДЕР: АКТИВНАЯ ЗАДАЧА ----------
  if (myActiveTask) {
    const eta = parseETA(myActiveTask.eta);
    const etaBorderColor = getETABorderColor(myActiveTask.eta);

    return (
      <div className="terminal-root fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-xl p-0 md:p-8 animate-in fade-in duration-200">
        <div className="bg-[#0A0A0C] w-full md:w-[95%] max-w-[800px] h-[95vh] md:h-[90vh] rounded-t-3xl md:rounded-[2.5rem] border border-white/10 flex flex-col shadow-2xl overflow-hidden relative">
          {/* Header */}
          <div className="flex items-center justify-between px-8 py-6 border-b border-white/10 bg-white/5">
            <div className="flex items-center gap-3">
              <div className="text-2xl font-extrabold uppercase tracking-widest text-white">Активная задача</div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-full">
                <UserIcon size={14} className="text-white/60" />
                <span className="text-sm font-semibold text-white/80">{currentUser.name}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {uploadTimeout && (
                <button
                  onClick={fetchQueue}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 transition-colors text-sm font-bold"
                >
                  <RefreshCw size={14} /> Обновить экран
                </button>
              )}
              <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/20 flex items-center justify-center transition-colors">
                <span className="text-2xl leading-none mb-1">&times;</span>
              </button>
            </div>
          </div>

          {/* Task content */}
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <div className={`bg-white/5 border-2 ${etaBorderColor} rounded-3xl p-8 space-y-6 animate-in slide-in-from-bottom-2 duration-300`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <span className="font-mono text-4xl font-bold text-white">{myActiveTask.id}</span>
                  {getTypeBadge(myActiveTask.type)}
                </div>
                <div className="flex items-center gap-2">
                  {etaBorderColor.includes('red') && <AlertTriangle size={20} className="text-red-500" />}
                  {etaBorderColor.includes('orange') && !etaBorderColor.includes('red') && <AlertTriangle size={20} className="text-orange-500" />}
                  <div className="text-right">
                    <div className="text-sm text-white/50">ETA</div>
                    <div className="text-xl font-bold text-white">{eta.time}</div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <div className="text-sm text-white/50">Начало</div>
                  <div className="flex items-center gap-2 text-white">
                    <Clock size={16} />
                    <span className="text-lg font-semibold">{formatTime(myActiveTask.start_time)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-white/50">Паллеты</div>
                  <div className="flex items-center gap-2 text-white">
                    <Layers size={16} />
                    <span className="text-lg font-semibold">{myActiveTask.pallets || '-'}</span>
                  </div>
                </div>
                {myActiveTask.phone && (
                  <div className="space-y-2">
                    <div className="text-sm text-white/50">Телефон водителя</div>
                    <div className="flex items-center gap-2 text-white">
                      <Phone size={16} />
                      <span className="text-lg font-semibold">{myActiveTask.phone}</span>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <div className="text-sm text-white/50">Время работы</div>
                  <div className="text-lg font-semibold text-white">{calculateDuration(myActiveTask.start_time)}</div>
                </div>
              </div>
              <div className="pt-8 border-t border-white/10">
                <button
                  onClick={() => handleTaskAction(myActiveTask, 'finish')}
                  className="w-full py-5 rounded-2xl bg-accent-green text-black font-extrabold text-lg tracking-wider shadow-lg shadow-accent-green/20 hover:bg-accent-green/90 transition-all active:scale-95 flex items-center justify-center gap-3"
                >
                  <Check size={24} /> ЗАВЕРШИТЬ ЗАДАЧУ
                </button>
              </div>
            </div>
            <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <div className="flex items-center gap-2 text-blue-300 text-sm">
                <AlertTriangle size={16} />
                <span>Другие задачи временно недоступны. Завершите текущую задачу, чтобы получить доступ к следующим.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- РЕНДЕР: СПИСОК ДОСТУПНЫХ ЗАДАЧ ----------
  return (
    <div className="terminal-root fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-xl p-0 md:p-8 animate-in fade-in duration-200">
      <div className="bg-[#0A0A0C] w-full md:w-[95%] max-w-[800px] h-[95vh] md:h-[90vh] rounded-t-3xl md:rounded-[2.5rem] border border-white/10 flex flex-col shadow-2xl overflow-hidden relative">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-extrabold uppercase tracking-widest text-white">{t.drv_title}</div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-full">
              <UserIcon size={14} className="text-white/60" />
              <span className="text-sm font-semibold text-white/80">{currentUser.name}</span>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/20 flex items-center justify-center transition-colors">
            <span className="text-2xl leading-none mb-1">&times;</span>
          </button>
        </div>

        {/* Stats */}
        <div className="px-6 py-4 bg-white/5 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="text-sm text-white/60">Всего задач: <span className="font-bold text-white">{tasks.length}</span></div>
            <div className="text-sm text-white/60">Доступно: <span className="font-bold text-accent-green">{availableTasks.length}</span></div>
            <div className="text-sm text-white/60">Активных (система): <span className="font-bold text-accent-yellow">{allActiveTasks.length}</span></div>
          </div>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-white/50 animate-pulse">Загрузка задач...</div>
            </div>
          ) : availableTasks.length === 0 ? (
            <div className="text-center text-white/30 text-xl font-bold mt-20">Нет доступных задач для принятия</div>
          ) : (
            availableTasks.map(task => {
              const etaBorderColor = getETABorderColor(task.eta);
              const eta = parseETA(task.eta);
              return (
                <div key={task.id} className={`bg-white/5 border-2 ${etaBorderColor} rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 hover:bg-white/10 transition-colors`}>
                  <div className="flex flex-col">
                    <div className="flex items-center">
                      <span className="font-mono text-2xl font-bold text-white">{task.id}</span>
                      {getTypeBadge(task.type)}
                    </div>
                    <span className="text-sm font-mono text-white/50 mt-1">{task.time}</span>
                    {task.eta && (
                      <div className="flex items-center gap-1 mt-2">
                        <Clock size={12} className="text-white/40" />
                        <span className="text-xs text-white/40">ETA: {eta.time}</span>
                        {etaBorderColor.includes('red') && <span className="text-[10px] text-red-500 font-bold ml-2">ПРОСРОЧЕНО</span>}
                        {etaBorderColor.includes('orange') && !etaBorderColor.includes('red') && <span className="text-[10px] text-orange-500 font-bold ml-2">СКОРО</span>}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2 text-white/40 text-sm">
                      <Layers size={14} />
                      <span className="font-semibold">{task.pallets || '-'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-auto">
                    {task.phone && (
                      <a href={`tel:${task.phone.replace(/\D/g, '')}`} className="w-12 h-12 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                        <Phone size={20} className="text-accent-green" />
                      </a>
                    )}
                    <button
                      onClick={() => handleTaskAction(task, 'start')}
                      className="h-12 px-6 rounded-xl font-bold text-sm tracking-wide shadow-lg transition-transform active:scale-95 flex items-center gap-2 bg-accent-blue text-white shadow-accent-blue/20 hover:bg-accent-blue/90"
                    >
                      <Play size={16} fill="currentColor" /> {t.btn_start}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 py-4 border-t border-white/10 bg-white/5 text-xs text-white/40 text-center">
          <p>Система поддерживает одновременную работу нескольких операторов</p>
          <p className="mt-1">Каждый оператор может принимать одну задачу одновременно</p>
        </div>
      </div>
    </div>
  );
};

export default OperatorTerminal;