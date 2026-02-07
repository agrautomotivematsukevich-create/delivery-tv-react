import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Issue, TranslationSet } from '../types';
import { ArrowLeft, User, Calendar, X, ImageIcon, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import SecureImage from './SecureImage';

interface HistoryModalProps {
  onClose: () => void;
  t: TranslationSet;
}

interface LightboxState {
  images: string[];
  index: number;
}

const HistoryModal: React.FC<HistoryModalProps> = ({ onClose, t }) => {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const data = await api.fetchIssues();
      setIssues(data);
      setLoading(false);
    };
    fetch();
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowLeft') setLightbox((prev) => prev ? { ...prev, index: (prev.index - 1 + prev.images.length) % prev.images.length } : null);
      if (e.key === 'ArrowRight') setLightbox((prev) => prev ? { ...prev, index: (prev.index + 1) % prev.images.length } : null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightbox]);

  const handleIssueClick = (issue: Issue) => {
    setSelectedIssue(issue);
  };

  const handleBack = () => {
    setSelectedIssue(null);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-xl p-0 md:p-8 animate-in fade-in duration-200">
      <div className="bg-[#0A0A0C] w-full md:w-[95%] max-w-[800px] h-full md:h-[90vh] rounded-none md:rounded-[2.5rem] border-0 md:border border-white/10 flex flex-col shadow-2xl overflow-hidden relative">
        <div className="flex items-center justify-between px-6 py-6 border-b border-white/10 bg-white/5 shrink-0">
          <div className="flex items-center gap-4">
            {selectedIssue && (
              <button
                onClick={handleBack}
                className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors border border-white/5"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
            )}
            <div className="text-2xl font-extrabold uppercase tracking-widest text-white">
              {selectedIssue ? selectedIssue.id : t.history_title}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/20 flex items-center justify-center transition-colors text-white"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar bg-black/20">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-white/50 animate-pulse">{t.msg_loading_history}</div>
            </div>
          ) : !selectedIssue ? (
            <div className="p-4 md:p-6 space-y-3">
              {issues.length === 0 ? (
                <div className="text-center text-white/30 text-xl font-bold mt-20">{t.history_empty}</div>
              ) : (
                issues.map((issue, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleIssueClick(issue)}
                    className="bg-white/5 border border-white/5 rounded-2xl p-5 hover:bg-white/10 transition-all cursor-pointer group flex flex-col gap-2"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-accent-red/10 flex items-center justify-center border border-accent-red/20">
                          <AlertCircle className="text-accent-red w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-mono text-xl font-bold text-white group-hover:text-accent-blue transition-colors">{issue.id}</div>
                          <div className="text-xs text-white/40 font-bold uppercase tracking-wider flex items-center gap-1">
                            <User size={10} /> {issue.author}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-white/30 bg-white/5 px-2 py-1 rounded-lg border border-white/5">
                        {issue.timestamp.split(',')[0]}
                      </span>
                    </div>

                    <div className="text-white/70 text-sm line-clamp-2 pl-[52px]">{issue.desc}</div>

                    {issue.photos.length > 0 && (
                      <div className="pl-[52px] flex items-center gap-2 mt-1">
                        <div className="flex items-center justify-center px-2 py-1 rounded bg-white/5 border border-white/5 text-xs text-white/50 gap-1">
                          <ImageIcon size={10} /> {issue.photos.length}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="p-6 md:p-8 space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex flex-col gap-2 border-b border-white/10 pb-6">
                <div className="flex items-center gap-2 text-white/40 text-sm font-mono">
                  <Calendar size={14} /> {selectedIssue.timestamp}
                  <span className="mx-2">|</span>
                  <User size={14} /> {selectedIssue.author}
                </div>
              </div>

              <div className="bg-white/5 rounded-2xl p-6 border border-white/5">
                <h3 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-2">{t.lbl_description}</h3>
                <p className="text-white text-lg leading-relaxed whitespace-pre-wrap">{selectedIssue.desc}</p>
              </div>

              {selectedIssue.photos.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-4">{t.lbl_photos_list}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedIssue.photos.map((url, idx) => (
                      <div key={idx} className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/50 aspect-video group">
                        <SecureImage
                          src={url}
                          onClick={() => setLightbox({ images: selectedIssue.photos, index: idx })}
                          alt="Issue evidence"
                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[70] bg-black/95 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(prev => prev ? { ...prev, index: (prev.index - 1 + prev.images.length) % prev.images.length } : null);
            }}
            className="absolute left-4 md:left-8 text-white/60 hover:text-white"
          >
            <ChevronLeft size={40} />
          </button>

          <div onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full">
            <SecureImage
              src={lightbox.images[lightbox.index]}
              alt="Full view"
              className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain"
            />
            {lightbox.images.length > 1 && (
              <div className="text-center text-white/60 text-xs mt-3">{lightbox.index + 1} / {lightbox.images.length}</div>
            )}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(prev => prev ? { ...prev, index: (prev.index + 1) % prev.images.length } : null);
            }}
            className="absolute right-4 md:right-8 text-white/60 hover:text-white"
          >
            <ChevronRight size={40} />
          </button>

          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white/50 hover:text-white p-2 transition-colors">
            <X size={32} />
          </button>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
      `}</style>
    </div>
  );
};

export default HistoryModal;
