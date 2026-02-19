import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Clock, CheckCircle, Edit3 } from 'lucide-react';
import { api } from '../services/api';
import { ActiveDowntime, DowntimeReason, DOWNTIME_REASON_OPTIONS } from '../types';

interface DowntimeNotificationModalProps {
  activeDowntimes: ActiveDowntime[];
  currentDate: string; // DD.MM
  userName: string;
  onClose: () => void;
  onReasonUpdated: () => void;
}

const DowntimeNotificationModal: React.FC<DowntimeNotificationModalProps> = ({
  activeDowntimes,
  currentDate,
  userName,
  onClose,
  onReasonUpdated,
}) => {
  const [reasons, setReasons] = useState<Record<string, string>>({}); // key: zone_startTime
  const [customTexts, setCustomTexts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadExistingReasons();
  }, [currentDate]);

  const loadExistingReasons = async () => {
    const data = await api.fetchDowntimeReasons(currentDate);
    const map: Record<string, string> = {};
    data.forEach((r) => {
      map[`${r.zone}_${r.start_time}`] = r.reason;
    });
    setReasons(map);
  };

  const formatMinutes = (minutes: number): string => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0) return `${h}ч ${m}мин`;
    return `${m}мин`;
  };

  const getKey = (dt: ActiveDowntime) => `${dt.zone}_${dt.startTime}`;

  const getStatusColor = (minutes: number) => {
    if (minutes > 60) return { border: 'border-red-500/50', bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-500' };
    if (minutes > 30) return { border: 'border-yellow-500/50', bg: 'bg-yellow-500/10', text: 'text-yellow-400', dot: 'bg-yellow-500' };
    return { border: 'border-blue-500/30', bg: 'bg-blue-500/5', text: 'text-blue-400', dot: 'bg-blue-500' };
  };

  const handleSave = async (dt: ActiveDowntime) => {
    const key = getKey(dt);
    const selected = reasons[key];
    if (!selected) return;

    const finalReason = selected === 'Другое' ? (customTexts[key] || '') : selected;
    if (!finalReason.trim()) return;

    setSaving((prev) => ({ ...prev, [key]: true }));
    const ok = await api.setDowntimeReason(currentDate, dt.zone, dt.startTime, finalReason, userName);
    setSaving((prev) => ({ ...prev, [key]: false }));

    if (ok) {
      setSaved((prev) => ({ ...prev, [key]: true }));
      // Update local reason with final text
      setReasons((prev) => ({ ...prev, [key]: finalReason }));
      onReasonUpdated();
      setTimeout(() => setSaved((prev) => ({ ...prev, [key]: false })), 3000);
    }
  };

  const handleSelectReason = (key: string, value: string) => {
    setReasons((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-[#16161A] border border-white/10 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
              <AlertTriangle className="text-orange-400 w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">Активные простои зон</h2>
              <p className="text-sm text-white/40">
                {activeDowntimes.length === 0
                  ? 'Нет активных простоев'
                  : `${activeDowntimes.length} зон${activeDowntimes.length > 1 ? 'ы' : 'а'} простаивает`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <X className="text-white/50 w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-4 custom-scrollbar">
          {activeDowntimes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-white/30 gap-4">
              <CheckCircle size={48} strokeWidth={1} className="text-green-500/30" />
              <p className="font-bold">Нет активных простоев</p>
            </div>
          ) : (
            activeDowntimes.map((dt) => {
              const key = getKey(dt);
              const color = getStatusColor(dt.idleMinutes);
              const currentReason = reasons[key] || '';
              const isOtherSelected = currentReason === 'Другое';
              const isCompleted = currentReason === 'Поставки закончились' || 
                (saved[key] && currentReason !== '');
              const isSaving = saving[key];

              return (
                <div
                  key={key}
                  className={`rounded-2xl border-2 p-5 transition-all ${color.border} ${color.bg}`}
                >
                  {/* Zone header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`relative w-14 h-14 rounded-xl flex items-center justify-center font-black text-2xl border-2 ${color.border} bg-black/20`}>
                        <span className={color.text}>{dt.zone}</span>
                        <span className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full animate-pulse ${color.dot}`} />
                      </div>
                      <div>
                        <div className="text-xs text-white/40 font-bold uppercase tracking-wider">Простаивает</div>
                        <div className={`text-2xl font-black tabular-nums ${color.text}`}>
                          {formatMinutes(dt.idleMinutes)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="text-white/40 text-xs mb-1">Последний контейнер</div>
                      <div className="font-mono font-bold text-white truncate max-w-[140px]" title={dt.lastContainerId}>
                        {dt.lastContainerId}
                      </div>
                      <div className="text-green-400 font-mono text-xs">завершён {dt.lastEndTime}</div>
                    </div>
                  </div>

                  {/* Reason selector */}
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-white/50 uppercase tracking-wider">
                      <Edit3 size={12} />
                      Причина простоя
                    </label>

                    <select
                      value={currentReason || ''}
                      onChange={(e) => handleSelectReason(key, e.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-medium outline-none focus:border-white/30 transition-colors appearance-none cursor-pointer"
                    >
                      <option value="" disabled>— Выберите причину —</option>
                      {DOWNTIME_REASON_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>

                    {isOtherSelected && (
                      <input
                        type="text"
                        value={customTexts[key] || ''}
                        onChange={(e) =>
                          setCustomTexts((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        placeholder="Опишите причину..."
                        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-white/30 transition-colors placeholder-white/20"
                      />
                    )}

                    <button
                      onClick={() => handleSave(dt)}
                      disabled={!currentReason || isSaving || isCompleted}
                      className={`w-full py-3 rounded-xl font-bold text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                        saved[key]
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : isCompleted
                          ? 'bg-green-500/10 text-green-400/50 border border-green-500/10 cursor-default'
                          : !currentReason || isSaving
                          ? 'bg-white/5 text-white/20 cursor-not-allowed'
                          : 'bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30'
                      }`}
                    >
                      {isSaving ? (
                        <>
                          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          Сохранение...
                        </>
                      ) : saved[key] ? (
                        <><CheckCircle size={16} />Сохранено!</>
                      ) : isCompleted ? (
                        <><CheckCircle size={16} />Причина указана</>
                      ) : (
                        'Сохранить причину'
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <style>{`
          .custom-scrollbar::-webkit-scrollbar { width: 4px; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: #444; border-radius: 10px; }
        `}</style>
      </div>
    </div>
  );
};

export default DowntimeNotificationModal;
