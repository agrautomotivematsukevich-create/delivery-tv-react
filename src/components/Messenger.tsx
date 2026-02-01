import React, { useEffect, useState, useRef } from 'react';
import { api } from '../services/api';
import { TranslationSet, User, Message } from '../types';
import { X, Send, MessageSquare, User as UserIcon } from 'lucide-react';

interface MessengerProps {
  onClose: () => void;
  user: User;
  t: TranslationSet;
}

const Messenger: React.FC<MessengerProps> = ({ onClose, user, t }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = async () => {
    const data = await api.fetchMessages();
    setMessages(data);
  };

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    
    const txt = input.trim();
    setInput(""); // Clear immediately
    setSending(true);
    
    // Optimistic update
    const tempMsg: Message = {
      id: 'temp-' + Date.now(),
      timestamp: new Date().toLocaleString(),
      user: user.name,
      text: txt
    };
    setMessages(prev => [...prev, tempMsg]);

    await api.sendMessage(user.name, txt);
    setSending(false);
    loadMessages(); // Refresh to get real timestamp/ID
  };

  return (
    <div className="fixed inset-y-0 right-0 z-[100] w-full max-w-sm bg-[#0F0F12] border-l border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
       
       {/* Header */}
       <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#16161d]">
          <div className="flex items-center gap-2 font-bold text-white">
             <MessageSquare className="text-accent-blue" size={20} />
             {t.menu_messenger}
          </div>
          <button onClick={onClose} className="p-2 text-white/50 hover:text-white transition-colors">
             <X size={20} />
          </button>
       </div>

       {/* Chat Area */}
       <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-black/20">
          {messages.length === 0 && (
             <div className="text-center text-white/20 mt-10 text-sm">No messages yet</div>
          )}
          {messages.map((m) => {
             const isMe = m.user === user.name;
             return (
               <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-2 mb-1">
                     {!isMe && <UserIcon size={10} className="text-white/40" />}
                     <span className="text-[10px] text-white/40 font-bold uppercase">{m.user}</span>
                     <span className="text-[10px] text-white/20">{m.timestamp.split(',')[1]?.trim() || m.timestamp}</span>
                  </div>
                  <div className={`px-4 py-2 rounded-2xl max-w-[85%] text-sm ${
                    isMe 
                    ? 'bg-accent-blue text-white rounded-tr-none' 
                    : 'bg-white/10 text-white/90 rounded-tl-none border border-white/5'
                  }`}>
                     {m.text}
                  </div>
               </div>
             );
          })}
          <div ref={bottomRef} />
       </div>

       {/* Input Area */}
       <form onSubmit={handleSend} className="p-4 border-t border-white/10 bg-[#16161d] flex gap-2">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.msg_placeholder}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-accent-blue transition-colors placeholder:text-white/20"
          />
          <button 
            type="submit" 
            disabled={!input.trim() || sending}
            className="p-3 bg-accent-blue rounded-xl text-white hover:bg-accent-blue/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
             <Send size={18} />
          </button>
       </form>

       <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
      `}</style>
    </div>
  );
};

export default Messenger;