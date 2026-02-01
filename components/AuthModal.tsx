import React, { useState } from 'react';
import { api } from '../services/api';
import { TranslationSet, User } from '../types';

interface AuthModalProps {
  onClose: () => void;
  onLoginSuccess: (user: User) => void;
  t: TranslationSet;
}

const AuthModal: React.FC<AuthModalProps> = ({ onClose, onLoginSuccess, t }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (mode === 'login') {
      const res = await api.login(username, password);
      if (res.success) {
        onLoginSuccess({ 
          user: username, 
          name: res.name || username,
          role: (res.role as 'OPERATOR' | 'LOGISTIC' | 'ADMIN') || 'OPERATOR'
        });
      } else {
        setError('Invalid credentials');
      }
    } else {
      if (!name) { setError('Name required'); setLoading(false); return; }
      const success = await api.register(username, password, name);
      if (success) {
        alert('Registration sent. Please login.');
        setMode('login');
      } else {
        setError('Registration failed');
      }
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0F0F12] border border-white/10 p-10 rounded-[2rem] w-full max-w-md shadow-2xl relative flex flex-col gap-6">
        <h2 className="text-3xl font-extrabold text-center text-white">
          {mode === 'login' ? t.login_title : t.reg_title}
        </h2>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === 'register' && (
            <input 
              type="text" 
              placeholder="Name" 
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white placeholder:text-white/30 focus:bg-accent-blue/5 focus:border-accent-blue outline-none transition-all"
            />
          )}
          <input 
            type="text" 
            placeholder="Username" 
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white placeholder:text-white/30 focus:bg-accent-blue/5 focus:border-accent-blue outline-none transition-all"
          />
          <input 
            type="password" 
            placeholder="Password" 
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white placeholder:text-white/30 focus:bg-accent-blue/5 focus:border-accent-blue outline-none transition-all"
          />
          
          {error && <div className="text-accent-red text-center text-sm font-bold">{error}</div>}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-accent-blue hover:bg-accent-blue/90 text-white font-bold py-4 rounded-xl mt-2 shadow-[0_10px_30px_rgba(30,128,125,0.3)] transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? '...' : (mode === 'login' ? t.btn_login : t.btn_reg)}
          </button>
        </form>

        <div className="flex justify-between text-sm text-white/40">
          <button 
             type="button"
             onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
             className="hover:text-white transition-colors"
          >
             {mode === 'login' ? t.reg_title : t.login_title}
          </button>
          <button onClick={onClose} className="hover:text-white transition-colors">{t.btn_cancel}</button>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;