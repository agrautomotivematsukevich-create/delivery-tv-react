import React, { useState } from 'react';
import { api } from '../services/api';
import { useAppContext } from './AppContext';
import { User } from '../types';

interface TVLoginScreenProps {
  onSuccess: () => void;
}

const TVLoginScreen: React.FC<TVLoginScreenProps> = ({ onSuccess }) => {
  const { setUser } = useAppContext();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!login.trim() || !password.trim()) {
      setError('Заполните все поля');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.login(login.trim(), password);

      if (res.success) {
        const nameParts = (res.name || login).split(' ');
        const newUser: User = {
          user: login.trim(),
          name: res.name || login.trim(),
          role: (res.role as 'OPERATOR' | 'LOGISTIC' | 'ADMIN') || 'OPERATOR',
          tabNumber: login.trim(),
          firstName: nameParts[0] || login.trim(),
          lastName: nameParts.slice(1).join(' ') || '',
        };
        setUser(newUser);
        onSuccess();
      } else {
        const messages: Record<string, string> = {
          WRONG_PASSWORD: 'Неверный логин или пароль',
          RATE_LIMITED: 'Слишком много попыток. Подождите 5 минут.',
          PENDING: 'Заявка ожидает одобрения администратором.',
          REJECTED: 'Заявка отклонена.',
        };
        setError(messages[res.error || ''] || 'Неверный логин или пароль');
      }
    } catch {
      setError('Ошибка сети. Проверьте подключение.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div className="fixed inset-0 bg-[#191B25] flex items-center justify-center z-[200]">
      {/* Subtle background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-blue-500/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-sm mx-4">
        {/* Glass card */}
        <div className="backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] rounded-2xl p-8 shadow-2xl">
          {/* Logo / Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-blue-500/10 border border-blue-500/20 mb-4">
              <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125Z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-white/90 tracking-wide">AGR Warehouse</h1>
            <p className="text-xs text-white/30 mt-1 tracking-widest uppercase">Режим монитора</p>
          </div>

          {/* Fields */}
          <div className="space-y-4">
            <div>
              <input
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Логин"
                autoFocus
                className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/25 text-sm outline-none focus:border-blue-500/40 focus:bg-white/[0.06] transition-all duration-200"
              />
            </div>
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Пароль"
                className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/25 text-sm outline-none focus:border-blue-500/40 focus:bg-white/[0.06] transition-all duration-200"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-red-400 text-xs text-center">{error}</p>
            </div>
          )}

          {/* Button */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="mt-6 w-full py-3 rounded-xl bg-blue-500/80 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-sm tracking-wide transition-all duration-200 active:scale-[0.98]"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
                  <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Вход...
              </span>
            ) : (
              'Войти'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TVLoginScreen;
