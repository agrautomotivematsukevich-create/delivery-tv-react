import React, { useState, useEffect, useCallback } from 'react';
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
  // State
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('warehouse_lang') as Lang) || 'RU');
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('warehouse_user');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [view, setView] = useState<'dashboard' | 'history' | 'logistics'>('dashboard');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  
  // Состояние для экрана загрузки
  const [isAppReady, setIsAppReady] = useState(false);

  // Modals
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

  // Инициализация приложения
  useEffect(() => {
    refreshDashboard().then(() => {
      // Искусственная задержка 1.2с для плавности анимации заставки
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
      {/* ПРИВЕТСТВЕННЫЙ ЭКРАН ЗАГРУЗКИ (SPLASH SCREEN) */}
      {!isAppReady && (
        <div className="fixed inset-0 z-[100] bg-[#0F0F12] flex flex-col items-center justify-center">
          <div className="relative flex flex-col items-center animate-in fade-in zoom-in duration-500">
            <div className="w-20 h-20 mb-8 relative">
              <div className="absolute inset-0 border-2 border-accent-blue/20 rounded-full"></div>
              <div className="absolute inset-0 border-2 border-accent-blue rounded-full border-t-transparent animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              </div>
            </div>
            <h1 className="text-white text-lg font-black uppercase tracking-[0.6em] mb-2">
              Terminal
            </h1>
            <p className="text-white/20 text-[9px] font-bold uppercase tracking-[0.3em]">
              Developed by Vladislav_Matsukevich
            </p>
          </div>
        </div>
      )}

      {/* ОСНОВНОЙ ИНТЕРФЕЙС */}
      <div className={`relative min-h-screen w-full overflow-hidden flex flex-col p-4 md:p-8 bg-transparent font-sans selection:bg-accent-blue/30 selection:text-white transition-opacity duration-700 ${isAppReady ? 'opacity-100' : 'opacity-0'}`}>
        <div className="relative z-10 flex-1 flex flex-col min-h-0 max-w-[1920px] mx-auto w-full">
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

          {renderContent()}
        </div>

        {/* Modals */}
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
          <ActionModal action={currentAction} user={user} t={t} onClose={() => setCurrentAction(null)} onSuccess={handleActionSuccess} />
        )}

        {/* FOOTER AUTHORSHIP */}
        <footer className="absolute bottom-4 left-0 right-0 z-[5] flex justify-center items-center opacity-30 hover:opacity-100 transition-all duration-700 pointer-events-none">
          <div className="flex flex-col items-center gap-1 pointer-events-auto">
            <div className="h-[1px] w-8 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
            <p className="text-[8px] font-medium tracking-[0.5em] text-white/30 uppercase text-center">
              Developed by 
              <span className="ml-2 text-white/50 font-black tracking-[0.2em]">
                Vladislav_Matsukevich
              </span>
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}

export default App;