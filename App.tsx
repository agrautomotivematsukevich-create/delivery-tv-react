import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import AuthModal from './components/AuthModal';
import IssueModal from './components/IssueModal';
import IssueHistoryModal from './components/IssueHistoryModal';
import OperatorTerminal from './components/OperatorTerminal';
import StatsModal from './components/StatsModal';
import ActionModal from './components/ActionModal';
import AdminPanel from './components/AdminPanel';
import SplashScreen from './components/SplashScreen';
import PageMeta from './components/PageMeta';
import TVLoginScreen from './components/TVLoginScreen';
import PwaUpdateBanner from './components/PwaUpdateBanner';
import { api } from './services/api';
import { TRANSLATIONS } from './constants';
import { DashboardData, Task, TaskAction, TaskActionResult } from './types';
import { useAppContext } from './components/AppContext';
import { deepEqual } from './utils/deepEqual';

// Lazy-loaded heavy views
const HistoryView          = React.lazy(() => import('./components/HistoryView'));
const LogisticsView        = React.lazy(() => import('./components/LogisticsView'));
const ZoneDowntimeView     = React.lazy(() => import('./components/ZoneDowntimeView'));
const ArrivalAnalyticsView = React.lazy(() => import('./components/ArrivalAnalyticsView'));
const LotTrackerTV         = React.lazy(() => import('./components/LotTrackerTV'));
const LotTrackerView       = React.lazy(() => import('./components/LotTrackerView'));
const AccountingView       = React.lazy(() => import('./components/AccountingView'));

const DASHBOARD_LKG_KEY = 'warehouse_dashboard_last_nonzero';
const NIGHT_PLAN_CARRYOVER_END_MIN = 7 * 60;

function getMoscowMinutes(): number {
  const [hh, mm] = new Date()
    .toLocaleTimeString('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hour12: false })
    .split(':')
    .map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

function isNightPlanCarryoverWindow(): boolean {
  return getMoscowMinutes() < NIGHT_PLAN_CARRYOVER_END_MIN;
}

function isEmptyDashboardSnapshot(data: DashboardData): boolean {
  return data.total === 0 && data.done === 0 && data.activeList.length === 0 && data.onTerritory === 0;
}

function saveLastNonZeroDashboard(data: DashboardData): void {
  if (data.total <= 0) return;
  try {
    localStorage.setItem(DASHBOARD_LKG_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // LKG persistence is best-effort; in-memory state still protects open TVs.
  }
}

function loadRecentNonZeroDashboard(): DashboardData | null {
  try {
    const raw = localStorage.getItem(DASHBOARD_LKG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; data?: DashboardData };
    if (!parsed.savedAt || !parsed.data || parsed.data.total <= 0) return null;
    if (Date.now() - parsed.savedAt > 12 * 60 * 60 * 1000) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function getNightCarryoverDashboard(prev: DashboardData | null, next: DashboardData): DashboardData | null {
  if (!isNightPlanCarryoverWindow() || !isEmptyDashboardSnapshot(next)) return null;
  if (prev && prev.total > 0) return prev;
  return loadRecentNonZeroDashboard();
}

const ViewFallback = () => (
  <div className="flex-1 flex items-center justify-center">
    <div className="text-white/40 animate-pulse text-sm font-mono tracking-widest">LOADING...</div>
  </div>
);

function App() {
  const { user, setUser, logout, dashboardData, setDashboardData, isOffline, setIsOffline, lang, setLang } = useAppContext();
  
  const location = useLocation();
  const navigate = useNavigate();

  // Мемоизируем URL-параметры — читаем один раз, не пересоздаём на каждый рендер
  const { isTV, isTV2, tv2Lot } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      isTV: params.get('tv') === '1',
      isTV2: params.get('tv') === '2',
      tv2Lot: params.get('lot') || '',
    };
  }, []);

  const [isAppReady, setIsAppReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [isTasksLoading, setIsTasksLoading] = useState(true);

  const [showAuth, setShowAuth] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showIssue, setShowIssue] = useState(false);
  const [showIssueHistory, setShowIssueHistory] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [currentAction, setCurrentAction] = useState<TaskAction | null>(null);

  const t = TRANSLATIONS[lang];

  // Флаг для защиты от наложения промисов polling'а
  const isFetchingRef = useRef(false);
  // Ref для хранения предыдущего allTasks (deepEqual проверка)
  const prevTasksRef = useRef<Task[]>([]);
  const lastDashboardRef = useRef<DashboardData | null>(dashboardData);

  useEffect(() => {
    lastDashboardRef.current = dashboardData;
  }, [dashboardData]);

  const refreshDashboard = useCallback(async () => {
    // Защита: если предыдущий запрос ещё не завершился — пропускаем
    if (isFetchingRef.current) return null;
    isFetchingRef.current = true;

    try {
      const todayStr = (() => {
        const moscowTime = new Date().toLocaleString("en-US", {timeZone: "Europe/Moscow"});
        const now = new Date(moscowTime);
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        return `${dd}.${mm}`;
      })();

      // Single HTTP call: bundle auto-falls back to 2 parallel calls if backend
      // route is not deployed yet (api.fetchDashboardBundle handles that).
      const bundle = await api.fetchDashboardBundle(todayStr).catch(() => null);
      const data = bundle?.dashboard ?? null;
      const tasks = bundle?.tasks ?? null;
      const carryoverDashboard = data ? getNightCarryoverDashboard(lastDashboardRef.current, data) : null;
      const nextDashboard = carryoverDashboard ?? data;

      if (nextDashboard) {
        setDashboardData((prev) => {
          if (deepEqual(prev, nextDashboard)) return prev;
          lastDashboardRef.current = nextDashboard;
          return nextDashboard;
        });
        if (!carryoverDashboard) saveLastNonZeroDashboard(nextDashboard);
        setIsOffline(false);
      } else {
        setIsOffline(true);
      }

      // Защита от лишних ререндеров: сравниваем tasks через deepEqual
      // При ошибке (tasks === null) сохраняем предыдущие данные (Last Known Good Data)
      if (tasks !== null && !carryoverDashboard) {
        if (!deepEqual(prevTasksRef.current, tasks)) {
          prevTasksRef.current = tasks;
          setAllTasks(tasks);
        }
      }

      return nextDashboard;
    } catch (e) {
      setIsOffline(true);
      return null;
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
      setIsTasksLoading(false);
    }
  }, [setDashboardData, setIsOffline]);

  // 🚀 GATE 1: Первичная загрузка
  useEffect(() => {
    if ((isTV || isTV2) && !user) {
      setIsLoading(false);
      const timer = setTimeout(() => setIsAppReady(true), 500);
      return () => clearTimeout(timer);
    }

    if (isTV2) {
      const timer = setTimeout(() => setIsAppReady(true), 800);
      return () => clearTimeout(timer);
    }
    
    let timer: ReturnType<typeof setTimeout>;
    refreshDashboard().then(() => {
      timer = setTimeout(() => setIsAppReady(true), 1200);
    });
    return () => clearTimeout(timer);
  }, [refreshDashboard, isTV2, isTV, user]);

  // 🚀 GATE 2: Polling с защитой от наложения
  useEffect(() => {
    if (location.pathname !== '/' || isTV2) return;
    if (isTV && !user) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (!intervalId) { intervalId = setInterval(refreshDashboard, 45000); }
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
  }, [refreshDashboard, location.pathname, isTV2, isTV, user]);

  const handleTaskActionRequest = (task: Task, actionType: 'start' | 'finish') => {
    return new Promise<TaskActionResult>((resolve, reject) => {
      setCurrentAction({
        id: task.id,
        type: actionType,
        sealPhotoUrl: actionType === 'finish' ? task.photo_seal : undefined,
        onResolve: (result: TaskActionResult = 'completed') => resolve(result),
        onReject: reject,
      });
    });
  };

  const handleActionSuccess = (result: TaskActionResult = 'completed') => {
    if (currentAction?.onResolve) currentAction.onResolve(result);
    setCurrentAction(null);
    refreshDashboard();
  };

  const handleActionClose = () => {
    if (currentAction?.onReject) currentAction.onReject(new Error('USER_CANCELLED'));
    setCurrentAction(null);
  };

  const currentView = location.pathname.slice(1) || 'dashboard';
  const handleSetView = (view: string) => {
    navigate(view === 'dashboard' ? '/' : `/${view}`);
  };

  const isUpdateBannerBlocked = showAuth || showTerminal || showStats || showIssue || showIssueHistory || showAdmin || Boolean(currentAction);

  const lazyRoutes = (
    <Suspense fallback={<ViewFallback />}>
      <Routes>
        <Route path="/" element={<Dashboard data={dashboardData} allTasks={allTasks} isTasksLoading={isTasksLoading} t={t} tvMode={isTV} />} />
        <Route path="/history" element={<HistoryView t={t} />} />
        <Route path="/logistics" element={<LogisticsView t={t} />} />
        <Route path="/downtime" element={<ZoneDowntimeView t={t} />} />
        <Route path="/arrival" element={<ArrivalAnalyticsView t={t} />} />
        <Route path="/lotTracker" element={<LotTrackerView user={user} t={t} />} />
        <Route path="/accounting" element={<AccountingView t={t} />} />
        <Route path="*" element={<Dashboard data={dashboardData} allTasks={allTasks} isTasksLoading={isTasksLoading} t={t} tvMode={isTV} />} />
      </Routes>
    </Suspense>
  );

  return (
    <>
      <PageMeta />

      {isOffline && (
        <div className="fixed top-0 left-0 w-full bg-red-500 text-white text-center py-1 text-xs font-bold z-[100]">
          ⚠️ ПОТЕРЯНО СОЕДИНЕНИЕ С СЕРВЕРОМ (ОФФЛАЙН РЕЖИМ)
        </div>
      )}
      <PwaUpdateBanner
        isBlocked={isUpdateBannerBlocked || !isAppReady || isLoading}
        isTVMode={isTV || isTV2}
        allowTVAutoReload={(isTV || isTV2) && Boolean(user) && isAppReady}
      />
      <SplashScreen isLoaded={!isLoading} />

      {/* 🚀 ЛОГИКА ОТОБРАЖЕНИЯ ТВ ЭКРАНОВ */}
      {(isTV || isTV2) && !user ? (
        <div className={`fixed inset-0 bg-[#191B25] flex flex-col transition-opacity duration-700 ${isAppReady ? 'opacity-100' : 'opacity-0'} z-50`}>
          <TVLoginScreen onSuccess={() => {
            setIsLoading(true);
            refreshDashboard().then(() => setIsLoading(false));
          }} />
        </div>
      ) : isTV2 ? (
        <div className={`fixed inset-0 bg-[#191B25] flex flex-col p-5 transition-opacity duration-700 ${isAppReady ? 'opacity-100' : 'opacity-0'} overflow-y-auto overflow-x-hidden`}>
          <Suspense fallback={<ViewFallback />}>
            <LotTrackerTV lot={tv2Lot} />
          </Suspense>
        </div>
      ) : isTV ? (
        <div className={`fixed inset-0 bg-[#191B25] flex flex-col p-5 transition-opacity duration-700 ${isAppReady ? 'opacity-100' : 'opacity-0'} overflow-y-auto overflow-x-hidden`}>
          {lazyRoutes}
        </div>
      ) : (
        <div className={`relative h-screen w-full flex flex-col p-4 md:p-8 bg-transparent transition-opacity duration-700 ${isAppReady ? 'opacity-100' : 'opacity-0'} overflow-hidden`}>
          <div className="relative z-20 flex-1 flex flex-col min-h-0 max-w-[1920px] mx-auto w-full">
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
                onLogoutClick={() => { logout(); setShowTerminal(false); }}
                onTerminalClick={() => setShowTerminal(true)}
                onStatsClick={() => setShowStats(true)}
                onIssueClick={() => setShowIssue(true)}
                onHistoryClick={() => setShowIssueHistory(true)}
                onAdminClick={() => setShowAdmin(true)}
              />
            </div>

            <main className="relative z-10 flex-1 mt-4 min-h-0 overflow-y-auto custom-scrollbar">
              {lazyRoutes}
            </main>
          </div>

          {showAuth && <AuthModal t={t} onClose={() => setShowAuth(false)} onLoginSuccess={(u) => { setUser(u); setShowAuth(false); }} />}
          {showTerminal && <OperatorTerminal t={t} onClose={() => setShowTerminal(false)} onTaskAction={handleTaskActionRequest} />}
          {showStats && <StatsModal t={t} onClose={() => setShowStats(false)} />}
          {showIssue && <IssueModal t={t} user={user} onClose={() => setShowIssue(false)} />}
          {showIssueHistory && <IssueHistoryModal t={t} onClose={() => setShowIssueHistory(false)} />}
          {showAdmin && user?.role === 'ADMIN' && <AdminPanel onClose={() => setShowAdmin(false)} />}
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
/ /   p w a   u p d a t e   t e s t 
 
 
// pwa update banner test