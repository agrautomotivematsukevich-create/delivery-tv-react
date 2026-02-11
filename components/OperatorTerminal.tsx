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
    const data = await api.fetchTasks('get_operator_tasks');
    setTasks(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  const activeTasks = tasks.filter(t => !t.end_time && t.status !== 'DONE');

  const activeNow = activeTasks.find(t => t.start_time && !t.end_time);

  const getEtaBorder = (eta?: string) => {
    if (!eta) return "border-white/5";
    const [h, m] = eta.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0);
    const diffMin = (d.getTime() - Date.now()) / 60000;
    if (diffMin < 0) return "border-red-500";
    if (diffMin < 30) return "border-orange-500";
    return "border-white/5";
  };

  return (
    <div className="terminal-root fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-xl p-0 md:p-8">
      <div className="bg-[#0A0A0C] w-full md:w-[95%] max-w-[800px] h-[95vh] md:h-[90vh] rounded-t-3xl md:rounded-[2.5rem] border border-white/10 flex flex-col overflow-hidden">

        <div className="flex items-center justify-between px-8 py-6 border-b border-white/10 bg-white/5">
          <div className="text-2xl font-extrabold uppercase tracking-widest text-white">{t.drv_title}</div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/20">
            <span className="text-2xl">&times;</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="text-white/50 text-center mt-20">Loading...</div>
          ) : activeNow ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-10">
              <div>
                <div className="text-5xl font-mono font-bold text-white">{activeNow.id}</div>
                <div className="text-white/40 mt-2">{activeNow.pallets} pallets</div>
              </div>
              <button
                onClick={() => onTaskAction(activeNow, 'finish')}
                className="w-[80%] py-10 text-2xl font-black rounded-3xl bg-accent-green text-black"
              >
                {t.btn_finish}
              </button>
            </div>
          ) : (
            activeTasks.map(task => {
              const isWait = task.status === 'WAIT';
              return (
                <div
                  key={task.id}
                  className={`bg-white/5 border ${getEtaBorder(task.eta)} rounded-2xl p-5 flex items-center justify-between`}
                >
                  <div>
                    <div className="text-xl font-bold text-white">{task.id}</div>
                    <div className="text-white/40 text-sm">{task.eta}</div>
                  </div>

                  <button
                    onClick={() => onTaskAction(task, isWait ? 'start' : 'finish')}
                    className={`h-12 px-6 rounded-xl font-bold ${isWait ? 'bg-accent-blue' : 'bg-accent-green text-black'}`}
                  >
                    {isWait ? t.btn_start : t.btn_finish}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default OperatorTerminal;
