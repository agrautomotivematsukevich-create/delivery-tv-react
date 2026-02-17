import React, { useState, useEffect } from 'react';
import { Download, Edit, Calendar, TrendingUp, Clock } from 'lucide-react';
import { ArrivalAnalyticsRecord, Lang } from '../types';
import { SCRIPT_URL, TRANSLATIONS } from '../constants';

interface Props {
  lang: Lang;
}

/**
 * ArrivalDowntimeView Component
 * 
 * Analytics view showing downtime between arrival and unloading completion
 * 
 * Features:
 * - Date range selection (default: last 7 days)
 * - Sortable table with all arrival data
 * - Statistics: total/average downtime
 * - Edit arrival time for corrections
 * - Export to CSV
 */
export function ArrivalDowntimeView({ lang }: Props) {
  const t = TRANSLATIONS[lang];
  
  const [records, setRecords] = useState<ArrivalAnalyticsRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortField, setSortField] = useState<keyof ArrivalAnalyticsRecord>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [editingRecord, setEditingRecord] = useState<ArrivalAnalyticsRecord | null>(null);
  const [newArrivalTime, setNewArrivalTime] = useState('');
  const [saving, setSaving] = useState(false);

  // Initialize date range (last 7 days)
  useEffect(() => {
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 6);
    
    setToDate(formatDateForInput(today));
    setFromDate(formatDateForInput(lastWeek));
  }, []);

  // Format date for input (YYYY-MM-DD)
  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Convert input date (YYYY-MM-DD) to backend format (DD.MM.YYYY)
  const convertDateToBackend = (dateStr: string): string => {
    const [year, month, day] = dateStr.split('-');
    return `${day}.${month}.${year}`;
  };

  // Load analytics data
  const loadAnalytics = async () => {
    if (!fromDate || !toDate) return;
    
    try {
      setLoading(true);
      
      const fromBackend = convertDateToBackend(fromDate);
      const toBackend = convertDateToBackend(toDate);
      
      const url = `${SCRIPT_URL}?mode=get_arrival_analytics&from=${encodeURIComponent(fromBackend)}&to=${encodeURIComponent(toBackend)}&nocache=${Date.now()}`;
      
      const response = await fetch(url);
      const data: ArrivalAnalyticsRecord[] = await response.json();
      
      setRecords(data);
    } catch (err) {
      console.error('Failed to load analytics:', err);
      alert('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Sort records
  const sortedRecords = [...records].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDirection === 'asc' 
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }
    
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDirection === 'asc' 
        ? aVal - bVal
        : bVal - aVal;
    }
    
    return 0;
  });

  // Handle sort
  const handleSort = (field: keyof ArrivalAnalyticsRecord) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Calculate statistics
  const totalDowntime = records.reduce((sum, r) => sum + (r.downtime || 0), 0);
  const avgDowntime = records.length > 0 ? totalDowntime / records.length : 0;

  // Format minutes to readable format
  const formatDowntime = (minutes: number | null): string => {
    if (minutes === null || minutes === undefined) return '-';
    
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    
    if (hours > 0) {
      return `${hours}${t.analytics_hours} ${mins}${t.analytics_minutes}`;
    }
    return `${mins}${t.analytics_minutes}`;
  };

  // Edit arrival time
  const handleEditArrival = (record: ArrivalAnalyticsRecord) => {
    setEditingRecord(record);
    setNewArrivalTime(record.arrival);
  };

  // Save edited arrival time
  const handleSaveArrival = async () => {
    if (!editingRecord) return;
    
    // Validate time format
    if (newArrivalTime && !/^\d{1,2}:\d{2}$/.test(newArrivalTime)) {
      alert('Invalid time format. Use HH:MM');
      return;
    }
    
    try {
      setSaving(true);
      
      const url = `${SCRIPT_URL}?mode=set_arrival&id=${encodeURIComponent(editingRecord.id)}&arrival=${encodeURIComponent(newArrivalTime)}&date=${editingRecord.date}&nocache=${Date.now()}`;
      
      const response = await fetch(url);
      const result = await response.text();
      
      if (result === 'UPDATED') {
        // Reload analytics
        await loadAnalytics();
        setEditingRecord(null);
        setNewArrivalTime('');
      } else {
        alert(`Failed to save: ${result}`);
      }
    } catch (err) {
      console.error('Failed to save arrival:', err);
      alert('Network error');
    } finally {
      setSaving(false);
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = [
      t.analytics_col_date,
      'Container ID',
      t.log_lot,
      t.log_ws,
      t.log_pallets,
      t.analytics_col_eta,
      t.analytics_col_arrival,
      t.lbl_start,
      t.analytics_col_end,
      `${t.analytics_col_downtime} (${t.analytics_minutes})`,
      t.dtl_zone,
      t.dtl_operator
    ];
    
    const rows = sortedRecords.map(r => [
      r.date,
      r.id,
      r.lot || '',
      r.type || '',
      r.pallets || '',
      r.eta,
      r.arrival,
      r.start_time || '',
      r.end_time || '',
      r.downtime?.toString() || '',
      r.zone || '',
      r.operator || ''
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `arrival-analytics-${fromDate}-to-${toDate}.csv`;
    link.click();
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DONE': return 'text-green-400';
      case 'ACTIVE': return 'text-blue-400';
      default: return 'text-gray-400';
    }
  };

  // Get downtime color (based on severity)
  const getDowntimeColor = (minutes: number | null): string => {
    if (minutes === null) return 'text-gray-400';
    if (minutes < 30) return 'text-green-400';
    if (minutes < 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto text-white">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">
          {t.analytics_arrival_title}
        </h2>
        <p className="text-gray-400">
          {t.nav_arrival_analytics}
        </p>
      </div>

      {/* Date Range Selector */}
      <div className="bg-white/5 border border-white/10 rounded-lg shadow-md p-6 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {t.analytics_date_from}
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {t.analytics_date_to}
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <button
            onClick={loadAnalytics}
            disabled={loading || !fromDate || !toDate}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                {t.msg_uploading}
              </>
            ) : (
              <>
                <Calendar className="w-4 h-4" />
                {t.analytics_load_data}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Statistics */}
      {records.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white/5 border border-white/10 rounded-lg shadow-md p-6">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-6 h-6 text-blue-600" />
              <h3 className="text-sm font-medium text-gray-300">{t.analytics_total_downtime}</h3>
            </div>
            <p className="text-3xl font-bold text-white">{formatDowntime(totalDowntime)}</p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-lg shadow-md p-6">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-6 h-6 text-green-600" />
              <h3 className="text-sm font-medium text-gray-300">{t.analytics_avg_downtime}</h3>
            </div>
            <p className="text-3xl font-bold text-white">{formatDowntime(avgDowntime)}</p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-lg shadow-md p-6">
            <div className="flex items-center gap-3 mb-2">
              <Calendar className="w-6 h-6 text-purple-600" />
              <h3 className="text-sm font-medium text-gray-300">{t.analytics_records_count}</h3>
            </div>
            <p className="text-3xl font-bold text-white">{records.length}</p>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white/5 border border-white/10 rounded-lg shadow-md overflow-hidden">
        {/* Table Header with Export */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-lg font-semibold text-white">
            {records.length > 0 ? `${records.length} ${t.analytics_records_count}` : t.analytics_no_arrivals}
          </h3>
          
          {records.length > 0 && (
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              {t.export_csv}
            </button>
          )}
        </div>
        

        {/* Table Content */}
        {records.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Clock className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg text-gray-400">{t.analytics_no_arrivals}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <SortableHeader field="date" label={t.analytics_col_date} />
                  <SortableHeader field="id" label="ID" />
                  <SortableHeader field="type" label={t.log_ws} />
                  <SortableHeader field="eta" label={t.analytics_col_eta} />
                  <SortableHeader field="arrival" label={t.analytics_col_arrival} />
                  <SortableHeader field="start_time" label={t.lbl_start} />
                  <SortableHeader field="end_time" label={t.analytics_col_end} />
                  <SortableHeader field="downtime" label={t.analytics_col_downtime} />
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    {t.dtl_zone}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    {t.analytics_edit_arrival}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {sortedRecords.map((record) => (
                  <tr key={`${record.date}-${record.id}`} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-sm text-white/70">{record.date}</td>
                    <td className="px-4 py-3 text-sm font-medium text-white">{record.id}</td>
                    <td className="px-4 py-3 text-sm text-white/60">{record.type || '-'}</td>
                    <td className="px-4 py-3 text-sm text-white/80">{record.eta}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-blue-400">{record.arrival}</td>
                    <td className="px-4 py-3 text-sm text-white/60">{record.start_time || '-'}</td>
                    <td className="px-4 py-3 text-sm text-white/60">{record.end_time || '-'}</td>
                    <td className={`px-4 py-3 text-sm font-bold ${getDowntimeColor(record.downtime)}`}>
                      {formatDowntime(record.downtime)}
                    </td>
                    <td className="px-4 py-3 text-sm text-white/60">{record.zone || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => handleEditArrival(record)}
                        className="text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0a0a0c] rounded-2xl shadow-2xl max-w-md w-full border border-white/10">
            <div className="bg-blue-600 text-white p-4 rounded-t-2xl">
              <h3 className="text-xl font-bold">{t.analytics_edit_arrival}</h3>
              <p className="text-blue-100 text-sm mt-1">{editingRecord.id}</p>
            </div>

            <div className="p-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {t.arrival_time} (HH:MM)
              </label>
              
              <input
                type="text"
                value={newArrivalTime}
                onChange={(e) => setNewArrivalTime(e.target.value)}
                placeholder="14:30"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-lg font-mono text-center text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                disabled={saving}
              />

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setEditingRecord(null)}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-white/5 text-gray-300 border border-white/10 rounded-lg hover:bg-white/10 transition-colors font-medium disabled:opacity-50"
                >
                  {t.btn_cancel}
                </button>
                
                <button
                  onClick={handleSaveArrival}
                  disabled={saving || !newArrivalTime}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
                >
                  {saving ? t.msg_uploading : t.log_btn_save}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Sortable header component
  function SortableHeader({ field, label }: { field: keyof ArrivalAnalyticsRecord; label: string }) {
    const isActive = sortField === field;
    
    return (
      <th
        onClick={() => handleSort(field)}
        className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase cursor-pointer hover:bg-white/5 transition-colors select-none"
      >
        <div className="flex items-center gap-2">
          {label}
          {isActive && (
            <span className="text-blue-600">
              {sortDirection === 'asc' ? '↑' : '↓'}
            </span>
          )}
        </div>
      </th>
    );
  }
}
