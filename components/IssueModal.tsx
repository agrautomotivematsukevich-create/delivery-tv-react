import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { TranslationSet, User } from '../types';
import { Camera, X, Upload, CheckCircle, Loader2 } from 'lucide-react';
import { useEscape } from '../utils/useEscape';
import { useAppContext } from './AppContext';

interface IssueModalProps {
  onClose: () => void;
  user: User | null;
  t: TranslationSet;
}

interface PhotoData {
  data: string;
  mime: string;
  name: string;
  preview: string;
}

const IssueModal: React.FC<IssueModalProps> = ({ onClose, user, t }) => {
  useEscape(onClose);
  const { addToast } = useAppContext();
  const [containerIds, setContainerIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<(PhotoData | null)[]>([null, null, null]);
  const [loading, setLoading] = useState(false);
  const [loadingIds, setLoadingIds] = useState(true);
  const [uploadStatus, setUploadStatus] = useState("");
  const [processingPhoto, setProcessingPhoto] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activePhotoIndex = useRef<number>(0);
  const workerRef = useRef<Worker | null>(null);

  // ── Initialize Web Worker for off-thread image compression ──
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../utils/ImageWorker.ts', import.meta.url),
      { type: 'module' }
    );
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    const loadIds = async () => {
      const ids = await api.fetchAllContainers();
      setContainerIds(ids);
      setLoadingIds(false);
    };
    loadIds();
  }, []);

  const triggerFile = (index: number) => {
    activePhotoIndex.current = index;
    fileInputRef.current?.click();
  };

  // ── Photo compression via Web Worker (no main-thread freeze) ──
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !workerRef.current) return;
    e.target.value = '';

    const idx = activePhotoIndex.current;
    setProcessingPhoto(true);

    const suffix = `issue_${Date.now()}_${idx}`;

    const onMessage = (event: MessageEvent) => {
      workerRef.current?.removeEventListener('message', onMessage);
      setProcessingPhoto(false);

      const result = event.data;
      if (result.success) {
        const newPhotos = [...photos];
        newPhotos[idx] = {
          data: result.data,
          mime: result.mime,
          name: result.name,
          // Generate a tiny preview from the same data URL
          // (Worker already compressed to 1200px — good enough for thumbnail)
          preview: result.data,
        };
        setPhotos(newPhotos);
      } else {
        addToast('Ошибка сжатия фото. Попробуйте другой файл.', 'error');
      }
    };

    workerRef.current.addEventListener('message', onMessage);
    // Send the raw File object to the Worker — it uses createImageBitmap + OffscreenCanvas
    workerRef.current.postMessage({ file, maxW: 1200, quality: 0.8, suffix });
  };

  const removePhoto = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newPhotos = [...photos];
    newPhotos[index] = null;
    setPhotos(newPhotos);
  };

  const handleSubmit = async () => {
    if (!selectedId || !description) return;

    setLoading(true);
    setUploadStatus(t.msg_uploading);

    const uploadedUrls: string[] = [];

    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      if (p) {
        setUploadStatus(`${t.msg_uploading} (${i + 1}/${photos.filter(x => x).length})`);
        const url = await api.uploadPhoto(p.data, p.mime, p.name);
        uploadedUrls.push(url);
      } else {
        uploadedUrls.push("");
      }
    }

    setUploadStatus("Sending Report...");
    
    await api.reportIssue(
      selectedId,
      description,
      uploadedUrls,
      user ? user.name : "Guest"
    );

    setLoading(false);
    addToast(t.issue_success, 'success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in zoom-in duration-200">
      <div className="bg-[#0F0F12] border border-white/10 p-8 rounded-3xl w-full max-w-[550px] flex flex-col gap-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
        
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-extrabold text-white uppercase tracking-wider">{t.issue_title}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Container Selection */}
        <div>
          <label className="text-xs font-bold text-white/40 mb-2 block uppercase tracking-wider">Container ID</label>
          <select 
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:bg-accent-blue/5 focus:border-accent-blue outline-none transition-all appearance-none"
            disabled={loadingIds}
          >
            <option value="">{loadingIds ? "Loading..." : "Select Container..."}</option>
            {!loadingIds && containerIds.map(id => (
              <option key={id} value={id} className="bg-[#1a1a1e] text-white">{id}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
           <label className="text-xs font-bold text-white/40 mb-2 block uppercase tracking-wider">Description</label>
           <textarea
             value={description}
             onChange={e => setDescription(e.target.value)}
             placeholder={t.issue_desc_ph}
             className="w-full h-32 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:bg-accent-blue/5 focus:border-accent-blue outline-none transition-all resize-none"
           />
        </div>

        {/* Photos */}
        <div>
           <label className="text-xs font-bold text-white/40 mb-2 block uppercase tracking-wider">Photos (Max 3)</label>
           <div className="grid grid-cols-3 gap-3">
              {photos.map((p, idx) => (
                <div 
                  key={idx}
                  onClick={() => !processingPhoto && triggerFile(idx)}
                  className={`aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer relative overflow-hidden transition-all ${
                    p ? 'border-accent-green bg-black' : 'border-white/20 hover:bg-white/5 hover:border-accent-blue'
                  } ${processingPhoto ? 'opacity-60 cursor-wait' : ''}`}
                >
                   {p ? (
                     <>
                       <img src={p.preview} alt="preview" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                       <CheckCircle className="relative z-10 text-accent-green w-8 h-8 drop-shadow-lg" />
                       <button 
                         onClick={(e) => removePhoto(idx, e)}
                         className="absolute top-1 right-1 bg-black/50 rounded-full p-1 hover:bg-red-500/80 transition-colors z-20"
                       >
                         <X size={12} className="text-white" />
                       </button>
                     </>
                   ) : processingPhoto && activePhotoIndex.current === idx ? (
                     <Loader2 className="w-7 h-7 text-accent-blue animate-spin" />
                   ) : (
                     <Camera className="text-white/30 w-6 h-6" />
                   )}
                </div>
              ))}
           </div>
           <input 
             type="file" 
             ref={fileInputRef} 
             hidden 
             accept="image/*" 
             capture="environment" 
             onChange={handleFileChange} 
           />
        </div>

        {/* Submit */}
        <div className="mt-2">
           <button 
             onClick={handleSubmit}
             disabled={loading || processingPhoto || !selectedId || !description}
             className="w-full py-4 bg-accent-blue hover:bg-accent-blue/90 text-white font-bold rounded-2xl shadow-lg shadow-accent-blue/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-2"
           >
             {loading ? <Upload className="animate-bounce w-5 h-5" /> : null}
             {loading ? uploadStatus : t.issue_btn}
           </button>
        </div>

      </div>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
      `}</style>
    </div>
  );
};

export default IssueModal;
