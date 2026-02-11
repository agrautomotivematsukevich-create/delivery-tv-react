import React, { useState, useEffect, useCallback } from 'react';
import { 
  getOperatorTasks, 
  updateContainerRow, 
  uploadPhoto,
  type Task 
} from '../services/api';
import ActionModal from './ActionModal';
import { CheckCircle, AlertTriangle, Clock, RefreshCw } from 'lucide-react';

const OperatorTerminal: React.FC<{ operatorId: string }> = ({ operatorId }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showActionModal, setShowActionModal] = useState(false);
  const [modalAction, setModalAction] = useState<'start' | 'finish' | null>(null);
  const [selectedContainer, setSelectedContainer] = useState<string>('');
  const [uploadTimeout, setUploadTimeout] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Загрузка задач оператора
  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getOperatorTasks(operatorId);
      setTasks(data);
      
      // Определяем активную задачу (есть Start Time, нет End Time)
      const active = data.find(task => 
        task.startTime && !task.endTime
      );
      setActiveTask(active || null);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setIsLoading(false);
    }
  }, [operatorId]);

  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 30000); // Обновление каждые 30 сек
    return () => clearInterval(interval);
  }, [loadTasks]);

  // Определение цвета рамки ETA
  const getETABorderColor = (eta: string): string => {
    const now = new Date();
    const etaTime = new Date(eta);
    const diffMinutes = (etaTime.getTime() - now.getTime()) / (1000 * 60);
    
    if (diffMinutes < 0) return 'border-red-500';
    if (diffMinutes < 30) return 'border-orange-500';
    return 'border-gray-300';
  };

  // Обработчик начала задачи
  const handleStartClick = (containerId: string) => {
    setSelectedContainer(containerId);
    setModalAction('start');
    setShowActionModal(true);
  };

  // Обработчик завершения задачи
  const handleFinishClick = () => {
    if (activeTask) {
      setSelectedContainer(activeTask.containerId);
      setModalAction('finish');
      setShowActionModal(true);
    }
  };

  // Подтверждение действия из модального окна
  const handleActionConfirm = async (confirmed: boolean, photos?: File[]) => {
    setShowActionModal(false);
    setUploadTimeout(false);
    setUploadProgress(0);

    if (!confirmed || !modalAction || !selectedContainer) return;

    try {
      if (modalAction === 'start') {
        await updateContainerRow(selectedContainer, {
          status: 'ACTIVE',
          startTime: new Date().toISOString()
        });
      } else if (modalAction === 'finish') {
        // Загрузка фото с отслеживанием прогресса
        if (photos && photos.length > 0) {
          let uploadTimer: NodeJS.Timeout;
          
          // Таймер 60 секунд
          const timeoutPromise = new Promise((_, reject) => {
            uploadTimer = setTimeout(() => {
              setUploadTimeout(true);
              reject(new Error('Upload timeout'));
            }, 60000);
          });

          try {
            await Promise.race([
              Promise.all(photos.map(async (photo, index) => {
                await uploadPhoto(
                  selectedContainer,
                  photo,
                  index === 0 ? 'before' : 'after',
                  (progress) => {
                    setUploadProgress(progress);
                  }
                );
              })),
              timeoutPromise
            ]);
            
            clearTimeout(uploadTimer);
          } catch (uploadError) {
            clearTimeout(uploadTimer);
            throw uploadError;
          }
        }

        await updateContainerRow(selectedContainer, {
          endTime: new Date().toISOString()
        });
      }

      // Перезагрузка задач после успешного действия
      await loadTasks();
    } catch (error) {
      console.error('Error performing action:', error);
      alert('Произошла ошибка. Попробуйте еще раз.');
    }
  };

  // Single Active Task Mode
  if (activeTask) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        {/* Заголовок активной задачи */}
        <div className="mb-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-800">
            Активная задача
          </h2>
          <div className="flex items-center space-x-3">
            {uploadTimeout && (
              <button
                onClick={loadTasks}
                className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Обновить экран
              </button>
            )}
            <button
              onClick={handleFinishClick}
              className="flex items-center px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 font-semibold"
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              Завершить задачу
            </button>
          </div>
        </div>

        {/* Карточка активной задачи */}
        <div className={`bg-white rounded-xl shadow-lg p-6 border-2 ${getETABorderColor(activeTask.eta)}`}>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Контейнер</h3>
              <p className="text-2xl font-bold text-gray-900">{activeTask.containerId}</p>
              <p className="text-gray-600 mt-1">Lot: {activeTask.lot}</p>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">ETA</h3>
              <div className="flex items-center">
                <Clock className="w-5 h-5 mr-2 text-gray-500" />
                <span className="text-xl font-medium">
                  {new Date(activeTask.eta).toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {new Date(activeTask.eta).toLocaleDateString('ru-RU')}
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Паллеты</h3>
              <p className="text-xl font-bold text-blue-600">{activeTask.pallets}</p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Зона</h3>
              <p className="text-xl font-medium text-gray-900">{activeTask.zone}</p>
            </div>
          </div>

          {/* Прогресс загрузки фото */}
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="mt-6">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">Загрузка фото</span>
                <span className="text-sm font-medium text-gray-700">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Режим множественных задач (нет активной)
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">
        Доступные задачи
      </h2>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          Нет доступных задач
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tasks.map((task) => (
            <div
              key={task.containerId}
              className={`bg-white rounded-lg shadow-md p-4 border-2 ${getETABorderColor(task.eta)} hover:shadow-lg transition-shadow`}
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-lg text-gray-900">
                    {task.containerId}
                  </h3>
                  <p className="text-sm text-gray-600">Lot: {task.lot}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  task.status === 'WAIT' ? 'bg-yellow-100 text-yellow-800' :
                  task.status === 'ACTIVE' ? 'bg-blue-100 text-blue-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {task.status}
                </span>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between">
                  <span className="text-gray-600">Паллеты:</span>
                  <span className="font-semibold">{task.pallets}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Зона:</span>
                  <span className="font-semibold">{task.zone}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">ETA:</span>
                  <div className="flex items-center">
                    {getETABorderColor(task.eta).includes('red') && (
                      <AlertTriangle className="w-4 h-4 text-red-500 mr-1" />
                    )}
                    <span className="font-medium">
                      {new Date(task.eta).toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleStartClick(task.containerId)}
                className="w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium transition-colors"
              >
                Начать задачу
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Модальное окно подтверждения */}
      {showActionModal && (
        <ActionModal
          isOpen={showActionModal}
          onClose={() => setShowActionModal(false)}
          onConfirm={handleActionConfirm}
          containerId={selectedContainer}
          action={modalAction!}
          uploadProgress={uploadProgress}
          showRefreshButton={uploadTimeout}
          onRefresh={loadTasks}
        />
      )}
    </div>
  );
};

export default OperatorTerminal;