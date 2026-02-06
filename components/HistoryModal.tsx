import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Issue, TranslationSet } from '../types';
import { ArrowLeft, User, Calendar, X, Share2, AlertCircle } from 'lucide-react';
import { generateMailto } from '../constants';

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

  const getDriveImgSrc = (url: string, size: string = 'w800') => {
    if (!url) return '';
    const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    const id = idMatch ? idMatch[1] : '';
    if (!id) return url;
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${id}`;
    return `https://wsrv.nl/?url=${encodeURIComponent(downloadUrl)}&q=100&${size}`;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-xl p-0 md:p-8">
      <div className="bg-[#0A0A0C] w-full md:w-[95%] max-w-[800px] h-full md:h-[90vh] rounded-none md:rounded-[2.5rem] border-0 md:border border-white/10 flex flex-col shadow-2xl overflow-hidden relative">
        
        <div className="flex items-center justify-between px-6 py-6 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-4">
            {selectedIssue && <button onClick={() => setSelectedIssue(null)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white"><ArrowLeft size={20} /></button>}
            <div className="text-2xl font-black text-white uppercase">{selectedIssue ? selectedIssue.id : t.history_title}</div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
             <div className="flex items-center justify-center h-full text-white/30">Загрузка...</div>
          ) : !selectedIssue ? (
            <div className="p-4 space-y-3">
              {issues.map((issue, idx) => (
                <div key={idx} onClick={() => setSelectedIssue(issue)} className="bg-white/5 border border-white/5 p-5 rounded-2xl hover:bg-white/10 cursor-pointer">
                  <div className="font-mono text-xl font-bold text-white mb-2">{issue.id}</div>
                  <div className="text-white/60 text-sm line-clamp-1">{issue.desc}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 md:p-10 space-y-8 animate-in slide-in-from-right-5">
              
              {/* КНОПКА ОТЧЕТА */}
              <a
                href={generateMailto(`ПРОБЛЕМА: ${selectedIssue.id}`, { "Контейнер": selectedIssue.id, "Описание": selectedIssue.desc, "Дата": selectedIssue.timestamp }, selectedIssue.photos)}
                className="w-full py-4 bg-accent-red text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:brightness-110 transition-all"
              >
                <Share2 size={20} /> ОТПРАВИТЬ ОТЧЕТ С ФОТО
              </a>

              <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                <p className="text-white text-lg leading-relaxed">{selectedIssue.desc}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedIssue.photos.map((url, i) => (
                  <div key={i} className="relative rounded-2xl overflow-hidden border border-white/10 aspect-video bg-black/50 group">
                    <img src={getDriveImgSrc(url)} className="w-full h-full object-cover" />
                    <a href={url} target="_blank" className="absolute top-4 right-4 p-2 bg-black/60 rounded-xl text-white opacity-0 group-hover:opacity-100 transition-opacity">
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