import React, { useState, useRef } from 'react';
import { api } from '../services/api';
import { TranslationSet, TaskAction, User } from '../types';
import { Camera, Lock, CheckCircle, Upload, Clock, Truck } from 'lucide-react';

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
  
  // --- НОВОЕ: Ручной переключатель режима "Локальная поставка" ---
  const [isLocalManual, setIsLocalManual] = useState(false);
  const [manualTime, setManualTime] = useState(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentPhotoTarget = useRef<1 | 2>(1);

  const isStart = action.type === 'start';

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
          const suffix = isStart ? (currentPhotoTarget.current === 1 ? "_General" : "_Seal") : "_Empty";
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
    if (isLocalManual) return true; // В локальном режиме всё валидно
    if (isStart) {
      if (!zone) return false;
      return deferUpload || (!!photo1 && !!photo2);
    }
    return deferUpload || !!photo1;
  };

  const handleSubmit = async () => {
    if (!isFormValid()) return;
    setSubmitting(true);
    
    let urlGen = "", urlSeal = "", urlEmpty = "";

    if (!isLocalManual && !deferUpload) {
      if (photo1) urlGen = await api.uploadPhoto(photo1.data, photo1.mime, photo1.name);
      if (photo2) urlSeal = await api.uploadPhoto(photo2.data, photo2.mime, photo2.name);
      if (!isStart && photo1) { urlEmpty = urlGen; urlGen = ""; }
    }

    await api.taskAction(
      action.id,
      action.type,
      user.name,
      isLocalManual ? `МАНУАЛ: ${manualTime}` : (zone || ""), 
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
           <h2 className="text-2xl font-extrabold text-white mb-1 leading-tight">{action.id}</h2>
           
           {/* Кнопка-переключатель режима */}
           <button 
            onClick={() => setIsLocalManual(!isLocalManual)}
            className={`mt-4 mx-auto flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${
              isLocalManual 
              ? 'bg-orange-500/20 border-orange-500 text-orange-500' 
              : 'bg-white/5 border-white/10 text-white/40 hover:text-white'
            }`}
           >
             <Truck size={16} />
             <span className="text-xs font-bold uppercase tracking-wider">
               {isLocalManual ? "Режим: Локальная (Ручной ввод)" : "Переключить на локальную"}
             </span>
           </button>
        </div>

        {isLocalManual ? (
          /* Интерфейс ручного ввода времени */
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col items-center gap-4 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-3 text-orange-500">
              <Clock size={24} />
              <span className="font-bold uppercase text-sm">Фактическое время</span>
            </div>
            <input 
              type="time" 
              value={manualTime}
              onChange={(e) => setManualTime(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-xl px-6 py-4 text-4xl font-mono text-white outline-none focus:border-orange-500 transition-all w-full text-center [color-scheme:dark]"
            />
          </div>
        ) : (
          /* Стандартный интерфейс с фото */
          <>
            {isStart && (
              <div>
                <p className="text-xs font-bold text-white/40 mb-3 uppercase tracking-wider text-center">Выберите зону</p>
                <div className="grid grid-cols-3 gap-3">
                  {AVAILABLE_ZONES.map(z => (
                    <button key={z} onClick={() => setZone(z)} className={`py-4 rounded-xl font-bold border transition-all ${zone === z ? 'bg-accent-blue text-white border-accent-blue' : 'bg-white/5 text-white/50 border-transparent'}`}>{z}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-3">
               <div onClick={() => triggerFile(1)} className={`border-2 border-dashed rounded-2xl p-6 cursor-pointer flex flex-col items-center gap-2 ${photo1 ? 'border-accent-green' : 'border-white/20'}`}>
                 {photo1 ? <CheckCircle className="text-accent-green w-8 h-8" /> : <Camera className="text-white/50 w-8 h-8" />}
                 <span className="font-semibold text-white/80 text-center">{isStart ? t.lbl_photo1 : t.lbl_photo_empty}</span>
               </div>
               {isStart && (
                 <div onClick={() => triggerFile(2)} className={`border-2 border-dashed rounded-2xl p-6 cursor-pointer flex flex-col items-center gap-2 ${photo2 ? 'border-accent-green' : 'border-white/20'}`}>
                   {photo2 ? <CheckCircle className="text-accent-green w-8 h-8" /> : <Lock className="text-white/50 w-8 h-8" />}
                   <span className="font-semibold text-white/80 text-center">{t.lbl_photo2}</span>
                 </div>
               )}
               <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={handleFileChange} />
            </div>
          </>
        )}

        <div className="flex flex-col gap-3 mt-2">
           <button 
             onClick={handleSubmit}
             disabled={submitting || !isFormValid()}
             className={`w-full py-4 font-bold rounded-2xl shadow-lg transition-all active:scale-[0.98] ${
               isLocalManual ? 'bg-orange-600 hover:bg-orange-500 text-white' : 'bg-accent-blue hover:bg-accent-blue/90 text-white'
             } disabled:opacity-50`}
           >
             {submitting ? "СОХРАНЕНИЕ..." : "ПОДТВЕРДИТЬ"}
           </button>
           <button onClick={onClose} className="text-white/40 hover:text-white py-2 transition-colors">{t.btn_cancel}</button>
        </div>
      </div>
    </div>
  );
};

export default ActionModal;