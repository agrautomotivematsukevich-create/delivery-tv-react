import React, { useState, useRef } from 'react';
import { X, Camera, Upload, AlertCircle, RefreshCw } from 'lucide-react';

interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (confirmed: boolean, photos?: File[]) => void;
  containerId: string;
  action: 'start' | 'finish';
  uploadProgress: number;
  showRefreshButton: boolean;
  onRefresh: () => void;
}

const ActionModal: React.FC<ActionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  containerId,
  action,
  uploadProgress,
  showRefreshButton,
  onRefresh
}) => {
  const [photos, setPhotos] = useState<File[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newPhotos = Array.from(e.target.files);
      setPhotos(prev => [...prev, ...newPhotos]);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
      setIsCapturing(true);
    } catch (error) {
      console.error('Camera error:', error);
      alert('Не удалось получить доступ к камере');
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `photo_${Date.now()}.jpg`, {
            type: 'image/jpeg'
          });
          setPhotos(prev => [...prev, file]);
        }
      }, 'image/jpeg', 0.8);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCapturing(false);
  };

  const handleConfirm = () => {
    if (action === 'finish' && photos.length === 0) {
      if (!window.confirm('Вы не прикрепили фото. Продолжить без фото?')) {
        return;
      }
    }
    onConfirm(true, photos.length > 0 ? photos : undefined);
    setPhotos([]);
    stopCamera();
  };

  const handleCancel = () => {
    onConfirm(false);
    setPhotos([]);
    stopCamera();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Заголовок */}
        <div className="flex justify-between items-center p-6 border-b">
          <h3 className="text-xl font-bold text-gray-900">
            {action === 'start' ? 'Начать задачу' : 'Завершить задачу'}
          </h3>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Контент */}
        <div className="p-6">
          {/* Контейнер ID */}
          <div className="text-center mb-6">
            <p className="text-sm text-gray-600 mb-1">Контейнер</p>
            <p className="text-3xl font-bold text-blue-600">{containerId}</p>
          </div>

          {/* Предупреждение */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 mr-2" />
              <p className="text-sm text-yellow-800">
                {action === 'start' 
                  ? 'Подтвердите начало работы с этим контейнером' 
                  : 'Подтвердите завершение работы. Не забудьте прикрепить фото!'}
              </p>
            </div>
          </div>

          {/* Загрузка фото (только для завершения) */}
          {action === 'finish' && (
            <div className="mb-6">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-semibold text-gray-700">Фотографии</h4>
                <span className="text-sm text-gray-500">
                  {photos.length} загружено
                </span>
              </div>

              {/* Кнопки загрузки фото */}
              <div className="flex space-x-3 mb-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 transition-colors"
                >
                  <Upload className="w-5 h-5 mr-2 text-gray-500" />
                  <span>Выбрать файлы</span>
                </button>

                <button
                  onClick={isCapturing ? stopCamera : startCamera}
                  className={`flex-1 flex items-center justify-center py-2 rounded-lg ${
                    isCapturing 
                      ? 'bg-red-500 hover:bg-red-600 text-white' 
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  <Camera className="w-5 h-5 mr-2" />
                  <span>{isCapturing ? 'Остановить' : 'Камера'}</span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Видео с камеры */}
              {isCapturing && (
                <div className="relative mb-4">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full rounded-lg"
                  />
                  <button
                    onClick={capturePhoto}
                    className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white p-3 rounded-full shadow-lg hover:shadow-xl"
                  >
                    <Camera className="w-6 h-6" />
                  </button>
                </div>
              )}

              {/* Препросмотр фото */}
              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {photos.map((photo, index) => (
                    <div key={index} className="relative">
                      <img
                        src={URL.createObjectURL(photo)}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-24 object-cover rounded"
                      />
                      <button
                        onClick={() => setPhotos(prev => prev.filter((_, i) => i !== index))}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 text-sm"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Прогресс загрузки */}
              {uploadProgress > 0 && (
                <div className="mb-4">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Загрузка фото</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Кнопка обновления при таймауте */}
              {showRefreshButton && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-red-700">
                      Загрузка заняла более 60 секунд
                    </span>
                    <button
                      onClick={onRefresh}
                      className="flex items-center text-sm font-medium text-red-700 hover:text-red-800"
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Обновить
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Кнопки действий */}
        <div className="flex border-t p-6">
          <button
            onClick={handleCancel}
            className="flex-1 py-3 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
          >
            Отмена
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-3 px-4 ml-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium"
          >
            {action === 'start' ? 'Начать' : 'Завершить'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActionModal;