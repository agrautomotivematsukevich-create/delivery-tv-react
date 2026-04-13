import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { Task, TranslationSet } from '../types';
import { Download, RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface AccountingViewProps {
  t: TranslationSet;
}

type AccountingStatus = 'WAIT' | 'ACCEPTED' | 'REJECTED';

const STATUS_CYCLE: AccountingStatus[] = ['WAIT', 'ACCEPTED', 'REJECTED'];

function nextStatus(current: AccountingStatus): AccountingStatus {
  const idx = STATUS_CYCLE.indexOf(current);
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}

function getTodayFormatted(): string {
  const moscowTime = new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' });
  const now = new Date(moscowTime);
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}`;
}

const StatusBadge: React.FC<{ status: AccountingStatus; onClick: () => void }> = ({ status, onClick }) => {
  const config = {
    WAIT: { icon: <Clock size={14} />, label: 'Ожидает', bg: 'bg-white/10', text: 'text-white/60', border: 'border-white/10' },
    ACCEPTED: { icon: <CheckCircle2 size={14} />, label: 'Принят', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/20' },
    REJECTED: { icon: <XCircle size={14} />, label: 'Не принят', bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/20' },
  }[status];

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all hover:scale-105 active:scale-95 ${config.bg} ${config.text} ${config.border}`}
    >
      {config.icon}
      {config.label}
    </button>
  );
};

const AccountingView: React.FC<AccountingViewProps> = ({ t }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.fetchHistory(getTodayFormatted());
      setTasks(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const doneTasks = useMemo(() => tasks.filter((t) => t.status === 'DONE'), [tasks]);

  const stats = useMemo(() => {
    const total = doneTasks.length;
    const sapAccepted = doneTasks.filter((t) => t.sap_status === 'ACCEPTED').length;
    const lesAccepted = doneTasks.filter((t) => t.les_status === 'ACCEPTED').length;
    const waiting = doneTasks.filter((t) => t.sap_status !== 'ACCEPTED' || t.les_status !== 'ACCEPTED').length;
    return { total, sapAccepted, lesAccepted, waiting };
  }, [doneTasks]);

  const handleStatusClick = useCallback(async (taskId: string, system: 'SAP' | 'LES') => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId) return task;
        const field = system === 'SAP' ? 'sap_status' : 'les_status';
        const current = (task[field] || 'WAIT') as AccountingStatus;
        return { ...task, [field]: nextStatus(current) };
      })
    );

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const field = system === 'SAP' ? 'sap_status' : 'les_status';
    const current = (task[field] || 'WAIT') as AccountingStatus;
    const newStatus = nextStatus(current);

    const ok = await api.updateAccountingStatus(taskId, system, newStatus);
    if (!ok) {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, [field]: current } : t))
      );
    }
  }, [tasks]);

  const exportCSV = useCallback(() => {
    const BOM = '\uFEFF';
    const header = ['№', 'ID контейнера', 'Зона выгрузки', 'Окончание выгрузки', 'Оператор', 'Статус SAP', 'Статус LES'];
    const statusLabel = (s?: string) => {
      if (s === 'ACCEPTED') return 'Принят';
      if (s === 'REJECTED') return 'Не принят';
      return 'Ожидает';
    };
    const rows = doneTasks.map((task, i) => [
      i + 1,
      task.id,
      task.zone || '',
      task.end_time || '',
      task.operator || '',
      statusLabel(task.sap_status),
      statusLabel(task.les_status),
    ]);
    const csvContent = BOM + [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accounting_${getTodayFormatted().replace('.', '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [doneTasks]);

  return (
    <div className="flex flex-col h-full">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 pb-4 bg-[#191B25]">
        {/* Title + Actions */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg md:text-xl font-extrabold text-white tracking-tight uppercase">
            Учет SAP / LES
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-white/60 hover:text-white bg-white/5 border border-white/5 transition-all"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Обновить
            </button>
            <button
              onClick={exportCSV}
              disabled={doneTasks.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={14} />
              Выгрузить отчет (CSV)
            </button>
          </div>
        </div>

        {/* Stats Widgets */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white/5 border border-white/5 rounded-xl p-4">
            <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1">Всего завершено</div>
            <div className="text-2xl font-black text-white tabular-nums">{stats.total}</div>
          </div>
          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4">
            <div className="text-[10px] font-bold text-emerald-400/60 uppercase tracking-wider mb-1">Принято SAP</div>
            <div className="text-2xl font-black text-emerald-400 tabular-nums">{stats.sapAccepted}</div>
          </div>
          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4">
            <div className="text-[10px] font-bold text-emerald-400/60 uppercase tracking-wider mb-1">Принято LES</div>
            <div className="text-2xl font-black text-emerald-400 tabular-nums">{stats.lesAccepted}</div>
          </div>
          <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4">
            <div className="text-[10px] font-bold text-amber-400/60 uppercase tracking-wider mb-1">Ожидает проверки</div>
            <div className="text-2xl font-black text-amber-400 tabular-nums">{stats.waiting}</div>
          </div>
        </div>

        {/* Table Header */}
        <div className="hidden md:grid grid-cols-[50px_1fr_1fr_1fr_1fr_140px_140px] gap-2 px-4 py-2 text-[10px] font-bold text-white/30 uppercase tracking-wider border-b border-white/5">
          <div>№</div>
          <div>ID контейнера</div>
          <div>Зона выгрузки</div>
          <div>Окончание выгрузки</div>
          <div>Оператор</div>
          <div className="text-center">Статус SAP</div>
          <div className="text-center">Статус LES</div>
        </div>
      </div>

      {/* Table Body */}
      <div className="flex-1 overflow-y-auto">
        {loading && doneTasks.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-white/40 animate-pulse text-sm font-mono tracking-widest">ЗАГРУЗКА...</div>
          </div>
        ) : doneTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-white/30">
            <CheckCircle2 size={48} className="mb-4 opacity-30" />
            <div className="text-sm font-bold">Нет завершенных машин за сегодня</div>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {doneTasks.map((task, index) => (
              <div
                key={task.id}
                className="grid grid-cols-1 md:grid-cols-[50px_1fr_1fr_1fr_1fr_140px_140px] gap-2 px-4 py-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 transition-all items-center"
              >
                <div className="text-white/30 text-xs font-mono hidden md:block">{index + 1}</div>
                <div className="text-white font-bold text-sm tracking-wide">{task.id}</div>
                <div className="text-white/60 text-sm">{task.zone || '—'}</div>
                <div className="text-white/60 text-sm font-mono">{task.end_time || '—'}</div>
                <div className="text-white/60 text-sm">{task.operator || '—'}</div>
                <div className="flex justify-center">
                  <StatusBadge
                    status={(task.sap_status || 'WAIT') as AccountingStatus}
                    onClick={() => handleStatusClick(task.id, 'SAP')}
                  />
                </div>
                <div className="flex justify-center">
                  <StatusBadge
                    status={(task.les_status || 'WAIT') as AccountingStatus}
                    onClick={() => handleStatusClick(task.id, 'LES')}
                  />
                </div>

                {/* Mobile layout labels */}
                <div className="md:hidden col-span-1 flex flex-wrap gap-2 text-[10px] text-white/30 mt-1">
                  <span>#{index + 1}</span>
                  <span>Зона: {task.zone || '—'}</span>
                  <span>Оконч.: {task.end_time || '—'}</span>
                  <span>Оператор: {task.operator || '—'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountingView;
