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
      {/* ПРИВЕТСТВЕННЫЙ ЭКРАН ЗАГРУЗКИ (PROFESSIONAL SPLASH SCREEN) */}
      {!isAppReady && (
        <div className="fixed inset-0 z-[100] bg-[#0A0A0C] flex flex-col items-center justify-center overflow-hidden">
          {/* Фоновые декоративные элементы для глубины */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full"></div>
          <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-emerald-600/5 blur-[100px] rounded-full"></div>

          <div className="relative flex flex-col items-center z-10">
            {/* Анимированный сканер/логотип */}
            <div className="relative w-24 h-24 mb-10">
              <div className="absolute inset-0 border-[3px] border-white/5 rounded-2xl rotate-45"></div>
              <div className="absolute inset-0 border-[3px] border-blue-500 rounded-2xl rotate-45 animate-[spin_4s_linear_infinite] shadow-[0_0_20px_rgba(59,130,246,0.5)]"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse shadow-[0_0_10px_#fff]"></div>
              </div>
            </div>

            {/* Заголовок с градиентом */}
            <h1 className="text-4xl md:text-5xl font-black tracking-[0.2em] mb-4 bg-gradient-to-b from-white via-white to-white/20 bg-clip-text text-transparent animate-in fade-in slide-in-from-bottom-4 duration-1000">
              WAREHOUSE
              <span className="block text-center text-lg tracking-[0.6em] text-blue-500 mt-2 font-light">DASHBOARD</span>
            </h1>

            {/* Полоса загрузки (Progress Bar) */}
            <div className="w-48 h-[2px] bg-white/5 rounded-full mt-6 overflow-hidden">
              <div className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-[loading-bar_1.5s_ease-in-out_forwards]"></div>
            </div>

            {/* Авторство */}
            <div className="mt-12 flex flex-col items-center gap-2 opacity-40 animate-in fade-in duration-1000 delay-500">
              <span className="text-[8px] font-bold uppercase tracking-[0.4em] text-white/50">System Initializing</span>
              <p className="text-[10px] font-medium tracking-[0.2em] text-white">
                Developed by <span className="font-black text-blue-400">Vladislav_Matsukevich</span>
              </p>
            </div>
          </div>

          <style>{`
            @keyframes loading-bar {
              0% { width: 0%; transform: translateX(-100%); }
              100% { width: 100%; transform: translateX(0%); }
            }
          `}</style>
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