import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Task, TranslationSet } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

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
  const waitCount = tasks.filter(x => x.status !== 'DONE').length; // Includes ACTIVE
  
  const chartData = [
    { name: 'Done', value: doneCount },
    { name: 'Queue', value: waitCount },
  ];
  const COLORS = ['#00E676', '#333333'];

  return (
    <div className="stats-root fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/90 backdrop-blur-xl p-0 md:p-8 animate-in fade-in duration-200">
      <div className="bg-[#0A0A0C] w-full md:w-[95%] max-w-[1200px] h-[95vh] md:h-[90vh] rounded-t-3xl md:rounded-[2.5rem] border border-white/10 flex flex-col shadow-2xl overflow-hidden">
        
        <div className="flex items-center justify-between px-8 py-6 border-b border-white/10 bg-white/5">
          <div className="text-2xl font-extrabold uppercase tracking-widest text-white">{t.stats_title}</div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/20 flex items-center justify-center transition-colors">
            <span className="text-2xl leading-none mb-1 text-white">&times;</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
           <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-8 h-full">
              
              {/* Summary Column */}
              <div className="flex flex-col gap-8">
                 <div className="w-full aspect-square relative bg-white/5 rounded-3xl border border-white/5 p-4">
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
                       <span className="text-5xl font-extrabold text-white tabular-nums">{doneCount}</span>
                       <span className="text-sm text-white/50 font-bold uppercase tracking-widest tabular-nums">/ {doneCount + waitCount}</span>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 rounded-2xl p-6 text-center border border-white/5">
                       <div className="text-4xl font-mono font-bold text-accent-green mb-1 tabular-nums">{doneCount}</div>
                       <div className="text-xs font-bold text-white/40 uppercase tracking-widest">{t.stat_done}</div>
                    </div>
                    <div className="bg-white/5 rounded-2xl p-6 text-center border border-white/5">
                       <div className="text-4xl font-mono font-bold text-white mb-1 tabular-nums">{waitCount}</div>
                       <div className="text-xs font-bold text-white/40 uppercase tracking-widest">{t.stat_queue}</div>
                    </div>
                 </div>
              </div>

              {/* Lists Column */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full min-h-[500px]">
                 
                 {/* Done List */}
                 <div className="bg-white/5 rounded-3xl border border-white/5 flex flex-col overflow-hidden">
                    <div className="p-6 border-b border-white/5 bg-white/5 flex justify-between items-center">
                       <span className="font-bold text-accent-green uppercase tracking-wider">{t.list_done}</span>
                       <span className="font-bold text-white/30 tabular-nums">{doneCount}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                       {tasks.filter(t => t.status === 'DONE').map(task => (
                          <div key={task.id} className="flex justify-between items-center p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
                             <span className="font-mono font-bold text-white">{task.id}</span>
                             <span className="font-mono text-sm text-white/40 tabular-nums">{task.end_time || task.time}</span>
                          </div>
                       ))}
                    </div>
                 </div>

                 {/* Wait List */}
                 <div className="bg-white/5 rounded-3xl border border-white/5 flex flex-col overflow-hidden">
                    <div className="p-6 border-b border-white/5 bg-white/5 flex justify-between items-center">
                       <span className="font-bold text-white/50 uppercase tracking-wider">{t.list_wait}</span>
                       <span className="font-bold text-white/30 tabular-nums">{waitCount}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                       {tasks.filter(t => t.status !== 'DONE').map(task => (
                          <div key={task.id} className="flex justify-between items-center p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
                             <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-white">{task.id}</span>
                                {task.type && <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/20 text-white/60">{task.type}</span>}
                             </div>
                             <span className="font-mono text-sm text-white/40 tabular-nums">{task.start_time || task.eta || task.time}</span>
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