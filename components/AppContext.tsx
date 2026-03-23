import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User, DashboardData } from '../types';
import { getToken, clearToken, onSessionExpired } from '../services/api';

// ══════════════════════════════════════════════════════════════════════════════
// SECURITY MODEL (updated):
//
//   localStorage stores TWO items:
//     1. warehouse_session_token  — opaque auth token (managed by api.ts)
//     2. warehouse_user_info      — JSON with user data for UI display
//
//   WHY this is safe:
//     - The backend validates the TOKEN on every request (read and write).
//     - Even if someone edits warehouse_user_info to set role:"ADMIN",
//       the backend will reject their requests with ADMIN_REQUIRED,
//       and our session-expiry handler will immediately log them out.
//     - warehouse_user_info is used ONLY for rendering UI elements
//       (which buttons to show, what name to display).
//     - No privilege escalation is possible because the server is the
//       single source of truth for authorization.
// ══════════════════════════════════════════════════════════════════════════════

const USER_INFO_KEY = "warehouse_user_info";

function saveUserInfo(user: User): void {
  try {
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
  } catch {
    // Storage full or disabled — UI still works from React state
  }
}

function loadUserInfo(): User | null {
  try {
    const raw = localStorage.getItem(USER_INFO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Minimal shape validation — prevent crash on corrupted data
    if (parsed && typeof parsed.user === "string" && typeof parsed.name === "string" && typeof parsed.role === "string") {
      // Backward compatibility: old sessions may not have new fields.
      // Derive them from existing data if missing.
      const nameParts = parsed.name.split(' ');
      return {
        user: parsed.user,
        name: parsed.name,
        role: parsed.role,
        tabNumber: parsed.tabNumber || parsed.user,
        firstName: parsed.firstName || nameParts[0] || parsed.user,
        lastName: parsed.lastName || nameParts.slice(1).join(' ') || '',
      } as User;
    }
    return null;
  } catch {
    return null;
  }
}

function clearUserInfo(): void {
  localStorage.removeItem(USER_INFO_KEY);
}

// ══════════════════════════════════════════════════════════════════════════════

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface AppContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
  dashboardData: DashboardData | null;
  setDashboardData: React.Dispatch<React.SetStateAction<DashboardData | null>>;
  isOffline: boolean;
  setIsOffline: (status: boolean) => void;
  toasts: ToastMessage[];
  addToast: (message: string, type?: ToastMessage['type']) => void;
  removeToast: (id: string) => void;
  confirm: (message: string, onConfirm: () => void, description?: string) => void;
  lang: 'RU' | 'EN_CN';
  setLang: (lang: 'RU' | 'EN_CN') => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {

  // ── Restore session on page load ──
  // Only restore if BOTH token and user info exist.
  // If token was cleared (e.g. by session expiry) but user info remained,
  // we don't restore — the user must log in again.
  const [user, setUserState] = useState<User | null>(() => {
    const token = getToken();
    if (!token) {
      clearUserInfo(); // stale info without token is useless
      return null;
    }
    return loadUserInfo(); // may be null if info was cleared separately
  });

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [lang, setLang] = useState<'RU' | 'EN_CN'>('RU');

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    message: string;
    description?: string;
    onConfirm: () => void;
  }>({ isOpen: false, message: '', onConfirm: () => {} });

  // ── Toast system ──

  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Confirm dialog ──

  const confirm = useCallback((message: string, onConfirm: () => void, description?: string) => {
    setConfirmState({ isOpen: true, message, onConfirm, description });
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmState(prev => ({ ...prev, isOpen: false }));
  }, []);

  // ── User / session management ──

  const setUser = useCallback((newUser: User | null) => {
    setUserState(newUser);
    if (newUser) {
      // Login: persist user info for session recovery after F5
      saveUserInfo(newUser);
    } else {
      // Logout: clear everything
      clearUserInfo();
      clearToken();
    }
  }, []);

  const logout = useCallback(() => {
    setUserState(null);
    clearUserInfo();
    clearToken();
  }, []);

  // ── Session expiry handler ──
  // When api.ts detects AUTH_REQUIRED from backend, it calls this.
  useEffect(() => {
    onSessionExpired(() => {
      setUserState(null);
      clearUserInfo();
      clearToken();
      addToast('Сессия истекла. Пожалуйста, войдите заново.', 'error');
    });
  }, [addToast]);

  return (
    <AppContext.Provider value={{
      user, setUser, logout,
      dashboardData, setDashboardData,
      isOffline, setIsOffline,
      toasts, addToast, removeToast,
      confirm,
      lang, setLang,
    }}>
      {children}

      {/* Toast Overlay */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`pointer-events-auto px-4 py-3 rounded-xl shadow-lg font-bold text-sm tracking-wide text-white animate-in slide-in-from-right-5 fade-in duration-300 ${t.type === 'error' ? 'bg-red-500/90 border border-red-400' : t.type === 'success' ? 'bg-emerald-500/90 border border-emerald-400' : 'bg-blue-500/90 border border-blue-400'}`}>
            {t.message}
          </div>
        ))}
      </div>

      {/* Confirm Dialog Overlay */}
      {confirmState.isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#191B25] border border-white/10 rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-white mb-2">{confirmState.message}</h3>
            {confirmState.description && <p className="text-white/60 text-sm mb-6">{confirmState.description}</p>}
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={closeConfirm}
                className="px-4 py-2.5 rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-colors font-bold text-sm"
              >
                Отмена
              </button>
              <button
                onClick={() => { confirmState.onConfirm(); closeConfirm(); }}
                className="px-5 py-2.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30 transition-colors font-bold text-sm active:scale-95"
              >
                ОК
              </button>
            </div>
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
