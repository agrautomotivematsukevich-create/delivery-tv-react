import React, { useState } from 'react';
import { api } from '../services/api';
import { TranslationSet, User } from '../types';
import { useEscape } from '../utils/useEscape';
import { useAppContext } from './AppContext';

interface AuthModalProps {
  onClose: () => void;
  onLoginSuccess: (user: User) => void;
  t: TranslationSet;
}

const AuthModal: React.FC<AuthModalProps> = ({ onClose, onLoginSuccess, t }) => {
  useEscape(onClose);
  const { addToast } = useAppContext();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // ── Shared fields ──
  const [tabNumber, setTabNumber] = useState('');
  const [password, setPassword] = useState('');

  // ── Registration-only fields ──
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const validate = (): boolean => {
    if (!tabNumber.trim()) {
      setError('Введите табельный номер');
      return false;
    }
    if (!password.trim()) {
      setError('Введите пароль');
      return false;
    }
    if (mode === 'register') {
      if (!firstName.trim()) {
        setError('Введите имя');
        return false;
      }
      if (!lastName.trim()) {
        setError('Введите фамилию');
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validate()) return;

    setLoading(true);

    if (mode === 'login') {
      const res = await api.login(tabNumber, password);
      if (res.success) {
        // Parse firstName / lastName from the name returned by backend
        // Backend returns "Имя Фамилия" in res.name
        const nameParts = (res.name || tabNumber).split(' ');
        const fName = nameParts[0] || tabNumber;
        const lName = nameParts.slice(1).join(' ') || '';

        onLoginSuccess({
          user: tabNumber,
          name: res.name || tabNumber,
          role: (res.role as 'OPERATOR' | 'LOGISTIC' | 'ADMIN') || 'OPERATOR',
          tabNumber,
          firstName: fName,
          lastName: lName,
        });
        addToast('Вход выполнен успешно', 'success');
      } else {
        setError('Неверный логин или пароль');
      }
    } else {
      try {
        const fullName = `${firstName.trim()} ${lastName.trim()}`;
        const success = await api.register(tabNumber, password, fullName);
        if (success) {
          addToast('Регистрация прошла успешно. Пожалуйста, выполните вход.', 'success');
          setMode('login');
          // Сбрасываем поля регистрации, оставляем логин для удобства
          setFirstName('');
          setLastName('');
          setPassword('');
        } else {
          setError('Ошибка регистрации. Попробуйте позже.');
        }
      } catch {
        setError('Ошибка сети. Проверьте подключение к интернету.');
      }
    }
    setLoading(false);
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
  };

  const inputClass =
    'w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white placeholder:text-white/30 focus:bg-accent-blue/5 focus:border-accent-blue outline-none transition-all';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0F0F12] border border-white/10 p-10 rounded-[2rem] w-full max-w-md shadow-2xl relative">

        {/* ── Header ── */}
        <h2 className="text-3xl font-extrabold text-center mb-8 text-white">
          {mode === 'login' ? 'Вход' : 'Регистрация'}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          {/* ── Registration-only: Имя + Фамилия ── */}
          {mode === 'register' && (
            <>
              <div className="relative">
                <label className="absolute -top-2.5 left-4 bg-[#0F0F12] px-1.5 text-[10px] font-bold text-white/40 uppercase tracking-wider">
                  Имя
                </label>
                <input
                  type="text"
                  placeholder="Введите имя"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  className={inputClass}
                  autoComplete="given-name"
                />
              </div>
              <div className="relative">
                <label className="absolute -top-2.5 left-4 bg-[#0F0F12] px-1.5 text-[10px] font-bold text-white/40 uppercase tracking-wider">
                  Фамилия
                </label>
                <input
                  type="text"
                  placeholder="Введите фамилию"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  className={inputClass}
                  autoComplete="family-name"
                />
              </div>
            </>
          )}

          {/* ── Shared: Табельный номер / Логин ── */}
          <div className="relative">
            <label className="absolute -top-2.5 left-4 bg-[#0F0F12] px-1.5 text-[10px] font-bold text-white/40 uppercase tracking-wider">
              Табельный номер / Логин
            </label>
            <input
              type="text"
              placeholder="Введите табельный номер или логин"
              value={tabNumber}
              // Просто сохраняем введенное значение без фильтрации цифр
              onChange={(e) => setTabNumber(e.target.value)}
              className={inputClass}
              autoComplete="username"
            />
          </div>

          {/* ── Shared: Пароль ── */}
          <div className="relative">
            <label className="absolute -top-2.5 left-4 bg-[#0F0F12] px-1.5 text-[10px] font-bold text-white/40 uppercase tracking-wider">
              Пароль
            </label>
            <input
              type="password"
              placeholder="Введите пароль"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={inputClass}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {/* ── Error ── */}
          {error && (
            <div className="text-accent-red text-center text-sm font-bold py-1">
              {error}
            </div>
          )}

          {/* ── Submit ── */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent-blue hover:bg-accent-blue/90 text-white font-bold py-4 rounded-xl mt-4 shadow-[0_10px_30px_rgba(30,128,125,0.3)] transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? '...' : (mode === 'login' ? 'Войти' : 'Зарегистрироваться')}
          </button>
        </form>

        {/* ── Footer: Switch mode & Cancel ── */}
        <div className="mt-6 flex justify-between text-sm">
          <button
            type="button"
            onClick={switchMode}
            className="text-white/40 hover:text-white transition-colors"
          >
            {mode === 'login' ? 'Регистрация' : 'Уже есть аккаунт? Войти'}
          </button>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;