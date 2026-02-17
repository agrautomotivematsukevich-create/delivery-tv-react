import React, { useEffect, useState, useRef } from 'react';
import { api } from '../services/api';
import { TranslationSet, User } from '../types';
import { X, AlertTriangle, Camera, CheckCircle2, ChevronDown, Loader2 } from 'lucide-react';

interface IssueModalProps {
  onClose: () => void;
  t: TranslationSet;
  user?: User | null;
}

const MAX_WIDTH = 1200;
const JPEG_QUALITY = 0.8;

const compressImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const IssueModal: React.FC<IssueModalProps> = ({ onClose, t, user }) => {
  const [containers, setContainers] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [customId, setCustomId] = useState('');
  const [useCustomId, setUseCustomId] = useState(false);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<(string | null)[]>([null, null, null]);
  const [previews, setPreviews] = useState<(string | null)[]>([null, null, null]);
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const fileRef0 = useRef<HTMLInputElement>(null);
  const fileRef1 = useRef<HTMLInputElement>(null);
  const fileRef2 = useRef<HTMLInputElement>(null);
  const fileRefs = [fileRef0, fileRef1, fileRef2];

  useEffect(() => {
    api.fetchAllContainers().then(setContainers);
  }, []);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setPhotos(prev => { const n = [...prev]; n[index] = compressed; return n; });
      setPreviews(prev => { const n = [...prev]; n[index] = compressed; return n; });
    } catch { setError('Ошибка обработки фото'); }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => { const n = [...prev]; n[index] = null; return n; });
    setPreviews(prev => { const n = [...prev]; n[index] = null; return n; });
    if (fileRefs[index].current) fileRefs[index].current!.value = '';
  };

  const handleSubmit = async () => {
    const containerId = useCustomId ? customId.trim() : selectedId;
    if (!containerId) { setError('Выберите контейнер'); return; }
    if (!description.trim()) { setError('Опишите проблему'); return; }
    setError(''); setUploading(true);
    try {
      const uploadedUrls: string[] = [];
      const validPhotos = photos.filter(Boolean) as string[];
      for (let i = 0; i < validPhotos.length; i++) {
        setUploadStep('Загрузка фото ' + (i + 1) + '/' + validPhotos.length + '...');
        const url = await api.uploadPhoto(validPhotos[i], 'image/jpeg', containerId + '_Issue_' + (i + 1) + '.jpg');
        if (url) uploadedUrls.push(url);
      }
      setUploadStep('Отправка отчёта...');
      await api.reportIssue(containerId, description.trim(), uploadedUrls, user?.name || 'Anonymous');
      setSuccess(true);
    } catch { setError('Ошибка отправки. Попробуйте снова.'); }
    finally { setUploading(false); setUploadStep(''); }
  };

  const containerId = useCustomId ? customId.trim() : selectedId;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/90 backdrop-blur-xl p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-[#0A0A0C] w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border-t sm:border border-white/10 flex flex-col shadow-2xl overflow-hidden" style={{maxHeight:'95dvh'}}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/10 bg-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <span className="text-lg font-extrabold uppercase tracking-widest text-white">{t.issue_title}</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center transition-colors text-white/60 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {success ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <div className="w-20 h-20 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-400" />
              </div>
              <p className="text-xl font-bold text-white">{t.issue_success}</p>
              <p className="text-white/40 text-sm">Отчёт отправлен администратору</p>
              <button onClick={onClose} className="mt-4 px-8 py-3 bg-white/10 rounded-xl text-white font-bold text-sm hover:bg-white/15 transition-colors">
                {t.btn_cancel}
              </button>
            </div>
          ) : (
            <>
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm font-medium">{error}</div>
              )}

              {/* Container */}
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">Container ID</label>
                {!useCustomId ? (
                  <div className="relative">
                    <select
                      value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
                      className="w-full appearance-none px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors"
                    >
                      <option value="" className="bg-[#1A1A1F]">— Выберите контейнер —</option>
                      {containers.map(id => <option key={id} value={id} className="bg-[#1A1A1F]">{id}</option>)}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                  </div>
                ) : (
                  <input
                    type="text" value={customId} onChange={(e) => setCustomId(e.target.value.toUpperCase())}
                    placeholder="WSDU1234567"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors placeholder:text-white/20"
                  />
                )}
                <button onClick={() => { setUseCustomId(!useCustomId); setSelectedId(''); setCustomId(''); }}
                  className="mt-2 text-xs text-white/30 hover:text-white/60 transition-colors">
                  {useCustomId ? '← Выбрать из списка' : 'Ввести вручную →'}
                </button>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                  {t.lbl_description || 'Описание'}
                </label>
                <textarea
                  value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder={t.issue_desc_ph} rows={4}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors placeholder:text-white/20 leading-relaxed"
                />
              </div>

              {/* Photos */}
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-3">
                  {t.issue_upload} (до 3)
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[0,1,2].map(index => (
                    <div key={index}>
                      {previews[index] ? (
                        <div className="relative aspect-square rounded-xl overflow-hidden border border-white/10">
                          <img src={previews[index]!} alt="" className="w-full h-full object-cover" />
                          <button onClick={() => removePhoto(index)}
                            className="absolute top-1 right-1 w-6 h-6 bg-black/70 rounded-full flex items-center justify-center text-white hover:bg-red-500/80 transition-colors">
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => fileRefs[index].current?.click()}
                          disabled={index > 0 && !previews[index - 1]}
                          className="w-full aspect-square rounded-xl border border-dashed border-white/15 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/25 flex flex-col items-center justify-center gap-1.5 transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
                        >
                          <Camera size={22} className="text-white/30" />
                          <span className="text-[10px] text-white/30 font-bold">Фото {index + 1}</span>
                        </button>
                      )}
                      <input ref={fileRefs[index]} type="file" accept="image/*" capture="environment"
                        onChange={(e) => handlePhotoSelect(e, index)} className="hidden" />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="p-4 border-t border-white/5 bg-white/[0.02] shrink-0">
            <button
              onClick={handleSubmit}
              disabled={uploading || !containerId || !description.trim()}
              className="w-full py-4 bg-red-600/90 hover:bg-red-600 text-white font-extrabold text-sm uppercase tracking-widest rounded-xl flex items-center justify-center gap-3 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {uploading ? (
                <><Loader2 size={18} className="animate-spin" />{uploadStep || t.msg_uploading}</>
              ) : (
                <><AlertTriangle size={18} />{t.issue_btn}</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default IssueModal;
