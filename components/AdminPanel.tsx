import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { PendingUser } from '../types';
import { ShieldAlert, UserCheck, XCircle, RefreshCcw, CheckCircle, Trash } from 'lucide-react';

export default function AdminPanel({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [roles, setRoles] = useState<Record<string, string>>({});

  const loadUsers = async () => {
    setLoading(true);
    const data = await api.getPendingUsers();
    setUsers(data);
    const initialRoles: Record<string, string> = {};
    data.forEach(u => initialRoles[u.login] = u.role || 'OPERATOR');
    setRoles(initialRoles);
    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleRoleChange = (login: string, role: string) => {
    setRoles(prev => ({ ...prev, [login]: role }));
  };

  const handleApprove = async (login: string) => {
    setApproving(login);
    try {
      const role = roles[login] || 'OPERATOR';
      await api.approveUser(login, role);
      setUsers(prev => prev.filter(u => u.login !== login));
    } catch (e) {
      alert('Ошибка при одобрении пользователя');
    }
    setApproving(null);
  };

  const handleReject = async (login: string) => {
    if (!window.confirm(`Отклонить заявку пользователя ${login}?`)) return;
    setRejecting(login);
    try {
      await api.rejectUser(login);
      setUsers(prev => prev.filter(u => u.login !== login));
    } catch (e) {
      alert('Ошибка при отклонении пользователя');
    }
    setRejecting(null);
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center p-6 bg-[#191B25] overflow-y-auto w-full">
      <div className="w-full max-w-3xl flex flex-col gap-6 relative mt-10">
        <button onClick={onClose} className="absolute right-0 top-0 text-white/40 hover:text-white transition-colors">
          <XCircle className="w-8 h-8" />
        </button>

        <div className="flex items-center gap-3 mt-2">
          <ShieldAlert className="w-10 h-10 text-accent-blue" />
          <h1 className="text-3xl font-extrabold text-white">Панель Администратора</h1>
        </div>

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white/80">Ожидают подтверждения: {users.length}</h2>
          <button 
            onClick={loadUsers} 
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 transition-all disabled:opacity-50"
          >
            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            Обновить
          </button>
        </div>

        {loading ? (
          <div className="text-white/50 animate-pulse text-center py-10">Загрузка...</div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white/5 rounded-2xl border border-white/10">
            <CheckCircle className="w-16 h-16 text-emerald-500/50 mb-4" />
            <p className="text-white/50 text-xl font-bold">Нет заявок на ожидании</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {users.map(u => (
              <div key={u.login} className="flex flex-col md:flex-row items-center justify-between p-5 bg-white/5 border border-white/10 rounded-2xl gap-4">
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="text-lg font-bold text-white truncate">{u.name}</div>
                  <div className="text-sm font-mono text-white/50">Логин: {u.login}</div>
                  
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-white/50 uppercase">Роль:</span>
                    <select 
                      value={roles[u.login] || u.role || 'OPERATOR'}
                      onChange={(e) => handleRoleChange(u.login, e.target.value)}
                      className="bg-[#191B25] border border-white/20 rounded-md px-2 py-1 text-sm text-white focus:outline-none focus:border-accent-blue outline-none"
                    >
                      <option value="OPERATOR">OPERATOR</option>
                      <option value="LOGISTIC">LOGISTIC</option>
                      <option value="AGRL">AGRL</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 w-full md:w-auto mt-3 md:mt-0">
                  <button
                    onClick={() => handleReject(u.login)}
                    disabled={rejecting === u.login}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl font-bold transition-all disabled:opacity-50"
                  >
                    {rejecting === u.login ? (
                      <RefreshCcw className="w-5 h-5 animate-spin" />
                    ) : (
                      <Trash className="w-5 h-5" />
                    )}
                    Отклонить
                  </button>
                  
                  <button
                    onClick={() => handleApprove(u.login)}
                    disabled={approving === u.login}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded-xl font-bold transition-all disabled:opacity-50"
                  >
                    {approving === u.login ? (
                      <RefreshCcw className="w-5 h-5 animate-spin" />
                    ) : (
                      <UserCheck className="w-5 h-5" />
                    )}
                    Одобрить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
