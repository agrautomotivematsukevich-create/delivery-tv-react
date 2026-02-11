import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import { TranslationSet, TaskAction, User } from '../types';
import { Camera, Lock, Clock, Truck, RefreshCw, AlertTriangle } from 'lucide-react';

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
  const [error, setError] = useState<string | null>(null);
  const [isLocalManual, setIsLocalManual] = useState(false);
  const [manualTime, setManualTime] = useState(
    new Date().toLocaleTimeString('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    }).slice(0, 5)
  );
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentPhotoTarget = useRef<1 | 2>(1);
  const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isStart = action.type === 'start';
  const AVAILABLE_ZONES = ['G4', 'G5', 'G7', 'G8', 'G9', 'P70'];

  // Очистка таймера при размонтировании
  useEffect(() => {
    return () => {
      if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current);
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
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        let width = img.width, height = img.height;
        const maxWidth = 1600, maxHeight = 1200;
        if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth; }
        if (height > maxHeight) { width = (width * maxHeight) / height; height = maxHeight; }
        
        canvas.width = width; canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        const suffix = isStart 
          ? (currentPhotoTarget.current === 1 ? "_General" : "_Seal") 
          : "_Empty";
        const photoData = { 
          data: canvas.toDataURL('image/jpeg', 0.8), 
          mime: 'image/jpeg', 
          name: `${action.id}${suffix}.jpg` 
        };
        
        if (currentPhotoTarget.current === 1) setPhoto1(photoData);
        else setPhoto2(photoData);
        setError(null);
      };
      img.src = evt.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const isFormValid = () => {
    if (isStart && !zone) return false;
    if (isLocalManual) return true;
    return isStart ? (!!photo1 && !!photo2) : !!photo1;
  };

  const handleSubmit = async () => {
    if (!isFormValid()) return;
    
    setSubmitting(true);
    setError(null);
    
    // Таймаут 60 секунд на всю операцию
    submitTimeoutRef.current = setTimeout(() => {
      setSubmitting(false);
      setError('Превышено время ожидания. Попробуйте снова.');
    }, 60000);
    
    let urlGen = "", urlSeal = "", urlEmpty = "";
    
    try {
      if (!isLocalManual) {
        // Загружаем фото через JSON (без CORS)
        if (photo1) {
          urlGen = await api.uploadPhoto(photo1.data, photo1.mime, photo1.name);
        }
        if (photo2) {
          urlSeal = await api.uploadPhoto(photo2.data, photo2.mime, photo2.name);
        }
        if (!isStart && photo1) {
          urlEmpty = urlGen;
          urlGen = "";
        }
      }
      
      // Очищаем таймаут после успеха
      if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current);
      
      const actionType = isLocalManual 
        ? `${action.type}_manual_${manualTime.replace(':', '')}` 
        : action.type;
      
      await api.taskAction(
        action.id,
        actionType,
        user.name,
        zone || "",
        urlGen,
        urlSeal,
        urlEmpty
      );
      
      setSubmitting(false);
      onSuccess();
    } catch (err) {
      console.error('Action error:', err);
      if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current);
      setSubmitting(false);
      setError('Ошибка при отправке. Проверьте соединение и попробуйте снова.');
    }
  };

  const handleRefresh = () => {
    if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current);
    onRefresh?.();
    onClose();
  };

  const resetPhoto = (target: 1 | 2) => {
    if (target === 1) setPhoto1(null);
    else setPhoto2(null);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#0F0F12] border border-white/10 p-8 rounded-3xl w-full max-w-[480px] flex flex-col gap-6 shadow-2xl">
        {/* Заголовок */}
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

        {/* Ошибка / Таймаут */}
        {error && (
          <div className="animate-in slide-in-from-top-2 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-400" />
                <span className="text-sm text-red-300">{error}</span>
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

        {/* Выбор зоны */}
        {isStart && (
          <div className="animate-in slide-in-from-top-2">
            <p className="text-[10px] font-black text-white/30 mb-3 uppercase tracking-[0.2em] text-center">Выбор зоны выгрузки</p>
            <div className="grid grid-cols-3 gap-2">
              {AVAILABLE_ZONES.map(z => (
                <button 
                  key={z} 
                  onClick={() => setZone(z)} 
                  disabled={submitting}
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

        {/* Ручной ввод времени */}
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
              disabled={submitting}
              className="bg-transparent text-white text-5xl font-mono text-center outline-none [color-scheme:dark] w-full disabled:opacity-50"
            />
            <div className="text-xs text-white/40 text-center">
              Формат: ЧЧ:ММ (24-часовой)
            </div>
          </div>
        ) : (
          /* Загрузка фото */
          <div className="space-y-3">
            <div 
              onClick={() => !submitting && triggerFile(1)} 
              className={`border-2 border-dashed rounded-2xl p-6 cursor-pointer flex flex-col items-center gap-2 transition-all relative group
                ${submitting ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                ${photo1 ? 'border-green-500 bg-green-500/5' : 'border-white/10 hover:border-blue-500'}
              `}
            >
              {photo1 ? (
                <>
                  <div className="absolute top-2 right-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); resetPhoto(1); }}
                      className="w-6 h-6 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center text-xs text-white"
                    >
                      ×
                    </button>
                  </div>
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden">
                    <img src={photo1.data} alt="Preview" className="w-full h-full object-cover" />
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
                onClick={() => !submitting && triggerFile(2)} 
                className={`border-2 border-dashed rounded-2xl p-6 cursor-pointer flex flex-col items-center gap-2 transition-all relative group
                  ${submitting ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                  ${photo2 ? 'border-green-500 bg-green-500/5' : 'border-white/10 hover:border-blue-500'}
                `}
              >
                {photo2 ? (
                  <>
                    <div className="absolute top-2 right-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); resetPhoto(2); }}
                        className="w-6 h-6 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center text-xs text-white"
                      >
                        ×
                      </button>
                    </div>
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden">
                      <img src={photo2.data} alt="Preview" className="w-full h-full object-cover" />
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
              disabled={submitting}
            />
          </div>
        )}

        {/* Кнопки */}
        <div className="flex flex-col gap-3">
          <button 
            onClick={handleSubmit} 
            disabled={submitting || !isFormValid()} 
            className={`w-full py-5 font-black text-sm rounded-2xl transition-all relative overflow-hidden group
              ${isLocalManual ? 'bg-orange-600 hover:bg-orange-500' : 'bg-blue-600 hover:bg-blue-500'}
              disabled:opacity-30 disabled:cursor-not-allowed text-white uppercase tracking-widest shadow-xl active:scale-95
            `}
          >
            {submitting ? (
              <div className="flex items-center justify-center gap-3">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Отправка...</span>
              </div>
            ) : (
              "Подтвердить"
            )}
          </button>
          <button 
            onClick={onClose} 
            disabled={submitting}
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