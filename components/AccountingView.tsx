import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { Task, TranslationSet } from '../types';
import { Download, RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { getMillisecondsUntilNextOperationalBoundary, getOperationalDateInfo } from '../utils/time';

interface AccountingViewProps {
  t: TranslationSet;
}

type AccountingStatus = 'WAIT' | 'ACCEPTED' | 'REJECTED';
type AccountingFilter = 'ALL' | 'UNACCEPTED';

const STATUS_CYCLE: AccountingStatus[] = ['WAIT', 'ACCEPTED', 'REJECTED'];

const STATUS_CONFIG: Record<AccountingStatus, { icon: React.ReactNode; label: string; bg: string; text: string; border: string }> = {
  WAIT: { icon: <Clock size={14} />, label: 'Ожидает', bg: 'bg-white/10', text: 'text-white/70', border: 'border-white/10' },
  ACCEPTED: { icon: <CheckCircle2 size={14} />, label: 'Принят', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  REJECTED: { icon: <XCircle size={14} />, label: 'Не принят', bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/20' },
};

const NEXT_ACTION_CONFIG: Record<AccountingStatus, { label: string; bg: string; text: string; border: string }> = {
  WAIT: { label: 'Принять', bg: 'bg-emerald-500/10', text: 'text-emerald-300', border: 'border-emerald-500/20' },
  ACCEPTED: { label: 'Не принять', bg: 'bg-red-500/10', text: 'text-red-300', border: 'border-red-500/20' },
  REJECTED: { label: 'Ожидает', bg: 'bg-white/5', text: 'text-white/75', border: 'border-white/10' },
};

function nextStatus(current: AccountingStatus): AccountingStatus {
  const idx = STATUS_CYCLE.indexOf(current);
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}

function isUnacceptedTask(task: Task): boolean {
  return task.sap_status !== 'ACCEPTED' || task.les_status !== 'ACCEPTED';
}

const StatusBadge: React.FC<{
  status: AccountingStatus;
  onClick: () => void;
  system?: 'SAP' | 'LES';
  showSystemLabel?: boolean;
}> = ({ status, onClick, system, showSystemLabel = false }) => {
  const currentConfig = STATUS_CONFIG[status];
  const nextActionConfig = NEXT_ACTION_CONFIG[status];

  return (
    <div className="w-full min-w-0">
      {showSystemLabel && system && (
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/35">{system}</div>
      )}

      <div className={`flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-bold ${currentConfig.bg} ${currentConfig.text} ${currentConfig.border}`}>
        {currentConfig.icon}
        <span className="truncate">{currentConfig.label}</span>
      </div>

      <div className="mt-2 mb-1 text-center text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">
        Следующее нажатие
      </div>

      <button
        onClick={onClick}
        className={`w-full min-h-[42px] rounded-xl border px-3 py-2 text-[11px] font-black leading-tight transition-all hover:bg-white/10 active:scale-[0.98] ${nextActionConfig.bg} ${nextActionConfig.text} ${nextActionConfig.border}`}
      >
        {nextActionConfig.label}
      </button>
    </div>
  );
};

const AccountingView: React.FC<AccountingViewProps> = ({ t }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountingFilter, setAccountingFilter] = useState<AccountingFilter>('ALL');
  const [activeSheetDate, setActiveSheetDate] = useState(() => getOperationalDateInfo().operationalSheetName);

  const loadData = useCallback(async (sheetDate: string = getOperationalDateInfo().operationalSheetName) => {
    setLoading(true);
    try {
      const data = await api.fetchHistory(sheetDate);
      setActiveSheetDate(sheetDate);
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

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const scheduleBoundaryRefresh = () => {
      timeoutId = setTimeout(() => {
        loadData(getOperationalDateInfo().operationalSheetName);
        scheduleBoundaryRefresh();
      }, getMillisecondsUntilNextOperationalBoundary());
    };

    scheduleBoundaryRefresh();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [loadData]);

  const doneTasks = useMemo(() => tasks.filter((t) => t.status === 'DONE'), [tasks]);

  const stats = useMemo(() => {
    const total = doneTasks.length;
    const sapAccepted = doneTasks.filter((t) => t.sap_status === 'ACCEPTED').length;
    const lesAccepted = doneTasks.filter((t) => t.les_status === 'ACCEPTED').length;
    const waiting = doneTasks.filter(isUnacceptedTask).length;
    return { total, sapAccepted, lesAccepted, waiting };
  }, [doneTasks]);

  const filteredDoneTasks = useMemo(() => {
    if (accountingFilter === 'ALL') return doneTasks;
    return doneTasks.filter(isUnacceptedTask);
  }, [accountingFilter, doneTasks]);

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

    const targetSheetDate = task.sheet_date || activeSheetDate;
    const ok = await api.updateAccountingStatus(taskId, system, newStatus, targetSheetDate);
    if (!ok) {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, [field]: current } : t))
      );
    }
  }, [activeSheetDate, tasks]);

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
    a.download = `accounting_${activeSheetDate.replace('.', '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeSheetDate, doneTasks]);

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full">
      <div className="flex-1 overflow-y-auto custom-scrollbar relative">
        {/* Sticky Header */}
        <div className="sticky top-0 z-50 bg-[#191B25] pt-2 pb-4 shadow-xl border-b border-white/5">
          {/* Title + Actions */}
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg md:text-xl font-extrabold text-white tracking-tight uppercase">
              Учет SAP / LES
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => loadData()}
                className="flex min-h-[42px] items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-xs font-bold text-white/60 transition-all hover:text-white"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                Обновить
              </button>
              <button
                onClick={exportCSV}
                disabled={doneTasks.length === 0}
                className="flex min-h-[42px] items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-400 transition-all hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download size={14} />
                Выгрузить отчет (CSV)
              </button>
            </div>
          </div>

          <div className="mb-4 flex flex-col gap-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
              Быстрый фильтр контейнеров
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setAccountingFilter('ALL')}
                aria-pressed={accountingFilter === 'ALL'}
                className={`flex min-h-[42px] items-center gap-2 rounded-xl border px-4 py-2 text-xs font-black transition-all ${accountingFilter === 'ALL' ? 'border-cyan-400/30 bg-cyan-400/15 text-cyan-100' : 'border-white/10 bg-white/5 text-white/70 hover:text-white'}`}
              >
                <span>Все</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${accountingFilter === 'ALL' ? 'bg-cyan-300/20 text-cyan-50' : 'bg-white/10 text-white/60'}`}>
                  {stats.total}
                </span>
              </button>
              <button
                onClick={() => setAccountingFilter('UNACCEPTED')}
                aria-pressed={accountingFilter === 'UNACCEPTED'}
                className={`flex min-h-[42px] items-center gap-2 rounded-xl border px-4 py-2 text-xs font-black transition-all ${accountingFilter === 'UNACCEPTED' ? 'border-amber-400/30 bg-amber-400/15 text-amber-50' : 'border-white/10 bg-white/5 text-white/70 hover:text-white'}`}
              >
                <span>Непринятые</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${accountingFilter === 'UNACCEPTED' ? 'bg-amber-300/20 text-amber-50' : 'bg-white/10 text-white/60'}`}>
                  {stats.waiting}
                </span>
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
          <div className="hidden md:grid grid-cols-[50px_1fr_1fr_1fr_1fr_140px_140px] gap-2 px-4 py-2 text-[10px] font-bold text-white/30 uppercase tracking-wider">
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
        <div className="pb-8">
        {loading && doneTasks.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-white/40 animate-pulse text-sm font-mono tracking-widest">ЗАГРУЗКА...</div>
          </div>
        ) : doneTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-white/30">
            <CheckCircle2 size={48} className="mb-4 opacity-30" />
            <div className="text-sm font-bold">Нет завершенных машин за сегодня</div>
          </div>
        ) : filteredDoneTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-white/30">
            <CheckCircle2 size={48} className="mb-4 opacity-30" />
            <div className="text-sm font-bold">Непринятых контейнеров нет</div>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filteredDoneTasks.map((task, index) => (
              <div
                key={task.id}
                className="grid grid-cols-1 md:grid-cols-[50px_1fr_1fr_1fr_1fr_140px_140px] gap-2 px-4 py-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 transition-all items-center"
              >
                <div className="text-white/30 text-xs font-mono hidden md:block">{index + 1}</div>
                <div className="text-white font-bold text-sm tracking-wide md:pr-2">{task.id}</div>
                <div className="hidden text-white/60 text-sm md:block">{task.zone || '—'}</div>
                <div className="hidden text-white/60 text-sm font-mono md:block">{task.end_time || '—'}</div>
                <div className="hidden text-white/60 text-sm md:block">{task.operator || '—'}</div>
                <div className="hidden md:flex md:justify-center">
                  <StatusBadge
                    status={(task.sap_status || 'WAIT') as AccountingStatus}
                    onClick={() => handleStatusClick(task.id, 'SAP')}
                  />
                </div>
                <div className="hidden md:flex md:justify-center">
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
                <div className="md:hidden col-span-1 grid grid-cols-1 min-[390px]:grid-cols-2 gap-2 mt-1">
                  <StatusBadge
                    system="SAP"
                    showSystemLabel
                    status={(task.sap_status || 'WAIT') as AccountingStatus}
                    onClick={() => handleStatusClick(task.id, 'SAP')}
                  />
                  <StatusBadge
                    system="LES"
                    showSystemLabel
                    status={(task.les_status || 'WAIT') as AccountingStatus}
                    onClick={() => handleStatusClick(task.id, 'LES')}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default AccountingView;
