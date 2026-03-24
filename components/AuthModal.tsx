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

// 🚀 ДОБАВЛЕН СЛОВАРЬ ОШИБОК И СТАТУСОВ
const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  WRONG_PASSWORD: 'Неверный логин или пароль',
  PENDING:        'Ваша заявка на регистрацию ещё не одобрена администратором. Пожалуйста, подождите.',
  REJECTED:       'Ваша заявка на регистрацию была отклонена. Обратитесь к администратору.',
  NOT_APPROVED:   'Ваш аккаунт не активирован. Обратитесь к администратору.',
  RATE_LIMITED:   'Слишком много попыток входа. Попробуйте через 5 минут.',
  NETWORK_ERROR:  'Ошибка сети. Проверьте подключение к интернету.',
  SERVER_ERROR:   'Ошибка сервера. Попробуйте позже.',
  INVALID_INPUT:  'Заполните все поля',
  UNKNOWN:        'Неверный логин или пароль'
};

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
      setError('Введите табельный номер / логин');
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

    // 🚀 НОРМАЛИЗАЦИЯ ЛОГИНА
    const normalizeLogin = (input: string) => {
      let str = input.trim().toLowerCase();
      // Если только цифры (напр. "990" или "000990") -> "u000990"
      if (/^\d+$/.test(str)) return 'u' + str.padStart(6, '0');
      // Если начинается на "u" и дальше цифры (напр. "u990") -> "u000990"
      if (/^u\d+$/.test(str)) return 'u' + str.substring(1).padStart(6, '0');
      // Иначе (dmitry, test1 и т.д.) оставляем как есть
      return str;
    };

    const finalLogin = normalizeLogin(tabNumber);
    setLoading(true);

    if (mode === 'login') {
      // 🚀 Используем finalLogin вместо tabNumber
      const res = await api.login(finalLogin, password);
      if (res.success) {
        const nameParts = (res.name || finalLogin).split(' ');
        const fName = nameParts[0] || finalLogin;
        const lName = nameParts.slice(1).join(' ') || '';

        onLoginSuccess({
          user: finalLogin,
          name: res.name || finalLogin,
          role: (res.role as 'OPERATOR' | 'LOGISTIC' | 'ADMIN') || 'OPERATOR',
          tabNumber: finalLogin, // Сохраняем нормализованный
          firstName: fName,
          lastName: lName,
        });
        addToast('Вход выполнен успешно', 'success');
      } else {
        const errorCode = res.error || 'UNKNOWN';
        const message = LOGIN_ERROR_MESSAGES[errorCode] || LOGIN_ERROR_MESSAGES.UNKNOWN;

        if (errorCode === 'PENDING') {
          setError(message);
          addToast('Заявка ожидает одобрения', 'info');
        } else if (errorCode === 'REJECTED') {
          setError(message);
          addToast('Заявка отклонена', 'error');
        } else if (errorCode === 'RATE_LIMITED') {
          setError(message);
          addToast('Превышен лимит попыток', 'error');
        } else {
          setError(message);
        }
      }
    } else {
      try {
        const fullName = `${firstName.trim()} ${lastName.trim()}`;
        // 🚀 Используем finalLogin вместо tabNumber при регистрации
        const success = await api.register(finalLogin, password, fullName);
        if (success) {
          addToast('Регистрация прошла успешно. Пожалуйста, выполните вход.', 'success');
          setMode('login');
          setFirstName('');
          setLastName('');
          setPassword('');
          // Оставляем в поле ввода то, что он ввёл, или уже отформатированное значение:
          setTabNumber(finalLogin); 
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

  // 🎨 Определяем стиль ошибки (желтый для PENDING, красный для остальных)
  const isPendingError = error === LOGIN_ERROR_MESSAGES.PENDING;
  const errorBgClass = isPendingError
    ? 'text-amber-400 bg-amber-400/10 border border-amber-400/20'
    : 'text-accent-red bg-red-500/10 border border-red-500/20';

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
            <div className={`text-center text-sm font-bold py-2 px-3 rounded-xl ${errorBgClass}`}>
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