import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Task, TranslationSet } from '../types';
import { Phone, Check, Play, Layers } from 'lucide-react';

interface OperatorTerminalProps {
  onClose: () => void;
  onTaskAction: (task: Task, action: 'start' | 'finish') => void;
  t: TranslationSet;
}

const OperatorTerminal: React.FC<OperatorTerminalProps> = ({ onClose, onTaskAction, t }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQueue = async () => {
    // Do not set loading(true) here to avoid flickering on refresh
    const data = await api.fetchTasks('get_operator_tasks');
    setTasks(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchQueue();
    // Refresh every 5s while open to be more responsive
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  const getTypeBadge = (type?: string) => {
    if (!type) return null;
    let color = "bg-white/10 border-white/20 text-white";
    if (type.includes("BS")) color = "bg-accent-red/15 border-accent-red text-accent-red";
    if (type.includes("AS")) color = "bg-orange-500/15 border-orange-500 text-orange-500";
    if (type.includes("PS")) color = "bg-accent-purple/15 border-accent-purple text-accent-purple";
    
    return <span className={`px-2 py-0.5 rounded text-xs font-bold border ${color} ml-2`}>{type}</span>;
  };

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
          ) : tasks.length === 0 ? (
             <div className="text-center text-white/30 text-xl font-bold mt-20">{t.empty}</div>
          ) : (
            tasks.map(task => {
              const isWait = task.status === 'WAIT';
              return (
                <div key={task.id} className="bg-white/5 border border-white/5 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 hover:bg-white/10 transition-colors">
                  <div className="flex flex-col">
                    <div className="flex items-center">
                       <span className="font-mono text-2xl font-bold text-white">{task.id}</span>
                       {getTypeBadge(task.type)}
                    </div>
                    <span className="text-sm font-mono text-white/50 mt-1">{task.time}</span>
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