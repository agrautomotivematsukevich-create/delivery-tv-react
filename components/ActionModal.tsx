import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import { TranslationSet, TaskAction, User } from '../types';
import { SCRIPT_URL } from '../constants'; // ← ИМПОРТИРУЕМ РАБОЧИЙ URL
import { Camera, Lock, CheckCircle, Clock, Truck, RefreshCw, Upload, AlertTriangle } from 'lucide-react';

interface ActionModalProps {
  action: TaskAction;
  user: User;
  t: TranslationSet;
  onClose: () => void;
  onSuccess: () => void;
  onRefresh?: () => void;
}

const ActionModal: React.FC<ActionModalProps> = ({ 
  action, 
  user, 
  t, 
  onClose, 
  onSuccess,
  onRefresh 
}) => {
  const [zone, setZone] = useState<string | null>(null);
  const [photo1, setPhoto1] = useState<{data: string, mime: string, name: string} | null>(null);
  const [photo2, setPhoto2] = useState<{data: string, mime: string, name: string} | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadTimeout, setUploadTimeout] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  const [isLocalManual, setIsLocalManual] = useState(false);
  const [manualTime, setManualTime] = useState(
    new Date().toLocaleTimeString('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    }).slice(0, 5)
  );
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentPhotoTarget = useRef<1 | 2>(1);
  const uploadTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isStart = action.type === 'start';
  const AVAILABLE_ZONES = ['G4', 'G5', 'G7', 'G8', 'G9', 'P70'];

  useEffect(() => {
    return () => {
      if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const triggerFile = (target: 1 | 2) => {
    currentPhotoTarget.current = target;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
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
          
          const maxWidth = 1600;
          const maxHeight = 1200;
          let width = img.width;
          let height = img.height;
          
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
          
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
          
          const suffix = isStart 
            ? (currentPhotoTarget.current === 1 ? "_General" : "_Seal") 
            : "_Empty";
          const photoData = { 
            data: canvas.toDataURL('image/jpeg', 0.8), 
            mime: 'image/jpeg', 
            name: `${action.id}${suffix}.jpg` 
          };
          
          if (currentPhotoTarget.current === 1) {
            setPhoto1(photoData);
            setUploadError(null);
          } else {
            setPhoto2(photoData);
            setUploadError(null);
          }
        };
        if (evt.target?.result) img.src = evt.target.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const isFormValid = () => {
    if (isStart && !zone) return false;
    if (isLocalManual) return true;
    return isStart ? (!!photo1 && !!photo2) : !!photo1;
  };

  // Загрузка фото с прогрессом через XMLHttpRequest – ИСПОЛЬЗУЕМ SCRIPT_URL ИЗ КОНСТАНТ
  const uploadPhotoWithProgress = async (
    photoData: { data: string, mime: string, name: string },
    photoIndex: number
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      abortControllerRef.current = new AbortController();
      
      const formData = new FormData();
      
      const base64Data = photoData.data.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: photoData.mime });
      
      formData.append('mode', 'upload_photo');
      formData.append('photo', blob, photoData.name);
      formData.append('mimeType', photoData.mime);
      
      const xhr = new XMLHttpRequest();
      xhr.open('POST', SCRIPT_URL, true); // ← ИСПРАВЛЕНО: используем SCRIPT_URL
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          const baseProgress = photoIndex === 1 ? 0 : 50;
          const adjustedProgress = baseProgress + (progress * 0.5);
          setUploadProgress(Math.min(adjustedProgress, photoIndex === 1 ? 50 : 100));
        }
      };
      
      xhr.onload = () => {
        if (xhr.status === 200) {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.status === "SUCCESS" && response.url) {
              resolve(response.url);
            } else {
              reject(new Error('Upload failed: ' + (response.error || 'Unknown error')));
            }
          } catch (e) {
            reject(new Error('Invalid response format'));
          }
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };
      
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.ontimeout = () => reject(new Error('Upload timeout'));
      xhr.timeout = 30000;
      
      if (abortControllerRef.current) {
        abortControllerRef.current.signal.addEventListener('abort', () => {
          xhr.abort();
          reject(new DOMException('Aborted', 'AbortError'));
        });
      }
      
      xhr.send(formData);
    });
  };

  const handleSubmit = async () => {
    if (!isFormValid()) return;
    
    setSubmitting(true);
    setUploadProgress(0);
    setIsUploading(true);
    setUploadTimeout(false);
    setUploadError(null);
    
    if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current);
    
    uploadTimerRef.current = setTimeout(() => {
      setUploadTimeout(true);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    }, 60000);
    
    let urlGen = "", urlSeal = "", urlEmpty = "";
    
    try {
      if (!isLocalManual) {
        if (photo1) {
          setUploadProgress(10);
          urlGen = await uploadPhotoWithProgress(photo1, 1);
          setUploadProgress(50);
        }
        if (photo2) {
          urlSeal = await uploadPhotoWithProgress(photo2, 2);
          setUploadProgress(100);
        }
        if (!isStart && photo1) { 
          urlEmpty = urlGen; 
          urlGen = ""; 
        }
      }
      
      if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current);
      
      const actionTypeToSend = isLocalManual 
        ? `${action.type}_manual_${manualTime.replace(':', '')}` 
        : action.type;

      await api.taskAction(
        action.id,
        actionTypeToSend,
        user.name,
        zone || "",
        urlGen,
        urlSeal,
        urlEmpty
      );

      setSubmitting(false);
      setIsUploading(false);
      onSuccess();
      
    } catch (error) {
      console.error('Upload/action error:', error);
      
      if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current);
      
      setSubmitting(false);
      setIsUploading(false);
      
      if (error instanceof DOMException && error.name === 'AbortError') {
        setUploadError('Загрузка была отменена');
      } else if (error instanceof Error && error.message.includes('timeout')) {
        setUploadTimeout(true);
        setUploadError('Загрузка заняла слишком много времени');
      } else {
        setUploadError('Ошибка при загрузке фото. Попробуйте еще раз.');
      }
    }
  };

  const handleRefresh = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current);
    if (onRefresh) onRefresh();
    onClose();
  };

  const resetPhoto = (target: 1 | 2) => {
    if (target === 1) setPhoto1(null);
    else setPhoto2(null);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#0F0F12] border border-white/10 p-8 rounded-3xl w-full max-w-[480px] flex flex-col gap-6 shadow-2xl">
        <div className="text-center">
           <h2 className="text-2xl font-extrabold text-white mb-1 leading-tight tracking-tight">{action.id}</h2>
           <p className="text-sm text-white/50">
             {isStart ? "Подтвердите начало работы" : "Подтвердите завершение работы"}
           </p>
           
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

        {uploadTimeout && (
          <div className="animate-in slide-in-from-top-2 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-400" />
                <span className="text-sm text-red-300">Загрузка заняла более 60 секунд</span>
              </div>
              <button
                onClick={handleRefresh}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-300 text-sm font-bold transition-colors"
              >
                <RefreshCw size={14} /> Обновить экран
              </button>
            </div>
          </div>
        )}

        {uploadError && !uploadTimeout && (
          <div className="animate-in slide-in-from-top-2 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-400" />
              <span className="text-sm text-red-300">{uploadError}</span>
            </div>
          </div>
        )}

        {isUploading && !isLocalManual && (
          <div className="animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/50 uppercase tracking-wider">
                {uploadProgress < 100 ? "Загрузка фото..." : "Загрузка завершена"}
              </span>
              <span className="text-sm font-bold text-white">{uploadProgress}%</span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="text-center text-xs text-white/40 mt-2">
                Пожалуйста, не закрывайте приложение
              </div>
            )}
          </div>
        )}

        {isStart && (
          <div className="animate-in slide-in-from-top-2">
            <p className="text-[10px] font-black text-white/30 mb-3 uppercase tracking-[0.2em] text-center">Выбор зоны выгрузки</p>
            <div className="grid grid-cols-3 gap-2">
              {AVAILABLE_ZONES.map(z => (
                <button 
                  key={z} 
                  onClick={() => setZone(z)} 
                  disabled={isUploading}
                  className={`py-4 rounded-xl font-bold text-sm border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
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
            <input 
              type="time" 
              value={manualTime} 
              onChange={(e) => setManualTime(e.target.value)} 
              disabled={isUploading}
              className="bg-transparent text-white text-5xl font-mono text-center outline-none [color-scheme:dark] w-full disabled:opacity-50"
            />
            <div className="text-xs text-white/40 text-center">
              Формат: ЧЧ:ММ (24-часовой)
            </div>
          </div>
        ) : (
          <div className="space-y-3">
             <div 
               onClick={() => !isUploading && triggerFile(1)} 
               className={`border-2 border-dashed rounded-2xl p-6 cursor-pointer flex flex-col items-center gap-2 transition-all relative group
                 ${isUploading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                 ${photo1 ? 'border-green-500 bg-green-500/5' : 'border-white/10 hover:border-blue-500'}
               `}
             >
               {photo1 ? (
                 <>
                   <div className="absolute top-2 right-2">
                     <button 
                       onClick={(e) => {
                         e.stopPropagation();
                         resetPhoto(1);
                       }}
                       className="w-6 h-6 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center text-xs text-white"
                     >
                       ×
                     </button>
                   </div>
                   <div className="relative w-16 h-16 rounded-lg overflow-hidden">
                     <img 
                       src={photo1.data} 
                       alt="Preview" 
                       className="w-full h-full object-cover"
                     />
                   </div>
                   <span className="font-bold text-green-400 text-xs uppercase text-center leading-tight">
                     {isStart ? t.lbl_photo1 : t.lbl_photo_empty} ✓
                   </span>
                 </>
               ) : (
                 <>
                   <Camera className="text-white/20 w-12 h-12" />
                   <span className="font-bold text-white/60 text-xs uppercase text-center leading-tight">
                     {isStart ? t.lbl_photo1 : t.lbl_photo_empty}
                   </span>
                   <span className="text-[10px] text-white/40 mt-1">
                     Нажмите для съемки или выбора фото
                   </span>
                 </>
               )}
             </div>
             
             {isStart && (
               <div 
                 onClick={() => !isUploading && triggerFile(2)} 
                 className={`border-2 border-dashed rounded-2xl p-6 cursor-pointer flex flex-col items-center gap-2 transition-all relative group
                   ${isUploading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                   ${photo2 ? 'border-green-500 bg-green-500/5' : 'border-white/10 hover:border-blue-500'}
                 `}
               >
                 {photo2 ? (
                   <>
                     <div className="absolute top-2 right-2">
                       <button 
                         onClick={(e) => {
                           e.stopPropagation();
                           resetPhoto(2);
                         }}
                         className="w-6 h-6 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center text-xs text-white"
                       >
                         ×
                       </button>
                     </div>
                     <div className="relative w-16 h-16 rounded-lg overflow-hidden">
                       <img 
                         src={photo2.data} 
                         alt="Preview" 
                         className="w-full h-full object-cover"
                       />
                     </div>
                     <span className="font-bold text-green-400 text-xs uppercase">
                       {t.lbl_photo2} ✓
                     </span>
                   </>
                 ) : (
                   <>
                     <Lock className="text-white/20 w-12 h-12" />
                     <span className="font-bold text-white/60 text-xs uppercase">{t.lbl_photo2}</span>
                     <span className="text-[10px] text-white/40 mt-1">
                       Фото пломбы/печати
                     </span>
                   </>
                 )}
               </div>
             )}
             
             <input 
               type="file" 
               ref={fileInputRef} 
               hidden 
               accept="image/*" 
               capture="environment" 
               onChange={handleFileChange} 
               disabled={isUploading}
             />
          </div>
        )}

        <div className="flex flex-col gap-3">
           <button 
             onClick={handleSubmit} 
             disabled={submitting || !isFormValid() || isUploading} 
             className={`w-full py-5 font-black text-sm rounded-2xl transition-all relative overflow-hidden group
               ${isLocalManual ? 'bg-orange-600 hover:bg-orange-500' : 'bg-blue-600 hover:bg-blue-500'}
               ${(submitting || isUploading) ? 'opacity-90' : ''}
               disabled:opacity-30 disabled:cursor-not-allowed text-white uppercase tracking-widest shadow-xl active:scale-95
             `}
           >
             {submitting || isUploading ? (
               <div className="flex items-center justify-center gap-3">
                 <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                 <span>
                   {isLocalManual ? "Сохранение..." : `Загрузка ${uploadProgress}%`}
                 </span>
               </div>
             ) : (
               "Подтвердить"
             )}
           </button>
           
           <button 
             onClick={onClose} 
             disabled={isUploading}
             className="text-white/40 hover:text-white py-2 text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
           >
             Отмена
           </button>
        </div>
      </div>
    </div>
  );
};

export default ActionModal;