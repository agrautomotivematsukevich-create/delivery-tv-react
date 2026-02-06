import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Task, TranslationSet } from '../types';
import { Calendar, Package, Camera, User, Clock, X, Share2, ExternalLink } from 'lucide-react';
import { generateMailto } from '../constants';

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

  // Функция для получения качественного прокси-фото
  const getDriveImgSrc = (url: string | undefined, size?: string) => {
    if (!url) return '';
    let id = "";
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match) id = match[1];
    if (!id) return url;
    const originalFileLink = `https://drive.google.com/uc?export=download&id=${id}`;
    const sizeParam = size ? `&${size.startsWith('w') ? 'w' : 'h'}=${size.replace(/\D/g, '')}` : '&n=-1';
    return `https://wsrv.nl/?url=${encodeURIComponent(originalFileLink)}&q=100${sizeParam}`;
  };

  return (
    <div className="flex flex-col gap-6 h-full flex-1 min-h-0">
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

      <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-3xl flex-1 min-h-0 overflow-hidden flex flex-col">
         {loading ? (
           <div className="flex-1 flex items-center justify-center text-white/30 animate-pulse">{t.msg_loading_history}</div>
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
                      <div className="text-sm text-white/50">{task.type} | {task.time}</div>
                    </div>
                 </div>
                 <div className="flex items-center gap-4">
                    {task.zone && <span className="font-mono text-white/60 bg-white/5 px-2 py-1 rounded">{task.zone}</span>}
                 </div>
               </div>
             ))}
           </div>
         )}
      </div>

      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-[#1A1A1E] border border-white/10 rounded-[2rem] w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar relative">
                <button onClick={() => setSelectedTask(null)} className="absolute top-6 right-6 p-2 rounded-full bg-white/5 hover:bg-white/10 text-white z-10"><X size={24} /></button>
                <div className="p-8">
                  <h2 className="text-2xl font-bold text-white font-mono mb-6">{selectedTask.id}</h2>
                  
                  {/* КНОПКА ОТЧЕТА */}
                  <div className="grid grid-cols-1 gap-3 mb-8">
                    <a 
                      href={generateMailto(`Отчет: ${selectedTask.id}`, { "ID": selectedTask.id, "Оператор": selectedTask.operator, "Зона": selectedTask.zone }, [selectedTask.photo_gen, selectedTask.photo_seal, selectedTask.photo_empty])}
                      className="flex items-center justify-center gap-2 bg-accent-blue py-4 rounded-2xl text-white font-bold hover:brightness-110 transition-all"
                    >
                      <Share2 size={20} /> ОТПРАВИТЬ ПОЛНЫЙ ОТЧЕТ
                    </a>
                  </div>

                  <div className="bg-white/5 rounded-2xl p-5 border border-white/5 space-y-3 mb-6">
                      <div className="flex justify-between text-sm"><span className="text-white/40">Оператор:</span><span className="text-white">{selectedTask.operator}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-white/40">Зона:</span><span className="text-white font-mono bg-white/10 px-2 rounded">{selectedTask.zone}</span></div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                     {[selectedTask.photo_gen, selectedTask.photo_seal, selectedTask.photo_empty].map((url, i) => url && (
                       <div key={i} className="group relative aspect-square bg-black rounded-xl overflow-hidden border border-white/10 cursor-pointer">
                          <img 
                            src={getDriveImgSrc(url, 'w400')} 
                            onClick={() => setLightboxImg(getDriveImgSrc(url, 'w2000'))}
                            className="w-full h-full object-cover" 
                          />
                          <a href={url} target="_blank" className="absolute bottom-2 right-2 p-1.5 bg-black/60 rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity">
                            <ExternalLink size={14} />
                          </a>
                       </div>
                     ))}
                  </div>
                </div>
            </div>
        </div>
      )}

      {lightboxImg && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-4" onClick={() => setLightboxImg(null)}>
          <img src={lightboxImg} className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
};

export default HistoryView;