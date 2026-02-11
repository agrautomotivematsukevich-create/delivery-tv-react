import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import { Task, TranslationSet, User } from '../types';
import { Phone, Check, Play, Layers, Clock, AlertTriangle, RefreshCw, User as UserIcon } from 'lucide-react';

interface OperatorTerminalProps {
  onClose: () => void;
  onTaskAction: (task: Task, action: 'start' | 'finish') => void;
  t: TranslationSet;
  currentUser: User; // Добавляем информацию о текущем пользователе
}

// Функция для парсинга времени в формате HH:mm
const parseTime = (timeStr?: string): { hours: number, minutes: number, valid: boolean } => {
  if (!timeStr || typeof timeStr !== 'string') {
    return { hours: 0, minutes: 0, valid: false };
  }
  
  const trimmed = timeStr.trim();
  
  // Удаляем все нецифровые символы кроме двоеточия и точки
  const cleanStr = trimmed.replace(/[^\d:.]/g, '');
  
  // Разные форматы времени
  const formats = [
    /^(\d{1,2}):(\d{1,2})$/,       // 9:42, 09:42
    /^(\d{1,2})\.(\d{1,2})$/,      // 9.42, 09.42
    /^(\d{1,2})(\d{2})$/,          // 942, 0942
  ];
  
  for (const format of formats) {
    const match = cleanStr.match(format);
    if (match) {
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      
      if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
        return { hours, minutes, valid: true };
      }
    }
  }
  
  return { hours: 0, minutes: 0, valid: false };
};

// Форматирование времени для отображения
const formatTime = (timeStr?: string): string => {
  if (!timeStr) return '-';
  
  const parsed = parseTime(timeStr);
  if (!parsed.valid) return '-';
  
  const { hours, minutes } = parsed;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

// Расчет времени работы
const calculateDuration = (startTimeStr?: string): string => {
  if (!startTimeStr) return '-';
  
  const startParsed = parseTime(startTimeStr);
  if (!startParsed.valid) return '-';
  
  const now = new Date();
  const startDate = new Date();
  startDate.setHours(startParsed.hours, startParsed.minutes, 0, 0);
  
  // Если время начала позже текущего времени, значит это было вчера
  if (startDate > now) {
    startDate.setDate(startDate.getDate() - 1);
  }
  
  const diffMs = now.getTime() - startDate.getTime();
  if (diffMs < 0) return '-';
  
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  
  if (diffMinutes < 60) return `${diffMinutes} мин`;
  
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return `${hours} ч ${minutes > 0 ? `${minutes} мин` : ''}`.trim();
};

// Парсинг ETA времени
const parseETA = (etaStr?: string): { time: string, date: Date | null, valid: boolean } => {
  if (!etaStr) return { time: '-', date: null, valid: false };
  
  const parsed = parseTime(etaStr);
  if (!parsed.valid) return { time: '-', date: null, valid: false };
  
  const { hours, minutes } = parsed;
  const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  
  // Создаем дату для ETA
  const etaDate = new Date();
  etaDate.setHours(hours, minutes, 0, 0);
  
  // Если ETA уже прошло сегодня, считаем что это на следующий день
  const now = new Date();
  if (etaDate < now) {
    etaDate.setDate(etaDate.getDate() + 1);
  }
  
  return { time: timeStr, date: etaDate, valid: true };
};

// Определение цвета рамки для ETA
const getETABorderColor = (etaStr?: string): string => {
  const eta = parseETA(etaStr);
  if (!eta.valid || !eta.date) return 'border-white/10';
  
  const now = new Date();
  const diffMinutes = (eta.date.getTime() - now.getTime()) / (1000 * 60);
  
  if (diffMinutes < 0) return 'border-red-500'; // Просрочено
  if (diffMinutes < 30) return 'border-orange-500'; // Менее 30 минут
  return 'border-white/10'; // Обычная
};

const OperatorTerminal: React.FC<OperatorTerminalProps> = ({ 
  onClose, 
  onTaskAction, 
  t, 
  currentUser 
}) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadTimeout, setUploadTimeout] = useState(false);
  const [userTasks, setUserTasks] = useState<Task[]>([]); // Задачи текущего пользователя

  // Определяем активную задачу ТЕКУЩЕГО ОПЕРАТОРА (есть start_time, нет end_time)
  const activeTask = userTasks.find(task => {
    const hasStartTime = task.start_time && task.start_time.trim() !== '';
    const hasEndTime = task.end_time && task.end_time.trim() !== '';
    return hasStartTime && !hasEndTime;
  });

  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.fetchTasks('get_operator_tasks');
      
      // Фильтруем задачи, которые относятся к текущему оператору
      // В реальном приложении тут должна быть логика по оператору
      // Пока что используем все задачи для отладки
      const userSpecificTasks = data.filter(task => {
        // В реальности здесь должна быть проверка task.operator === currentUser.name
        // Но так как в API нет оператора, покажем все задачи
        return true;
      });
      
      console.log('All tasks:', data.length);
      console.log('Filtered for user:', userSpecificTasks.length);
      console.log('Active task for user:', activeTask);
      
      setTasks(data);
      setUserTasks(userSpecificTasks);
      setUploadTimeout(false);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUser, activeTask]);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  const getTypeBadge = (type?: string) => {
    if (!type) return null;
    let color = "bg-white/10 border-white/20 text-white";
    if (type.includes("BS")) color = "bg-accent-red/15 border-accent-red text-accent-red";
    if (type.includes("AS")) color = "bg-orange-500/15 border-orange-500 text-orange-500";
    if (type.includes("PS")) color = "bg-accent-purple/15 border-accent-purple text-accent-purple";
    
    return <span className={`px-2 py-0.5 rounded text-xs font-bold border ${color} ml-2`}>{type}</span>;
  };

  // Фильтруем задачи для отображения в общем списке
  // Показываем все задачи без start_time (не начатые) и без end_time (не завершенные)
  const availableTasks = tasks.filter(task => {
    // Не показываем задачи с end_time (завершенные)
    if (task.end_time && task.end_time.trim() !== '') return false;
    
    // Не показываем задачи, которые уже начаты (имеют start_time)
    // Эти задачи будут видны только оператору, который их начал
    if (task.start_time && task.start_time.trim() !== '') {
      // В реальности здесь должна быть проверка: task.operator === currentUser.name
      // Если задача начата текущим пользователем, покажем ее в режиме Single Active Task
      // Если задача начата другим пользователем, не показываем ее вообще
      return false;
    }
    
    // Показываем только задачи со статусом WAIT
    return task.status === 'WAIT';
  });

  // Single Active Task Mode - показываем только активную задачу ТЕКУЩЕГО ОПЕРАТОРА
  if (activeTask) {
    const eta = parseETA(activeTask.eta);
    const etaBorderColor = getETABorderColor(activeTask.eta);
    
    return (
      <div className="terminal-root fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-xl p-0 md:p-8 animate-in fade-in duration-200">
        <div className="bg-[#0A0A0C] w-full md:w-[95%] max-w-[800px] h-[95vh] md:h-[90vh] rounded-t-3xl md:rounded-[2.5rem] border border-white/10 flex flex-col shadow-2xl overflow-hidden relative">
          
          {/* Header with user info */}
          <div className="flex items-center justify-between px-8 py-6 border-b border-white/10 bg-white/5">
            <div className="flex items-center gap-3">
              <div className="text-2xl font-extrabold uppercase tracking-widest text-white">
                Активная задача
              </div>
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
                  <RefreshCw size={14} />
                  Обновить экран
                </button>
              )}
              <button 
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <span className="text-2xl leading-none mb-1">&times;</span>
              </button>
            </div>
          </div>

          {/* Active Task Content */}
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <div className={`bg-white/5 border-2 ${etaBorderColor} rounded-3xl p-8 space-y-6 animate-in slide-in-from-bottom-2 duration-300`}>
              
              {/* Task Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <span className="font-mono text-4xl font-bold text-white">{activeTask.id}</span>
                  {getTypeBadge(activeTask.type)}
                </div>
                
                {/* ETA Display */}
                <div className="flex items-center gap-2">
                  {etaBorderColor.includes('red') && <AlertTriangle size={20} className="text-red-500" />}
                  {etaBorderColor.includes('orange') && !etaBorderColor.includes('red') && <AlertTriangle size={20} className="text-orange-500" />}
                  <div className="text-right">
                    <div className="text-sm text-white/50">ETA</div>
                    <div className="text-xl font-bold text-white">
                      {eta.time}
                    </div>
                  </div>
                </div>
              </div>

              {/* Task Details */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <div className="text-sm text-white/50">Начало</div>
                  <div className="flex items-center gap-2 text-white">
                    <Clock size={16} />
                    <span className="text-lg font-semibold">
                      {formatTime(activeTask.start_time)}
                    </span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="text-sm text-white/50">Паллеты</div>
                  <div className="flex items-center gap-2 text-white">
                    <Layers size={16} />
                    <span className="text-lg font-semibold">{activeTask.pallets || '-'}</span>
                  </div>
                </div>
                
                {activeTask.phone && (
                  <div className="space-y-2">
                    <div className="text-sm text-white/50">Телефон водителя</div>
                    <div className="flex items-center gap-2 text-white">
                      <Phone size={16} />
                      <span className="text-lg font-semibold">{activeTask.phone}</span>
                    </div>
                  </div>
                )}
                
                <div className="space-y-2">
                  <div className="text-sm text-white/50">Время работы</div>
                  <div className="text-lg font-semibold text-white">
                    {calculateDuration(activeTask.start_time)}
                  </div>
                </div>
              </div>

              {/* Finish Button */}
              <div className="pt-8 border-t border-white/10">
                <button
                  onClick={() => onTaskAction(activeTask, 'finish')}
                  className="w-full py-5 rounded-2xl bg-accent-green text-black font-extrabold text-lg tracking-wider shadow-lg shadow-accent-green/20 hover:bg-accent-green/90 transition-all active:scale-95 flex items-center justify-center gap-3"
                >
                  <Check size={24} />
                  ЗАВЕРШИТЬ ЗАДАЧУ
                </button>
              </div>
            </div>
            
            {/* Информация о блокировке других задач */}
            <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <div className="flex items-center gap-2 text-blue-300 text-sm">
                <AlertTriangle size={16} />
                <span>
                  Другие задачи временно недоступны. Завершите текущую задачу, чтобы получить доступ к следующим.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Обычный режим - все доступные задачи (WAIT без start_time)
  return (
    <div className="terminal-root fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-xl p-0 md:p-8 animate-in fade-in duration-200">
      <div className="bg-[#0A0A0C] w-full md:w-[95%] max-w-[800px] h-[95vh] md:h-[90vh] rounded-t-3xl md:rounded-[2.5rem] border border-white/10 flex flex-col shadow-2xl overflow-hidden relative">
        
        {/* Header with user info */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-extrabold uppercase tracking-widest text-white">{t.drv_title}</div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-full">
              <UserIcon size={14} className="text-white/60" />
              <span className="text-sm font-semibold text-white/80">{currentUser.name}</span>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <span className="text-2xl leading-none mb-1">&times;</span>
          </button>
        </div>

        {/* Статистика */}
        <div className="px-6 py-4 bg-white/5 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="text-sm text-white/60">
              Всего задач: <span className="font-bold text-white">{tasks.length}</span>
            </div>
            <div className="text-sm text-white/60">
              Доступно: <span className="font-bold text-accent-green">{availableTasks.length}</span>
            </div>
            <div className="text-sm text-white/60">
              Активных: <span className="font-bold text-accent-yellow">{tasks.filter(t => t.start_time && !t.end_time).length}</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {loading ? (
             <div className="flex items-center justify-center h-full">
               <div className="text-white/50 animate-pulse">Загрузка задач...</div>
             </div>
          ) : availableTasks.length === 0 ? (
             <div className="text-center text-white/30 text-xl font-bold mt-20">
               Нет доступных задач для принятия
             </div>
          ) : (
            // Рендерим отфильтрованный список
            availableTasks.map(task => {
              const isWait = task.status === 'WAIT';
              const etaBorderColor = getETABorderColor(task.eta);
              const eta = parseETA(task.eta);
              
              return (
                <div 
                  key={task.id} 
                  className={`bg-white/5 border-2 ${etaBorderColor} rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 hover:bg-white/10 transition-colors`}
                >
                  <div className="flex flex-col">
                    <div className="flex items-center">
                       <span className="font-mono text-2xl font-bold text-white">{task.id}</span>
                       {getTypeBadge(task.type)}
                    </div>
                    <span className="text-sm font-mono text-white/50 mt-1">{task.time}</span>
                    
                    {/* ETA Indicator */}
                    {task.eta && (
                      <div className="flex items-center gap-1 mt-2">
                        <Clock size={12} className="text-white/40" />
                        <span className="text-xs text-white/40">
                          ETA: {eta.time}
                        </span>
                        {etaBorderColor.includes('red') && (
                          <span className="text-[10px] text-red-500 font-bold ml-2">ПРОСРОЧЕНО</span>
                        )}
                        {etaBorderColor.includes('orange') && !etaBorderColor.includes('red') && (
                          <span className="text-[10px] text-orange-500 font-bold ml-2">СКОРО</span>
                        )}
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2 mt-2 text-white/40 text-sm">
                       <Layers size={14} />
                       <span className="font-semibold">{task.pallets || '-'}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 ml-auto">
                    {task.phone && (
                      <a 
                        href={`tel:${task.phone.replace(/\D/g, '')}`} 
                        className="w-12 h-12 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                      >
                        <Phone size={20} className="text-accent-green" />
                      </a>
                    )}
                    
                    <button
                      onClick={() => onTaskAction(task, isWait ? 'start' : 'finish')}
                      className={`h-12 px-6 rounded-xl font-bold text-sm tracking-wide shadow-lg transition-transform active:scale-95 flex items-center gap-2
                        ${isWait 
                          ? 'bg-accent-blue text-white shadow-accent-blue/20 hover:bg-accent-blue/90' 
                          : 'bg-accent-green text-black shadow-accent-green/20 hover:bg-accent-green/90'
                        }`}
                    >
                      {isWait ? (
                        <><Play size={16} fill="currentColor" /> {t.btn_start}</>
                      ) : (
                        <><Check size={18} /> {t.btn_finish}</>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        
        {/* Footer с информацией */}
        <div className="px-6 py-4 border-t border-white/10 bg-white/5">
          <div className="text-xs text-white/40 text-center">
            <p>Система поддерживает одновременную работу нескольких операторов</p>
            <p className="mt-1">Каждый оператор может принимать одну задачу одновременно</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OperatorTerminal;