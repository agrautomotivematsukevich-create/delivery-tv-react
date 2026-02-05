import React, { useState, useRef } from 'react';
import { api } from '../services/api';
import { TranslationSet, TaskAction, User } from '../types';
import { Camera, Lock, CheckCircle, Upload } from 'lucide-react';

interface ActionModalProps {
  action: TaskAction;
  user: User;
  t: TranslationSet;
  onClose: () => void;
  onSuccess: () => void;
}

const ActionModal: React.FC<ActionModalProps> = ({ action, user, t, onClose, onSuccess }) => {
  const [zone, setZone] = useState<string | null>(null);
  const [photo1, setPhoto1] = useState<{data: string, mime: string, name: string} | null>(null);
  const [photo2, setPhoto2] = useState<{data: string, mime: string, name: string} | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deferUpload, setDeferUpload] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentPhotoTarget = useRef<1 | 2>(1);

  const isStart = action.type === 'start';

  // Список доступных зон склада
  const AVAILABLE_ZONES = ['G4', 'G5', 'G7', 'G8', 'G9', 'P70'];

  const triggerFile = (target: 1 | 2) => {
    currentPhotoTarget.current = target;
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
          const scale = 1600 / img.width;
          canvas.width = 1600;
          canvas.height = img.height * scale;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          const suffix = isStart 
            ? (currentPhotoTarget.current === 1 ? "_General" : "_Seal") 
            : "_Empty";
            
          const photoData = {
            data: canvas.toDataURL('image/jpeg', 0.9),
            mime: 'image/jpeg',
            name: `${action.id}${suffix}.jpg`
          };

          if (currentPhotoTarget.current === 1) setPhoto1(photoData);
          else setPhoto2(photoData);
        };
        if (evt.target?.result) img.src = evt.target.result as string;
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const isFormValid = () => {
    if (isStart) {
      if (!zone) return false;
      if (!deferUpload) {
        return !!photo1 && !!photo2;
      }
      return true;
    } else {
      if (!deferUpload) {
        return !!photo1;
      }
      return true;
    }
  };

  const handleSubmit = async () => {
    if (!isFormValid()) return;

    setSubmitting(true);
    setUploadStatus("");
    
    let urlGen = "", urlSeal = "", urlEmpty = "";

    if (!deferUpload) {
      if (photo1) {
        if (isStart && photo2) setUploadStatus(`${t.msg_uploading} (1/2)`);
        else setUploadStatus(`${t.msg_uploading}`);
        
        urlGen = await api.uploadPhoto(photo1.data, photo1.mime, photo1.name);
      }
      
      if (photo2) {
        setUploadStatus(`${t.msg_uploading} (2/2)`);
        urlSeal = await api.uploadPhoto(photo2.data, photo2.mime, photo2.name);
      }
      
      if (!isStart && photo1) {
        urlEmpty = urlGen; 
        urlGen = ""; 
      }
    }

    setUploadStatus("...");

    await api.taskAction(
      action.id,
      action.type,
      user.name,
      zone || "",
      urlGen,
      urlSeal,
      urlEmpty
    );

    setSubmitting(false);
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in zoom-in duration-200">
      <div className="bg-[#0F0F12] border border-white/10 p-8 rounded-3xl w-full max-w-[480px] flex flex-col gap-6 shadow-2xl">
        
        <div className="text-center">
           <h2 className="text-3xl font-extrabold text-white mb-1">{action.id}</h2>
           <p className="text-white/50 uppercase tracking-widest text-sm">{isStart ? t.btn_start : t.btn_finish}</p>
        </div>

        {isStart && (
          <div>
            <p className="text-xs font-bold text-white/40 mb-3 uppercase tracking-wider">ВЫБОР ЗОНЫ</p>
            <div className="grid grid-cols-3 gap-3">
              {AVAILABLE_ZONES.map(z => (
                <button
                  key={z}
                  onClick={() => setZone(z)}
                  className={`py-4 rounded-xl font-bold border transition-all ${
                    zone === z 
                    ? 'bg-accent-blue text-white border-accent-blue shadow-[0_0_15px_rgba(30,128,125,0.4)]' 
                    : 'bg-white/5 text-white/50 border-transparent hover:bg-white/10'
                  }`}
                >
                  {z}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
           <div 
             onClick={() => triggerFile(1)}
             className={`border-2 border-dashed rounded-2xl p-6 cursor-pointer flex flex-col items-center gap-2 transition-colors ${photo1 ? 'border-accent-green bg-accent-green/5' : 'border-white/20 hover:border-accent-blue hover:bg-accent-blue/5'}`}
           >
             {photo1 ? <CheckCircle className="text-accent-green w-8 h-8" /> : <Camera className="text-white/50 w-8 h-8" />}
             <span className="font-semibold text-white/80">{isStart ? t.lbl_photo1 : t.lbl_photo_empty}</span>
           </div>

           {isStart && (
             <div 
               onClick={() => triggerFile(2)}
               className={`border-2 border-dashed rounded-2xl p-6 cursor-pointer flex flex-col items-center gap-2 transition-colors ${photo2 ? 'border-accent-green bg-accent-green/5' : 'border-white/20 hover:border-accent-blue hover:bg-accent-blue/5'}`}
             >
               {photo2 ? <CheckCircle className="text-accent-green w-8 h-8" /> : <Lock className="text-white/50 w-8 h-8" />}
               <span className="font-semibold text-white/80">{t.lbl_photo2}</span>
             </div>
           )}
           
           <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={handleFileChange} />
           
           <label className="flex items-center justify-center gap-2 text-white/50 text-sm cursor-pointer hover:text-white transition-colors mt-2">
             <input type="checkbox" checked={deferUpload} onChange={e => setDeferUpload(e.target.checked)} className="rounded bg-white/10 border-white/20" />
             Загрузить фото позже (Оффлайн)
           </label>
        </div>

        <div className="flex flex-col gap-3 mt-2">
           <button 
             onClick={handleSubmit}
             disabled={submitting || !isFormValid()}
             className="w-full py-4 bg-accent-blue hover:bg-accent-blue/90 text-white font-bold rounded-2xl shadow-lg shadow-accent-blue/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-2"
           >
             {submitting ? <Upload className="animate-bounce w-5 h-5" /> : null}
             {submitting ? (uploadStatus || t.msg_uploading) : "ПОДТВЕРДИТЬ"}
           </button>
           <button onClick={onClose} className="text-white/40 hover:text-white py-2 transition-colors">{t.btn_cancel}</button>
        </div>
      </div>
    </div>
  );
};

export default ActionModal;