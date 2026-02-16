import React, { useState, useEffect } from 'react';
import { Truck, Clock, CheckCircle2, XCircle, Edit } from 'lucide-react';
import { ContainerSchedule, Lang, TranslationSet } from '../types';
import { SCRIPT_URL, TRANSLATIONS } from '../constants';

interface Props {
  lang: Lang;
  onClose: () => void;
}

/**
 * ArrivalTerminal Component
 * 
 * Allows AGRL (Arrival Agent) and ADMIN to mark container arrivals
 * 
 * Features:
 * - Shows all containers for current date
 * - Visual indicator for arrived containers
 * - Set/Edit arrival time (default: current time)
 * - Auto-refresh list after marking
 */
export function ArrivalTerminal({ lang, onClose }: Props) {
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
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadContainers, 30000);
    return () => clearInterval(interval);
  }, []);

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
      case 'DONE': return 'text-green-600';
      case 'ACTIVE': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  // Get container type color
  const getTypeColor = (type?: string) => {
    switch (type) {
      case 'BS': return 'bg-red-100 text-red-700';
      case 'AS': return 'bg-orange-100 text-orange-700';
      case 'PS': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg p-8 max-w-md w-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">{t.msg_uploading}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-t-lg">
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
              <Truck className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">{t.empty}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {containers.map((container) => (
                <div
                  key={container.id}
                  className={`border rounded-lg p-4 hover:shadow-md transition-all ${
                    container.arrival ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    {/* Left: Container Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-bold text-lg text-gray-900">{container.id}</span>
                        {container.type && (
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${getTypeColor(container.type)}`}>
                            {container.type}
                          </span>
                        )}
                        <span className={`text-sm font-medium ${getStatusColor(container.status)}`}>
                          {container.status}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-600">
                        {container.lot && (
                          <div>
                            <span className="font-medium">{t.log_lot}:</span> {container.lot}
                          </div>
                        )}
                        {container.pallets && (
                          <div>
                            <span className="font-medium">{t.log_pallets}:</span> {container.pallets}
                          </div>
                        )}
                        <div>
                          <span className="font-medium">{t.log_eta}:</span> {container.eta}
                        </div>
                        {container.zone && (
                          <div>
                            <span className="font-medium">{t.dtl_zone}:</span> {container.zone}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Arrival Status & Action */}
                    <div className="flex flex-col items-end gap-2">
                      {container.arrival ? (
                        <>
                          <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle2 className="w-5 h-5" />
                            <div className="text-right">
                              <div className="font-semibold">{t.arrival_marked}</div>
                              <div className="text-sm">{container.arrival}</div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleMarkArrival(container)}
                            className="flex items-center gap-1 px-3 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          >
                            <Edit className="w-3 h-3" />
                            {t.log_btn_edit}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleMarkArrival(container)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
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
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full">
            <div className="bg-blue-600 text-white p-4 rounded-t-lg">
              <h3 className="text-xl font-bold">{t.arrival_set_time}</h3>
              <p className="text-blue-100 text-sm mt-1">{selectedContainer.id}</p>
            </div>

            <div className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  {error}
                </div>
              )}

              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t.arrival_time} (HH:MM)
              </label>
              
              <input
                type="text"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                placeholder="14:30"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-lg font-mono text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={saving}
              />

              <div className="mt-6 flex gap-3">
                {selectedContainer.arrival && (
                  <button
                    onClick={handleResetArrival}
                    disabled={saving}
                    className="flex-1 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium disabled:opacity-50"
                  >
                    {t.arrival_reset}
                  </button>
                )}
                
                <button
                  onClick={() => setSelectedContainer(null)}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium disabled:opacity-50"
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
    </div>
  );
}
