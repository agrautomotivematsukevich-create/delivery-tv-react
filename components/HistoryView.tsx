import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Task, TranslationSet } from '../types';
import { Calendar, Package, Camera, User, Clock, MapPin, X, ZoomIn } from 'lucide-react';

interface HistoryViewProps {
  t: TranslationSet;
}

const HistoryView: React.FC<HistoryViewProps> = ({ t }) => {
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

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

  // Блокировка скролла основного экрана при открытии модалки
  useEffect(() => {
    if (selectedTask) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [selectedTask]);

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
      {/* Controls */}
      <div className="bg-card-bg border border-white/10 rounded-3xl p-6 flex flex-wrap items-center gap-4">
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

      {/* List */}
      <div className="bg-card-bg border border-white/10 rounded-3xl flex-1 min-h-0 overflow-hidden flex flex-col">
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

      {/* DETAIL MODAL - SOLID & LOCKED */}
      {selectedTask && (
        <div className="fixed inset-0 z-[99999] flex flex-col bg-black">
            {/* Header (Always Fixed) */}
            <div className="bg-[#0F0F12] p-6 border-b border-white/10 flex justify-between items-start safe-top">
                <div className="flex-1 pr-4">
                    <h2 className="text-xl md:text-3xl font-bold text-white font-mono break-all leading-tight">
                        {selectedTask.id}
                    </h2>
                    <div className="flex gap-2 mt-2">
                        <span className="px-2 py-0.5 bg-white/10 rounded text-[10px] font-bold text-white/70 uppercase">{selectedTask.type}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${selectedTask.status === 'DONE' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/50'}`}>
                            {selectedTask.status}
                        </span>
                    </div>
                </div>
                <button 
                    onClick={() => setSelectedTask(null)}
                    className="p-4 -mr-2 -mt-2 rounded-full bg-white/10 text-white active:bg-white/30"
                >
                    <X size={28} />
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto bg-[#0F0F12] p-6 space-y-8 overscroll-contain pb-20">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white/5 rounded-2xl p-5 border border-white/5 space-y-4">
                        <h3 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Информация</h3>
                        <div className="grid gap-3">
                            <div className="flex justify-between border-b border-white/5 pb-2">
                                <span className="text-white/40 text-sm flex items-center gap-2"><Clock size={12}/> Начало</span>
                                <span className="text-white font-mono">{selectedTask.start_time || '--:--'}</span>
                            </div>
                            <div className="flex justify-between border-b border-white/5 pb-2">
                                <span className="text-white/40 text-sm flex items-center gap-2"><Clock size={12}/> Конец</span>
                                <span className="text-white font-mono">{selectedTask.end_time || '--:--'}</span>
                            </div>
                            <div className="flex justify-between border-b border-white/5 pb-2">
                                <span className="text-white/40 text-sm flex items-center gap-2"><User size={12}/> Оператор</span>
                                <span className="text-white">{selectedTask.operator || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-white/40 text-sm flex items-center gap-2"><MapPin size={12}/> Зона</span>
                                <span className="text-white font-mono bg-white/10 px-2 rounded text-xs leading-5">{selectedTask.zone || '-'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                        <h3 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <Camera size={14} /> Фотоотчет
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            {[selectedTask.photo_gen, selectedTask.photo_seal, selectedTask.photo_empty].map((url, i) => (
                                url && (
                                    <div 
                                        key={i} 
                                        className="aspect-square bg-black rounded-xl overflow-hidden border border-white/10 active:opacity-50"
                                        onClick={() => setLightboxImg(getDriveImgSrc(url, 'w2000'))}
                                    >
                                        <img src={getDriveImgSrc(url, 'w400')} className="w-full h-full object-cover" />
                                    </div>
                                )
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxImg && (
        <div className="fixed inset-0 z-[100000] bg-black flex items-center justify-center p-4" onClick={() => setLightboxImg(null)}>
          <img src={lightboxImg} className="max-w-full max-h-full object-contain" />
          <button className="absolute top-10 right-6 text-white bg-white/20 p-3 rounded-full"><X size={32} /></button>
        </div>
      )}
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        .safe-top { padding-top: max(1.5rem, env(safe-area-inset-top)); }
        .overscroll-contain { overscroll-behavior: contain; }
      `}</style>
    </div>
  );
};

export default HistoryView;