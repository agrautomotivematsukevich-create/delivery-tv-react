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
import { tvDiagnostics } from './services/tvDiagnostics';
import { TRANSLATIONS } from './constants';
import { DashboardData, Task, TaskAction, TaskActionResult } from './types';
import { useAppContext } from './components/AppContext';
import { deepEqual } from './utils/deepEqual';
import { getMillisecondsUntilNextOperationalBoundary, getOperationalDateInfo } from './utils/time';

// Lazy-loaded heavy views
const HistoryView          = React.lazy(() => import('./components/HistoryView'));
const LogisticsView        = React.lazy(() => import('./components/LogisticsView'));
const ZoneDowntimeView     = React.lazy(() => import('./components/ZoneDowntimeView'));
const ArrivalAnalyticsView = React.lazy(() => import('./components/ArrivalAnalyticsView'));
const LotTrackerTV         = React.lazy(() => import('./components/LotTrackerTV'));
const LotTrackerView       = React.lazy(() => import('./components/LotTrackerView'));
const AccountingView       = React.lazy(() => import('./components/AccountingView'));
const TvCommandCenterLight = React.lazy(() => import('./components/TvCommandCenterLight'));
const TvLotProgressView    = React.lazy(() => import('./components/TvLotProgressView'));

const DASHBOARD_LKG_KEY = 'warehouse_dashboard_last_nonzero';
const TV1_ROTATION_MS = 180000;

type Tv1Screen = 'dashboard' | 'lots';

function readTv1ScreenOverride(value: string | null): Tv1Screen | null {
  if (value === 'dashboard' || value === 'lots') return value;
  return null;
}

function readTv1RotateMs(value: string | null): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed >= 5000 ? parsed : TV1_ROTATION_MS;
}

function isNightPlanCarryoverWindow(): boolean {
  return getOperationalDateInfo().isBeforeOperationalCutoff;
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
  const { isTV, isTV2, isTV3, tv2Lot, tv1ScreenOverride, tv1RotateMs, isTv1Preview } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const tvMode = params.get('tv');
    return {
      isTV: tvMode === '1',
      isTV2: tvMode === '2',
      isTV3: tvMode === '3',
      tv2Lot: params.get('lot') || '',
      tv1ScreenOverride: readTv1ScreenOverride(params.get('screen')),
      tv1RotateMs: readTv1RotateMs(params.get('rotateMs')),
      isTv1Preview: import.meta.env.DEV && tvMode === '1' && params.get('preview') === '1',
    };
  }, []);
  const isAnyTV = isTV || isTV2 || isTV3;
  const needsTvLogin = isAnyTV && !user && !isTv1Preview;

  const [isAppReady, setIsAppReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [isTasksLoading, setIsTasksLoading] = useState(true);
  const [tv1Screen, setTv1Screen] = useState<Tv1Screen>('dashboard');

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

  useEffect(() => {
    if (isAnyTV) tvDiagnostics.start();
    return () => tvDiagnostics.stop();
  }, [isAnyTV]);

  useEffect(() => {
    if (!isTV) return;
    if (tv1ScreenOverride) {
      setTv1Screen(tv1ScreenOverride);
      return;
    }

    setTv1Screen('dashboard');
    const id = setInterval(() => {
      setTv1Screen((screen) => screen === 'dashboard' ? 'lots' : 'dashboard');
    }, tv1RotateMs);

    return () => clearInterval(id);
  }, [isTV, tv1RotateMs, tv1ScreenOverride]);

  useEffect(() => {
    tvDiagnostics.setAuth(user ? {
      login: user.user,
      name: user.name,
      role: user.role,
    } : null);
  }, [user]);

  const refreshDashboard = useCallback(async () => {
    // Защита: если предыдущий запрос ещё не завершился — пропускаем
    if (isFetchingRef.current) return null;
    isFetchingRef.current = true;

    try {
      const todayStr = getOperationalDateInfo().operationalSheetName;

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
        tvDiagnostics.markDataSuccess('dashboard');
      } else {
        console.error('[dashboard-offline]', {
          reason: 'refreshDashboard resolved with null dashboard',
          hasBundle: !!bundle,
          hasRawDashboard: !!data,
          hasCarryoverDashboard: !!carryoverDashboard,
          hasTasks: tasks !== null,
        });
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
      console.error('[dashboard-offline]', {
        reason: 'refreshDashboard exception',
        error: e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : e,
      });
      setIsOffline(true);
      tvDiagnostics.markError(e);
      return null;
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
      setIsTasksLoading(false);
    }
  }, [setDashboardData, setIsOffline]);

  // 🚀 GATE 1: Первичная загрузка
  useEffect(() => {
    if (isTv1Preview) {
      setIsLoading(false);
      setIsTasksLoading(false);
      const timer = setTimeout(() => setIsAppReady(true), 300);
      return () => clearTimeout(timer);
    }

    if (needsTvLogin) {
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
  }, [refreshDashboard, isTV2, isTv1Preview, needsTvLogin]);

  // 🚀 GATE 2: Polling с защитой от наложения
  useEffect(() => {
    if (location.pathname !== '/' || isTV2) return;
    if (isTv1Preview) return;
    if ((isTV || isTV3) && !user) return;

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
  }, [refreshDashboard, location.pathname, isTV2, isTV, isTV3, user, isTv1Preview]);

  useEffect(() => {
    if (isTV2) return;
    if (isTv1Preview) return;
    if ((isTV || isTV3) && !user) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const scheduleBoundaryRefresh = () => {
      timeoutId = setTimeout(() => {
        refreshDashboard();
        scheduleBoundaryRefresh();
      }, getMillisecondsUntilNextOperationalBoundary());
    };

    scheduleBoundaryRefresh();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [refreshDashboard, isTV2, isTV, isTV3, user, isTv1Preview]);

  const handleTaskActionRequest = (task: Task, actionType: 'start' | 'finish') => {
    return new Promise<TaskActionResult>((resolve, reject) => {
      setCurrentAction({
        id: task.id,
        type: actionType,
        sheetDate: task.sheet_date,
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
  const isArrivalView = currentView === 'arrival';

  useEffect(() => {
    const arrivalBodyClass = 'body--arrival-page';
    if (isArrivalView && !isAnyTV) {
      document.body.classList.add(arrivalBodyClass);
    } else {
      document.body.classList.remove(arrivalBodyClass);
    }

    return () => {
      document.body.classList.remove(arrivalBodyClass);
    };
  }, [isArrivalView, isAnyTV]);

  const handleSetView = (view: string) => {
    api.auditEvent('VIEW_SWITCH', {
      entityType: 'page',
      entityId: view,
      details: { from: currentView, to: view },
    }, `view-switch:${currentView}:${view}`, 2000);
    navigate(view === 'dashboard' ? '/' : `/${view}`);
  };

  const isUpdateBannerBlocked = showAuth || showTerminal || showStats || showIssue || showIssueHistory || showAdmin || Boolean(currentAction);

  useEffect(() => {
    if (!user) return;
    api.auditEvent('PAGE_OPEN', {
      entityType: 'page',
      entityId: currentView,
      details: {
        path: location.pathname,
        tvMode: isTV ? 'tv1' : isTV2 ? 'tv2' : isTV3 ? 'tv3' : 'desktop',
        preview: isTv1Preview,
      },
    }, `page-open:${location.pathname}:${isTV ? 'tv1' : isTV2 ? 'tv2' : isTV3 ? 'tv3' : 'desktop'}:${isTv1Preview ? 'preview' : 'live'}`, 30000);
  }, [currentView, isTV, isTV2, isTV3, isTv1Preview, location.pathname, user]);

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

  const tv1Content = tv1Screen === 'lots' ? (
    <Suspense fallback={<ViewFallback />}>
      <TvLotProgressView allTasks={allTasks} isTasksLoading={isTasksLoading} preview={isTv1Preview} />
    </Suspense>
  ) : lazyRoutes;

  return (
    <>
      <PageMeta />
      <span hidden data-pwa-update-validation="2026-04-24-runtime-marker" />

      {isOffline && (
        <div className="fixed top-0 left-0 w-full bg-red-500 text-white text-center py-1 text-xs font-bold z-[100]">
          ⚠️ ПОТЕРЯНО СОЕДИНЕНИЕ С СЕРВЕРОМ (ОФФЛАЙН РЕЖИМ)
        </div>
      )}
      <PwaUpdateBanner
        isBlocked={isUpdateBannerBlocked || !isAppReady || isLoading}
        isTVMode={isAnyTV}
        allowTVAutoReload={isAnyTV && Boolean(user) && isAppReady}
      />
      <SplashScreen isLoaded={!isLoading} />

      {/* 🚀 ЛОГИКА ОТОБРАЖЕНИЯ ТВ ЭКРАНОВ */}
      {needsTvLogin ? (
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
      ) : isTV3 ? (
        <div className={`fixed inset-0 bg-[#c4c9d2] transition-opacity duration-700 ${isAppReady ? 'opacity-100' : 'opacity-0'} overflow-hidden`}>
          <Suspense fallback={<ViewFallback />}>
            <TvCommandCenterLight data={dashboardData} allTasks={allTasks} isTasksLoading={isTasksLoading} t={t} />
          </Suspense>
        </div>
      ) : isTV ? (
        <div className={`fixed inset-0 bg-[#191B25] flex flex-col transition-opacity duration-700 ${isAppReady ? 'opacity-100' : 'opacity-0'} ${tv1Screen === 'lots' ? 'p-0 overflow-hidden' : 'p-5 overflow-y-auto overflow-x-hidden'}`}>
          {tv1Content}
        </div>
      ) : (
        <div className={`relative app-shell w-full flex flex-col bg-transparent transition-opacity duration-700 ${isAppReady ? 'opacity-100' : 'opacity-0'} overflow-hidden ${isArrivalView ? 'app-shell--arrival-page' : ''}`}>
          <div className={`relative z-20 flex-1 flex flex-col min-h-0 w-full ${isArrivalView ? 'app-frame--arrival-page max-w-none mx-0' : 'max-w-[1920px] mx-auto'}`}>
            <div className={`relative z-50 ${isArrivalView ? 'app-header--arrival-page' : ''}`}> 
              <Header 
                user={user} 
                lang={lang} 
                t={t}
                view={currentView as any}
                setView={handleSetView}
                title={t.title}
                onToggleLang={() => setLang(lang === 'RU' ? 'EN_CN' : 'RU')}
                onLoginClick={() => setShowAuth(true)}
                onLogoutClick={() => {
                  api.auditEvent('LOGOUT', { entityType: 'auth', details: { path: location.pathname } }, 'logout', 1000);
                  logout();
                  setShowTerminal(false);
                }}
                onTerminalClick={() => {
                  api.auditEvent('TERMINAL_OPEN', { entityType: 'page', entityId: 'terminal' }, 'terminal-open', 5000);
                  setShowTerminal(true);
                }}
                onStatsClick={() => {
                  api.auditEvent('STATS_OPEN', { entityType: 'page', entityId: 'stats' }, 'stats-open', 5000);
                  setShowStats(true);
                }}
                onIssueClick={() => {
                  api.auditEvent('ISSUE_MODAL_OPEN', { entityType: 'page', entityId: 'issue' }, 'issue-open', 5000);
                  setShowIssue(true);
                }}
                onHistoryClick={() => {
                  api.auditEvent('ISSUE_HISTORY_OPEN', { entityType: 'page', entityId: 'issue_history' }, 'issue-history-open', 5000);
                  setShowIssueHistory(true);
                }}
                onAdminClick={() => {
                  api.auditEvent('ADMIN_PANEL_OPEN', { entityType: 'page', entityId: 'admin' }, 'admin-open', 5000);
                  setShowAdmin(true);
                }}
              />
            </div>

            <main className={`relative z-10 flex-1 mt-2 md:mt-4 min-h-0 overflow-y-auto custom-scrollbar ${isArrivalView ? 'app-main--arrival-page' : ''}`}>
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

          {!isArrivalView && (
            <footer className="mt-8 z-[5] flex justify-center items-center opacity-30 hover:opacity-100 transition-all duration-700">
              <div className="flex flex-col items-center gap-1">
                <div className="h-[1px] w-8 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
                <p className="text-[8px] font-medium tracking-[0.5em] text-white/50 uppercase text-center">
                  Developed by <span className="ml-2 text-white/50 font-black tracking-[0.2em]">Vladislav_Matsukevich</span>
                </p>
              </div>
            </footer>
          )}
        </div>
      )}
    </>
  );
}

export default App;
