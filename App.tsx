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
  // ... (все useState и useCallback без изменений) ...

  // ВОССТАНАВЛИВАЕМ ЭКРАН ПРИВЕТСТВИЯ
  const [isAppReady, setIsAppReady] = useState(false);
  useEffect(() => {
    refreshDashboard().then(() => {
      setTimeout(() => setIsAppReady(true), 1200);
    });
    // ...
  }, []);

  return (
    <>
      {/* ЭКРАН ПРИВЕТСТВИЯ */}
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

      {/* ОСНОВНОЙ КОНТЕНТ */}
      <div className={`relative min-h-screen w-full flex flex-col p-4 md:p-8 bg-transparent transition-opacity duration-700 ${isAppReady ? 'opacity-100' : 'opacity-0'}`}>
        {/* ... остальной код App ... */}
      </div>
      <Analytics />
    </>
  );
}

export default App;