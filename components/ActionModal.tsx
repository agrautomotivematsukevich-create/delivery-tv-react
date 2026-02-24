import React, { useState, useRef } from 'react';
import { api } from '../services/api';
import { TranslationSet, TaskAction, User } from '../types';
import { Camera, Lock, CheckCircle, Clock, Truck, Upload, AlertCircle, Loader2, Image as ImageIcon } from 'lucide-react';

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

// ── Вспомогательная функция: сжатие фото ──────────────────────────────────────
// maxW=1200 и quality=0.72 — быстрее и достаточно для архива
async function compressImage(file: File, maxW = 1200, quality = 0.72, suffix = ''): Promise<PhotoData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = evt => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas error'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({
          data: canvas.toDataURL('image/jpeg', quality),
          mime: 'image/jpeg',
          name: suffix ? `${suffix}.jpg` : file.name,
        });
      };
      img.onerror = () => reject(new Error('Image load error'));
      if (evt.target?.result) img.src = evt.target.result as string;
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsDataURL(file);
  });
}
// ─────────────────────────────────────────────────────────────────────────────

const ActionModal: React.FC<ActionModalProps> = ({ action, user, t, onClose, onSuccess }) => {
  const [zone, setZone]     = useState<string | null>(null);
  const [photo1, setPhoto1] = useState<PhotoData | null>(null); // General / Empty
  const [photo2, setPhoto2] = useState<PhotoData | null>(null); // Seal (только start)
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

  // Превью пломбы при финише (если передали)
  const sealPhotoUrl: string | undefined = (action as any).sealPhotoUrl;

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
    // Сбрасываем input чтобы повторный выбор того же файла работал
    e.target.value = '';
    setProcessingPhoto(true);
    try {
      const t1 = currentPhotoTarget.current;
      const suffix = isStart
        ? (t1 === 1 ? `${action.id}_General` : `${action.id}_Seal`)
        : `${action.id}_Empty`;
      const compressed = await compressImage(file, 1200, 0.72, suffix);
      if (t1 === 1) setPhoto1(compressed);
      else setPhoto2(compressed);
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
      setUploadStatus({ state: 'uploading', step: 'Подготовка...', progress: 5 });
      let urlGen = '', urlSeal = '', urlEmpty = '';

      if (!isLocalManual) {
        if (isStart) {
          // ── Параллельная загрузка обоих фото ──
          setUploadStatus({ state: 'uploading', step: 'Загрузка фото...', progress: 15 });
          const [r1, r2] = await Promise.all([
            photo1 ? api.uploadPhoto(photo1.data, photo1.mime, photo1.name) : Promise.resolve(''),
            photo2 ? api.uploadPhoto(photo2.data, photo2.mime, photo2.name) : Promise.resolve(''),
          ]);
          if (photo1 && !r1) throw new Error('Не удалось загрузить фото 1. Проверьте интернет.');
          if (photo2 && !r2) throw new Error('Не удалось загрузить фото 2. Проверьте интернет.');
          urlGen  = r1;
          urlSeal = r2;
        } else {
          // Финиш — одно фото
          setUploadStatus({ state: 'uploading', step: 'Загрузка фото...', progress: 20 });
          if (photo1) {
            urlEmpty = await api.uploadPhoto(photo1.data, photo1.mime, photo1.name);
            if (!urlEmpty) throw new Error('Не удалось загрузить фото. Проверьте интернет.');
          }
        }
      }

      setUploadStatus({ state: 'uploading', step: 'Сохранение...', progress: 85 });

      const actionType = isLocalManual
        ? `${action.type}_manual_${manualTime}`
        : action.type;

      await api.taskAction(action.id, actionType, user.name, zone || '', urlGen, urlSeal, urlEmpty);

      setUploadStatus({ state: 'uploading', step: 'Готово!', progress: 100 });
      setTimeout(() => {
        setUploadStatus({ state: 'success' });
        setTimeout(onSuccess, 700);
      }, 400);

    } catch (error) {
      setUploadStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Неизвестная ошибка. Попробуйте снова.',
      });
    }
  };

  const isSubmitting = uploadStatus.state === 'uploading';
  const isSuccess    = uploadStatus.state === 'success';
  const isError      = uploadStatus.state === 'error';

  // ─── Превью миниатюры из base64 или URL ──────────────────────────────────────
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
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent py-2 px-3">
            <span className="text-xs font-bold text-white/80 uppercase tracking-wide">{label}</span>
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3">
          {processingPhoto && currentPhotoTarget.current === (label.includes('пломб') ? 2 : 1)
            ? <Loader2 className="w-7 h-7 text-accent-blue animate-spin" />
            : icon}
          <span className="font-bold text-white/40 text-xs uppercase text-center leading-tight">{label}</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#0F0F12] border border-white/10 p-6 rounded-3xl w-full max-w-[480px] flex flex-col gap-5 shadow-2xl relative max-h-[95vh] overflow-y-auto">

        {/* Overlay загрузки / успех */}
        {(isSubmitting || isSuccess) && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm rounded-3xl z-10 flex flex-col items-center justify-center gap-4 p-8">
            {isSubmitting && uploadStatus.state === 'uploading' && (
              <>
                <div className="relative w-28 h-28">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
                    <circle cx="60" cy="60" r="54" fill="none" stroke="#00d4ff" strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 54}`}
                      strokeDashoffset={`${2 * Math.PI * 54 * (1 - uploadStatus.progress / 100)}`}
                      className="transition-all duration-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Upload className="w-9 h-9 text-[#00d4ff] animate-bounce" />
                  </div>
                </div>
                <div className="text-4xl font-black text-white tabular-nums">{Math.round(uploadStatus.progress)}%</div>
                <div className="text-sm font-bold text-white/80">{uploadStatus.step}</div>
                <div className="w-full max-w-[260px] h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500 rounded-full"
                    style={{ width: `${uploadStatus.progress}%` }} />
                </div>
              </>
            )}
            {isSuccess && (
              <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-300">
                <div className="w-24 h-24 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle className="w-16 h-16 text-emerald-500" strokeWidth={2.5} />
                </div>
                <div className="text-3xl font-black text-white">Успешно!</div>
              </div>
            )}
          </div>
        )}

        {/* Ошибка */}
        {isError && (
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm rounded-3xl z-10 flex flex-col items-center justify-center gap-4 p-8">
            <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center animate-in zoom-in">
              <AlertCircle className="w-14 h-14 text-red-500" strokeWidth={2.5} />
            </div>
            <div className="text-xl font-black text-white text-center">Ошибка!</div>
            <div className="text-sm text-white/70 text-center max-w-[280px]">
              {uploadStatus.state === 'error' && uploadStatus.message}
            </div>
            <button onClick={() => setUploadStatus({ state: 'idle' })}
              className="mt-2 px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all">
              Попробовать снова
            </button>
          </div>
        )}

        {/* Заголовок + ID */}
        <div className="text-center">
          <div className="text-xs text-white/30 uppercase tracking-widest mb-1">
            {isStart ? 'Начало разгрузки' : 'Завершение разгрузки'}
          </div>
          <h2 className="text-2xl font-extrabold text-white font-mono tracking-tight">{action.id}</h2>

          <button
            onClick={() => setIsLocalManual(!isLocalManual)}
            disabled={isSubmitting}
            className={`mt-3 mx-auto flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-300 ${
              isLocalManual
                ? 'bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/20'
                : 'bg-white/5 border-white/10 text-white/40 hover:text-white'
            } disabled:opacity-50`}
          >
            <Truck size={14} />
            <span className="text-[10px] font-black uppercase tracking-[0.1em]">
              {isLocalManual ? 'Локальный режим: ВКЛ' : 'Режим без фото'}
            </span>
          </button>
        </div>

        {/* Выбор зоны */}
        {isStart && (
          <div>
            <p className="text-[10px] font-black text-white/30 mb-2 uppercase tracking-[0.2em] text-center">Зона выгрузки</p>
            <div className="grid grid-cols-3 gap-2">
              {AVAILABLE_ZONES.map(z => (
                <button key={z} onClick={() => setZone(z)} disabled={isSubmitting}
                  className={`py-3.5 rounded-xl font-bold text-sm border transition-all ${
                    zone === z
                      ? (isLocalManual ? 'bg-orange-500 border-orange-400 text-white' : 'bg-blue-600 border-blue-500 text-white')
                      : 'bg-white/5 text-white/40 border-transparent hover:bg-white/10'
                  } disabled:opacity-50`}>
                  {z}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Превью пломбы при финише */}
        {!isStart && sealPhotoUrl && (
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-black">
            <div className="px-4 py-2 bg-white/5 border-b border-white/5 flex items-center gap-2">
              <ImageIcon size={13} className="text-white/40" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Фото пломбы</span>
            </div>
            <img
              src={sealPhotoUrl.replace('view?usp=drivesdk', 'view').replace(
                /https:\/\/drive\.google\.com\/file\/d\/([^/]+)\/.*/,
                (_, id) => `https://wsrv.nl/?url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${id}`)}&w=800`
              )}
              alt="Пломба"
              className="w-full max-h-48 object-cover"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}

        {/* Фото-блок */}
        {isLocalManual ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 text-orange-400">
              <Clock size={16} />
              <span className="font-bold uppercase text-[10px] tracking-widest">
                {isStart ? 'Время начала (Факт)' : 'Время завершения (Факт)'}
              </span>
            </div>
            <input type="time" value={manualTime} onChange={e => setManualTime(e.target.value)}
              disabled={isSubmitting}
              className="bg-transparent text-white text-5xl font-mono text-center outline-none [color-scheme:dark] disabled:opacity-50" />
          </div>
        ) : (
          <div className={`grid gap-3 ${isStart ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <PhotoPreview
              src={photo1?.data ?? null}
              label={isStart ? 'Общее фото (сзади)' : 'Фото пустого'}
              onTap={() => triggerFile(1)}
              icon={<Camera className="text-white/20 w-7 h-7" />}
            />
            {isStart && (
              <PhotoPreview
                src={photo2?.data ?? null}
                label="Фото пломбы"
                onTap={() => triggerFile(2)}
                icon={<Lock className="text-white/20 w-7 h-7" />}
              />
            )}
          </div>
        )}

        {/* Кнопки */}
        <div className="flex flex-col gap-2">
          <button onClick={handleSubmit}
            disabled={isSubmitting || processingPhoto || !isFormValid()}
            className={`w-full py-4 font-black text-sm rounded-2xl transition-all uppercase tracking-widest active:scale-95 flex items-center justify-center gap-2 ${
              isLocalManual ? 'bg-orange-600 hover:bg-orange-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
            } disabled:opacity-20`}>
            {(isSubmitting || processingPhoto) && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Загрузка...' : processingPhoto ? 'Обработка фото...' : 'Подтвердить'}
          </button>
          <button onClick={onClose} disabled={isSubmitting}
            className="text-white/20 hover:text-white py-2 text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50">
            Отмена
          </button>
        </div>

        {/* Hidden inputs */}
        <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={handleFileChange} disabled={isSubmitting} />
        <input type="file" ref={cameraInputRef} hidden accept="image/*" capture="environment" onChange={handleFileChange} disabled={isSubmitting} />
      </div>

      {/* Меню выбора источника фото */}
      {showPhotoMenu && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setShowPhotoMenu(null)}>
          <div className="w-full max-w-sm bg-[#1c1c1e] rounded-3xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
            onClick={e => e.stopPropagation()}>
            <div className="px-4 pt-4 pb-1 text-center">
              <p className="text-white/40 text-xs font-semibold uppercase tracking-widest">
                {showPhotoMenu.target === 2 ? 'Фото пломбы' : (isStart ? 'Общее фото' : 'Фото пустого')}
              </p>
            </div>
            <div className="flex flex-col divide-y divide-white/5">
              <button onClick={triggerCamera}
                className="flex items-center gap-4 px-6 py-4 text-white hover:bg-white/5 transition-colors active:bg-white/10">
                <Camera className="w-5 h-5 text-blue-400" />
                <span className="font-semibold">Камера</span>
              </button>
              <button onClick={triggerGallery}
                className="flex items-center gap-4 px-6 py-4 text-white hover:bg-white/5 transition-colors active:bg-white/10">
                <Upload className="w-5 h-5 text-blue-400" />
                <span className="font-semibold">Галерея</span>
              </button>
            </div>
            <div className="p-3 pt-1">
              <button onClick={() => setShowPhotoMenu(null)}
                className="w-full py-3.5 rounded-2xl bg-white/5 text-white/50 font-bold text-sm hover:bg-white/10 transition-colors">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActionModal;
