import React, { useState, useEffect } from 'react';
import { User, Lang, TranslationSet } from '../types';
import { api } from '../services/api';
import { Globe, User as UserIcon, LogOut, ChevronDown, ScanBarcode, LogIn, TriangleAlert, History, LayoutDashboard, Archive, Truck, ShieldCheck, MessageSquare, Bell } from 'lucide-react';

interface HeaderProps {
  user: User | null;
  lang: Lang;
  t: TranslationSet;
  view: 'dashboard' | 'history' | 'logistics' | 'admin';
  setView: (view: 'dashboard' | 'history' | 'logistics' | 'admin') => void;
  onToggleLang: () => void;
  onLoginClick: () => void;
  onLogoutClick: () => void;
  onTerminalClick: () => void;
  onStatsClick: () => void;
  onIssueClick: () => void;
  onHistoryClick: () => void;
  onMessengerClick: () => void;
  title: string;
}

const Header: React.FC<HeaderProps> = ({ 
  user, lang, t, view, setView, onToggleLang, onLoginClick, onLogoutClick, onTerminalClick, onStatsClick, onIssueClick, onHistoryClick, onMessengerClick, title
}) => {
  const [time, setTime] = useState(new Date());
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Poll for unread messages
  useEffect(() => {
    if (!user) return;

    const checkMessages = async () => {
      try {
        const msgs = await api.fetchMessages();
        if (msgs.length > 0) {
          const lastReadId = parseInt(localStorage.getItem('warehouse_last_read_msg_id') || '0');
          // IDs are sequential numbers as strings
          const unread = msgs.filter(m => parseInt(m.id) > lastReadId).length;
          setUnreadCount(unread);
        }
      } catch (e) {
        console.error("Msg poll error", e);
      }
    };

    checkMessages();
    const interval = setInterval(checkMessages, 10000); // 10s poll
    return () => clearInterval(interval);
  }, [user]);

  const handleMessengerOpen = () => {
    onMessengerClick();
    setUnreadCount(0);
    
    // Update last read ID
    api.fetchMessages().then(msgs => {
      if (msgs.length > 0) {
        const latestId = msgs[msgs.length - 1].id;
        localStorage.setItem('warehouse_last_read_msg_id', latestId);
      }
    });
  };

  const formattedTime = time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const formattedDate = time.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 h-auto md:h-20 z-50 gap-4 relative">
      
      {/* Title */}
      <div 
        onClick={onStatsClick}
        className="flex items-center gap-2 cursor-pointer group"
      >
        <span className="text-2xl md:text-3xl font-extrabold tracking-tight text-white group-hover:text-accent-blue transition-colors uppercase">
          {title}
        </span>
        <ChevronDown className="text-white/30 w-5 h-5 mt-1 group-hover:text-white transition-colors" />
      </div>

      <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
        
        {/* Navigation Bar */}
        {user && (
          <div className="flex items-center p-1 rounded-xl bg-white/5 border border-white/5">
             <button 
               onClick={() => setView('dashboard')}
               className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${view === 'dashboard' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
             >
               <LayoutDashboard size={14} />
               <span className="hidden lg:inline">{t.nav_dashboard}</span>
             </button>
             <div className="w-px h-4 bg-white/5 mx-1"></div>
             <button 
               onClick={() => setView('history')}
               className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${view === 'history' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
             >
               <Archive size={14} />
               <span className="hidden lg:inline">{t.nav_history}</span>
             </button>
             {(user.role === 'LOGISTIC' || user.role === 'ADMIN') && (
               <>
                 <div className="w-px h-4 bg-white/5 mx-1"></div>
                 <button 
                   onClick={() => setView('logistics')}
                   className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${view === 'logistics' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                 >
                   <Truck size={14} />
                   <span className="hidden lg:inline">{t.nav_plan}</span>
                 </button>
               </>
             )}
             {user.role === 'ADMIN' && (
               <>
                 <div className="w-px h-4 bg-white/5 mx-1"></div>
                 <button 
                   onClick={() => setView('admin')}
                   className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${view === 'admin' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                 >
                   <ShieldCheck size={14} />
                   <span className="hidden lg:inline">{t.nav_admin}</span>
                 </button>
               </>
             )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
           <button 
             onClick={onToggleLang}
             className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-white/40 hover:text-white hover:bg-white/5 transition-all"
           >
             <Globe size={16} />
             <span>{lang === 'RU' ? 'RU' : 'EN'}</span>
           </button>

           {user && (
             <>
               <button 
                  onClick={onTerminalClick}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-accent-blue bg-accent-blue/10 border border-accent-blue/20 hover:bg-accent-blue/20 transition-all"
               >
                 <ScanBarcode size={16} />
                 <span className="hidden sm:inline">{t.drv_title}</span>
               </button>

               <button 
                  onClick={onIssueClick}
                  className="p-2 rounded-xl text-accent-red hover:bg-accent-red/10 transition-all border border-transparent hover:border-accent-red/20"
               >
                 <TriangleAlert size={18} />
               </button>

               <button 
                  onClick={handleMessengerOpen}
                  className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all border border-transparent relative group"
                  title={t.menu_messenger}
               >
                 <Bell size={18} />
                 {unreadCount > 0 && (
                   <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-accent-red rounded-full shadow-[0_0_8px_rgba(255,59,48,0.8)] animate-pulse"></span>
                 )}
               </button>
             </>
           )}
        </div>

        {/* User Profile */}
        <div className="relative">
          {user ? (
            <div className="relative">
                <button 
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center gap-3 pl-2 pr-4 py-2 rounded-xl border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center text-xs font-bold text-white border border-white/5 group-hover:border-white/20">
                    <UserIcon size={14} />
                  </div>
                  <span className="text-xs font-bold text-white uppercase tracking-wider">{user.name}</span>
                  <ChevronDown size={14} className={`text-white/30 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)}></div>
                    <div className="absolute top-full right-0 mt-2 w-56 bg-[#1A1A1F] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 p-1">
                      <button 
                        onClick={() => { onHistoryClick(); setIsDropdownOpen(false); }}
                        className="w-full flex items-center gap-3 px-3 py-3 text-sm font-bold text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-left"
                      >
                        <History size={16} />
                        <span>{t.menu_history}</span>
                      </button>
                      
                      <button 
                        onClick={() => { handleMessengerOpen(); setIsDropdownOpen(false); }}
                        className="w-full flex items-center gap-3 px-3 py-3 text-sm font-bold text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-left"
                      >
                        <div className="relative">
                          <MessageSquare size={16} />
                          {unreadCount > 0 && (
                             <span className="absolute -top-1 -right-1 w-2 h-2 bg-accent-red rounded-full"></span>
                          )}
                        </div>
                        <span>{t.menu_messenger}</span>
                      </button>
                      
                      <div className="h-px bg-white/5 my-1"></div>
                      <button 
                        onClick={() => { onLogoutClick(); setIsDropdownOpen(false); }}
                        className="w-full flex items-center gap-3 px-3 py-3 text-sm font-bold text-accent-red hover:bg-accent-red/10 rounded-lg transition-colors text-left"
                      >
                        <LogOut size={16} />
                        <span>{t.menu_logout}</span>
                      </button>
                    </div>
                  </>
                )}
            </div>
          ) : (
            <button 
              onClick={onLoginClick} 
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-bold hover:bg-gray-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.1)] active:scale-95"
            >
               <LogIn size={16} />
               <span className="text-xs uppercase tracking-widest">{t.btn_login}</span>
            </button>
          )}
        </div>

      </div>

      <div className="text-right ml-auto md:ml-0 hidden lg:block">
        <div className="font-mono text-3xl font-bold text-white leading-none tabular-nums tracking-tight">{formattedTime}</div>
        <div className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mt-2 text-right">{formattedDate}</div>
      </div>
      
       {/* Mobile Time */}
      <div className="md:hidden absolute top-0 right-0 p-4 pointer-events-none">
          <div className="font-mono text-xl font-bold tabular-nums text-white/50">{formattedTime}</div>
      </div>
    </div>
  );
};

export default Header;