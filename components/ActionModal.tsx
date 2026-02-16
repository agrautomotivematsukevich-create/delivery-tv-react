import React, { useState, useRef } from 'react';
import { api } from '../services/api';
import { TranslationSet, TaskAction, User } from '../types';
import { Camera, Lock, CheckCircle, Clock, Truck, Upload, AlertCircle, Loader2 } from 'lucide-react';

interface ActionModalProps {
  action: TaskAction;
  user: User;
  t: TranslationSet;
  onClose: () => void;
  onSuccess: () => void;
}

// Типы статусов загрузки
type UploadStatus = 
  | { state: 'idle' }
  | { state: 'uploading'; step: string; progress: number }
  | { state: 'success' }
  | { state: 'error'; message: string };

const ActionModal: React.FC<ActionModalProps> = ({ action, user, t, onClose, onSuccess }) => {
  const [zone, setZone] = useState<string | null>(null);
  const [photo1, setPhoto1] = useState<{data: string, mime: string, name: string} | null>(null);
  const [photo2, setPhoto2] = useState<{data: string, mime: string, name: string} | null>(null);
  
  // Новое: детальный статус загрузки
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({ state: 'idle' });
  
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
    if (isStart && !zone) return false;
    if (isLocalManual) return true;
    return isStart ? (!!photo1 && !!photo2) : !!photo1;
  };

  const handleSubmit = async () => {
    if (!isFormValid()) return;
    
    try {
      setUploadStatus({ state: 'uploading', step: 'Подготовка...', progress: 0 });
      
      let urlGen = "", urlSeal = "", urlEmpty = "";
      
      if (!isLocalManual) {
        const totalPhotos = isStart ? 2 : 1;
        let uploadedPhotos = 0;
        
        // Загрузка фото 1
        if (photo1) {
          setUploadStatus({ 
            state: 'uploading', 
            step: isStart ? 'Загрузка общего фото...' : 'Загрузка фото пустого...',
            progress: 10 
          });
          
          urlGen = await api.uploadPhoto(photo1.data, photo1.mime, photo1.name);
          
          if (!urlGen) {
            throw new Error('Не удалось загрузить фото 1. Проверьте интернет.');
          }
          
          uploadedPhotos++;
          setUploadStatus({ 
            state: 'uploading', 
            step: `Фото ${uploadedPhotos}/${totalPhotos} загружено`,
            progress: (uploadedPhotos / totalPhotos) * 60 
          });
        }
        
        // Загрузка фото 2 (только для start)
        if (isStart && photo2) {
          setUploadStatus({ 
            state: 'uploading', 
            step: 'Загрузка фото пломбы...',
            progress: 40 
          });
          
          urlSeal = await api.uploadPhoto(photo2.data, photo2.mime, photo2.name);
          
          if (!urlSeal) {
            throw new Error('Не удалось загрузить фото 2. Проверьте интернет.');
          }
          
          uploadedPhotos++;
          setUploadStatus({ 
            state: 'uploading', 
            step: `Фото ${uploadedPhotos}/${totalPhotos} загружено`,
            progress: 70 
          });
        }
        
        if (!isStart && photo1) { 
          urlEmpty = urlGen; 
          urlGen = ""; 
        }
      }

      // Сохранение данных
      setUploadStatus({ 
        state: 'uploading', 
        step: 'Сохранение данных...',
        progress: 80 
      });

      const actionTypeToSend = isLocalManual 
        ? `${action.type}_manual_${manualTime}` 
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

      setUploadStatus({ 
        state: 'uploading', 
        step: 'Готово!',
        progress: 100 
      });

      // Показать успех на 1 секунду
      setTimeout(() => {
        setUploadStatus({ state: 'success' });
        setTimeout(() => {
          onSuccess();
        }, 800);
      }, 500);
      
    } catch (error) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Неизвестная ошибка. Попробуйте снова.';
      
      setUploadStatus({ 
        state: 'error', 
        message: errorMessage 
      });
      
      console.error('Submit error:', error);
    }
  };

  const resetError = () => {
    setUploadStatus({ state: 'idle' });
  };

  const isSubmitting = uploadStatus.state === 'uploading';
  const isSuccess = uploadStatus.state === 'success';
  const isError = uploadStatus.state === 'error';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#0F0F12] border border-white/10 p-8 rounded-3xl w-full max-w-[480px] flex flex-col gap-6 shadow-2xl relative">
        
        {/* Overlay при загрузке */}
        {(isSubmitting || isSuccess) && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm rounded-3xl z-10 flex flex-col items-center justify-center gap-4 p-8">
            {isSubmitting && uploadStatus.state === 'uploading' && (
              <>
                {/* Анимированный индикатор */}
                <div className="relative w-32 h-32">
                  {/* Круговой прогресс */}
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                    <circle 
                      cx="60" 
                      cy="60" 
                      r="54" 
                      fill="none" 
                      stroke="rgba(255,255,255,0.1)" 
                      strokeWidth="8"
                    />
                    <circle 
                      cx="60" 
                      cy="60" 
                      r="54" 
                      fill="none" 
                      stroke="#00d4ff" 
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 54}`}
                      strokeDashoffset={`${2 * Math.PI * 54 * (1 - uploadStatus.progress / 100)}`}
                      className="transition-all duration-500"
                    />
                  </svg>
                  
                  {/* Иконка в центре */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Upload className="w-10 h-10 text-[#00d4ff] animate-bounce" />
                  </div>
                </div>

                {/* Процент */}
                <div className="text-5xl font-black text-white tabular-nums">
                  {Math.round(uploadStatus.progress)}%
                </div>

                {/* Статус */}
                <div className="text-center">
                  <div className="text-lg font-bold text-white/90 mb-1">
                    {uploadStatus.step}
                  </div>
                  <div className="text-xs text-white/40 uppercase tracking-widest">
                    Пожалуйста, ожидайте...
                  </div>
                </div>

                {/* Прогресс-бар */}
                <div className="w-full max-w-[300px] h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500 rounded-full"
                    style={{ width: `${uploadStatus.progress}%` }}
                  />
                </div>
              </>
            )}

            {isSuccess && (
              <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-300">
                <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center">
                  <CheckCircle className="w-16 h-16 text-green-500 animate-in zoom-in duration-300" strokeWidth={2.5} />
                </div>
                <div className="text-3xl font-black text-white">Успешно!</div>
                <div className="text-sm text-white/60">Данные сохранены</div>
              </div>
            )}
          </div>
        )}

        {/* Ошибка */}
        {isError && (
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm rounded-3xl z-10 flex flex-col items-center justify-center gap-4 p-8">
            <div className="w-24 h-24 rounded-full bg-red-500/20 flex items-center justify-center animate-in zoom-in duration-300">
              <AlertCircle className="w-16 h-16 text-red-500" strokeWidth={2.5} />
            </div>
            <div className="text-2xl font-black text-white text-center">Ошибка!</div>
            <div className="text-sm text-white/80 text-center max-w-[300px]">
              {uploadStatus.state === 'error' && uploadStatus.message}
            </div>
            <button 
              onClick={resetError}
              className="mt-4 px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all"
            >
              Попробовать снова
            </button>
          </div>
        )}

        {/* Основной контент */}
        <div className="text-center">
          <h2 className="text-2xl font-extrabold text-white mb-1 leading-tight tracking-tight">{action.id}</h2>
          <button 
            onClick={() => setIsLocalManual(!isLocalManual)}
            disabled={isSubmitting}
            className={`mt-4 mx-auto flex items-center gap-2 px-5 py-2.5 rounded-full border transition-all duration-300 ${
              isLocalManual ? 'bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/20' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
            } disabled:opacity-50`}
          >
            <Truck size={16} />
            <span className="text-[11px] font-black uppercase tracking-[0.1em]">
              {isLocalManual ? "Локальный режим: ВКЛ" : "Обычный (Фото) / Переключить"}
            </span>
          </button>
        </div>

        {isStart && (
          <div className="animate-in slide-in-from-top-2">
            <p className="text-[10px] font-black text-white/30 mb-3 uppercase tracking-[0.2em] text-center">Выбор зоны выгрузки</p>
            <div className="grid grid-cols-3 gap-2">
              {AVAILABLE_ZONES.map(z => (
                <button 
                  key={z} 
                  onClick={() => setZone(z)}
                  disabled={isSubmitting}
                  className={`py-4 rounded-xl font-bold text-sm border transition-all ${
                    zone === z 
                    ? (isLocalManual ? 'bg-orange-500 border-orange-400 text-white' : 'bg-blue-600 border-blue-500 text-white') 
                    : 'bg-white/5 text-white/40 border-transparent hover:bg-white/10'
                  } disabled:opacity-50`}
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
              disabled={isSubmitting}
              className="bg-transparent text-white text-5xl font-mono text-center outline-none [color-scheme:dark] disabled:opacity-50" 
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div 
              onClick={() => !isSubmitting && triggerFile(1)} 
              className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center gap-2 transition-all ${
                photo1 ? 'border-green-500 bg-green-500/5' : 'border-white/10 hover:border-blue-500'
              } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {photo1 ? <CheckCircle className="text-green-500 w-8 h-8" /> : <Camera className="text-white/20 w-8 h-8" />}
              <span className="font-bold text-white/60 text-xs uppercase text-center leading-tight">
                {isStart ? t.lbl_photo1 : t.lbl_photo_empty}
              </span>
            </div>
            {isStart && (
              <div 
                onClick={() => !isSubmitting && triggerFile(2)} 
                className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center gap-2 transition-all ${
                  photo2 ? 'border-green-500 bg-green-500/5' : 'border-white/10 hover:border-blue-500'
                } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {photo2 ? <CheckCircle className="text-green-500 w-8 h-8" /> : <Lock className="text-white/20 w-8 h-8" />}
                <span className="font-bold text-white/60 text-xs uppercase">{t.lbl_photo2}</span>
              </div>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              hidden 
              accept="image/*" 
              onChange={handleFileChange}
              disabled={isSubmitting}
            />
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button 
            onClick={handleSubmit} 
            disabled={isSubmitting || !isFormValid()} 
            className={`w-full py-5 font-black text-sm rounded-2xl transition-all ${
              isLocalManual ? 'bg-orange-600 hover:bg-orange-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
            } disabled:opacity-20 uppercase tracking-widest shadow-xl active:scale-95 flex items-center justify-center gap-2`}
          >
            {isSubmitting && <Loader2 className="w-5 h-5 animate-spin" />}
            {isSubmitting ? "Загрузка..." : "Подтвердить"}
          </button>
          <button 
            onClick={onClose} 
            disabled={isSubmitting}
            className="text-white/20 hover:text-white py-2 text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActionModal;