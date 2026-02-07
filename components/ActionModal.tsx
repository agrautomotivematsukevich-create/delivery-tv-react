import React, { useState, useRef } from 'react';
import { api } from '../services/api';
import { TranslationSet, TaskAction, User } from '../types';
import { Camera, Lock, CheckCircle, Clock, Truck } from 'lucide-react';

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
  
  const [isLocalManual, setIsLocalManual] = useState(false);
  const [manualTime, setManualTime] = useState(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentPhotoTarget = useRef<1 | 2>(1);

  const isStart = action.type === 'start'; // Проверка: начало это или конец
  const AVAILABLE_ZONES = ['G4', 'G5', 'G7', 'G8', 'G9', 'P70'];

  const triggerFile = (target: 1 | 2) => {
    currentPhotoTarget.current = target;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
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
          const photoData = { data: canvas.toDataURL('image/jpeg', 0.8), mime: 'image/jpeg', name: `${action.id}${suffix}.jpg` };
          if (currentPhotoTarget.current === 1) setPhoto1(photoData);
          else setPhoto2(photoData);
        };
        if (evt.target?.result) img.src = evt.target.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const isFormValid = () => {
    // Зона обязательна ТОЛЬКО при старте
    if (isStart && !zone) return false;
    
    if (isLocalManual) return true;
    return isStart ? (!!photo1 && !!photo2) : !!photo1;
  };

  const handleSubmit = async () => {
    if (submitting || !isFormValid()) return;
    setSubmitting(true);
    
    let urlGen = "", urlSeal = "", urlEmpty = "";
    if (!isLocalManual) {
      if (photo1) urlGen = await api.uploadPhoto(photo1.data, photo1.mime, photo1.name);
      if (photo2) urlSeal = await api.uploadPhoto(photo2.data, photo2.mime, photo2.name);
      if (!isStart && photo1) { urlEmpty = urlGen; urlGen = ""; }
    }

    const actionTypeToSend = isLocalManual ? `${action.type}_manual_${manualTime}` : action.type;

    const result = await api.taskAction(
      action.id,
      actionTypeToSend,
      user.name,
      zone || "", // Если это финиш, отправится пустота, и скрипт не перезапишет зону в таблице
      urlGen,
      urlSeal,
      urlEmpty
    );

    setSubmitting(false);
    if (!result.ok) {
      alert(`Не удалось сохранить действие: ${result.error || "UNKNOWN"}`);
      return;
    }

    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#0F0F12] border border-white/10 p-8 rounded-3xl w-full max-w-[480px] flex flex-col gap-6 shadow-2xl">
        <div className="text-center">
           <h2 className="text-2xl font-extrabold text-white mb-1 leading-tight tracking-tight">{action.id}</h2>
           <button 
            onClick={() => setIsLocalManual(!isLocalManual)}
            className={`mt-4 mx-auto flex items-center gap-2 px-5 py-2.5 rounded-full border transition-all duration-300 ${
              isLocalManual ? 'bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/20' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
            }`}
           >
             <Truck size={16} />
             <span className="text-[11px] font-black uppercase tracking-[0.1em]">
               {isLocalManual ? "Локальный режим: ВКЛ" : "Обычный (Фото) / Переключить"}
             </span>
           </button>
        </div>

        {/* Выбор зоны показываем ТОЛЬКО при нажатии кнопки "Начать" */}
        {isStart && (
          <div className="animate-in slide-in-from-top-2">
            <p className="text-[10px] font-black text-white/30 mb-3 uppercase tracking-[0.2em] text-center">Выбор зоны выгрузки</p>
            <div className="grid grid-cols-3 gap-2">
              {AVAILABLE_ZONES.map(z => (
                <button 
                  key={z} 
                  onClick={() => setZone(z)} 
                  className={`py-4 rounded-xl font-bold text-sm border transition-all ${
                    zone === z 
                    ? (isLocalManual ? 'bg-orange-500 border-orange-400 text-white' : 'bg-blue-600 border-blue-500 text-white') 
                    : 'bg-white/5 text-white/40 border-transparent hover:bg-white/10'
                  }`}
                >
                  {z}
                </button>
              ))}
            </div>
          </div>
        )}

        {isLocalManual ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col items-center gap-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-2 text-orange-400">
              <Clock size={18} />
              <span className="font-bold uppercase text-[10px] tracking-widest">
                {isStart ? "Время начала (Факт)" : "Время завершения (Факт)"}
              </span>
            </div>
            <input type="time" value={manualTime} onChange={(e) => setManualTime(e.target.value)} className="bg-transparent text-white text-5xl font-mono text-center outline-none [color-scheme:dark]" />
          </div>
        ) : (
          <div className="space-y-3">
             <div onClick={() => triggerFile(1)} className={`border-2 border-dashed rounded-2xl p-6 cursor-pointer flex flex-col items-center gap-2 transition-all ${photo1 ? 'border-green-500 bg-green-500/5' : 'border-white/10 hover:border-blue-500'}`}>
               {photo1 ? <CheckCircle className="text-green-500 w-8 h-8" /> : <Camera className="text-white/20 w-8 h-8" />}
               <span className="font-bold text-white/60 text-xs uppercase text-center leading-tight">
                 {isStart ? t.lbl_photo1 : t.lbl_photo_empty}
               </span>
             </div>
             {isStart && (
               <div onClick={() => triggerFile(2)} className={`border-2 border-dashed rounded-2xl p-6 cursor-pointer flex flex-col items-center gap-2 transition-all ${photo2 ? 'border-green-500 bg-green-500/5' : 'border-white/10 hover:border-blue-500'}`}>
                 {photo2 ? <CheckCircle className="text-green-500 w-8 h-8" /> : <Lock className="text-white/20 w-8 h-8" />}
                 <span className="font-bold text-white/60 text-xs uppercase">{t.lbl_photo2}</span>
               </div>
             )}
             <input 
  type="file" 
  ref={fileInputRef} 
  hidden 
  accept="image/*" 
  capture="environment" 
  onChange={handleFileChange} 
/>
          </div>
        )}

        <div className="flex flex-col gap-3">
           <button 
             onClick={handleSubmit} 
             disabled={submitting || !isFormValid()} 
             className={`w-full py-5 font-black text-sm rounded-2xl transition-all ${
               isLocalManual ? 'bg-orange-600 hover:bg-orange-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
             } disabled:opacity-20 uppercase tracking-widest shadow-xl active:scale-95`}
           >
             {submitting ? "Сохранение..." : "Подтвердить"}
           </button>
           <button onClick={onClose} className="text-white/20 hover:text-white py-2 text-[10px] font-bold uppercase tracking-widest transition-colors">Отмена</button>
        </div>
      </div>
    </div>
  );
};

export default ActionModal;