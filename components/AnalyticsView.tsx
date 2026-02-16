import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Task, TranslationSet } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Cell } from 'recharts';
import { TrendingUp, Box, Clock, AlertCircle } from 'lucide-react';

interface AnalyticsViewProps {
  t: TranslationSet;
}

interface DayData {
  label: string;
  date: string;
  total: number;
  done: number;
  avgMin: number;
}

const getLast7Days = (): { label: string; ddmm: string; iso: string }[] => {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const weekday = d.toLocaleDateString('ru-RU', { weekday: 'short' });
    days.push({ label: `${dd}.${mm}`, ddmm: `${dd}.${mm}`, iso: d.toISOString().split('T')[0] });
  }
  return days;
};

const timeDiffMin = (start?: string, end?: string): number | null => {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (isNaN(sh) || isNaN(eh)) return null;
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 && diff < 480 ? diff : null; // игнорируем аномалии > 8ч
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1a1e] border border-white/10 rounded-xl px-4 py-3 text-sm">
      <p className="font-bold text-white mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-mono">
          {p.name}: <span className="font-bold">{p.value ?? '—'}</span>
        </p>
      ))}
    </div>
  );
};

const AnalyticsView: React.FC<AnalyticsViewProps> = ({ t }) => {
  const [dayData, setDayData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const load = async () => {
      const days = getLast7Days();
      const results: DayData[] = [];
      for (let i = 0; i < days.length; i++) {
        const { label, ddmm } = days[i];
        setProgress(Math.round(((i + 1) / days.length) * 100));
        try {
          const tasks: Task[] = await api.fetchHistory(ddmm);
          const done = tasks.filter(t => t.status === 'DONE').length;
          const durations = tasks.map(t => timeDiffMin(t.start_time, t.end_time)).filter((d): d is number => d !== null);
          const avgMin = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
          results.push({ label, date: ddmm, total: tasks.length, done, avgMin });
        } catch {
          results.push({ label, date: ddmm, total: 0, done: 0, avgMin: 0 });
        }
      }
      setDayData(results);
      setLoading(false);
    };
    load();
  }, []);

  const totalWeek = dayData.reduce((s, d) => s + d.done, 0);
  const avgTimeWeek = (() => {
    const vals = dayData.filter(d => d.avgMin > 0).map(d => d.avgMin);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  })();
  const bestDay = dayData.reduce((best, d) => d.done > (best?.done ?? -1) ? d : best, dayData[0]);

  const glassPanelClass = 'bg-card-bg backdrop-blur-xl border border-white/10 rounded-3xl';

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4">
        <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-accent-blue transition-all duration-300 rounded-full" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-white/40 text-sm">Загрузка данных за 7 дней... {progress}%</p>
      </div>
    );
  }

  const hasAnyData = dayData.some(d => d.total > 0);

  if (!hasAnyData) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 text-white/30">
        <AlertCircle size={48} strokeWidth={1} />
        <p>{t.analytics_no_data}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-6">
      <h2 className="text-lg font-black text-white/70 uppercase tracking-widest">{t.analytics_title}</h2>

      {/* KPI карточки */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Box, label: 'За неделю', value: totalWeek, unit: 'конт.', color: 'text-accent-green' },
          { icon: Clock, label: 'Среднее время', value: avgTimeWeek || '—', unit: avgTimeWeek ? 'мин' : '', color: 'text-accent-blue' },
          { icon: TrendingUp, label: 'Лучший день', value: bestDay?.label || '—', unit: bestDay ? `${bestDay.done} конт.` : '', color: 'text-accent-yellow' },
        ].map(({ icon: Icon, label, value, unit, color }) => (
          <div key={label} className={`${glassPanelClass} p-5 flex flex-col gap-2`}>
            <div className="flex items-center gap-2">
              <Icon size={16} className={color} />
              <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{label}</span>
            </div>
            <div className={`text-3xl font-black tabular-nums ${color}`}>{value}</div>
            <div className="text-xs text-white/30">{unit}</div>
          </div>
        ))}
      </div>

      {/* График: Контейнеры по дням */}
      <div className={`${glassPanelClass} p-6`}>
        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-5">{t.analytics_containers} / день</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={dayData} barSize={28}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="done" name="Выполнено" radius={[6, 6, 0, 0]}>
              {dayData.map((entry, i) => (
                <Cell key={i} fill={entry.done === (bestDay?.done ?? 0) && entry.done > 0 ? '#00E676' : '#3B82F6'} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* График: Среднее время обработки */}
      <div className={`${glassPanelClass} p-6`}>
        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-5">{t.analytics_avg_time} / день</p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={dayData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} unit="м" />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="avgMin"
              name="Среднее (мин)"
              stroke="#00d4ff"
              strokeWidth={2.5}
              dot={{ fill: '#00d4ff', r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Таблица */}
      <div className={`${glassPanelClass} overflow-hidden`}>
        <div className="grid grid-cols-4 px-6 py-3 bg-white/5 border-b border-white/5">
          {['Дата', 'Всего', 'Выполнено', 'Среднее время'].map(h => (
            <span key={h} className="text-[10px] font-black text-white/30 uppercase tracking-widest">{h}</span>
          ))}
        </div>
        {dayData.map(d => (
          <div key={d.date} className="grid grid-cols-4 px-6 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
            <span className="font-mono text-white/70 text-sm">{d.label}</span>
            <span className="font-mono text-white/50 text-sm">{d.total}</span>
            <span className={`font-mono font-bold text-sm ${d.done > 0 ? 'text-accent-green' : 'text-white/20'}`}>{d.done}</span>
            <span className={`font-mono text-sm ${d.avgMin > 0 ? 'text-white/70' : 'text-white/20'}`}>{d.avgMin > 0 ? `${d.avgMin} мин` : '—'}</span>
          </div>
        ))}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
      `}</style>
    </div>
  );
};

export default AnalyticsView;
