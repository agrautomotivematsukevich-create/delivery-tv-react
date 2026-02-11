import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import { Task, TranslationSet } from '../types';
import { Phone, Check, Play, Layers, Clock, AlertTriangle, RefreshCw } from 'lucide-react';

interface OperatorTerminalProps {
  onClose: () => void;
  onTaskAction: (task: Task, action: 'start' | 'finish') => void;
  t: TranslationSet;
}

const OperatorTerminal: React.FC<OperatorTerminalProps> = ({ onClose, onTaskAction, t }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadTimeout, setUploadTimeout] = useState(false);

  // NEW: Определяем активную задачу (есть start_time, нет end_time)
  const activeTask = tasks.find(task => 
    task.start_time && !task.end_time
  );

  const fetchQueue = useCallback(async () => {
    // Получаем задачи
    const data = await api.fetchTasks('get_operator_tasks');
    setTasks(data);
    setLoading(false);
    setUploadTimeout(false);
  }, []);

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

  // NEW: Функция для определения цвета рамки ETA
  const getETABorderColor = (eta?: string): string => {
    if (!eta) return 'border-white/10';
    
    try {
      const now = new Date();
      const etaTime = new Date(eta);
      const diffMinutes = (etaTime.getTime() - now.getTime()) / (1000 * 60);
      
      if (diffMinutes < 0) return 'border-red-500'; // Просрочено
      if (diffMinutes < 30) return 'border-orange-500'; // Менее 30 минут
      return 'border-white/10'; // Обычная
    } catch (e) {
      return 'border-white/10';
    }
  };

  // Фильтруем задачи перед рендером
  const activeTasks = tasks.filter(task => {
    // 1. Если есть время завершения - скрываем (Критическая логика)
    if (task.end_time) return false;
    // 2. Если статус DONE - скрываем
    if (task.status === 'DONE') return false;
    // Иначе показываем
    return true;
  });

  // NEW: Single Active Task Mode - показываем только активную задачу
  if (activeTask) {
    const etaBorderColor = getETABorderColor(activeTask.eta);
    
    return (
      <div className="terminal-root fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-xl p-0 md:p-8 animate-in fade-in duration-200">
        <div className="bg-[#0A0A0C] w-full md:w-[95%] max-w-[800px] h-[95vh] md:h-[90vh] rounded-t-3xl md:rounded-[2.5rem] border border-white/10 flex flex-col shadow-2xl overflow-hidden relative">
          
          {/* Header with refresh button */}
          <div className="flex items-center justify-between px-8 py-6 border-b border-white/10 bg-white/5">
            <div className="text-2xl font-extrabold uppercase tracking-widest text-white">
              Активная задача
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
                      {activeTask.eta ? new Date(activeTask.eta).toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : '-'}
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
                      {activeTask.start_time ? new Date(activeTask.start_time).toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : '-'}
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
                    {activeTask.start_time ? `${Math.round((Date.now() - new Date(activeTask.start_time).getTime()) / (1000 * 60))} мин` : '-'}
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
          </div>
        </div>
        <style>{`
          .terminal-root .custom-scrollbar::-webkit-scrollbar { width: 4px; }
          .terminal-root .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        `}</style>
      </div>
    );
  }

  // Обычный режим - все задачи
  return (
    <div className="terminal-root fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-xl p-0 md:p-8 animate-in fade-in duration-200">
      <div className="bg-[#0A0A0C] w-full md:w-[95%] max-w-[800px] h-[95vh] md:h-[90vh] rounded-t-3xl md:rounded-[2.5rem] border border-white/10 flex flex-col shadow-2xl overflow-hidden relative">
        
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-white/10 bg-white/5">
          <div className="text-2xl font-extrabold uppercase tracking-widest text-white">{t.drv_title}</div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <span className="text-2xl leading-none mb-1">&times;</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {loading ? (
             <div className="flex items-center justify-center h-full">
               <div className="text-white/50 animate-pulse">Loading tasks...</div>
             </div>
          ) : activeTasks.length === 0 ? (
             <div className="text-center text-white/30 text-xl font-bold mt-20">{t.empty}</div>
          ) : (
            // Рендерим отфильтрованный список
            activeTasks.map(task => {
              const isWait = task.status === 'WAIT';
              const etaBorderColor = getETABorderColor(task.eta);
              
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
                          ETA: {new Date(task.eta).toLocaleTimeString('ru-RU', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
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
                      <a href={`tel:${task.phone}`} className="w-12 h-12 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
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
      </div>
      <style>{`
        .terminal-root .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .terminal-root .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
      `}</style>
    </div>
  );
};

export default OperatorTerminal;