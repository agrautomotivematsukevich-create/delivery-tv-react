import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Task, TranslationSet } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { X } from 'lucide-react'; // Импортируем иконку для красоты

interface StatsModalProps {
  onClose: () => void;
  t: TranslationSet;
}

const StatsModal: React.FC<StatsModalProps> = ({ onClose, t }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.fetchTasks('get_operator_tasks').then(data => {
      setTasks(data);
      setLoading(false);
    });
  }, []);

  const doneCount = tasks.filter(x => x.status === 'DONE').length;
  const waitCount = tasks.filter(x => x.status !== 'DONE').length;
  
  const chartData = [
    { name: 'Done', value: doneCount },
    { name: 'Queue', value: waitCount },
  ];
  const COLORS = ['#00E676', '#333333'];

  return (
    <div className="stats-root fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/95 backdrop-blur-xl p-0 md:p-6 animate-in fade-in duration-200">
      {/* Добавлен max-h-screen и flex-col для предотвращения вылета за экран */}
      <div className="bg-[#0A0A0C] w-full md:w-[98%] max-w-[1400px] h-[100dvh] md:h-[90vh] md:rounded-[2rem] border-t md:border border-white/10 flex flex-col shadow-2xl overflow-hidden relative">
        
        {/* Header - теперь фиксированный и с правильными отступами */}
        <div className="flex items-center justify-between px-6 py-4 md:px-8 md:py-6 border-b border-white/10 bg-white/5 sticky top-0 z-20">
          <div className="text-lg md:text-2xl font-extrabold uppercase tracking-widest text-white truncate mr-4">
            {t.stats_title}
          </div>
          
          {/* Кнопка закрытия: увеличена зона клика и исправлено положение */}
          <button 
            onClick={onClose} 
            className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-all active:scale-90"
          >
            <X size={24} className="text-white" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
           <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-6 md:gap-8 h-full">
              
              {/* Summary Column */}
              <div className="flex flex-col gap-6 md:gap-8">
                 <div className="w-full aspect-square max-w-[350px] mx-auto relative bg-white/5 rounded-3xl border border-white/5 p-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          innerRadius="75%"
                          outerRadius="90%"
                          paddingAngle={0}
                          dataKey="value"
                          stroke="none"
                          startAngle={90}
                          endAngle={-270}
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                       <span className="text-4xl md:text-5xl font-extrabold text-white tabular-nums">{doneCount}</span>
                       <span className="text-xs text-white/50 font-bold uppercase tracking-widest tabular-nums">/ {doneCount + waitCount}</span>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 rounded-2xl p-4 md:p-6 text-center border border-white/5">
                       <div className="text-2xl md:text-4xl font-mono font-bold text-accent-green mb-1 tabular-nums">{doneCount}</div>
                       <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{t.stat_done}</div>
                    </div>
                    <div className="bg-white/5 rounded-2xl p-4 md:p-6 text-center border border-white/5">
                       <div className="text-2xl md:text-4xl font-mono font-bold text-white mb-1 tabular-nums">{waitCount}</div>
                       <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{t.stat_queue}</div>
                    </div>
                 </div>
              </div>

              {/* Lists Column */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 pb-20 md:pb-0">
                 {/* Done List */}
                 <div className="bg-white/5 rounded-3xl border border-white/5 flex flex-col min-h-[300px] overflow-hidden text-sm">
                    <div className="p-4 md:p-6 border-b border-white/5 bg-white/5 flex justify-between items-center">
                       <span className="font-bold text-accent-green uppercase tracking-wider">{t.list_done}</span>
                       <span className="font-bold text-white/30 tabular-nums">{doneCount}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2 custom-scrollbar">
                       {tasks.filter(t => t.status === 'DONE').map(task => (
                          <div key={task.id} className="flex justify-between items-center p-3 md:p-4 bg-white/5 rounded-xl">
                             <span className="font-mono font-bold text-white">{task.id}</span>
                             <span className="font-mono text-xs text-white/40 tabular-nums">{task.end_time || task.time}</span>
                          </div>
                       ))}
                    </div>
                 </div>

                 {/* Wait List */}
                 <div className="bg-white/5 rounded-3xl border border-white/5 flex flex-col min-h-[300px] overflow-hidden text-sm">
                    <div className="p-4 md:p-6 border-b border-white/5 bg-white/5 flex justify-between items-center">
                       <span className="font-bold text-white/50 uppercase tracking-wider">{t.list_wait}</span>
                       <span className="font-bold text-white/30 tabular-nums">{waitCount}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2 custom-scrollbar">
                       {tasks.filter(t => t.status !== 'DONE').map(task => (
                          <div key={task.id} className="flex justify-between items-center p-3 md:p-4 bg-white/5 rounded-xl">
                             <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-white">{task.id}</span>
                                {task.type && <span className="text-[9px] px-1 py-0.5 rounded border border-white/20 text-white/60">{task.type}</span>}
                             </div>
                             <span className="font-mono text-xs text-white/40 tabular-nums">{task.start_time || task.eta || task.time}</span>
                          </div>
                       ))}
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>
      <style>{`
        .stats-root .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .stats-root .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
      `}</style>
    </div>
  );
};

export default StatsModal;