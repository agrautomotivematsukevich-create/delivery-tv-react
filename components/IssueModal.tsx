import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { TranslationSet, User } from '../types';
import { Camera, X, Upload, CheckCircle } from 'lucide-react';

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
  const [containerIds, setContainerIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<(PhotoData | null)[]>([null, null, null]);
  const [loading, setLoading] = useState(false);
  const [loadingIds, setLoadingIds] = useState(true);
  const [uploadStatus, setUploadStatus] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activePhotoIndex = useRef<number>(0);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          
          const scale = 1200 / img.width;
          canvas.width = 1200;
          canvas.height = img.height * scale;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          const newPhotos = [...photos];
          newPhotos[activePhotoIndex.current] = {
            data: canvas.toDataURL('image/jpeg', 0.8),
            mime: 'image/jpeg',
            name: `issue_${Date.now()}_${activePhotoIndex.current}.jpg`,
            preview: canvas.toDataURL('image/jpeg', 0.1)
          };
          setPhotos(newPhotos);
        };
        if (evt.target?.result) img.src = evt.target.result as string;
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
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
    alert(t.issue_success);
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
                  onClick={() => triggerFile(idx)}
                  className={`aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer relative overflow-hidden transition-all ${
                    p ? 'border-accent-green bg-black' : 'border-white/20 hover:bg-white/5 hover:border-accent-blue'
                  }`}
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
                   ) : (
                     <Camera className="text-white/30 w-6 h-6" />
                   )}
                </div>
              ))}
           </div>
           {/* ИСПРАВЛЕННЫЙ ИНПУТ: добавлен capture="environment" */}
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
             disabled={loading || !selectedId || !description}
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