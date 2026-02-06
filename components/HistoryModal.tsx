import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Issue, TranslationSet } from '../types';
import { ArrowLeft, User, Calendar, X, Copy, Mail, ExternalLink } from 'lucide-react';

interface HistoryModalProps {
  onClose: () => void;
  t: TranslationSet;
}

const HistoryModal: React.FC<HistoryModalProps> = ({ onClose, t }) => {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const data = await api.fetchIssues();
      setIssues(data);
      setLoading(false);
    };
    fetch();
  }, []);

  // Функция копирования отчета (для Outlook 2016)
  const handleShare = () => {
    if (!selectedIssue) return;
    
    const text = `ОТЧЕТ О ПРОБЛЕМЕ: ${selectedIssue.id}\n` +
                 `Дата: ${selectedIssue.timestamp}\n` +
                 `Автор: ${selectedIssue.author}\n` +
                 `Описание: ${selectedIssue.desc}\n\n` +
                 `ФОТОГРАФИИ (ОРИГИНАЛЫ):\n` +
                 selectedIssue.photos.map((url, i) => `Фото ${i+1}: ${url}`).join('\n');
    
    navigator.clipboard.writeText(text);
    alert("Данные и ссылки на фото скопированы! Вставьте их в Outlook (Ctrl+V)");
    
    // Пытаемся открыть почту
    window.location.href = `mailto:?subject=${encodeURIComponent("Проблема: " + selectedIssue.id)}`;
  };

  const getDriveImgSrc = (url: string) => {
    const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    const id = idMatch ? idMatch[1] : '';
    return id ? `https://wsrv.nl/?url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${id}`)}&w=800&q=100` : url;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-xl p-0 md:p-8">
      <div className="bg-[#0A0A0C] w-full md:w-[95%] max-w-[800px] h-full md:h-[90vh] rounded-none md:rounded-[2.5rem] border border-white/10 flex flex-col overflow-hidden relative">
        
        <div className="flex items-center justify-between px-6 py-6 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-4">
            {selectedIssue && (
              <button onClick={() => setSelectedIssue(null)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white">
                <ArrowLeft size={20} />
              </button>
            )}
            <div className="text-2xl font-black text-white uppercase tracking-widest">
              {selectedIssue ? selectedIssue.id : t.history_title}
            </div>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
             <div className="flex items-center justify-center h-full text-white/30 animate-pulse">Загрузка...</div>
          ) : !selectedIssue ? (
            <div className="p-4 space-y-3">
              {issues.map((issue, idx) => (
                <div key={idx} onClick={() => setSelectedIssue(issue)} className="bg-white/5 border border-white/5 p-5 rounded-2xl hover:bg-white/10 cursor-pointer transition-all">
                  <div className="font-mono text-xl font-bold text-white">{issue.id}</div>
                  <div className="text-white/40 text-sm line-clamp-1">{issue.desc}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 md:p-10 space-y-8 animate-in slide-in-from-right-4 duration-300">
              
              {/* КНОПКА КОТОРАЯ ДОЛЖНА БЫЛА ПОЯВИТЬСЯ */}
              <button
                onClick={handleShare}
                className="w-full py-5 bg-accent-red text-white rounded-2xl font-black flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-accent-red/20"
              >
                <Copy size={20} /> КОПИРОВАТЬ ОТЧЕТ И ОТКРЫТЬ ПОЧТУ
              </button>

              <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                <h3 className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em] mb-4">Описание инцидента</h3>
                <p className="text-white text-lg leading-relaxed whitespace-pre-wrap">{selectedIssue.desc}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedIssue.photos.map((url, i) => (
                  <div key={i} className="relative rounded-2xl overflow-hidden border border-white/10 aspect-video group">
                    <img src={getDriveImgSrc(url)} className="w-full h-full object-cover" alt="Issue" />
                    <a href={url} target="_blank" rel="noreferrer" className="absolute top-4 right-4 p-3 bg-black/60 rounded-xl text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      <ExternalLink size={20} />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoryModal;