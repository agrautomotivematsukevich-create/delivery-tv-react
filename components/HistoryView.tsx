import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
// Заменил TranslationSet на any, если он не определен в types.ts
import { Task } from '../types'; 
import { Calendar, Package, X } from 'lucide-react';

interface HistoryViewProps {
  t: any; // Временно используем any для успешного билда
}

const HistoryView: React.FC<HistoryViewProps> = ({ t }) => {
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  // ... остальной код без изменений
  const fetchData = async (d: string) => {
    setLoading(true);
    const [y, m, day] = d.split('-');
    const formattedDate = `${day}.${m}`;
    const data = await api.fetchHistory(formattedDate);
    setTasks(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData(date);
  }, [date]);

  const getDriveImgSrc = (url: string | undefined, size?: string) => {
    if (!url) return '';
    let id = "";
    const match1 = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match1) id = match1[1];
    if (!id) {
      const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (match2) id = match2[1];
    }
    if (!id) return url;
    const originalFileLink = `https://drive.google.com/uc?export=download&id=${id}`;
    const sizeParam = size ? `&${size.startsWith('w') ? 'w' : 'h'}=${size.replace(/\D/g, '')}` : '&n=-1';
    return `https://wsrv.nl/?url=${encodeURIComponent(originalFileLink)}&q=100${sizeParam}`;
  };

  return (
    <div className="flex flex-col gap-6 h-full flex-1 min-h-0">
      {/* Дата и поиск */}
      <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-3xl p-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
           <Calendar className="text-accent-blue" />
           <span className="font-bold text-white/50 uppercase tracking-widest">{t.hist_select_date}:</span>
        </div>
        <input 
          type="date" 
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white font-mono text-lg outline-none focus:border-accent-blue transition-colors [color-scheme:dark]"
        />
      </div>

      {/* Список задач */}
      <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-3xl flex-1 min-h-0 overflow-hidden flex flex-col">
         {loading ? (
           <div className="flex-1 flex items-center justify-center text-white/30 animate-pulse">{t.msg_loading_history}</div>
         ) : tasks.length === 0 ? (
           <div className="flex-1 flex flex-col items-center justify-center text-white/30 gap-4">
             <Package size={48} strokeWidth={1} />
             <div>{t.hist_no_data}</div>
           </div>
         ) : (
           <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
             {tasks.map(task => (
               <div 
                 key={task.id} 
                 onClick={() => setSelectedTask(task)}
                 className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:bg-white/10 cursor-pointer transition-all active:scale-[0.99]"
               >
                 <div className="flex items-center gap-4">
                    <div className={`w-2 h-12 rounded-full ${task.status === 'DONE' ? 'bg-accent-green' : 'bg-white/20'}`}></div>
                    <div>
                      <div className="font-mono text-xl font-bold text-white">{task.id}</div>
                      <div className="flex items-center gap-3 text-sm text-white/50 mt-1">
                        <span className="bg-white/10 px-1.5 rounded text-xs border border-white/10">{task.type}</span>
                        {task.time && <span>{task.time}</span>}
                      </div>
                    </div>
                 </div>
                 <div className="flex items-center gap-4">
                    {task.status === 'DONE' && <span className="text-accent-green font-bold text-xs uppercase tracking-wider">{t.stat_done}</span>}
                    {task.zone && <span className="font-mono text-white/60 bg-white/5 px-2 py-1 rounded">{task.zone}</span>}
                 </div>
               </div>
             ))}
           </div>
         )}
      </div>

      {/* Модальное окно (Центрированное, классическое) */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-[#1A1A1E] border border-white/10 rounded-[2rem] w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar relative shadow-2xl">
               <button 
                 onClick={() => setSelectedTask(null)}
                 className="absolute top-6 right-6 p-2 rounded-full bg-white/5 hover:bg-white/10 text-white z-10"
               >
                 <X size={24} />
               </button>

               <div className="p-8">
                  <h2 className="text-2xl font-bold text-white font-mono mb-6 pr-10">{selectedTask.id}</h2>
                  
                  <div className="grid grid-cols-1 gap-8">
                     <div className="space-y-4">
                        <div className="bg-white/5 rounded-2xl p-5 border border-white/5 space-y-3">
                           <div className="flex justify-between text-sm"><span className="text-white/40">Начало:</span><span className="text-white font-mono">{selectedTask.start_time || '-'}</span></div>
                           <div className="flex justify-between text-sm"><span className="text-white/40">Конец:</span><span className="text-white font-mono">{selectedTask.end_time || '-'}</span></div>
                           <div className="flex justify-between text-sm"><span className="text-white/40">Оператор:</span><span className="text-white">{selectedTask.operator || '-'}</span></div>
                           <div className="flex justify-between text-sm"><span className="text-white/40">Зона:</span><span className="text-white font-mono bg-white/10 px-2 rounded">{selectedTask.zone || '-'}</span></div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                           {[selectedTask.photo_gen, selectedTask.photo_seal, selectedTask.photo_empty].map((url, i) => (
                              url && (
                                <div 
                                  key={i} 
                                  className="aspect-square bg-black rounded-xl overflow-hidden border border-white/10 cursor-pointer"
                                  onClick={() => setLightboxImg(getDriveImgSrc(url, 'w2000'))}
                                >
                                   <img src={getDriveImgSrc(url, 'w300')} className="w-full h-full object-cover" />
                                </div>
                              )
                           ))}
                        </div>
                     </div>
                  </div>
               </div>
            </div>
        </div>
      )}

      {/* Лайтбокс */}
      {lightboxImg && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-4" onClick={() => setLightboxImg(null)}>
          <img src={lightboxImg} className="max-w-full max-h-full object-contain shadow-2xl" />
        </div>
      )}
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #444; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default HistoryView;