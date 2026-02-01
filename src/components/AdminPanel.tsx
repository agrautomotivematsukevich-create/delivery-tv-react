import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { TranslationSet, UserAccount, User } from '../types';
import { ShieldCheck, Trash2, CheckCircle, XCircle, RefreshCw, Pencil, MessageSquareX } from 'lucide-react';

interface AdminPanelProps {
  t: TranslationSet;
  currentUser: User;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ t, currentUser }) => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = async () => {
    setLoading(true);
    const data = await api.fetchUsers();
    setUsers(data);
    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleStatusToggle = async (u: UserAccount) => {
    if (u.user === currentUser.user) return; // Prevent self-lockout
    const newStatus = u.status === 'APPROVED' ? 'PENDING' : 'APPROVED';
    // Optimistic update
    setUsers(users.map(x => x.rowIndex === u.rowIndex ? { ...x, status: newStatus } : x));
    await api.updateUser(u.rowIndex, u.role, newStatus);
  };

  const handleRoleChange = async (u: UserAccount, newRole: string) => {
    if (u.user === currentUser.user) return;
    setUsers(users.map(x => x.rowIndex === u.rowIndex ? { ...x, role: newRole } : x));
    await api.updateUser(u.rowIndex, newRole, u.status);
  };

  const handleDelete = async (u: UserAccount) => {
    if (u.user === currentUser.user) return;
    if (!confirm(`Delete user ${u.user}?`)) return;
    setUsers(users.filter(x => x.rowIndex !== u.rowIndex));
    await api.deleteUser(u.rowIndex);
  };

  const handleRename = async (u: UserAccount) => {
    const newName = prompt("Enter new display name:", u.name);
    if (newName && newName !== u.name) {
      setUsers(users.map(x => x.rowIndex === u.rowIndex ? { ...x, name: newName } : x));
      await api.updateUserName(u.rowIndex, newName);
    }
  };

  const handleClearChat = async () => {
    if (confirm("Are you sure you want to clear ALL chat messages? This cannot be undone.")) {
      await api.clearMessages();
      alert("Chat history cleared.");
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full flex-1 min-h-0 animate-in fade-in zoom-in duration-300">
      
      {/* Header Card */}
      <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl shrink-0 flex items-center justify-between gap-4">
         <h2 className="text-2xl font-extrabold text-white flex items-center gap-3">
           <ShieldCheck className="text-accent-green" size={32} />
           {t.admin_title}
         </h2>
         
         <div className="flex items-center gap-3">
           <button
             onClick={handleClearChat}
             className="flex items-center gap-2 px-4 py-3 bg-white/5 rounded-xl hover:bg-accent-red/20 hover:text-accent-red text-white transition-colors text-xs font-bold uppercase"
           >
             <MessageSquareX size={18} />
             <span className="hidden sm:inline">Clear Chat</span>
           </button>
           
           <button 
             onClick={loadUsers} 
             className="p-3 bg-white/5 rounded-full hover:bg-white/10 text-white transition-colors"
             disabled={loading}
           >
             <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
           </button>
         </div>
      </div>

      {/* Main Content */}
      <div className="bg-card-bg backdrop-blur-xl border border-white/10 rounded-3xl p-8 flex-1 min-h-0 flex flex-col shadow-2xl relative overflow-hidden">
        {loading ? (
           <div className="flex-1 flex items-center justify-center text-white/30 animate-pulse">Loading users...</div>
        ) : users.length === 0 ? (
           <div className="flex-1 flex items-center justify-center text-white/30">No users found.</div>
        ) : (
          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#16161d] z-10 shadow-md">
                <tr>
                   <th className="p-4 text-xs font-bold text-white/40 uppercase tracking-widest border-b border-white/10">{t.admin_user}</th>
                   <th className="p-4 text-xs font-bold text-white/40 uppercase tracking-widest border-b border-white/10">{t.admin_role}</th>
                   <th className="p-4 text-xs font-bold text-white/40 uppercase tracking-widest border-b border-white/10">{t.admin_status}</th>
                   <th className="p-4 text-xs font-bold text-white/40 uppercase tracking-widest border-b border-white/10 text-right">{t.admin_actions}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isMe = u.user === currentUser.user;
                  return (
                    <tr key={u.rowIndex} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="font-bold text-white">{u.name}</div>
                          <button onClick={() => handleRename(u)} className="text-white/20 hover:text-white transition-colors">
                            <Pencil size={12} />
                          </button>
                        </div>
                        <div className="text-xs text-white/50">{u.user}</div>
                      </td>
                      <td className="p-4">
                         <select 
                           value={u.role}
                           onChange={(e) => handleRoleChange(u, e.target.value)}
                           disabled={isMe}
                           className="bg-black/20 border border-white/10 rounded-lg text-white text-sm p-2 outline-none focus:border-accent-green disabled:opacity-50"
                         >
                           <option value="OPERATOR">OPERATOR</option>
                           <option value="LOGISTIC">LOGISTIC</option>
                           <option value="ADMIN">ADMIN</option>
                         </select>
                      </td>
                      <td className="p-4">
                         <button 
                           onClick={() => handleStatusToggle(u)}
                           disabled={isMe}
                           className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50 ${
                             u.status === 'APPROVED' 
                               ? 'bg-accent-green/10 border-accent-green/20 text-accent-green' 
                               : 'bg-accent-red/10 border-accent-red/20 text-accent-red'
                           }`}
                         >
                            {u.status === 'APPROVED' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                            <span className="text-xs font-bold">{u.status}</span>
                         </button>
                      </td>
                      <td className="p-4 text-right">
                         {!isMe && (
                           <button 
                             onClick={() => handleDelete(u)}
                             className="p-2 text-white/30 hover:text-accent-red transition-colors"
                           >
                             <Trash2 size={18} />
                           </button>
                         )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
      `}</style>
    </div>
  );
};

export default AdminPanel;