import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { Task, TranslationSet, User } from '../types';
import { Phone, Check, Play, Layers, Clock, AlertTriangle, RefreshCw, User as UserIcon } from 'lucide-react';

interface OperatorTerminalProps {
  onClose: () => void;
  onTaskAction: (task: Task, action: 'start' | 'finish') => void;
  t: TranslationSet;
  currentUser: User;
}

// ... (вспомогательные функции parseTime, formatTime, calculateDuration, parseETA, getETABorderColor без изменений) ...

const OperatorTerminal: React.FC<OperatorTerminalProps> = ({ onClose, onTaskAction, t, currentUser }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadTimeout, setUploadTimeout] = useState(false);
  const previousTasksRef = useRef<string>('');

  const storageKey = `activeTask_${currentUser.name}`;
  const getActiveTaskId = (): string | null => localStorage.getItem(storageKey);
  const setActiveTaskId = (taskId: string | null) => {
    if (taskId) localStorage.setItem(storageKey, taskId);
    else localStorage.removeItem(storageKey);
  };

  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.fetchTasks('get_operator_tasks');
      
      // Сравниваем с предыдущими данными, чтобы избежать лишних ререндеров
      const dataString = JSON.stringify(data);
      if (dataString !== previousTasksRef.current) {
        setTasks(data);
        previousTasksRef.current = dataString;
      }
      
      setUploadTimeout(false);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    // УВЕЛИЧИВАЕМ ИНТЕРВАЛ ДО 15 СЕКУНД (15000 мс)
    const interval = setInterval(fetchQueue, 15000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  const activeTaskId = getActiveTaskId();
  const allActiveTasks = tasks.filter(t => t.start_time?.trim() && !t.end_time?.trim());
  const myActiveTask = tasks.find(t => t.id === activeTaskId && t.start_time?.trim() && !t.end_time?.trim());
  const otherActiveTaskIds = new Set(allActiveTasks.filter(t => t.id !== activeTaskId).map(t => t.id));

  const availableTasks = tasks.filter(task => {
    if (task.status !== 'WAIT') return false;
    if (task.start_time?.trim()) return false;
    if (task.end_time?.trim()) return false;
    if (otherActiveTaskIds.has(task.id)) return false;
    return true;
  });

  const handleTaskAction = (task: Task, action: 'start' | 'finish') => {
    if (action === 'start') setActiveTaskId(task.id);
    else setActiveTaskId(null);
    onTaskAction(task, action);
  };

  const getTypeBadge = (type?: string) => {
    if (!type) return null;
    let color = "bg-white/10 border-white/20 text-white";
    if (type.includes("BS")) color = "bg-accent-red/15 border-accent-red text-accent-red";
    if (type.includes("AS")) color = "bg-orange-500/15 border-orange-500 text-orange-500";
    if (type.includes("PS")) color = "bg-accent-purple/15 border-accent-purple text-accent-purple";
    return <span className={`px-2 py-0.5 rounded text-xs font-bold border ${color} ml-2`}>{type}</span>;
  };

  // ... (рендеринг myActiveTask и availableTasks без изменений, кроме замены uploadTimeout на вашу логику) ...
  // Я опускаю полный код рендера для краткости, но он должен быть такой же, как в предыдущем исправленном варианте.
  // Единственное изменение – увеличен интервал и добавлено сравнение данных.

  // Рендер см. в предыдущем сообщении – он полностью рабочий.
};