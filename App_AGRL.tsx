import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Analytics } from '@vercel/analytics/react';
import Header from './components/Header';
import Dashboard from './components/Dashboard_AGRL'; // ✅ Using updated Dashboard
import AuthModal from './components/AuthModal';
import OperatorTerminal from './components/OperatorTerminal';
import StatsModal from './components/StatsModal';
import ActionModal from './components/ActionModal';
import IssueModal from './components/IssueModal';
import IssueHistoryModal from './components/IssueHistoryModal';
import AnalyticsView from './components/AnalyticsView';
import HistoryView from './components/HistoryView';
import LogisticsView from './components/LogisticsView';
import ZoneDowntimeView from './components/ZoneDowntimeView';
// ✅ NEW: AGRL Components
import { ArrivalTerminal } from './components/ArrivalTerminal';
import { ArrivalDowntimeView } from './components/ArrivalDowntimeView';
import { api } from './services/api';
import { TRANSLATIONS } from './constants';
import { DashboardData, Lang, User, Task, TaskAction } from './types';

function App() {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('warehouse_lang') as Lang) || 'RU');
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('warehouse_user');
    return saved ? JSON.parse(saved) : null;
  });

  // ✅ UPDATED: Added 'arrival' and 'arrival-analytics' views
  const [view, setView] = useState<'dashboard' | 'history' | 'logistics' | 'downtime' | 'analytics' | 'arrival' | 'arrival-analytics'>('dashboard');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isAppReady, setIsAppReady] = useState(false);
  const [tvMode, setTvMode] = useState(false);

  const [showAuth, setShowAuth] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showIssue, setShowIssue] = useState(false);
  const [showIssueHistory, setShowIssueHistory] = useState(false);
  // ✅ NEW: Arrival Terminal modal state
  const [showArrivalTerminal, setShowArrivalTerminal] = useState(false);
  const [currentAction, setCurrentAction] = useState<TaskAction | null>(null);

  const t = TRANSLATIONS[lang];
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshDashboard = useCallback(async () => {
    const data = await api.fetchDashboard();
    if (data) setDashboardData(data);
    return data;
  }, []);

  // Первый запуск — без задержки
  useEffect(() => {
    refreshDashboard().then(() => setIsAppReady(true));
  }, [refreshDashboard]);

  // Авто-обновление с паузой при скрытой вкладке (Page Visibility API)
  useEffect(() => {
    const start = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (view === 'dashboard') {
        intervalRef.current = setInterval(refreshDashboard, 5000);
      }
    };
    const stop = () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        if (view === 'dashboard') refreshDashboard(); // немедленный запрос при возврате
        start();
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshDashboard, view]);

  const handleLangToggle = () => {
    const newLang = lang === 'RU' ? 'EN_CN' : 'RU';
    setLang(newLang);
    localStorage.setItem('warehouse_lang', newLang);
  };

  const handleLogin = (u: User) => {
    setUser(u);
    localStorage.setItem('warehouse_user', JSON.stringify(u));
    setShowAuth(false);
    
    // ✅ NEW: Auto-navigate AGRL users to arrival terminal
    if (u.role === 'AGRL') {
      setView('arrival');
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('warehouse_user');
    setView('dashboard');
    setShowTerminal(false);
    setShowArrivalTerminal(false);
  };

  const handleTaskActionRequest = (task: Task, actionType: 'start' | 'finish') => {
    setCurrentAction({ id: task.id, type: actionType });
  };

  const handleActionSuccess = () => {
    setCurrentAction(null);
    refreshDashboard();
  };

  const handleTvToggle = () => {
    const next = !tvMode;
    setTvMode(next);
    if (next) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      document.documentElement.style.fontSize = '120%';
    } else {
      document.exitFullscreen?.().catch(() => {});
      document.documentElement.style.fontSize = '';
    }
  };

  // ✅ UPDATED: Added new view cases
  const renderContent = () => {
    if (view === 'history') return <HistoryView t={t} />;
    if (view === 'logistics') return <LogisticsView t={t} />;
    if (view === 'downtime') return <ZoneDowntimeView t={t} />;
    if (view === 'analytics') return <AnalyticsView t={t} />;
    // ✅ NEW: AGRL Views
    if (view === 'arrival') {
      // Inline arrival terminal (not modal)
      return (
        <div className="flex-1 flex items-center justify-center">
          <ArrivalTerminal lang={lang} onClose={() => setView('dashboard')} />
        </div>
      );
    }
    if (view === 'arrival-analytics') return <ArrivalDowntimeView lang={lang} />;
    
    return <Dashboard data={dashboardData} t={t} />;
  };

  return (
    <>
      {/* Экран загрузки */}
      {!isAppReady && (
        <div className="fixed inset-0 z-[100] bg-[#0A0A0C] flex flex-col items-center justify-center overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full"></div>
          <div className="relative flex flex-col items-center z-10 text-center">
            <div className="relative w-24 h-24 mb-10 mx-auto">
              <div className="absolute inset-0 border-[3px] border-white/5 rounded-2xl rotate-45"></div>
              <div className="absolute inset-0 border-[3px] border-blue-500 rounded-2xl rotate-45 animate-spin shadow-[0_0_20px_rgba(59,130,246,0.5)]"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-[0.2em] mb-4 bg-gradient-to-b from-white via-white to-white/20 bg-clip-text text-transparent">
              WAREHOUSE
              <span className="block text-center text-lg tracking-[0.6em] text-blue-500 mt-2 font-light">DASHBOARD</span>
            </h1>
            <div className="w-48 h-[2px] bg-white/5 rounded-full mt-6 overflow-hidden mx-auto">
              <div className="h-full bg-blue-500 animate-[loading-bar_1s_ease-out_forwards]"></div>
            </div>
            <div className="mt-12 flex flex-col items-center gap-2 opacity-60">
              <span className="text-[8px] font-bold uppercase tracking-[0.4em] text-white/50">System Initializing</span>
              <p className="text-[10px] font-medium tracking-[0.2em] text-white">
                Developed by <span className="font-black text-blue-400">Vladislav_Matsukevich</span>
              </p>
            </div>
          </div>
          <style>{`
            @keyframes loading-bar {
              0% { width: 0%; }
              100% { width: 100%; }
            }
          `}</style>
        </div>
      )}

      <div className={`relative min-h-screen w-full flex flex-col ${tvMode ? 'p-6' : 'p-4 md:p-8'} bg-transparent transition-opacity duration-700 ${isAppReady ? 'opacity-100' : 'opacity-0'}`}>
        <div className="relative z-20 flex-1 flex flex-col max-w-[1920px] mx-auto w-full">
          <div className="relative z-50">
            <Header
              user={user}
              lang={lang}
              t={t}
              view={view}
              setView={setView}
              title={t.title}
              onToggleLang={handleLangToggle}
              onLoginClick={() => setShowAuth(true)}
              onLogoutClick={handleLogout}
              onTerminalClick={() => setShowTerminal(true)}
              onStatsClick={() => setShowStats(true)}
              onIssueClick={() => setShowIssue(true)}
              onHistoryClick={() => setShowIssueHistory(true)}
              // ✅ NEW: AGRL handlers
              onArrivalTerminalClick={() => setShowArrivalTerminal(true)}
              tvMode={tvMode}
              onTvToggle={handleTvToggle}
            />
          </div>

          <main className="relative z-10 flex-1 mt-4 flex flex-col min-h-0">
            {tvMode ? (
              // В TV режиме только дашборд, без навигации
              <Dashboard data={dashboardData} t={t} />
            ) : (
              renderContent()
            )}
          </main>
        </div>

        {showAuth && <AuthModal t={t} onClose={() => setShowAuth(false)} onLoginSuccess={handleLogin} />}
        {showTerminal && <OperatorTerminal t={t} onClose={() => setShowTerminal(false)} onTaskAction={handleTaskActionRequest} />}
        {showStats && <StatsModal t={t} onClose={() => setShowStats(false)} />}
        {showIssue && <IssueModal t={t} user={user} onClose={() => setShowIssue(false)} />}
        {showIssueHistory && <IssueHistoryModal t={t} onClose={() => setShowIssueHistory(false)} />}
        {/* ✅ NEW: Arrival Terminal Modal (alternative to inline view) */}
        {showArrivalTerminal && <ArrivalTerminal lang={lang} onClose={() => setShowArrivalTerminal(false)} />}
        {currentAction && user && (
          <ActionModal action={currentAction} user={user} t={t} onClose={() => setCurrentAction(null)} onSuccess={handleActionSuccess} />
        )}

        {!tvMode && (
          <footer className="mt-8 z-[5] flex justify-center items-center opacity-30 hover:opacity-100 transition-all duration-700">
            <div className="flex flex-col items-center gap-1">
              <div className="h-[1px] w-8 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
              <p className="text-[8px] font-medium tracking-[0.5em] text-white/30 uppercase text-center">
                Developed by <span className="ml-2 text-white/50 font-black tracking-[0.2em]">Vladislav_Matsukevich</span>
              </p>
            </div>
          </footer>
        )}
      </div>

      <Analytics />
    </>
  );
}

export default App;
