import React, { useState, useEffect } from 'react';
import { DashboardData, TranslationSet } from '../types';
import { Package, Clock } from 'lucide-react';

interface DashboardProps {
  data: DashboardData | null;
  t: TranslationSet;
}

const formatMinutes = (totalMinutes: number, t: TranslationSet): string => {
  const absMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;

  let timeString = "";
  if (hours > 0) {
    timeString += `${hours}ч `;
  }
  if (mins > 0 || hours === 0) {
    timeString += `${mins} мин`;
  }

  const prefix = totalMinutes >= 0 ? t.eta_prefix : t.delay_prefix;
  return `${prefix}${timeString.trim()}`;
};

const calculateTimeDiff = (timeStr: string, t: TranslationSet): string => {
  if (!timeStr || !timeStr.includes(':')) return "...";
  const match = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!match) return "...";
  
  const targetH = parseInt(match[1]);
  const targetM = parseInt(match[2]);
  const now = new Date();
  let target = new Date();
  
  target.setHours(targetH, targetM, 0, 0);
  
  let diffMinutes = Math.round((target.getTime() - now.getTime()) / 60000);
  
  if (diffMinutes < -720) diffMinutes += 1440;
  if (diffMinutes === 0) return "NOW";
  
  return formatMinutes(diffMinutes, t);
};

const Dashboard: React.FC<DashboardProps> = ({ data, t }) => {
  // Добавляем состояние для живого обновления таймеров каждую минуту
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000); // Обновляем раз в 30 сек
    return () => clearInterval(timer);
  }, []);

  // Функция расчета времени "В работе"
  const getWorkDuration = (startStr: string) => {
    if (!startStr || !startStr.includes(':')) return null;
    const [h, m] = startStr.split(':').map(Number);
    
    const startTime = new Date(now);
    startTime.setHours(h, m, 0, 0);

    // Если время старта больше текущего (например, ошибка ввода или будущее), корректируем
    let diffMs = now.getTime() - startTime.getTime();
    
    // Обработка перехода через полночь (если начали в 23:00, а сейчас 01:00)
    // Если разница отрицательная и большая (например, -23 часа), значит перешли сутки
    if (diffMs < -12 * 60 * 60 * 1000) {
       diffMs += 24 * 60 * 60 * 1000;
    } 
    // Если задача "из будущего" (небольшой минус), считаем 0
    else if (diffMs < 0) {
       diffMs = 0;
    }

    const totalMins = Math.floor(diffMs / 60000);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;

    return `${hrs > 0 ? `${hrs}ч ` : ''}${mins} мин`;
  };

  if (!data) return <div className="text-white/30 animate-pulse text-center mt-20">Loading Dashboard...</div>;

  const percent = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;
  const radius = 150;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  const isVictory = data.total > 0 && data.done === data.total;
  const isEmpty = data.total === 0;

  const getStatusClass = (s: string) => {
    if (s === 'ACTIVE') return 'text-accent-green border-accent-green bg-accent-green/10 shadow-[0_0_20px_rgba(0,230,118,0.4)]';
    if (s === 'PAUSE') return 'text-accent-yellow border-accent-yellow bg-accent-yellow/10 shadow-[0_0_20px_rgba(255,214,10,0.2)]';
    return 'bg-white/5 border-white/5 text-white';
  };

  const glassPanelClass = "bg-card-bg backdrop-blur-xl border border-white/10 border-t-white/15 rounded-3xl shadow-[0_20px_40px_rgba(0,0,0,0.4)]";

  return (
    <div className="dashboard-root grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8 flex-1 min-h-0">
      {/* Left Panel */}
      <div className={`${glassPanelClass} relative flex flex-col items-center justify-between p-10 overflow-hidden text-center`}>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] bg-accent-green blur-[120px] opacity-5 pointer-events-none"></div>
        <div className="text-xs font-bold text-white/30 uppercase tracking-[2px] w-full text-left mb-2">{t.progress}</div>
        
        <div className="flex-1 flex items-center justify-center w-full my-4">
          <div className="relative w-[85%] pb-[85%] h-0">
            <svg className="absolute top-0 left-0 w-full h-full -rotate-90" viewBox="0 0 350 350">
              <circle cx="175" cy="175" r="150" fill="none" strokeWidth="8" className="stroke-white/5" />
              <circle 
                cx="175" cy="175" r="150" 
                fill="none" strokeWidth="8" strokeLinecap="round" 
                className="stroke-accent-green transition-all duration-1000 ease-in-out"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-6xl lg:text-7xl font-extrabold tracking-tighter text-white z-10">
              {percent}%
            </div>
          </div>
        </div>

        <div className="font-mono text-3xl text-white/50 font-medium mb-8">{data.done} / {data.total}</div>
        <div className={`w-full py-5 rounded-2xl text-lg font-extrabold uppercase tracking-widest border transition-all duration-300 ${getStatusClass(data.status)}`}>
           {data.status === 'ACTIVE' ? t.status_active : data.status === 'PAUSE' ? t.status_pause : t.status_wait}
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex flex-col gap-6 h-full min-h-0">
        {!isVictory && !isEmpty && (
          <div className={`${glassPanelClass} p-8 flex flex-col justify-center`}>
            <div className="text-xs font-bold text-white/30 uppercase tracking-[2px] mb-2">{t.next}</div>
            <div className="font-mono text-6xl md:text-7xl font-bold tracking-tighter my-2 bg-gradient-to-b from-white to-gray-400 bg-clip-text text-transparent break-all">
              {data.nextId}
            </div>
            <div className="text-2xl text-accent-blue font-semibold flex items-center gap-3">
               <Clock className="w-6 h-6" />
               {calculateTimeDiff(data.nextTime, t)}
            </div>
          </div>
        )}

        {!isVictory && !isEmpty && (
          <div className={`${glassPanelClass} flex-1 min-h-0 flex flex-col relative overflow-hidden`}>
            <div className="text-xs font-bold text-white/30 uppercase tracking-[2px] p-6 pb-0">{t.list}</div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {data.activeList.map(item => (
                <div key={item.id} className="flex items-center p-5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group relative">
                   <div className="w-12 h-12 flex items-center justify-center shrink-0">
                      <Package className="w-10 h-10 text-white/80" />
                   </div>
                   <div className="flex-1 flex items-center gap-4 ml-6 overflow-hidden">
                      <span className="font-mono text-3xl md:text-4xl font-bold tracking-tight text-gray-100 truncate">{item.id}</span>
                      {item.zone && (
                        <span className="px-2 py-1 rounded bg-white/10 border border-white/10 text-sm font-bold text-white/70 uppercase">
                          {item.zone}
                        </span>
                      )}
                   </div>
                   <div className="ml-auto flex flex-col items-end shrink-0">
                      <span className="text-[0.7rem] uppercase text-white/50 font-bold tracking-widest mb-1">{t.lbl_start}</span>
                      <span className="font-mono text-2xl font-bold text-accent-green leading-none">{item.start}</span>
                      
                      {/* --- ДОБАВЛЕН ТАЙМЕР --- */}
                      <span className="mt-2 font-mono text-sm font-bold text-blue-400 flex items-center gap-1.5 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                        <Clock size={12} />
                        {getWorkDuration(item.start)}
                      </span>
                      {/* ----------------------- */}

                   </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(isVictory || isEmpty) && (
          <div className={`${glassPanelClass} flex-1 flex flex-col items-center justify-center text-center p-8`}>
            {isVictory ? (
              <>
                 <div className="text-8xl mb-6 animate-bounce">🏆</div>
                 <div className="text-4xl md:text-5xl font-black text-white">{t.victory}</div>
              </>
            ) : (
              <>
                 <div className="text-8xl mb-6 opacity-30">📅</div>
                 <div className="text-4xl md:text-5xl font-black text-white/30">{t.empty}</div>
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        .dashboard-root .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .dashboard-root .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
      `}</style>
    </div>
  );
};

export default Dashboard;