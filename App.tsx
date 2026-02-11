import React, { useState, useEffect, useCallback } from 'react';
import { Analytics } from '@vercel/analytics/react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import AuthModal from './components/AuthModal';
import OperatorTerminal from './components/OperatorTerminal';
import StatsModal from './components/StatsModal';
import ActionModal from './components/ActionModal';
import IssueModal from './components/IssueModal';
import HistoryModal from './components/HistoryModal';
import HistoryView from './components/HistoryView';
import LogisticsView from './components/LogisticsView';
import { api } from './services/api';
import { TRANSLATIONS } from './constants';
import { DashboardData, Lang, User, Task, TaskAction } from './types';

function App() {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('warehouse_lang') as Lang) || 'RU');
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('warehouse_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [view, setView] = useState<'dashboard' | 'history' | 'logistics'>('dashboard');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isAppReady, setIsAppReady] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showIssue, setShowIssue] = useState(false);
  const [showIssueHistory, setShowIssueHistory] = useState(false);
  const [currentAction, setCurrentAction] = useState<TaskAction | null>(null);

  const t = TRANSLATIONS[lang];

  const refreshDashboard = useCallback(async () => {
    const data = await api.fetchDashboard();
    if (data) setDashboardData(data);
    return data;
  }, []);

  useEffect(() => {
    refreshDashboard().then(() => {
      setTimeout(() => setIsAppReady(true), 1200);
    });
    const interval = setInterval(() => {
      if (view === 'dashboard') refreshDashboard();
    }, 5000);
    return () => clearInterval(interval);
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
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('warehouse_user');
    setView('dashboard');
    setShowTerminal(false);
  };

  const handleTaskActionRequest = (task: Task, actionType: 'start' | 'finish') => {
    setCurrentAction({ id: task.id, type: actionType });
  };

  const handleActionSuccess = () => {
    setCurrentAction(null);
    refreshDashboard();
  };

  const renderContent = () => {
    if (view === 'history') return <HistoryView t={t} />;
    if (view === 'logistics') return <LogisticsView t={t} />;
    return <Dashboard data={dashboardData} t={t} />;
  };

  return (
    <>
      {!isAppReady && (
        <div className="fixed inset-0 z-[100] bg-[#0A0A0C] flex flex-col items-center justify-center overflow-hidden">
          <div className="relative w-24 h-24 mb-8">
            <div className="absolute inset-0 rounded-full bg-accent-blue/20 animate-ping" />
            <div className="absolute inset-2 rounded-full bg-accent-blue/40 animate-pulse" />
            <div className="absolute inset-4 rounded-full bg-accent-blue" />
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight mb-4 animate-pulse">
            {t.title}
          </h1>
          <p className="text-white/50 text-sm md:text-base">Загрузка системы...</p>
        </div>
      )}

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

        {showAuth && <AuthModal t={t} onClose={() => setShowAuth(false)} onLoginSuccess={handleLogin} />}
        {showTerminal && user && (
          <OperatorTerminal
            t={t}
            onClose={() => setShowTerminal(false)}
            onTaskAction={handleTaskActionRequest}
            currentUser={user}
          />
        )}
        {showStats && <StatsModal t={t} onClose={() => setShowStats(false)} />}
        {showIssue && <IssueModal t={t} user={user} onClose={() => setShowIssue(false)} />}
        {showIssueHistory && <HistoryModal t={t} onClose={() => setShowIssueHistory(false)} />}
        {currentAction && user && (
          <ActionModal
            action={currentAction}
            user={user}
            t={t}
            onClose={() => setCurrentAction(null)}
            onSuccess={handleActionSuccess}
            onRefresh={refreshDashboard}
          />
        )}

        <footer className="mt-8 z-[5] flex justify-center items-center opacity-30 hover:opacity-100 transition-all duration-700">
          {/* footer content */}
        </footer>
      </div>
      <Analytics />
    </>
  );
}

export default App;