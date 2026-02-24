import React, { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../services/api';
import { Task, TranslationSet } from '../types';
import { Phone, Check, Play, Layers, Search, X, ChevronUp } from 'lucide-react';

interface OperatorTerminalProps {
  onClose: () => void;
  onTaskAction: (task: Task, action: 'start' | 'finish') => void;
  t: TranslationSet;
}

const OperatorTerminal: React.FC<OperatorTerminalProps> = ({ onClose, onTaskAction, t }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const activeRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const fetchQueue = useCallback(async () => {
    const data = await api.fetchTasks('get_operator_tasks');
    setTasks(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  // Авто-скролл к первому активному при загрузке
  useEffect(() => {
    if (!loading && activeRef.current) {
      setTimeout(() => {
        activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
  }, [loading]);

  const scrollToActive = () => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Фильтр: убрать завершённые
  const visible = tasks.filter(task => {
    if (task.end_time || task.status === 'DONE') return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return task.id.toLowerCase().includes(q) || (task.type || '').toLowerCase().includes(q);
  });

  // Сортировка: ACTIVE сначала, потом WAIT
  const sorted = [...visible].sort((a, b) => {
    const aActive = a.status === 'ACTIVE' ? 0 : 1;
    const bActive = b.status === 'ACTIVE' ? 0 : 1;
    return aActive - bActive;
  });

  const firstActiveIdx = sorted.findIndex(t => t.status === 'ACTIVE');
  const hasActive = firstActiveIdx !== -1;

  const getTypeBadge = (type?: string) => {
    if (!type) return null;
    const colorMap: Record<string, string> = {
      Welding:  'bg-blue-500/15 border-blue-500/40 text-blue-400',
      Assembly: 'bg-orange-500/15 border-orange-500/40 text-orange-400',
      Paint:    'bg-purple-500/15 border-purple-500/40 text-purple-400',
    };
    const color = colorMap[type] ?? 'bg-white/10 border-white/20 text-white/60';
    return (
      <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${color} ml-2 shrink-0`}>
        {type}
      </span>
    );
  };

  return (
    <div className="terminal-root fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-xl p-0 md:p-8 animate-in fade-in duration-200">
      <div className="bg-[#0A0A0C] w-full md:w-[95%] max-w-[800px] h-[95vh] md:h-[90vh] rounded-t-3xl md:rounded-[2.5rem] border border-white/10 flex flex-col shadow-2xl overflow-hidden relative">

        {/* Шапка */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5 shrink-0">
          <div className="text-xl font-extrabold uppercase tracking-widest text-white">{t.drv_title}</div>
          <div className="flex items-center gap-2">
            {hasActive && (
              <button
                onClick={scrollToActive}
                title="Перейти к активному"
                className="w-9 h-9 rounded-full bg-accent-green/15 border border-accent-green/30 hover:bg-accent-green/25 flex items-center justify-center transition-colors"
              >
                <ChevronUp size={16} className="text-accent-green" />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <X size={18} className="text-white/60" />
            </button>
          </div>
        </div>

        {/* Строка поиска */}
        <div className="px-6 py-3 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 focus-within:border-accent-blue/50 transition-colors">
            <Search size={16} className="text-white/30 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск по ID или типу..."
              className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-white/20"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-white/30 hover:text-white transition-colors">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Список */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-white/40 animate-pulse text-sm">Загрузка...</div>
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center text-white/30 text-lg font-bold mt-20">
              {search ? 'Ничего не найдено' : t.empty}
            </div>
          ) : (
            sorted.map((task, idx) => {
              const isWait = task.status === 'WAIT';
              const isActive = task.status === 'ACTIVE';
              const isFirstActive = idx === firstActiveIdx;

              return (
                <div
                  key={task.id}
                  ref={isFirstActive ? activeRef : undefined}
                  className={`rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 transition-all border ${
                    isActive
                      ? 'bg-accent-green/5 border-accent-green/20 shadow-[0_0_20px_rgba(0,230,118,0.05)]'
                      : 'bg-white/5 border-white/5 hover:bg-white/8'
                  }`}
                >
                  {/* Левая часть */}
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Индикатор статуса */}
                    <div className={`w-1.5 h-10 rounded-full shrink-0 ${isActive ? 'bg-accent-green' : 'bg-white/15'}`} />
                    <div className="min-w-0">
                      <div className="flex items-center flex-wrap gap-1">
                        <span className="font-mono text-lg font-bold text-white truncate">{task.id}</span>
                        {getTypeBadge(task.type)}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-white/40 text-xs">
                        <span className="font-mono">{task.eta || task.time || '—'}</span>
                        {task.pallets && (
                          <span className="flex items-center gap-1">
                            <Layers size={10} />
                            {task.pallets}
                          </span>
                        )}
                        {isActive && task.start_time && (
                          <span className="text-accent-green font-bold">▶ {task.start_time}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Правая часть */}
                  <div className="flex items-center gap-2 ml-auto shrink-0">
                    {task.phone && (
                      <a
                        href={`tel:${task.phone}`}
                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                      >
                        <Phone size={16} className="text-accent-green" />
                      </a>
                    )}
                    <button
                      onClick={() => onTaskAction(task, isWait ? 'start' : 'finish')}
                      className={`h-10 px-5 rounded-xl font-bold text-sm tracking-wide transition-all active:scale-95 flex items-center gap-2 ${
                        isWait
                          ? 'bg-accent-blue text-white hover:bg-accent-blue/80'
                          : 'bg-accent-green text-black hover:bg-accent-green/80'
                      }`}
                    >
                      {isWait ? (
                        <><Play size={13} fill="currentColor" /> {t.btn_start}</>
                      ) : (
                        <><Check size={15} /> {t.btn_finish}</>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Счётчик внизу */}
        {!loading && sorted.length > 0 && (
          <div className="px-6 py-3 border-t border-white/5 shrink-0 flex items-center justify-between">
            <span className="text-xs text-white/25 font-mono">
              {sorted.filter(t => t.status === 'ACTIVE').length} активных · {sorted.filter(t => t.status === 'WAIT').length} в очереди
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
