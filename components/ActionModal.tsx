import React, { useState, useRef } from 'react';
import { api } from '../services/api';
import { TranslationSet, TaskAction, User } from '../types';
import { Camera, Lock, CheckCircle, Clock, Truck, Upload, AlertCircle, Loader2, Image as ImageIcon } from 'lucide-react';
import { vibrate } from './OperatorTerminal';

interface ActionModalProps {
  action: TaskAction;
  user: User;
  t: TranslationSet;
  onClose: () => void;
  onSuccess: () => void;
}

type UploadStatus =
  | { state: 'idle' }
  | { state: 'uploading'; step: string; progress: number }
  | { state: 'success' }
  | { state: 'error'; message: string };

type PhotoData = { data: string; mime: string; name: string };

async function compressImage(file: File, maxW = 1200, quality = 0.72, suffix = ''): Promise<PhotoData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas error'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      canvas.width = 0;
      canvas.height = 0;
      resolve({
        data: dataUrl,
        mime: 'image/jpeg',
        name: suffix ? `${suffix}.jpg` : file.name,
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image load error'));
    };

    img.src = objectUrl;
  });
}

const ActionModal: React.FC<ActionModalProps> = ({ action, user, t, onClose, onSuccess }) => {
  const [zone, setZone]     = useState<string | null>(null);
  const [photo1, setPhoto1] = useState<PhotoData | null>(null);
  const [photo2, setPhoto2] = useState<PhotoData | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({ state: 'idle' });
  const [isLocalManual, setIsLocalManual] = useState(false);
  const [manualTime, setManualTime] = useState(
    new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  );
  const [showPhotoMenu, setShowPhotoMenu] = useState<{ target: 1 | 2 } | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const currentPhotoTarget = useRef<1 | 2>(1);

  const isStart = action.type === 'start';
  const AVAILABLE_ZONES = ['G4', 'G5', 'G7', 'G8', 'G9', 'P70'];

  const triggerFile = (target: 1 | 2) => {
    currentPhotoTarget.current = target;
    setShowPhotoMenu({ target });
  };

  const triggerGallery = () => {
    setShowPhotoMenu(null);
    setTimeout(() => fileInputRef.current?.click(), 50);
  };

  const triggerCamera = () => {
    setShowPhotoMenu(null);
    setTimeout(() => cameraInputRef.current?.click(), 50);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setProcessingPhoto(true);
    setUploadStatus({ state: 'idle' });

    try {
      const t1 = currentPhotoTarget.current;
      const suffix = isStart
        ? (t1 === 1 ? `${action.id}_General` : `${action.id}_Seal`)
        : `${action.id}_Empty`;
      const compressed = await compressImage(file, 1200, 0.72, suffix);
      if (t1 === 1) setPhoto1(compressed);
      else setPhoto2(compressed);
    } catch (error) {
      setUploadStatus({ state: 'error', message: 'Ошибка обработки фото. Попробуйте еще раз.' });
    } finally {
      setProcessingPhoto(false);
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
      if (!navigator.onLine) throw new Error('NETWORK_OFFLINE');
      setUploadStatus({ state: 'uploading', step: 'Отправка фото...', progress: 10 });
      let urlGen = '', urlSeal = '', urlEmpty = '';

      const actionType = isLocalManual ? `${action.type}_manual_${manualTime}` : action.type;
      const selectedZone = zone || '';

      if (!isLocalManual) {
        if (isStart) {
          setUploadStatus({ state: 'uploading', step: 'Загрузка фото 1 из 2...', progress: 30 });
          urlGen = photo1 ? await api.uploadPhoto(photo1.data, photo1.mime, photo1.name) : '';
          setUploadStatus({ state: 'uploading', step: 'Загрузка фото 2 из 2...', progress: 60 });
          urlSeal = photo2 ? await api.uploadPhoto(photo2.data, photo2.mime, photo2.name) : '';
        } else {
          setUploadStatus({ state: 'uploading', step: 'Загрузка фото...', progress: 40 });
          if (photo1) urlEmpty = await api.uploadPhoto(photo1.data, photo1.mime, photo1.name);
        }
      }

      setUploadStatus({ state: 'uploading', step: 'Сохранение...', progress: 85 });
      await api.taskAction(action.id, actionType, user.name, selectedZone, urlGen, urlSeal, urlEmpty);
      setUploadStatus({ state: 'uploading', step: 'Готово!', progress: 100 });
      setTimeout(() => {
        setUploadStatus({ state: 'success' });
        vibrate([100, 50, 100]);
        setTimeout(() => onSuccess(), 700);
      }, 400);
    } catch (error: any) {
      vibrate([200, 100, 200]);
      setUploadStatus({ state: 'error', message: 'Ошибка сети. Попробуйте снова через минуту.' });
    }
  };

  const isSubmitting = uploadStatus.state === 'uploading';
  const isSuccess    = uploadStatus.state === 'success';
  const isError      = uploadStatus.state === 'error';

  const PhotoPreview: React.FC<{ src: string | null; label: string; onTap: () => void; icon: React.ReactNode }> = ({ src, label, onTap, icon }) => (
    <div
      onClick={() => !isSubmitting && !processingPhoto && onTap()}
      className={`relative border-2 border-dashed rounded-2xl overflow-hidden transition-all cursor-pointer group ${
        src ? 'border-emerald-500 bg-black' : 'border-white/10 hover:border-accent-blue bg-white/3'
      } ${(isSubmitting || processingPhoto) ? 'opacity-50 cursor-not-allowed' : ''}`}
      style={{ aspectRatio: '4/3' }}
    >
      {src ? (
        <>
          <img src={src} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <CheckCircle className="text-emerald-400 w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
          </div>
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent py-2 px-3 text-center">
            <span className="text-[10px] font-black text-white/80 uppercase tracking-widest">{label}</span>
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3">
          {processingPhoto && currentPhotoTarget.current === (label.includes('пломб') ? 2 : 1)
            ? <Loader2 className="w-7 h-7 text-accent-blue animate-spin" />
            : icon}
          <span className="font-black text-white/60 text-[10px] uppercase text-center leading-tight tracking-widest">{label}</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="bg-[#0F0F12] border border-white/10 p-6 rounded-3xl w-full max-w-[480px] flex flex-col gap-5 relative max-h-[95vh] overflow-y-auto shadow-2xl">
        
        {(isSubmitting || isSuccess) && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm rounded-3xl z-10 flex flex-col items-center justify-center gap-4 p-8">
            {isSubmitting && uploadStatus.state === 'uploading' && (
              <>
                <div className="relative w-28 h-28">
                   <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
                    <circle cx="60" cy="60" r="54" fill="none" stroke="#00d4ff" strokeWidth="8"
                      strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 54}`}
                      strokeDashoffset={`${2 * Math.PI * 54 * (1 - uploadStatus.progress / 100)}`}
                      className="transition-all duration-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Upload className="w-9 h-9 text-[#00d4ff] animate-bounce" />
                  </div>
                </div>
                <div className="text-4xl font-black text-white">{Math.round(uploadStatus.progress)}%</div>
                <div className="text-sm font-bold text-white/80 text-center">{uploadStatus.step}</div>
              </>
            )}
            {isSuccess && (
              <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-300">
                <div className="w-24 h-24 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle className="w-16 h-16 text-emerald-500" />
                </div>
                <div className="text-3xl font-black text-white uppercase">Успешно!</div>
              </div>
            )}
          </div>
        )}

        {isError && (
          <div className="absolute inset-0 bg-black/95 backdrop-blur-md rounded-3xl z-10 flex flex-col items-center justify-center gap-5 p-8 border-2 border-red-500/30">
            <AlertCircle className="w-16 h-16 text-red-500" />
            <div className="text-xl font-black text-white uppercase text-center">{uploadStatus.state === 'error' && uploadStatus.message}</div>
            <button onClick={() => setUploadStatus({ state: 'idle' })} className="w-full py-4 bg-red-600 text-white font-black uppercase rounded-2xl">Попробовать снова</button>
          </div>
        )}

        <div className="text-center">
          <div className="text-[10px] text-white/50 uppercase tracking-[0.2em] mb-1">{isStart ? 'Начало разгрузки' : 'Завершение разгрузки'}</div>
          <h2 className="text-2xl font-black text-white font-mono">{action.id}</h2>
          <button onClick={() => setIsLocalManual(!isLocalManual)} className={`mt-3 mx-auto flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${isLocalManual ? 'bg-orange-500 text-white' : 'bg-white/5 text-white/40 border-white/10'}`}>
            <Truck size={14} /> <span className="text-[9px] font-black uppercase tracking-wider">{isLocalManual ? 'Локальный режим: ВКЛ' : 'Режим без фото'}</span>
          </button>
        </div>

        {isStart && (
          <div>
            <div className="grid grid-cols-3 gap-2">
              {AVAILABLE_ZONES.map(z => (
                <button key={z} onClick={() => setZone(z)} className={`py-3 rounded-xl font-black text-xs border transition-all ${zone === z ? 'bg-[#1E7D7D] text-white' : 'bg-white/5 text-white/40 border-transparent'}`}>{z}</button>
              ))}
            </div>
          </div>
        )}

        {isLocalManual ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col items-center">
            <input type="time" value={manualTime} onChange={e => setManualTime(e.target.value)} className="bg-transparent text-white text-5xl font-mono text-center outline-none" />
          </div>
        ) : (
          <div className={`grid gap-3 ${isStart ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <PhotoPreview src={photo1?.data ?? null} label={isStart ? 'Общее фото' : 'Фото пустого'} onTap={() => triggerFile(1)} icon={<Camera className="text-white/40 w-7 h-7" />} />
            {isStart && <PhotoPreview src={photo2?.data ?? null} label="Фото пломбы" onTap={() => triggerFile(2)} icon={<Lock className="text-white/40 w-7 h-7" />} />}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button onClick={handleSubmit} disabled={isSubmitting || processingPhoto || !isFormValid()} className={`w-full py-5 font-black text-sm rounded-2xl uppercase ${isLocalManual ? 'bg-orange-600' : 'bg-[#1E7D7D]'} text-white disabled:opacity-20`}>
            {isSubmitting ? 'Загрузка...' : 'Подтвердить'}
          </button>
          <button onClick={onClose} className="text-white/30 py-2 text-[9px] font-black uppercase">Отмена</button>
        </div>

        <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={handleFileChange} />
        <input type="file" ref={cameraInputRef} hidden accept="image/*" capture="environment" onChange={handleFileChange} />
      </div>

      {showPhotoMenu && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4" onClick={() => setShowPhotoMenu(null)}>
          <div className="w-full max-w-sm bg-[#1A1A1F] rounded-t-3xl overflow-hidden p-4 flex flex-col gap-2" onClick={e => e.stopPropagation()}>
             <button onClick={triggerCamera} className="w-full flex items-center gap-4 p-5 text-white bg-white/5 rounded-2xl"><Camera className="w-5 h-5" /> <span className="font-bold">Камера</span></button>
             <button onClick={triggerGallery} className="w-full flex items-center gap-4 p-5 text-white bg-white/5 rounded-2xl"><Upload className="w-5 h-5" /> <span className="font-bold">Галерея</span></button>
             <button onClick={() => setShowPhotoMenu(null)} className="w-full py-4 text-white/40 font-bold uppercase text-xs">Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActionModal;
