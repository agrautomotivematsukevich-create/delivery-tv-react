import React, { useEffect, useState, useRef } from 'react';
import { api } from '../services/api';
import { Task, TranslationSet } from '../types';
import { Phone, Check, Play, Layers, ScanLine, X, Zap } from 'lucide-react';

interface OperatorTerminalProps {
  onClose: () => void;
  onTaskAction: (task: Task, action: 'start' | 'finish') => void;
  t: TranslationSet;
}

// QR/Barcode сканер через нативный BarcodeDetector API
const QrScanner: React.FC<{ onDetect: (text: string) => void; onClose: () => void }> = ({ onDetect, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    let animId: number;
    let detector: any;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;

        // Пробуем нативный BarcodeDetector (Chrome, Samsung, Edge)
        if ('BarcodeDetector' in window) {
          detector = new (window as any).BarcodeDetector({ formats: ['code_128', 'code_39', 'qr_code', 'ean_13', 'data_matrix'] });
          const scan = async () => {
            if (!scanning || !videoRef.current) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes.length > 0) {
                const raw = codes[0].rawValue.trim();
                if (raw) { onDetect(raw); return; }
              }
            } catch (_) {}
            animId = requestAnimationFrame(scan);
          };
          videoRef.current?.addEventListener('loadeddata', () => { animId = requestAnimationFrame(scan); });
        } else {
          setError('Ваш браузер не поддерживает сканер. Используйте Chrome на Android.');
        }
      } catch (e) {
        setError('Нет доступа к камере. Разрешите использование камеры в настройках браузера.');
      }
    };

    start();
    return () => {
      cancelAnimationFrame(animId);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[90] bg-black flex flex-col animate-in fade-in duration-200">
      <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <ScanLine size={22} className="text-accent-blue" />
          <span className="font-black text-white uppercase tracking-widest text-sm">Сканирование штрихкода</span>
        </div>
        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors">
          <X size={20} className="text-white" />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        {error ? (
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
              <ScanLine size={32} className="text-red-400" />
            </div>
            <p className="text-white/70 text-sm leading-relaxed">{error}</p>
            <button onClick={onClose} className="mt-6 px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white font-bold text-sm transition-colors">
              Закрыть
            </button>
          </div>
        ) : (
          <>
            <div className="relative w-full max-w-sm aspect-square rounded-3xl overflow-hidden bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              {/* Прицел */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 relative">
                  <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-accent-blue rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-accent-blue rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-accent-blue rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-accent-blue rounded-br-lg" />
                  {/* Сканирующая линия */}
                  <div className="absolute inset-x-2 top-1/2 h-0.5 bg-accent-blue/70 animate-pulse" />
                </div>
              </div>
            </div>
            <p className="text-white/40 text-sm text-center">Направьте камеру на штрихкод контейнера</p>
          </>
        )}
      </div>
    </div>
  );
};

const OperatorTerminal: React.FC<OperatorTerminalProps> = ({ onClose, onTaskAction, t }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  const fetchQueue = async () => {
    const data = await api.fetchTasks('get_operator_tasks');
    setTasks(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  // Прокрутка к подсвеченному контейнеру
  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightId]);

  const handleScanResult = (code: string) => {
    setShowScanner(false);
    // Находим задачу по ID (частичное совпадение — штрих-код может содержать доп. символы)
    const found = activeTasks.find(t =>
      t.id.toLowerCase() === code.toLowerCase() ||
      code.toLowerCase().includes(t.id.toLowerCase())
    );
    if (found) {
      setHighlightId(found.id);
      setTimeout(() => setHighlightId(null), 3000);
    }
  };

  const getTypeBadge = (type?: string) => {
    if (!type) return null;
    let color = 'bg-white/10 border-white/20 text-white';
    if (type.includes('BS')) color = 'bg-accent-red/15 border-accent-red text-accent-red';
    if (type.includes('AS')) color = 'bg-orange-500/15 border-orange-500 text-orange-500';
    if (type.includes('PS')) color = 'bg-accent-purple/15 border-accent-purple text-accent-purple';
    return <span className={`px-2 py-0.5 rounded text-xs font-bold border ${color} ml-2`}>{type}</span>;
  };

  const activeTasks = tasks.filter(task => {
    if (task.end_time) return false;
    if (task.status === 'DONE') return false;
    return true;
  });

  return (
    <>
      <div className="terminal-root fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-xl p-0 md:p-8 animate-in fade-in duration-200">
        <div className="bg-[#0A0A0C] w-full md:w-[95%] max-w-[800px] h-[95vh] md:h-[90vh] rounded-t-3xl md:rounded-[2.5rem] border border-white/10 flex flex-col shadow-2xl overflow-hidden relative">

          {/* Header */}
          <div className="flex items-center justify-between px-8 py-6 border-b border-white/10 bg-white/5">
            <div className="text-2xl font-extrabold uppercase tracking-widest text-white">{t.drv_title}</div>
            <div className="flex items-center gap-3">
              {/* Кнопка QR-сканера */}
              <button
                onClick={() => setShowScanner(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-blue/10 hover:bg-accent-blue/20 border border-accent-blue/20 text-accent-blue font-bold text-xs uppercase tracking-wider transition-colors"
              >
                <ScanLine size={16} />
                <span className="hidden sm:inline">Сканировать</span>
              </button>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <span className="text-2xl leading-none mb-1">&times;</span>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-white/50 animate-pulse">Loading tasks...</div>
              </div>
            ) : activeTasks.length === 0 ? (
              <div className="text-center text-white/30 text-xl font-bold mt-20">{t.empty}</div>
            ) : (
              activeTasks.map(task => {
                const isWait = task.status === 'WAIT';
                const isHighlighted = task.id === highlightId;
                return (
                  <div
                    key={task.id}
                    ref={isHighlighted ? highlightRef : null}
                    className={`bg-white/5 border rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 hover:bg-white/10 transition-all duration-300 ${
                      isHighlighted ? 'border-accent-blue shadow-[0_0_20px_rgba(59,130,246,0.3)] scale-[1.01]' : 'border-white/5'
                    }`}
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center">
                        <span className="font-mono text-2xl font-bold text-white">{task.id}</span>
                        {getTypeBadge(task.type)}
                        {isHighlighted && (
                          <span className="ml-2 flex items-center gap-1 text-accent-blue text-xs font-bold">
                            <Zap size={12} /> Найден
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-mono text-white/50 mt-1">{task.time}</span>
                      <div className="flex items-center gap-2 mt-2 text-white/40 text-sm">
                        <Layers size={14} />
                        <span className="font-semibold">{task.pallets || '-'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 ml-auto">
                      {task.phone && (
                        <a href={`tel:${task.phone}`} className="w-12 h-12 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                          <Phone size={20} className="text-accent-green" />
                        </a>
                      )}
                      <button
                        onClick={() => onTaskAction(task, isWait ? 'start' : 'finish')}
                        className={`h-12 px-6 rounded-xl font-bold text-sm tracking-wide shadow-lg transition-transform active:scale-95 flex items-center gap-2
                          ${isWait
                            ? 'bg-accent-blue text-white shadow-accent-blue/20 hover:bg-accent-blue/90'
                            : 'bg-accent-green text-black shadow-accent-green/20 hover:bg-accent-green/90'
                          }`}
                      >
                        {isWait ? (<><Play size={16} fill="currentColor" /> {t.btn_start}</>) : (<><Check size={18} /> {t.btn_finish}</>)}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <style>{`
          .terminal-root .custom-scrollbar::-webkit-scrollbar { width: 4px; }
          .terminal-root .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        `}</style>
      </div>

      {showScanner && (
        <QrScanner
          onDetect={handleScanResult}
          onClose={() => setShowScanner(false)}
        />
      )}
    </>
  );
};

export default OperatorTerminal;