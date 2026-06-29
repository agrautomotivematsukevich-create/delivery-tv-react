import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, CheckCircle, Clock, Image as ImageIcon, Loader2, Lock, Truck, Upload, WifiOff } from 'lucide-react';
import { api } from '../services/api';
import { offlineQueue } from '../services/offlineQueue';
import { TaskAction, TaskActionResult, TranslationSet, User } from '../types';
import { useAppContext } from './AppContext';
import { vibrate } from '../utils/haptics';
import { AVAILABLE_ZONES } from '../utils/zones';
import { useEscape } from '../utils/useEscape';

interface ActionModalProps {
  action: TaskAction;
  user: User;
  t: TranslationSet;
  onClose: () => void;
  onSuccess: (result?: TaskActionResult) => void;
}

type UploadStatus =
  | { state: 'idle' }
  | { state: 'uploading'; step: string; progress: number }
  | { state: 'success' }
  | { state: 'queued' }
  | { state: 'error'; message: string };

type PhotoData = { data: string; mime: string; name: string };
const ActionModal: React.FC<ActionModalProps> = ({ action, user, t, onClose, onSuccess }) => {
  const { addToast } = useAppContext();
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
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const handleEscape = useCallback(() => {
    if (uploadStatus.state === 'idle' || uploadStatus.state === 'error') onClose();
  }, [onClose, uploadStatus.state]);

  useEscape(handleEscape);

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const currentPhotoTarget = useRef<1 | 2>(1);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(new URL('../utils/ImageWorker.ts', import.meta.url), { type: 'module' });
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const isStart = action.type === 'start';

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

    const t1 = currentPhotoTarget.current;
    const suffix = isStart
      ? (t1 === 1 ? `${action.id}_General` : `${action.id}_Seal`)
      : `${action.id}_Empty`;

    if (!workerRef.current) {
      setProcessingPhoto(false);
      return;
    }

    const onMessage = (event: MessageEvent) => {
      workerRef.current?.removeEventListener('message', onMessage);
      setProcessingPhoto(false);
      const data = event.data;
      if (data.success) {
        const compressed: PhotoData = { data: data.data, mime: data.mime, name: data.name };
        if (t1 === 1) setPhoto1(compressed);
        else setPhoto2(compressed);
      } else {
        setUploadStatus({ state: 'error', message: 'Ошибка обработки фото. Попробуйте еще раз.' });
      }
    };

    workerRef.current.addEventListener('message', onMessage);
    workerRef.current.postMessage({ file, maxW: 1200, quality: 0.72, suffix });
  };

  const isFormValid = () => {
    if (isStart && !zone) return false;
    if (isLocalManual) return true;
    return isStart ? (!!photo1 && !!photo2) : !!photo1;
  };

  const handleSubmit = async () => {
    if (!isFormValid()) return;
    const attemptedActionType = isLocalManual ? `${action.type}_manual_${manualTime}` : action.type;
    api.auditEvent(action.type === 'start' ? 'UNLOAD_START_CLICK' : 'UNLOAD_END_CLICK', {
      entityType: 'container',
      entityId: action.id,
      containerNo: action.id,
      sheetDate: action.sheetDate || '',
      details: {
        actionType: attemptedActionType,
        manual: isLocalManual,
        zone: zone || '',
        hasPhoto1: Boolean(photo1),
        hasPhoto2: Boolean(photo2),
      },
    }, `action-submit:${action.id}:${attemptedActionType}`, 2000);

    if (!isOnline) {
      if (!isLocalManual) {
        const message = 'Фото-режим требует сеть. Действие не сохранено: дождитесь Wi-Fi или включите режим без фото.';
        setUploadStatus({ state: 'error', message });
        addToast('Фото-режим требует сеть. Действие не сохранено.', 'info');
        return;
      }

      const actionType = attemptedActionType;
      const selectedZone = zone || '';
      await offlineQueue.enqueueTaskAction({ id: action.id, act: actionType, op: user.name, zone: selectedZone, date: action.sheetDate });
      setUploadStatus({ state: 'queued' });
      vibrate([100, 50, 100]);
      setTimeout(() => onSuccess('queued'), 1500);
      return;
    }

    try {
      setUploadStatus({ state: 'uploading', step: 'Отправка фото...', progress: 10 });
      let urlGen = '', urlSeal = '', urlEmpty = '';

      const actionType = attemptedActionType;
      const selectedZone = zone || '';

      if (!isLocalManual) {
        if (isStart) {
          // Upload both photos IN PARALLEL — each is a ~80KB POST that can take several
          // seconds; sequential awaits doubled the wait. task_action still runs after both
          // resolve (business requires both photos before start).
          setUploadStatus({ state: 'uploading', step: 'Загрузка фото...', progress: 40 });
          const [genUrl, sealUrl] = await Promise.all([
            photo1 ? api.uploadPhoto(photo1.data, photo1.mime, photo1.name, {
              containerId: action.id,
              photoType: 'container',
              sheetDate: action.sheetDate || '',
              actionType,
            }) : Promise.resolve(''),
            photo2 ? api.uploadPhoto(photo2.data, photo2.mime, photo2.name, {
              containerId: action.id,
              photoType: 'seal',
              sheetDate: action.sheetDate || '',
              actionType,
            }) : Promise.resolve(''),
          ]);
          urlGen = genUrl;
          urlSeal = sealUrl;
        } else {
          setUploadStatus({ state: 'uploading', step: 'Загрузка фото...', progress: 40 });
          if (photo1) urlEmpty = await api.uploadPhoto(photo1.data, photo1.mime, photo1.name, {
            containerId: action.id,
            photoType: 'unloaded',
            sheetDate: action.sheetDate || '',
            actionType,
          });
        }
      }

      setUploadStatus({ state: 'uploading', step: 'Сохранение...', progress: 85 });
      await api.taskAction(action.id, actionType, user.name, selectedZone, urlGen, urlSeal, urlEmpty, action.sheetDate || '');
      setUploadStatus({ state: 'uploading', step: 'Готово!', progress: 100 });
      setTimeout(() => {
        setUploadStatus({ state: 'success' });
        vibrate([100, 50, 100]);
        addToast('Задача успешно выполнена', 'success');
        setTimeout(() => onSuccess('completed'), 700);
      }, 400);
    } catch (error: unknown) {
      vibrate([200, 100, 200]);
      const msg = error instanceof Error ? error.message : 'Ошибка. Попробуйте снова или используйте оффлайн режим.';
      setUploadStatus({ state: 'error', message: msg });
      addToast('Произошла ошибка при выполнении', 'error');
    }
  };

  const isSubmitting = uploadStatus.state === 'uploading';
  const isSuccess    = uploadStatus.state === 'success';
  const isQueued     = uploadStatus.state === 'queued';
  const isError      = uploadStatus.state === 'error';
  const isOfflinePhotoBlocked = !isOnline && !isLocalManual;

  const PhotoPreview: React.FC<{ src: string | null; label: string; onTap: () => void; icon: React.ReactNode }> = ({ src, label, onTap, icon }) => (
    <div
      onClick={() => !isSubmitting && !processingPhoto && onTap()}
      role="button"
      tabIndex={isSubmitting || processingPhoto ? -1 : 0}
      aria-label={label}
      onKeyDown={(e) => {
        if (!isSubmitting && !processingPhoto && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onTap();
        }
      }}
      className={`relative border-2 border-dashed rounded-2xl overflow-hidden transition-all cursor-pointer group ${
        src ? 'border-emerald-500 bg-black' : 'border-white/10 hover:border-accent-blue bg-white/3'
      } ${(isSubmitting || processingPhoto) ? 'opacity-50 cursor-not-allowed' : ''}`}
      style={{ aspectRatio: '4/3' }}
    >
      {src ? (
        <>
          <img src={src} alt={label} className="w-full h-full object-cover" />
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
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/90 backdrop-blur-sm mobile-modal-frame">
      <div className="bg-[#0F0F12] border border-white/10 p-4 sm:p-6 rounded-t-3xl sm:rounded-3xl w-full max-w-[480px] flex flex-col gap-4 sm:gap-5 relative max-h-[calc(100dvh-1.5rem)] sm:max-h-[95vh] overflow-y-auto shadow-2xl">
        
        {(isSubmitting || isSuccess || isQueued) && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm rounded-t-3xl sm:rounded-3xl z-10 flex flex-col items-center justify-center gap-4 p-6 sm:p-8">
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
            {isQueued && (
              <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-300">
                <div className="w-24 h-24 rounded-full bg-orange-500/20 flex items-center justify-center">
                  <WifiOff className="w-16 h-16 text-orange-400" />
                </div>
                <div className="text-2xl font-black text-white uppercase text-center">В очереди</div>
                <div className="text-xs text-white/50 text-center">Отправится автоматически при появлении сети</div>
              </div>
            )}
          </div>
        )}

        {isError && (
          <div className="absolute inset-0 bg-black/95 backdrop-blur-md rounded-t-3xl sm:rounded-3xl z-10 flex flex-col items-center justify-center gap-5 p-6 sm:p-8 border-2 border-red-500/30">
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

        {!isOnline && (
          <div className={`rounded-2xl border px-4 py-3 flex items-start gap-3 text-xs font-bold leading-snug ${
            isLocalManual
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-100'
              : 'bg-red-500/10 border-red-500/30 text-red-100'
          }`}>
            <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {isLocalManual
                ? 'Действие без фото сохранится локально и отправится при появлении сети.'
                : 'Фото-режим требует сеть. Дождитесь Wi-Fi или включите режим без фото.'}
            </span>
          </div>
        )}

        {isStart && (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {AVAILABLE_ZONES.map(z => (
                <button key={z} onClick={() => setZone(z)} className={`min-h-11 py-3 rounded-xl font-black text-xs border transition-all ${zone === z ? 'bg-[#1E7D7D] text-white' : 'bg-white/5 text-white/40 border-transparent'}`}>{z}</button>
              ))}
            </div>
          </div>
        )}

        {isLocalManual ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-6 flex flex-col items-center">
            <input type="time" value={manualTime} onChange={e => setManualTime(e.target.value)} aria-label="Время действия" className="bg-transparent text-white text-4xl sm:text-5xl font-mono text-center outline-none" />
          </div>
        ) : (
          <div className={`grid gap-3 ${isStart ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <PhotoPreview src={photo1?.data ?? null} label={isStart ? 'Общее фото' : 'Фото пустого'} onTap={() => triggerFile(1)} icon={<Camera className="text-white/40 w-7 h-7" />} />
            {isStart && <PhotoPreview src={photo2?.data ?? null} label="Фото пломбы" onTap={() => triggerFile(2)} icon={<Lock className="text-white/40 w-7 h-7" />} />}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button onClick={handleSubmit} disabled={isSubmitting || processingPhoto || isOfflinePhotoBlocked || !isFormValid()} className={`w-full py-5 font-black text-sm rounded-2xl uppercase ${isLocalManual ? 'bg-orange-600' : 'bg-[#1E7D7D]'} text-white disabled:opacity-20`}>
            {isSubmitting ? 'Загрузка...' : 'Подтвердить'}
          </button>
          <button onClick={onClose} className="text-white/30 py-3 text-[9px] font-black uppercase">Отмена</button>
        </div>

        <input type="file" ref={fileInputRef} hidden accept="image/*" aria-label="Выбрать фото из галереи" onChange={handleFileChange} />
        <input type="file" ref={cameraInputRef} hidden accept="image/*" capture="environment" aria-label="Сделать фото камерой" onChange={handleFileChange} />
      </div>

      {showPhotoMenu && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 mobile-modal-frame" onClick={() => setShowPhotoMenu(null)}>
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
