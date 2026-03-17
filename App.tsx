import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import AuthModal from './components/AuthModal';
import IssueModal from './components/IssueModal';
import IssueHistoryModal from './components/IssueHistoryModal';
import OperatorTerminal from './components/OperatorTerminal';
import StatsModal from './components/StatsModal';
import ActionModal from './components/ActionModal';
import HistoryView from './components/HistoryView';
import LogisticsView from './components/LogisticsView';
import ZoneDowntimeView from './components/ZoneDowntimeView';
import ArrivalAnalyticsView from './components/ArrivalAnalyticsView';
import LotTrackerTV from './components/LotTrackerTV';
import LotTrackerView from './components/LotTrackerView';
import SplashScreen from './components/SplashScreen';
import { api } from './services/api';
import { TRANSLATIONS } from './constants';
import { Task, TaskAction } from './types';
import { useAppContext } from './components/AppContext';
import { deepEqual } from './utils/deepEqual';

function App() {
  const { user, setUser, dashboardData, setDashboardData, isOffline, setIsOffline, lang, setLang } = useAppContext();
  
  const location = useLocation();
  const navigate = useNavigate();

  const urlParams = new URLSearchParams(window.location.search);
  const isTV = urlParams.get('tv') === '1';
  const isTV2 = urlParams.get('tv') === '2';
  const tv2Lot = urlParams.get('lot') || '';

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
        setDashboardData((prev) => {
          if (deepEqual(prev, data)) return prev;
          return data;
        });
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
  }, [setDashboardData, setIsOffline]);

  useEffect(() => {
    if (isTV2) {
      setTimeout(() => setIsAppReady(true), 800);
      return;
    }
    refreshDashboard().then(() => {
      setTimeout(() => setIsAppReady(true), 1200);
    });
  }, [refreshDashboard, isTV2]);

  useEffect(() => {
    if (location.pathname !== '/' || isTV2) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (!intervalId) { intervalId = setInterval(refreshDashboard, 15000); }
    };
    const stopPolling = () => {
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
    };

    const onVisibility = () => {
      if (document.hidden) stopPolling();
      else { refreshDashboard(); startPolling(); }
    };

    startPolling();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshDashboard, location.pathname, isTV2]);

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

  // Convert old setView logic to navigation mapping
  const currentView = location.pathname.slice(1) || 'dashboard';
  const handleSetView = (view: string) => {
    navigate(view === 'dashboard' ? '/' : `/${view}`);
  };

  return (
    <>
      {isOffline && (
        <div className="fixed top-0 left-0 w-full bg-red-500 text-white text-center py-1 text-xs font-bold z-[100]">
          ⚠️ ПОТЕРЯНО СОЕДИНЕНИЕ С СЕРВЕРОМ (ОФФЛАЙН РЕЖИМ)
        </div>
      )}
      <SplashScreen isLoaded={!isLoading} />

      {isTV2 ? (
        <div className={`fixed inset-0 bg-[#191B25] flex flex-col p-5 transition-opacity duration-700 ${isAppReady ? 'opacity-100' : 'opacity-0'}`}>
          <LotTrackerTV lot={tv2Lot} />
        </div>
      ) : isTV ? (
        <div className={`fixed inset-0 bg-[#191B25] flex flex-col p-5 transition-opacity duration-700 ${isAppReady ? 'opacity-100' : 'opacity-0'}`}>
          <Routes>
            <Route path="/" element={<Dashboard data={dashboardData} t={t} tvMode={isTV} />} />
            <Route path="/history" element={<HistoryView t={t} />} />
            <Route path="/logistics" element={<LogisticsView t={t} />} />
            <Route path="/downtime" element={<ZoneDowntimeView t={t} />} />
            <Route path="/arrival" element={<ArrivalAnalyticsView t={t} />} />
            <Route path="/lotTracker" element={<LotTrackerView user={user} t={t} />} />
            <Route path="*" element={<Dashboard data={dashboardData} t={t} tvMode={isTV} />} />
          </Routes>
        </div>
      ) : (
        <div className={`relative min-h-screen w-full flex flex-col p-4 md:p-8 bg-transparent transition-opacity duration-700 ${isAppReady ? 'opacity-100' : 'opacity-0'}`}>
          <div className="relative z-20 flex-1 flex flex-col max-w-[1920px] mx-auto w-full">
            <div className="relative z-50"> 
              <Header 
                user={user} 
                lang={lang} 
                t={t}
                view={currentView as any}
                setView={handleSetView}
                title={t.title}
                onToggleLang={() => setLang(lang === 'RU' ? 'EN_CN' : 'RU')}
                onLoginClick={() => setShowAuth(true)}
                onLogoutClick={() => { setUser(null); setShowTerminal(false); }}
                onTerminalClick={() => setShowTerminal(true)}
                onStatsClick={() => setShowStats(true)}
                onIssueClick={() => setShowIssue(true)}
                onHistoryClick={() => setShowIssueHistory(true)}
              />
            </div>

            <main className="relative z-10 flex-1 mt-4 flex flex-col min-h-0">
              <Routes>
                <Route path="/" element={<Dashboard data={dashboardData} t={t} tvMode={isTV} />} />
                <Route path="/history" element={<HistoryView t={t} />} />
                <Route path="/logistics" element={<LogisticsView t={t} />} />
                <Route path="/downtime" element={<ZoneDowntimeView t={t} />} />
                <Route path="/arrival" element={<ArrivalAnalyticsView t={t} />} />
                <Route path="/lotTracker" element={<LotTrackerView user={user} t={t} />} />
                <Route path="*" element={<Dashboard data={dashboardData} t={t} tvMode={isTV} />} />
              </Routes>
            </main>
          </div>

          {showAuth && <AuthModal t={t} onClose={() => setShowAuth(false)} onLoginSuccess={(u) => { setUser(u); setShowAuth(false); }} />}
          {showTerminal && <OperatorTerminal t={t} onClose={() => setShowTerminal(false)} onTaskAction={handleTaskActionRequest} />}
          {showStats && <StatsModal t={t} onClose={() => setShowStats(false)} />}
          {showIssue && <IssueModal t={t} user={user} onClose={() => setShowIssue(false)} />}
          {showIssueHistory && <IssueHistoryModal t={t} onClose={() => setShowIssueHistory(false)} />}
          {currentAction && user && <ActionModal action={currentAction} user={user} t={t} onClose={handleActionClose} onSuccess={handleActionSuccess} />}

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