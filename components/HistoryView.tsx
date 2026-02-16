import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Task, TranslationSet } from '../types';
import { Calendar, Package, X, Search, Download, ImageOff } from 'lucide-react';

interface HistoryViewProps {
  t: TranslationSet;
}

const PHOTO_LABELS = [
  { key: 'photo_gen' as keyof Task,     label: 'Общий' },
  { key: 'photo_seal' as keyof Task,    label: 'Пломба' },
  { key: 'photo_inspect' as keyof Task, label: 'Осмотр' },
  { key: 'photo_empty' as keyof Task,   label: 'Пустой' },
];

const HistoryView: React.FC<HistoryViewProps> = ({ t }) => {
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchData = async (d: string) => {
    setLoading(true);
    const [y, m, day] = d.split('-');
    const formattedDate = `${day}.${m}`;
    const data = await api.fetchHistory(formattedDate);
    setTasks(data);
    setLoading(false);
  };

  useEffect(() => { fetchData(date); }, [date]);

  const getDriveImgSrc = (url: string | undefined, size?: string) => {
    if (!url) return '';
    let id = '';
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

  // CSV Экспорт
  const exportCSV = () => {
    const [y, m, day] = date.split('-');
    const dateLabel = `${day}.${m}.${y}`;
    const headers = ['ID', 'Тип', 'Паллеты', 'Зона', 'Оператор', 'ETA', 'Начало', 'Конец', 'Статус'];
    const rows = tasks.map(t => [
      t.id, t.type || '', t.pallets || '', t.zone || '', t.operator || '',
      t.eta || '', t.start_time || '', t.end_time || '', t.status,
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${dateLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredTasks = tasks.filter(t =>
    !search || t.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 h-full flex-1 min-h-0">
      {/* Панель управления */}
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

        {/* Поиск */}
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2 flex-1 min-w-[180px]">
          <Search size={16} className="text-white/30 flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t.search_placeholder}
            className="bg-transparent text-white text-sm outline-none w-full placeholder-white/30"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-white/30 hover:text-white">
              <X size={14} />
            </button>
          )}
        </div>

        {/* CSV Экспорт */}
        {tasks.length > 0 && (
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-xs font-bold uppercase tracking-wider transition-all"
          >
            <Download size={15} />
            {t.export_csv}
          </button>
        )}
      </div>

      {/* Список задач */}
      <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-3xl flex-1 min-h-0 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-white/30 animate-pulse">{t.msg_loading_history}</div>
        ) : filteredTasks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-white/30 gap-4">
            <Package size={48} strokeWidth={1} />
            <div>{search ? `Нет результатов для "${search}"` : t.hist_no_data}</div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
            {filteredTasks.map(task => (
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

      {/* Детали задачи */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1A1A1E] border border-white/10 rounded-[2rem] w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar relative shadow-2xl">
            <button onClick={() => setSelectedTask(null)} className="absolute top-6 right-6 p-2 rounded-full bg-white/5 hover:bg-white/10 text-white z-10">
              <X size={24} />
            </button>
            <div className="p-8">
              <h2 className="text-2xl font-bold text-white font-mono mb-6 pr-10">{selectedTask.id}</h2>
              <div className="space-y-5">
                {/* Инфо */}
                <div className="bg-white/5 rounded-2xl p-5 border border-white/5 space-y-3">
                  <div className="flex justify-between text-sm"><span className="text-white/40">Начало:</span><span className="text-white font-mono">{selectedTask.start_time || '-'}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-white/40">Конец:</span><span className="text-white font-mono">{selectedTask.end_time || '-'}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-white/40">Оператор:</span><span className="text-white">{selectedTask.operator || '-'}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-white/40">Зона:</span><span className="text-white font-mono bg-white/10 px-2 rounded">{selectedTask.zone || '-'}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-white/40">Паллеты:</span><span className="text-white">{selectedTask.pallets || '-'}</span></div>
                </div>

                {/* Фото с подписями */}
                <div>
                  <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-3">{t.dtl_photos}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {PHOTO_LABELS.map(({ key, label }) => {
                      const url = selectedTask[key] as string | undefined;
                      return (
                        <div key={key} className="flex flex-col gap-1.5">
                          {url ? (
                            <div
                              className="aspect-square bg-black rounded-xl overflow-hidden border border-white/10 cursor-pointer hover:border-white/30 transition-colors"
                              onClick={() => setLightboxImg(getDriveImgSrc(url, 'w2000'))}
                            >
                              <img src={getDriveImgSrc(url, 'w300')} className="w-full h-full object-cover" alt={label} />
                            </div>
                          ) : (
                            <div className="aspect-square bg-white/5 rounded-xl border border-white/5 flex flex-col items-center justify-center gap-2">
                              <ImageOff size={20} className="text-white/15" />
                              <span className="text-[9px] text-white/20">нет фото</span>
                            </div>
                          )}
                          <p className="text-[10px] text-white/40 text-center font-semibold">{label}</p>
                        </div>
                      );
                    })}
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
          <img src={lightboxImg} className="max-w-full max-h-full object-contain shadow-2xl" alt="Fullscreen" />
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