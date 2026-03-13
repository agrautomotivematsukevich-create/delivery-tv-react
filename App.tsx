import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import AuthModal from './components/AuthModal';
import IssueModal from './components/IssueModal';
import IssueHistoryModal from './components/IssueHistoryModal';
import OperatorTerminal from './components/OperatorTerminal';
import StatsModal from './components/StatsModal';
import ActionModal from './components/ActionModal';
import HistoryModal from './components/HistoryModal';
import HistoryView from './components/HistoryView';
import LogisticsView from './components/LogisticsView';
import ZoneDowntimeView from './components/ZoneDowntimeView'; // НОВЫЙ ИМПОРТ
import ArrivalAnalyticsView from './components/ArrivalAnalyticsView'; // АНАЛИТИКА ПРОСТОЯ
import LotTrackerTV from './components/LotTrackerTV';
import LotTrackerView from './components/LotTrackerView';
import SplashScreen from './components/SplashScreen';
import { api } from './services/api';
import { TRANSLATIONS } from './constants';
import { DashboardData, Lang, User, Task, TaskAction } from './types';

function App() {
  const [lang, setLang] = useState<Lang>('RU');
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('warehouse_user');
    return saved ? JSON.parse(saved) : null;
  });
  // TV mode: add ?tv=1 to URL to enable TV layout (fullscreen, no header/footer)
  const urlParams = new URLSearchParams(window.location.search);
  const isTV = urlParams.get('tv') === '1';
  const isTV2 = urlParams.get('tv') === '2';
  const tv2Lot = urlParams.get('lot') || '';

  // ОБНОВЛЕНО: добавлен 'arrival' view
  const [view, setView] = useState<'dashboard' | 'history' | 'logistics' | 'downtime' | 'arrival' | 'lotTracker'>('dashboard');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isAppReady, setIsAppReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [showAuth, setShowAuth] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showIssue, setShowIssue] = useState(false);
  const [showIssueHistory, setShowIssueHistory] = useState(false);
  const [currentAction, setCurrentAction] = useState<TaskAction | null>(null);

  const t = TRANSLATIONS[lang];

  const refreshDashboard = useCallback(async () => {
    try {
      const data = await api.fetchDashboard();
      if (data) {
        setDashboardData(data);
        setIsOffline(false);
      } else {
        setIsOffline(true);
      }
      return data;
    } catch (e) {
      setIsOffline(true);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (isTV2) {
      // TV2 doesn't need dashboard data
      setTimeout(() => setIsAppReady(true), 800);
      return;
    }
    refreshDashboard().then(() => {
      setTimeout(() => setIsAppReady(true), 1200);
    });
  }, [refreshDashboard, isTV2]);

  // Polling only when on dashboard AND tab is visible (skip for TV2)
  useEffect(() => {
    if (view !== 'dashboard' || isTV2) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (!intervalId) {
        intervalId = setInterval(refreshDashboard, 15000);
      }
    };
    const stopPolling = () => {
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
    };

    const onVisibility = () => {
      if (document.hidden) { stopPolling(); }
      else { refreshDashboard(); startPolling(); }
    };

    startPolling();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshDashboard, view, isTV2]);

  const handleLangToggle = () => {
    const newLang = lang === 'RU' ? 'EN_CN' : 'RU';
    setLang(newLang);
  };

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
    localStorage.setItem('warehouse_user', JSON.stringify(loggedInUser));
    setShowAuth(false);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('warehouse_user');
    setShowTerminal(false);
  };

  const handleTaskActionRequest = (task: Task, actionType: 'start' | 'finish') => {
    return new Promise<void>((resolve, reject) => {
      setCurrentAction({
        id: task.id,
        type: actionType,
        sealPhotoUrl: actionType === 'finish' ? task.photo_seal : undefined,
        onResolve: resolve,
        onReject: reject,
      });
    });
  };

  const handleActionSuccess = () => {
    if (currentAction?.onResolve) currentAction.onResolve();
    setCurrentAction(null);
    refreshDashboard();
  };

  const handleActionClose = () => {
    if (currentAction?.onReject) currentAction.onReject();
    setCurrentAction(null);
  };

  const renderContent = () => {
    if (view === 'history') return <HistoryView t={t} />;
    if (view === 'logistics') return <LogisticsView t={t} />;
    if (view === 'downtime') return <ZoneDowntimeView t={t} />;
    if (view === 'arrival') return <ArrivalAnalyticsView t={t} />;
    if (view === 'lotTracker') return <LotTrackerView user={user} t={t} />;
    return <Dashboard data={dashboardData} t={t} tvMode={isTV} />;
  };

  return (
    <>
      {isOffline && (
        <div className="fixed top-0 left-0 w-full bg-red-500 text-white text-center py-1 text-xs font-bold z-[100]">
          ⚠️ ПОТЕРЯНО СОЕДИНЕНИЕ С СЕРВЕРОМ (ОФФЛАЙН РЕЖИМ)
        </div>
      )}
      {/* ПРИВЕТСТВЕННЫЙ ЭКРАН ЗАГРУЗКИ */}
      <SplashScreen isLoaded={!isLoading} />


      {/* ── TV MODE: полный экран без header/footer ── */}
      {isTV2 ? (
        <div className={`fixed inset-0 bg-[#191B25] flex flex-col p-5 transition-opacity duration-700 ${isAppReady ? 'opacity-100' : 'opacity-0'}`}>
          <LotTrackerTV lot={tv2Lot} />
        </div>
      ) : isTV ? (
        <div className={`fixed inset-0 bg-[#191B25] flex flex-col p-5 transition-opacity duration-700 ${isAppReady ? 'opacity-100' : 'opacity-0'}`}>
          {renderContent()}
        </div>
      ) : (
        <div className={`relative min-h-screen w-full flex flex-col p-4 md:p-8 bg-transparent transition-opacity duration-700 ${isAppReady ? 'opacity-100' : 'opacity-0'}`}>
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
              />
            </div>

            <main className="relative z-10 flex-1 mt-4 flex flex-col min-h-0">
              {renderContent()}
            </main>
          </div>

          {showAuth && (
            <AuthModal t={t} onClose={() => setShowAuth(false)} onLoginSuccess={handleLogin} />
          )}
          {showTerminal && (
            <OperatorTerminal t={t} onClose={() => setShowTerminal(false)} onTaskAction={handleTaskActionRequest} />
          )}
          {showStats && (
            <StatsModal t={t} onClose={() => setShowStats(false)} />
          )}
          {showIssue && (
            <IssueModal t={t} user={user} onClose={() => setShowIssue(false)} />
          )}
          {showIssueHistory && (
            <HistoryModal t={t} onClose={() => setShowIssueHistory(false)} />
          )}
          {currentAction && user && (
            <ActionModal action={currentAction} user={user} t={t} onClose={handleActionClose} onSuccess={handleActionSuccess} />
          )}

          <footer className="mt-8 z-[5] flex justify-center items-center opacity-30 hover:opacity-100 transition-all duration-700">
            <div className="flex flex-col items-center gap-1">
              <div className="h-[1px] w-8 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
              <p className="text-[8px] font-medium tracking-[0.5em] text-white/50 uppercase text-center">
                Developed by <span className="ml-2 text-white/50 font-black tracking-[0.2em]">Vladislav_Matsukevich</span>
              </p>
            </div>
          </footer>
        </div>
      )}
    </>
  );
}

export default App;