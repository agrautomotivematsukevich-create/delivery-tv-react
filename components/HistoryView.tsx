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
    // Convert YYYY-MM-DD to DD.MM
    const [y, m, day] = d.split('-');
    const formattedDate = `${day}.${m}`;
    
    const data = await api.fetchHistory(formattedDate);
    setTasks(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData(date);
  }, [date]);

  const getDriveImgSrc = (url: string | undefined) => {
    if (!url) return '';
    
    let id = "";
    const match1 = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match1) id = match1[1];
    if (!id) {
      const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (match2) id = match2[1];
    }

    if (!id) return url;

    // Прямая ссылка на скачивание оригинального файла из Google Drive
    const originalFileLink = `https://drive.google.com/uc?export=download&id=${id}`;

    // Используем wsrv.nl только как прокси для обхода блокировки:
    // Мы УБИРАЕМ параметры &w=... и &sz=...
    // &q=100 — максимальное качество (без потерь)
    // &n=-1 — отключает любое изменение размера, выдает оригинал
    return `https://wsrv.nl/?url=${encodeURIComponent(originalFileLink)}&q=100&n=-1`;
  };

  return (
    <div className="flex flex-col gap-6 h-full flex-1 min-h-0">
      {/* Controls */}
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

      {/* List */}
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

      {/* Detail Modal */}
      {selectedTask && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
           <div className="bg-[#0F0F12] border border-white/10 p-8 rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] overflow-y-auto custom-scrollbar flex flex-col gap-6 shadow-2xl relative">
              <button 
                onClick={() => setSelectedTask(null)}
                className="absolute top-6 right-6 p-2 rounded-full bg-white/5 hover:bg-white/20 text-white transition-colors"
              >
                <X />
              </button>

              <div className="border-b border-white/10 pb-6">
                <h2 className="text-4xl font-extrabold text-white font-mono mb-2">{selectedTask.id}</h2>
                <div className="flex flex-wrap gap-3">
                   <span className="px-3 py-1 bg-white/10 rounded-lg text-sm font-bold border border-white/10 text-white/70">{selectedTask.type}</span>
                   <span className={`px-3 py-1 rounded-lg text-sm font-bold border ${selectedTask.status === 'DONE' ? 'bg-accent-green/10 text-accent-green border-accent-green/20' : 'bg-white/10 text-white/50 border-white/10'}`}>
                      {selectedTask.status}
                   </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="space-y-6">
                    <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                       <h3 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-4">Info</h3>
                       <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-white/50 flex items-center gap-2"><Clock size={14}/> Start</span>
                            <span className="font-mono text-white">{selectedTask.start_time || '-'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/50 flex items-center gap-2"><Clock size={14}/> End</span>
                            <span className="font-mono text-white">{selectedTask.end_time || '-'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/50 flex items-center gap-2"><User size={14}/> {t.dtl_operator}</span>
                            <span className="text-white font-medium">{selectedTask.operator || '-'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/50 flex items-center gap-2"><MapPin size={14}/> {t.dtl_zone}</span>
                            <span className="text-white font-medium">{selectedTask.zone || '-'}</span>
                          </div>
                       </div>
                    </div>
                 </div>

                 <div className="space-y-6">
                    <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                       <h3 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-4 flex items-center gap-2">
                         <Camera size={14} /> {t.dtl_photos}
                       </h3>
                       <div className="grid grid-cols-2 gap-3">
                          {[
                            { title: t.lbl_photo1, url: selectedTask.photo_gen },
                            { title: t.lbl_photo2, url: selectedTask.photo_seal },
                            { title: t.lbl_photo_empty, url: selectedTask.photo_empty }
                          ].map((p, i) => (
                             p.url && (
                               <div 
                                 key={i} 
                                 className="group relative aspect-square bg-black/50 rounded-xl overflow-hidden border border-white/10 cursor-pointer"
                                 onClick={() => setLightboxImg(getDriveImgSrc(p.url, 'w2000'))}
                               >
                                  <img src={getDriveImgSrc(p.url, 'w800')} className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <ZoomIn className="text-white mb-2" />
                                    <span className="text-[10px] uppercase font-bold text-white/70">{p.title}</span>
                                  </div>
                               </div>
                             )
                          ))}
                          {(!selectedTask.photo_gen && !selectedTask.photo_seal && !selectedTask.photo_empty) && (
                            <div className="col-span-2 text-center text-white/30 text-sm py-8">No photos uploaded</div>
                          )}
                       </div>
                    </div>
                 </div>
              </div>

           </div>
        </div>
      )}
      
      {/* Lightbox Overlay */}
      {lightboxImg && (
        <div 
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 animate-in fade-in duration-200 cursor-zoom-out"
          onClick={() => setLightboxImg(null)}
        >
          <div className="relative w-full max-w-5xl flex items-center justify-center">
             <img 
               src={lightboxImg} 
               alt="Full view" 
               className="w-full h-auto max-h-[90vh] rounded-lg shadow-2xl object-contain cursor-default" 
               onClick={(e) => e.stopPropagation()} 
             />
             <button className="absolute -top-12 right-0 text-white/50 hover:text-white p-2 transition-colors">
               <X size={40} />
             </button>
          </div>
        </div>
      )}
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
      `}</style>
    </div>
  );
};

export default HistoryView;