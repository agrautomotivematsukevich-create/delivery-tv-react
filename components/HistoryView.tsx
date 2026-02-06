import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Task, TranslationSet } from '../types';
import { Calendar, X, Copy, ExternalLink } from 'lucide-react';

interface HistoryViewProps {
  t: TranslationSet;
}

const HistoryView: React.FC<HistoryViewProps> = ({ t }) => {
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

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

  // Исправленная функция: теперь она принимает задачу как аргумент
  const handleTaskShare = (task: Task) => {
    const text = `ОТЧЕТ ПО ПОСТАВКЕ: ${task.id}\n` +
                 `--------------------------------\n` +
                 `Оператор: ${task.operator || '---'}\n` +
                 `Зона: ${task.zone || '---'}\n` +
                 `Время: ${task.time || '---'}\n\n` +
                 `ФОТО (ОРИГИНАЛЫ DRIVE):\n` +
                 `1. Общее: ${task.photo_gen || 'нет'}\n` +
                 `2. Пломба: ${task.photo_seal || 'нет'}\n` +
                 `3. Пустой: ${task.photo_empty || 'нет'}\n\n` +
                 `--------------------------------\n` +
                 `AG-Dashboard System`;
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        alert("Данные скопированы! В Outlook нажмите Ctrl+V для вставки.");
        window.location.href = `mailto:?subject=${encodeURIComponent("Отчет по поставке: " + task.id)}`;
      });
    }
  };

  const getDriveImgSrc = (url: string) => {
    if (!url) return '';
    const id = url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || url.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1];
    return id ? `https://wsrv.nl/?url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${id}`)}&w=600&q=100` : url;
  };

  return (
    <div className="flex flex-col gap-6 h-full flex-1 min-h-0">
      <div className="bg-[#121214] border border-white/10 rounded-3xl p-6 flex items-center gap-4">
        <Calendar className="text-accent-blue" />
        <input 
          type="date" 
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white outline-none [color-scheme:dark]"
        />
      </div>

      <div className="bg-[#121214] border border-white/10 rounded-3xl flex-1 overflow-y-auto p-4 custom-scrollbar">
        {loading ? (
          <div className="h-full flex items-center justify-center text-white/20 animate-pulse">Загрузка...</div>
        ) : (
          <div className="space-y-2">
            {tasks.map(task => (
              <div key={task.id} onClick={() => setSelectedTask(task)} className="bg-white/5 p-4 rounded-2xl flex justify-between items-center hover:bg-white/10 cursor-pointer transition-all">
                <div className="font-mono font-bold text-white text-lg">{task.id}</div>
                <div className="text-white/40 text-sm">{task.time}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
          <div className="bg-[#0A0A0C] border border-white/10 rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white uppercase font-mono">{selectedTask.id}</h2>
              <button onClick={() => setSelectedTask(null)} className="text-white/50 hover:text-white"><X size={24} /></button>
            </div>
            
            <div className="p-8 overflow-y-auto custom-scrollbar space-y-6">
              <button
                onClick={() => handleTaskShare(selectedTask)}
                className="w-full py-4 bg-accent-blue text-white rounded-2xl font-black flex items-center justify-center gap-3 hover:brightness-110 transition-all"
              >
                <Copy size={20} /> КОПИРОВАТЬ ДАННЫЕ ДЛЯ OUTLOOK
              </button>

              <div className="bg-white/5 p-5 rounded-2xl border border-white/5 space-y-3">
                <div className="flex justify-between text-sm"><span className="text-white/30">Оператор:</span><span className="text-white">{selectedTask.operator}</span></div>
                <div className="flex justify-between text-sm"><span className="text-white/30">Зона:</span><span className="text-white font-mono">{selectedTask.zone}</span></div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {[selectedTask.photo_gen, selectedTask.photo_seal, selectedTask.photo_empty].map((url, i) => url && (
                  <div key={i} className="relative rounded-2xl overflow-hidden border border-white/10 aspect-video group">
                    <img src={getDriveImgSrc(url)} className="w-full h-full object-cover" alt="Evidence" />
                    <a href={url} target="_blank" rel="noreferrer" className="absolute top-4 right-4 p-2 bg-black/60 rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      <ExternalLink size={18} />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ОБЯЗАТЕЛЬНО: Экспорт по умолчанию для корректного импорта в App.tsx
export default HistoryView;