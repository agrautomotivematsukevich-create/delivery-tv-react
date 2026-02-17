import React, { useState, useEffect } from 'react';
import { Truck, Clock, CheckCircle2, XCircle, Edit } from 'lucide-react';
import { ContainerSchedule, Lang, TranslationSet } from '../types';
import { SCRIPT_URL, TRANSLATIONS } from '../constants';

interface Props {
  lang: Lang;
  onClose: () => void;
  inline?: boolean;
}

/**
 * ArrivalTerminal Component
 * 
 * ✅ FIXED v2.3.2:
 * - Slower auto-refresh (2 minutes instead of 30 seconds)
 * - Pauses refresh when modal is open
 * - Dark theme matching the main site
 */
export function ArrivalTerminal({ lang, onClose, inline = false }: Props) {
  const t = TRANSLATIONS[lang];
  
  const [containers, setContainers] = useState<ContainerSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContainer, setSelectedContainer] = useState<ContainerSchedule | null>(null);
  const [arrivalTime, setArrivalTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Get today's date in DD.MM format
  const getTodayDate = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${day}.${month}`;
  };

  // Load containers for today
  const loadContainers = async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await fetch(`${SCRIPT_URL}?mode=get_today_schedule&nocache=${Date.now()}`);
      const data: ContainerSchedule[] = await response.json();
      
      setContainers(data);
    } catch (err) {
      console.error('Failed to load containers:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Initialize
  useEffect(() => {
    loadContainers();
    
    // ✅ FIXED: Auto-refresh every 2 minutes (was 30 seconds)
    // ✅ FIXED: Pause when modal is open
    const interval = setInterval(() => {
      if (!selectedContainer) { // Only refresh if no modal is open
        loadContainers();
      }
    }, 120000); // 2 minutes
    
    return () => clearInterval(interval);
  }, [selectedContainer]); // ✅ Re-run when modal state changes

  // Open arrival modal
  const handleMarkArrival = (container: ContainerSchedule) => {
    setSelectedContainer(container);
    
    // Default to current time if not already marked
    if (container.arrival) {
      setArrivalTime(container.arrival);
    } else {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setArrivalTime(`${hours}:${minutes}`);
    }
  };

  // Save arrival time
  const handleSaveArrival = async () => {
    if (!selectedContainer) return;
    
    // Validate time format
    if (arrivalTime && !/^\d{1,2}:\d{2}$/.test(arrivalTime)) {
      setError('Invalid time format. Use HH:MM');
      return;
    }
    
    try {
      setSaving(true);
      setError('');
      
      const url = `${SCRIPT_URL}?mode=set_arrival&id=${encodeURIComponent(selectedContainer.id)}&arrival=${encodeURIComponent(arrivalTime)}&date=${getTodayDate()}&nocache=${Date.now()}`;
      
      const response = await fetch(url);
      const result = await response.text();
      
      if (result === 'UPDATED') {
        // Success - reload list and close modal
        await loadContainers();
        setSelectedContainer(null);
        setArrivalTime('');
      } else {
        setError(`Failed to save: ${result}`);
      }
    } catch (err) {
      console.error('Failed to save arrival:', err);
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  // Reset arrival time
  const handleResetArrival = async () => {
    if (!selectedContainer) return;
    
    if (!confirm(t.arrival_reset + '?')) return;
    
    try {
      setSaving(true);
      setError('');
      
      // Send empty string to reset
      const url = `${SCRIPT_URL}?mode=set_arrival&id=${encodeURIComponent(selectedContainer.id)}&arrival=&date=${getTodayDate()}&nocache=${Date.now()}`;
      
      const response = await fetch(url);
      const result = await response.text();
      
      if (result === 'UPDATED') {
        await loadContainers();
        setSelectedContainer(null);
        setArrivalTime('');
      } else {
        setError(`Failed to reset: ${result}`);
      }
    } catch (err) {
      console.error('Failed to reset arrival:', err);
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DONE': return 'text-green-400';
      case 'ACTIVE': return 'text-blue-400';
      default: return 'text-gray-400';
    }
  };

  // Get container type color
  const getTypeColor = (type?: string) => {
    switch (type) {
      case 'BS': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'AS': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'PS': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
        <div className="bg-[#1a1a2e] rounded-lg p-8 max-w-md w-full border border-white/10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-400">{t.msg_uploading}</p>
          </div>
        </div>
      </div>
    );
  }

  const inner = (
    <>
      <div className="bg-[#0a0a0c] rounded-2xl shadow-2xl max-w-4xl w-full my-8 border border-white/10">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Truck className="w-8 h-8" />
              <div>
                <h2 className="text-2xl font-bold">{t.arrival_terminal_title}</h2>
                <p className="text-blue-100 text-sm mt-1">
                  {getTodayDate()} • {containers.length} {t.analytics_containers}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Container List */}
        <div className="p-6 max-h-[600px] overflow-y-auto">
          {containers.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Truck className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg">{t.empty}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {containers.map((container) => (
                <div
                  key={container.id}
                  className={`border rounded-xl p-3 sm:p-4 transition-all ${
                    container.arrival 
                      ? 'bg-green-500/10 border-green-500/30' 
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: Container Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="font-bold text-sm sm:text-lg text-white">{container.id}</span>
                        {container.type && (
                          <span className={`px-2 py-0.5 rounded border text-xs font-semibold shrink-0 ${getTypeColor(container.type)}`}>
                            {container.type}
                          </span>
                        )}
                        <span className={`text-xs font-medium shrink-0 ${getStatusColor(container.status)}`}>
                          {container.status}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs sm:text-sm text-gray-400">
                        {container.lot && (
                          <div className="truncate">
                            <span className="font-medium text-gray-500">{t.log_lot}:</span> {container.lot}
                          </div>
                        )}
                        {container.pallets && (
                          <div className="truncate">
                            <span className="font-medium text-gray-500">{t.log_pallets}:</span> {container.pallets}
                          </div>
                        )}
                        <div>
                          <span className="font-medium text-gray-500">{t.log_eta}:</span> {container.eta}
                        </div>
                        {container.zone && (
                          <div>
                            <span className="font-medium text-gray-500">{t.dtl_zone}:</span> {container.zone}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Arrival Status & Action */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {container.arrival ? (
                        <>
                          <div className="flex items-center gap-1.5 text-green-400">
                            <CheckCircle2 className="w-4 h-4" />
                            <div className="text-right">
                              <div className="font-semibold text-xs">{t.arrival_marked}</div>
                              <div className="text-sm font-bold tabular-nums">{container.arrival}</div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleMarkArrival(container)}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                          >
                            <Edit className="w-3 h-3" />
                            {t.log_btn_edit}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleMarkArrival(container)}
                          className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-1.5 text-xs sm:text-sm active:scale-95"
                        >
                          <Clock className="w-4 h-4" />
                          {t.arrival_mark}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Arrival Time Modal */}
      {selectedContainer && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[60] p-4">
          <div className="bg-[#1a1a2e] rounded-lg shadow-2xl max-w-md w-full border border-white/10">
            <div className="bg-blue-600 text-white p-4 rounded-t-lg">
              <h3 className="text-xl font-bold">{t.arrival_set_time}</h3>
              <p className="text-blue-100 text-sm mt-1">{selectedContainer.id}</p>
            </div>

            <div className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
                  {error}
                </div>
              )}

              <label className="block text-sm font-medium text-gray-400 mb-2">
                {t.arrival_time} (HH:MM)
              </label>
              
              <input
                type="text"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                placeholder="14:30"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-lg font-mono text-center text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                disabled={saving}
              />

              <div className="mt-6 flex gap-3">
                {selectedContainer.arrival && (
                  <button
                    onClick={handleResetArrival}
                    disabled={saving}
                    className="flex-1 px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors font-medium disabled:opacity-50"
                  >
                    {t.arrival_reset}
                  </button>
                )}
                
                <button
                  onClick={() => setSelectedContainer(null)}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-white/5 text-gray-400 border border-white/10 rounded-lg hover:bg-white/10 transition-colors font-medium disabled:opacity-50"
                >
                  {t.btn_cancel}
                </button>
                
                <button
                  onClick={handleSaveArrival}
                  disabled={saving || !arrivalTime}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      {t.msg_uploading}
                    </>
                  ) : (
                    t.log_btn_save
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (inline) return inner;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      {inner}
    </div>
  );
}
