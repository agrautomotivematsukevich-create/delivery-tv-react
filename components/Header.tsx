import React, { useState, useEffect } from 'react';
import { User, Lang, TranslationSet } from '../types';
import {
  Globe, User as UserIcon, LogOut, ChevronDown, ScanBarcode,
  AlertTriangle, History, LayoutDashboard, Archive, Truck,
  TrendingDown, BarChart2, Tv, Wifi, WifiOff, LogIn,
} from 'lucide-react';

interface HeaderProps {
  user: User | null;
  lang: Lang;
  t: TranslationSet;
  view: 'dashboard' | 'history' | 'logistics' | 'downtime' |
        'analytics' | 'arrival' | 'arrival-analytics';
  setView: (view: 'dashboard' | 'history' | 'logistics' |
           'downtime' | 'analytics' | 'arrival' | 'arrival-analytics') => void;
  onToggleLang: () => void;
  onLoginClick: () => void;
  onLogoutClick: () => void;
  onTerminalClick: () => void;
  onStatsClick: () => void;
  onIssueClick: () => void;
  onHistoryClick: () => void;
  onArrivalTerminalClick?: () => void;
  title: string;
  tvMode: boolean;
  onTvToggle: () => void;
}

// ─── Role predicates ────────────────────────────────────────────────────────
const canSeeTerminalBtn  = (r?: string) => r === 'OPERATOR' || r === 'LOGISTIC' || r === 'ADMIN';
const canSeeLogisticsNav = (r?: string) => r === 'LOGISTIC' || r === 'ADMIN';
const canSeeAgrlNav      = (r?: string) => r === 'AGRL'     || r === 'ADMIN';

// ─── Nav button style helper ─────────────────────────────────────────────────
const nb = (active: boolean) =>
  `flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap min-h-[44px] ${
    active ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white hover:bg-white/5'
  }`;

const Header: React.FC<HeaderProps> = ({
  user, lang, t, view, setView,
  onToggleLang, onLoginClick, onLogoutClick,
  onTerminalClick, onStatsClick, onIssueClick, onHistoryClick,
  title, tvMode, onTvToggle,
}) => {
  const [time, setTime] = useState(new Date());
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const clock = time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const date  = time.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const role  = user?.role;

  // ── TV mode ────────────────────────────────────────────────────────────────
  if (tvMode) {
    return (
      <div className="flex justify-between items-center mb-6 pt-2">
        <div className="font-mono text-5xl font-black text-white tabular-nums">{clock}</div>
        <button onClick={onTvToggle} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors">
          <Tv size={14} />{t.tv_exit}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 z-50 gap-3 relative pt-2">

      {/* Offline banner */}
      {!online && (
        <div className="fixed top-0 inset-x-0 z-[200] bg-red-600 text-white text-center py-2 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2">
          <WifiOff size={14} />Нет соединения
        </div>
      )}

      {/* Title + mobile clock */}
      <div className="flex justify-between items-center w-full md:w-auto">
        <div onClick={onStatsClick} className="flex items-center gap-2 cursor-pointer group">
          <span className="text-xl md:text-3xl font-extrabold tracking-tight text-white group-hover:text-accent-blue transition-colors uppercase whitespace-nowrap">
            {title}
          </span>
          <ChevronDown className="text-white/30 w-5 h-5 group-hover:text-white transition-colors" />
        </div>
        <div className="md:hidden flex items-center gap-2">
          {online ? <Wifi size={14} className="text-accent-green" /> : <WifiOff size={14} className="text-red-400" />}
          <div className="font-mono text-lg font-bold tabular-nums text-white/50 bg-white/5 px-3 py-1 rounded-lg border border-white/5">{clock}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">

        {/* ──────────────── NAVIGATION ──────────────── */}
        {user && (
          <div className="flex items-center p-1 rounded-xl bg-white/5 border border-white/5 overflow-x-auto no-scrollbar flex-shrink-0" style={{ maxWidth: '100%' }}>

            {/* Dashboard — all roles */}
            <button onClick={() => setView('dashboard')} className={nb(view === 'dashboard')}>
              <LayoutDashboard size={13} />
              <span className="hidden sm:inline">{t.nav_dashboard}</span>
            </button>

            {/* History — all roles */}
            <button onClick={() => setView('history')} className={nb(view === 'history')}>
              <Archive size={13} />
              <span className="hidden sm:inline">{t.nav_history}</span>
            </button>

            {/* LOGISTIC + ADMIN only */}
            {canSeeLogisticsNav(role) && (
              <>
                <button onClick={() => setView('analytics')} className={nb(view === 'analytics')}>
                  <BarChart2 size={13} />
                  <span className="hidden sm:inline">{t.nav_analytics}</span>
                </button>
                <button onClick={() => setView('downtime')} className={nb(view === 'downtime')}>
                  <TrendingDown size={13} />
                  <span className="hidden sm:inline">{t.nav_downtime}</span>
                </button>
                <button onClick={() => setView('logistics')} className={nb(view === 'logistics')}>
                  <Truck size={13} />
                  <span className="hidden sm:inline">{t.nav_plan}</span>
                </button>
              </>
            )}

            {/* AGRL + ADMIN only */}
            {canSeeAgrlNav(role) && (
              <>
                <button onClick={() => setView('arrival')} className={nb(view === 'arrival')}>
                  <Truck size={13} />
                  <span className="hidden sm:inline">{t.arrival_mark || 'Arrival'}</span>
                </button>
                <button onClick={() => setView('arrival-analytics')} className={nb(view === 'arrival-analytics')}>
                  <BarChart2 size={13} />
                  <span className="hidden sm:inline">{t.nav_arrival_analytics}</span>
                </button>
              </>
            )}
          </div>
        )}

        {/* ──────────────── ACTION BUTTONS ──────────────── */}
        <div className="flex items-center gap-2 ml-auto md:ml-0">

          {/* TV toggle */}
          <button onClick={onTvToggle} title={t.tv_mode}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white/30 hover:text-white bg-white/5 transition-colors min-h-[44px]">
            <Tv size={15} />
            <span className="hidden md:inline">{t.tv_mode}</span>
          </button>

          {/* Language */}
          <button onClick={onToggleLang}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-white/40 hover:text-white bg-white/5 min-h-[44px]">
            <Globe size={16} />
            <span>{lang === 'RU' ? 'RU' : 'EN'}</span>
          </button>

          {user ? (
            <>
              {/* Operator Terminal — OPERATOR, LOGISTIC, ADMIN only */}
              {canSeeTerminalBtn(role) && (
                <button
                  onClick={onTerminalClick}
                  className="flex items-center gap-2 px-3 md:px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-accent-blue bg-accent-blue/10 border border-accent-blue/20 hover:bg-accent-blue/20 transition-colors min-h-[44px]"
                >
                  <ScanBarcode size={15} />
                  <span className="hidden sm:inline">{t.drv_title}</span>
                </button>
              )}

              {/* Report Issue — all roles */}
              <button
                onClick={onIssueClick}
                title={t.issue_title}
                className="flex items-center justify-center w-11 h-11 rounded-xl text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors"
              >
                <AlertTriangle size={17} />
              </button>
            </>
          ) : (
            <button onClick={onLoginClick}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black font-bold text-xs uppercase tracking-widest min-h-[44px]">
              <LogIn size={15} />
              {t.btn_login}
            </button>
          )}
        </div>

        {/* ──────────────── USER DROPDOWN ──────────────── */}
        {user && (
          <div className="relative">
            <button
              onClick={() => setOpen(!open)}
              className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-xl border border-white/10 bg-white/5 min-h-[44px]"
            >
              <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
                <UserIcon size={12} className="text-white" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[10px] md:text-xs font-bold text-white uppercase tracking-wider max-w-[80px] truncate leading-tight">{user.name}</span>
                <span className="text-[9px] text-white/30 font-bold uppercase tracking-widest leading-tight">{user.role}</span>
              </div>
              <ChevronDown size={12} className="text-white/30" />
            </button>

            {open && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                <div className="absolute top-full right-0 mt-2 w-52 bg-[#1A1A1F] border border-white/10 rounded-xl shadow-2xl z-50 p-1">
                  <div className="px-3 py-2 mb-1">
                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20">{user.role}</span>
                  </div>
                  <div className="h-px bg-white/5 mb-1" />
                  <button onClick={() => { onHistoryClick(); setOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-3 text-sm font-bold text-white/70 hover:text-white hover:bg-white/5 rounded-lg text-left">
                    <History size={16} />{t.menu_history}
                  </button>
                  <div className="h-px bg-white/5 my-1" />
                  <button onClick={() => { onLogoutClick(); setOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-3 text-sm font-bold text-red-400 hover:bg-red-500/10 rounded-lg text-left">
                    <LogOut size={16} />{t.menu_logout}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Desktop clock */}
      <div className="text-right hidden lg:flex items-center gap-3 shrink-0">
        {online ? <Wifi size={14} className="text-accent-green opacity-50" /> : <WifiOff size={14} className="text-red-400" />}
        <div>
          <div className="font-mono text-3xl font-bold text-white leading-none tabular-nums">{clock}</div>
          <div className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mt-2">{date}</div>
        </div>
      </div>
    </div>
  );
};

export default Header;
