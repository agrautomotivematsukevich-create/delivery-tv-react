import React, { useState, useEffect } from 'react';
import { User, Lang, TranslationSet } from '../types';
import { Globe, User as UserIcon, LogOut, ChevronDown, ScanBarcode, LogIn, AlertTriangle, History, LayoutDashboard, Archive, Truck, TrendingDown } from 'lucide-react';

interface HeaderProps {
  user: User | null;
  lang: Lang;
  t: TranslationSet;
  view: 'dashboard' | 'history' | 'logistics' | 'downtime'; // ОБНОВЛЕНО
  setView: (view: 'dashboard' | 'history' | 'logistics' | 'downtime') => void; // ОБНОВЛЕНО
  onToggleLang: () => void;
  onLoginClick: () => void;
  onLogoutClick: () => void;
  onTerminalClick: () => void;
  onStatsClick: () => void;
  onIssueClick: () => void;
  onHistoryClick: () => void; 
  title: string;
}

const Header: React.FC<HeaderProps> = ({ 
  user, lang, t, view, setView, onToggleLang, onLoginClick, onLogoutClick, onTerminalClick, onStatsClick, onIssueClick, onHistoryClick, title
}) => {
  const [time, setTime] = useState(new Date());
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const formattedDate = time.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 h-auto z-50 gap-4 relative pt-2">
      
      {/* Title + Mobile Time Block */}
      <div className="flex justify-between items-center w-full md:w-auto">
        <div 
          onClick={onStatsClick}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <span className="text-xl md:text-3xl font-extrabold tracking-tight text-white group-hover:text-accent-blue transition-colors uppercase whitespace-nowrap">
            {title}
          </span>
          <ChevronDown className="text-white/30 w-5 h-5 group-hover:text-white transition-colors" />
        </div>

        <div className="md:hidden font-mono text-lg font-bold tabular-nums text-white/50 bg-white/5 px-3 py-1 rounded-lg border border-white/5">
          {formattedTime}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
        {/* Navigation Bar */}
        {user && (
          <div className="flex items-center p-1 rounded-xl bg-white/5 border border-white/5 overflow-x-auto no-scrollbar max-w-full">
             <button 
               onClick={() => setView('dashboard')}
               className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${view === 'dashboard' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
             >
               <LayoutDashboard size={14} />
               <span className="hidden sm:inline lg:inline">{t.nav_dashboard}</span>
             </button>
             <button 
               onClick={() => setView('history')}
               className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${view === 'history' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
             >
               <Archive size={14} />
               <span className="hidden sm:inline lg:inline">{t.nav_history}</span>
             </button>
             
             {/* НОВАЯ КНОПКА: Простои (только для LOGISTIC и ADMIN) */}
             {(user.role === 'LOGISTIC' || user.role === 'ADMIN') && (
               <button 
                 onClick={() => setView('downtime')}
                 className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${view === 'downtime' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
               >
                 <TrendingDown size={14} />
                 <span className="hidden sm:inline lg:inline">{t.nav_downtime}</span>
               </button>
             )}
             
             {(user.role === 'LOGISTIC' || user.role === 'ADMIN') && (
               <button 
                 onClick={() => setView('logistics')}
                 className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${view === 'logistics' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
               >
                 <Truck size={14} />
                 <span className="hidden sm:inline lg:inline">{t.nav_plan}</span>
               </button>
             )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 ml-auto md:ml-0">
           <button 
             onClick={onToggleLang}
             className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-white/40 hover:text-white bg-white/5 md:bg-transparent"
           >
             <Globe size={16} />
             <span>{lang === 'RU' ? 'RU' : 'EN'}</span>
           </button>

           {user && (
             <>
               <button 
                  onClick={onTerminalClick}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-wider text-accent-blue bg-accent-blue/10 border border-accent-blue/20"
               >
                 <ScanBarcode size={16} />
                 <span className="hidden xs:inline">{t.drv_title}</span>
               </button>

               <button 
                  onClick={onIssueClick}
                  className="p-2 rounded-xl text-accent-red bg-accent-red/10 md:bg-transparent border border-accent-red/20 md:border-transparent"
               >
                 <AlertTriangle size={18} />
               </button>
             </>
           )}
        </div>

        {/* User Profile */}
        <div className="relative">
          {user ? (
             <button 
               onClick={() => setIsDropdownOpen(!isDropdownOpen)}
               className="flex items-center gap-2 pl-1 pr-3 py-1.5 rounded-xl border border-white/10 bg-white/5"
             >
               <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white">
                 <UserIcon size={12} />
               </div>
               <span className="text-[10px] md:text-xs font-bold text-white uppercase tracking-wider max-w-[80px] truncate">{user.name}</span>
               <ChevronDown size={12} className="text-white/30" />
             </button>
          ) : (
            <button 
              onClick={onLoginClick} 
              className="px-4 py-2 rounded-xl bg-white text-black font-bold text-[10px] md:text-xs uppercase tracking-widest"
            >
               {t.btn_login}
            </button>
          )}

          {isDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)}></div>
              <div className="absolute top-full right-0 mt-2 w-48 bg-[#1A1A1F] border border-white/10 rounded-xl shadow-2xl z-50 p-1">
                <button onClick={() => { onHistoryClick(); setIsDropdownOpen(false); }} className="w-full flex items-center gap-3 px-3 py-3 text-sm font-bold text-white/70 hover:text-white hover:bg-white/5 rounded-lg text-left">
                  <History size={16} /> {t.menu_history}
                </button>
                <div className="h-px bg-white/5 my-1"></div>
                <button onClick={() => { onLogoutClick(); setIsDropdownOpen(false); }} className="w-full flex items-center gap-3 px-3 py-3 text-sm font-bold text-accent-red hover:bg-accent-red/10 rounded-lg text-left">
                  <LogOut size={16} /> {t.menu_logout}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Desktop Time */}
      <div className="text-right hidden lg:block">
        <div className="font-mono text-3xl font-bold text-white leading-none tabular-nums tracking-tight">{formattedTime}</div>
        <div className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mt-2">{formattedDate}</div>
      </div>
    </div>
  );
};

export default Header;
