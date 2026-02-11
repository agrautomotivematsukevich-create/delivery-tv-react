import React, { useState, useRef } from 'react';
import { api } from '../services/api';
import { TranslationSet, TaskAction, User } from '../types';

interface ActionModalProps {
  action: TaskAction;
  user: User;
  t: TranslationSet;
  onClose: () => void;
  onSuccess: () => void;
}

const ActionModal: React.FC<ActionModalProps> = ({ action, user, t, onClose, onSuccess }) => {
  const [confirm, setConfirm] = useState(true);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStuck, setUploadStuck] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<{data: string, mime: string, name: string} | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const reader = new FileReader();
    reader.onload = () => {
      photoRef.current = {
        data: reader.result as string,
        mime: 'image/jpeg',
        name: `${action.id}.jpg`
      };
    };
    reader.readAsDataURL(e.target.files[0]);
  };

  const handleSubmit = async () => {
    if (!photoRef.current) return;

    setSubmitting(true);
    const timer = setTimeout(() => setUploadStuck(true), 60000);

    const url = await api.uploadPhoto(
      photoRef.current.data,
      photoRef.current.mime,
      photoRef.current.name,
      setUploadProgress
    );

    clearTimeout(timer);

    await api.taskAction(action.id, action.type, user.name, '', url);

    setSubmitting(false);
    onSuccess();
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center">
      <div className="bg-[#0F0F12] p-8 rounded-3xl w-full max-w-[480px] text-center">

        {confirm ? (
          <>
            <div className="text-2xl font-bold text-white">{action.id}</div>
            <button onClick={() => setConfirm(false)} className="mt-6 bg-blue-600 px-6 py-3 rounded-xl">
              Подтвердить действие
            </button>
          </>
        ) : (
          <>
            <input type="file" ref={fileInputRef} hidden accept="image/*" capture="environment" onChange={handleFile}/>
            <button onClick={() => fileInputRef.current?.click()} className="border p-6 rounded-xl w-full">
              Сделать фото
            </button>

            {submitting && (
              <div className="mt-4">
                <div className="h-2 bg-white/10 rounded">
                  <div className="h-full bg-blue-500" style={{width: `${uploadProgress}%`}} />
                </div>
                <div className="text-xs text-white/50 mt-2">Загрузка {uploadProgress}%</div>
                {uploadStuck && (
                  <button onClick={() => window.location.reload()} className="text-red-400 mt-2 underline text-xs">
                    Зависло — обновить
                  </button>
                )}
              </div>
            )}

            <button onClick={handleSubmit} className="mt-6 bg-green-600 px-6 py-3 rounded-xl w-full">
              Отправить
            </button>
          </>
        )}

        <button onClick={onClose} className="mt-4 text-white/30">Отмена</button>
      </div>
    </div>
  );
};

export default ActionModal;
