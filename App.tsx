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
import AdminPanel from './components/AdminPanel';
import Messenger from './components/Messenger';
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
  
  // Navigation View State
  const [view, setView] = useState<'dashboard' | 'history' | 'logistics' | 'admin'>('dashboard');

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  
  // Modals
  const [showAuth, setShowAuth] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showIssue, setShowIssue] = useState(false);
  const [showIssueHistory, setShowIssueHistory] = useState(false);
  const [showMessenger, setShowMessenger] = useState(false);
  const [currentAction, setCurrentAction] = useState<TaskAction | null>(null);
  
  // Trigger to force components to refresh data
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Constants
  const t = TRANSLATIONS[lang];

  // Polling
  const refreshDashboard = useCallback(async () => {
    // Only poll if on dashboard view
    if (view === 'dashboard') {
      const data = await api.fetchDashboard();
      if (data) setDashboardData(data);
    }
  }, [view]);

  useEffect(() => {
    refreshDashboard();
    const interval = setInterval(refreshDashboard, 5000);
    return () => clearInterval(interval);
  }, [refreshDashboard]);

  // Handlers
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
    setView('dashboard'); // Reset view on logout
    setShowTerminal(false);
    setShowMessenger(false);
  };

  const handleTaskActionRequest = (task: Task, actionType: 'start' | 'finish') => {
    setCurrentAction({ id: task.id, type: actionType });
  };

  const handleActionSuccess = () => {
    setCurrentAction(null);
    // Force refresh of terminal data
    setRefreshTrigger(prev => prev + 1);
    refreshDashboard();
  };

  // Render Content based on View
  const renderContent = () => {
    if (view === 'history') return <HistoryView t={t} />;
    if (view === 'logistics') return <LogisticsView t={t} />;
    if (view === 'admin' && user?.role === 'ADMIN') return <AdminPanel t={t} currentUser={user} />;
    return <Dashboard data={dashboardData} t={t} />;
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden flex flex-col p-4 md:p-8 bg-transparent font-sans selection:bg-accent-blue/30 selection:text-white">
      {/* Main Content */}
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
          onMessengerClick={() => setShowMessenger(true)}
        />

        {renderContent()}
      </div>

      {/* Modals */}
      {showAuth && (
        <AuthModal 
          t={t} 
          onClose={() => setShowAuth(false)} 
          onLoginSuccess={handleLogin} 
        />
      )}

      {showTerminal && (
        <OperatorTerminal 
          t={t} 
          onClose={() => setShowTerminal(false)} 
          onTaskAction={handleTaskActionRequest}
          refreshTrigger={refreshTrigger}
        />
      )}

      {showStats && (
        <StatsModal 
          t={t} 
          onClose={() => setShowStats(false)} 
        />
      )}

      {showIssue && (
        <IssueModal 
          t={t}
          user={user}
          onClose={() => setShowIssue(false)}
        />
      )}

      {showIssueHistory && (
        <HistoryModal 
          t={t}
          onClose={() => setShowIssueHistory(false)}
        />
      )}

      {showMessenger && user && (
        <Messenger
          t={t}
          user={user}
          onClose={() => setShowMessenger(false)}
        />
      )}

      {currentAction && user && (
        <ActionModal 
          action={currentAction}
          user={user}
          t={t}
          onClose={() => setCurrentAction(null)}
          onSuccess={handleActionSuccess}
        />
      )}
    </div>
  );
}

export default App;